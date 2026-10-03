import type { EvidenceEvent } from "../packages/protocol/src/evidence-event.ts";
import type { SenseId } from "../packages/protocol/src/comprehension.ts";
import { deriveItemState, recordEvidence, validSpan, type Decision } from "./evidence-policy.ts";

export const POLICY_VERSION = "m5r-evidence-v1" as const;
type Input = Parameters<typeof recordEvidence>[0];

/** Validate provenance before sending observations to semantic judgment. */
export function sourceRejection(input: Pick<Input, "turn" | "observation" | "history" | "accepted">): string | null {
  const { turn, observation: o, history, accepted } = input;
  const source = o.textSource === "text" ? turn.text : turn.correction?.text ?? "";
  if (!validSpan(source, { start: o.start, end: o.start + o.quote.length }, o.quote)) return "invalid_span";
  if (turn.role === "learner" && (o.textSource !== "text" || o.behavior === "supplied")) return "invalid_role";
  if (turn.role === "assistant" && o.behavior !== "supplied") return "invalid_role";
  if (o.behavior === "mention") return "mention_only";
  const reference = history.find(t => t.id === o.referenceTurnId && t.role === "assistant" && t.conversationId === turn.conversationId && t.sequence < turn.sequence);
  if (o.referenceTurnId !== null && !reference) return "invalid_reference";
  if (o.behavior === "comprehension" && (!reference || !accepted.some(e => e.turnId === reference.id && e.kind === "supplied" && e.conversationId === turn.conversationId))) return "missing_support";
  return null;
}

export async function recordCorrectedEvidence(input: Input & { difficultyType?: EvidenceEvent["difficultyType"] }): Promise<Decision> {
  const { observation, judgment, turn } = input;
  const reject = (reason: string): Decision => ({ status: "rejected", reason, observation, judgment, event: null });
  const invalid = sourceRejection(input);
  if (invalid) return reject(invalid);
  const history = input.history.filter(t => t.conversationId === turn.conversationId && t.sequence < turn.sequence);
  const accepted = input.accepted.filter(e => e.conversationId === turn.conversationId && history.some(t => t.id === e.turnId));
  if (observation.behavior === "comprehension" && !accepted.some(e => e.kind === "supplied" && e.turnId === observation.referenceTurnId && e.itemId === judgment.itemId)) return reject("missing_support");
  const decision = await recordEvidence({ ...input, history, accepted });
  if (!decision.event) return decision;
  return { ...decision, event: { ...decision.event, policyVersion: POLICY_VERSION,
    ...(decision.event.kind === "help_requested" ? { difficultyType: input.difficultyType ?? "unspecified" } : {}) } };
}

/** Preserve old replay exactly; project newly versioned events into the legacy display shape. */
export function deriveStoredLegacyState(itemId: SenseId, events: readonly EvidenceEvent[]) {
  if (!events.some(e => e.itemId === itemId && e.policyVersion === POLICY_VERSION)) return deriveItemState(itemId, events);
  const state = deriveItemState(itemId, events.map(e => e.policyVersion === POLICY_VERSION ? { ...e, policyVersion: "m4-evidence-v1" as const } : e));
  return state ? { ...state, policyVersion: POLICY_VERSION } : null;
}
