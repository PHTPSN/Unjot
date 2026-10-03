import { createHash } from "node:crypto";
import type { ConversationTurn } from "../packages/protocol/src/conversation-turn.ts";
import type { EvidenceEvent, EvidenceKind } from "../packages/protocol/src/evidence-event.ts";
import type { LearnerItemState } from "../packages/protocol/src/learner-item-state.ts";
import type { CorrectedLearnerItemRead, ProductionState, ReceptiveState, SenseId, TextSpan } from "../packages/protocol/src/comprehension.ts";
import type { LexicalGraph } from "../packages/lexical-core/src/graph.ts";

export const EVIDENCE_POLICY_VERSION = "m4-evidence-v1" as const;
export const CORRECTED_EVIDENCE_POLICY_VERSION = "m5r-evidence-v1" as const;
export const STATE_DERIVATION_POLICY_VERSION = "m5r-state-v1" as const;
export type Observation = {
  expression: string; quote: string; start: number; textSource: "text" | "correction";
  behavior: "production" | "comprehension" | "difficulty" | "supplied" | "mention";
  referenceTurnId: string | null;
};
export type Judgment = {
  observationIndex: number; itemId: SenseId | null;
  correctness: "correct" | "incorrect" | "uncertain";
  usage: "communicative" | "paraphrase" | "difficulty" | "supplied" | "quoted" | "translation" | "state_request" | "uncertain";
  meaningClear: boolean; assistance: "independent" | "adopted" | "uncertain";
  supportTurnId: string | null; rationale: string;
};
export type Decision = { status: "accepted" | "downgraded" | "rejected"; reason: string; event: EvidenceEvent | null; observation: Observation; judgment: Judgment };

export function validSpan(text: string, span: TextSpan, quote?: string): boolean {
  return Number.isInteger(span.start) && Number.isInteger(span.end) && span.start >= 0 && span.end > span.start && span.end <= text.length && (quote === undefined || text.slice(span.start, span.end) === quote);
}

function clauseAt(text: string, start: number, end: number): string {
  const left = text.slice(0, start).split(/[.!?。！？;；\n]/).at(-1) ?? "";
  const right = text.slice(end).split(/[.!?。！？;；\n]/)[0];
  return left + text.slice(start, end) + right;
}
export function isStateRequest(text: string): boolean {
  return /(?:mark|set|change|assign|make|count|treat|consider).*(?:master|proficien|known|fluent|level|score)|(?:掌握|熟练|学会).*(?:设为|标记|改为)|(?:设为|标记|改为|把).*(?:掌握|熟练|学会)/i.test(text);
}

/** Only program-constructed decisions may enter the ledger; model proposals never write it. */
export async function recordEvidence(input: {
  observation: Observation; judgment: Judgment; turn: ConversationTurn;
  history: readonly ConversationTurn[]; accepted: readonly EvidenceEvent[];
  graph: LexicalGraph; deviceId: string;
}): Promise<Decision> {
  const { observation: o, judgment: j, turn, history, accepted, graph } = input;
  const reject = (reason: string): Decision => ({ status: "rejected", reason, event: null, observation: o, judgment: j });
  const text = o.textSource === "text" ? turn.text : turn.correction?.text;
  let span = { start: o.start, end: o.start + o.quote.length };
  if (!text || !o.quote || !validSpan(text, span, o.quote)) return reject("Invalid original-text reference.");
  // Models may cite a whole communicative clause while naming a lexical target.
  // Narrow a unique production occurrence before writing the Evidence span.
  if (o.behavior === "production" || o.behavior === "supplied") {
    const needle = o.expression.trim().toLowerCase();
    const source = o.quote.toLowerCase();
    const first = source.indexOf(needle);
    if (needle && first >= 0 && first === source.lastIndexOf(needle)) span = { start: o.start + first, end: o.start + first + o.expression.trim().length };
  }
  if (!j.itemId || !await graph.getItem(j.itemId)) return reject("No verified lexical sense.");
  const candidates = await graph.findSenseIds(o.expression);
  if (!candidates.includes(j.itemId)) return reject("Selected sense is not a candidate for this expression.");
  if (!j.rationale?.trim() || j.rationale.length > 2000) return reject("Missing or invalid semantic rationale.");
  if (isStateRequest(clauseAt(text, span.start, span.end)) || j.usage === "state_request") return reject("State instructions are not proficiency evidence.");
  if (["quoted", "translation"].includes(j.usage) || j.correctness === "incorrect") return reject("Quoted, translated or incorrect language cannot establish proficiency.");
  const reference = history.find(t => t.id === o.referenceTurnId && t.conversationId === turn.conversationId && t.sequence < turn.sequence);
  const literalIds = await graph.findSenseIds(text.slice(span.start, span.end));
  const literal = literalIds.includes(j.itemId);
  // Receptive paraphrases may cite a prior assistant expression; they do not produce it.
  if (!literal && o.behavior !== "difficulty") {
    if (!["comprehension", "difficulty"].includes(o.behavior) || !reference || reference.role !== "assistant" ||
      !reference.suppliedItemIds.includes(j.itemId)) return reject("Observation is not linked to a verified expression or prior supplied meaning.");
  }
  if (o.behavior === "difficulty" && !literal && !o.quote.toLowerCase().includes(o.expression.toLowerCase()) && !reference?.suppliedItemIds.includes(j.itemId)) return reject("Difficulty has no specific expression reference.");
  let kind: EvidenceKind;
  let supportTurnId: string | null = null;
  if (!j.meaningClear || j.correctness === "uncertain" || j.usage === "uncertain") kind = "uncertain";
  else if (o.behavior === "supplied" && turn.role === "assistant" && j.usage === "supplied" && literal) {
    const original = history.find(t => t.id === turn.correction?.sourceTurnId);
    if (o.textSource === "correction" && original && (await graph.findSenseIds(o.quote)).includes(j.itemId) && original.text.toLowerCase().includes(o.quote.toLowerCase())) return reject("Correction repeats original language rather than introducing support.");
    kind = "supplied";
  } else if (turn.role !== "learner" || o.textSource !== "text") return reject("Learner evidence must cite original learner text.");
  else if (o.behavior === "difficulty" && j.usage === "difficulty") kind = "help_requested";
  else if (o.behavior === "comprehension" && j.usage === "paraphrase" && reference?.role === "assistant" && reference.suppliedItemIds.includes(j.itemId)) kind = "recognized";
  else if (o.behavior === "production" && j.usage === "communicative" && literal) {
    // Explicit quotation delimiters around a production span require clarification.
    if (/^["'“‘]/.test(text.slice(span.start - 1, span.start)) && /^["'”’]/.test(text.slice(span.end, span.end + 1))) return reject("Quoted target is not communicative production.");
    const priorSupport = accepted.filter(e => e.itemId === j.itemId && e.kind === "supplied")
      .map(e => history.find(t => t.id === e.turnId && t.sequence < turn.sequence)).filter(t => t !== undefined);
    const copied = priorSupport.find(t => [t.text, t.correction?.text].some(s => s && s.toLowerCase().includes(clauseAt(text, span.start, span.end).trim().toLowerCase())));
    if (j.assistance === "adopted" || copied) {
      const support = copied ?? priorSupport.find(t => t.id === j.supportTurnId);
      if (!support) return reject("Claimed assistance has no accepted supplied observation.");
      kind = "assisted_production"; supportTurnId = support.id;
    } else if (j.assistance === "uncertain") kind = "uncertain";
    else if (j.supportTurnId !== null) return reject("Independent use cannot cite assistance.");
    else kind = "spontaneous_production";
  } else return reject("Behavior and semantic judgment do not agree.");
  const id = createHash("sha256").update(JSON.stringify([turn.id, j.itemId, o.textSource, span, kind])).digest("hex");
  const event: EvidenceEvent = {
    id: `ev:${id}`, deviceId: input.deviceId, itemId: j.itemId, kind,
    conversationId: turn.conversationId, turnId: turn.id, contextId: turn.contextId,
    occurredAt: turn.occurredAt, source: "conversation", textSource: o.textSource,
    observedSpan: span, supportTurnId, rationale: j.rationale, policyVersion: EVIDENCE_POLICY_VERSION,
  };
  return { status: kind === "uncertain" ? "downgraded" : "accepted", reason: j.rationale, event, observation: o, judgment: j };
}

export function deriveItemState(itemId: SenseId, events: readonly EvidenceEvent[]): LearnerItemState | null {
  const selected = [...new Map(events.filter(e => e.itemId === itemId).map(e => [e.id, e])).values()];
  if (!selected.length) return null;
  const counts: Record<EvidenceKind, number> = { encountered: 0, recognized: 0, help_requested: 0, supplied: 0, assisted_production: 0, spontaneous_production: 0, failed_opportunity: 0, uncertain: 0 };
  for (const event of selected) {
    if (!["m0-v2", EVIDENCE_POLICY_VERSION, CORRECTED_EVIDENCE_POLICY_VERSION].includes(event.policyVersion)) throw new Error("Unsupported Evidence policy version.");
    counts[event.kind]++;
  }
  const independent = selected.filter(e => e.kind === "spontaneous_production");
  const independentContextIds = [...new Set(independent.map(e => e.contextId))];
  const stage = independentContextIds.length >= 2 ? "repeated_independent_use" : independent.length ? "spontaneous_production" : counts.assisted_production ? "assisted_production" : counts.recognized ? "understood" : "encountered";
  return { itemId, stage, evidenceIds: selected.map(e => e.id), counts, independentContextIds,
    lastEvidenceAt: selected.at(-1)!.occurredAt, lastSpontaneousAt: independent.at(-1)?.occurredAt ?? null,
    policyVersion: selected.some(e => e.policyVersion === CORRECTED_EVIDENCE_POLICY_VERSION) ? CORRECTED_EVIDENCE_POLICY_VERSION : selected.some(e => e.policyVersion === EVIDENCE_POLICY_VERSION) ? EVIDENCE_POLICY_VERSION : "m0-v2" };
}

/** Versioned compatibility projection; it never mutates or reinterprets stored events. */
export function deriveCorrectedItemState(itemId: SenseId, events: readonly EvidenceEvent[], stateRevision: string): CorrectedLearnerItemRead {
  const selected = [...new Map(events.filter(e => e.itemId === itemId).map(e => [e.id, e])).values()];
  const receptiveEvidenceIds = selected.filter(e => ["encountered", "recognized"].includes(e.kind)).map(e => e.id);
  const difficulties = selected.filter(e => ["help_requested", "failed_opportunity"].includes(e.kind));
  let receptive: ReceptiveState = "unobserved";
  // Ledger order is authoritative, including equal timestamps. Exposure cannot erase difficulty.
  for (const event of selected) {
    if (!["m0-v2", "m4-evidence-v1", "m5r-evidence-v1"].includes(event.policyVersion)) throw new Error("Unsupported Evidence policy version.");
    if (event.kind === "recognized") receptive = "understood";
    else if (event.kind === "help_requested" && event.difficultyType !== "production") receptive = "needs_support";
    else if (event.kind === "encountered" && receptive === "unobserved") receptive = "encountered";
  }
  const assisted = selected.filter(e => e.kind === "assisted_production");
  const spontaneous = selected.filter(e => e.kind === "spontaneous_production");
  const independentContextIds = [...new Set(spontaneous.map(e => e.contextId))];
  let production: ProductionState = "none";
  if (independentContextIds.length >= 2) production = "repeated_independent_use";
  else if (spontaneous.length) production = "spontaneous_production";
  else if (assisted.length) production = "assisted_production";
  return {
    itemId, receptive, production,
    receptiveEvidenceIds, productionEvidenceIds: [...assisted, ...spontaneous].map(e => e.id),
    difficultyEvidenceIds: difficulties.map(e => e.id),
    supportEvidenceIds: selected.filter(e => e.kind === "supplied").map(e => e.id),
    evidencePolicyVersions: [...new Set(selected.map(e => e.policyVersion))],
    independentEventIds: spontaneous.map(e => e.id), independentContextIds,
    stateRevision, derivationPolicyVersion: STATE_DERIVATION_POLICY_VERSION,
  };
}
