import { randomUUID } from "node:crypto";
import type { ConversationTurn } from "../packages/protocol/src/conversation-turn.ts";
import type { LexicalGraph } from "../packages/lexical-core/src/graph.ts";
import { evaluateTurn } from "./evidence-evaluator.ts";
import { createLearnerAwareReply } from "./learner-aware-reply.ts";
import { PersonalReads } from "./personal-reads.ts";
import type { LearnerStore } from "./learner-store.ts";
import type { LlmConfig } from "./llm-config.ts";

export async function sendLearningTurn(options: { store: LearnerStore; graph: LexicalGraph; config: LlmConfig; id: string; text: string; correctionMode: boolean; conversationId?: string; fetcher?: typeof fetch }) {
  const { store, graph, config, fetcher } = options;
  let submission = store.begin(options.id, options.text, options.correctionMode, options.conversationId);
  if (submission.reply) return submission.reply;
  const owner = store.claim(submission.id);
  try {
    const history = store.turns(21).filter(t => t.sequence < submission.turn.sequence);
    const pinnedRevision = submission.snapshotRevision ?? submission.stateRevision ?? store.revision();
    const evidenceLane = submission.evidenceDone ? Promise.resolve([] as Awaited<ReturnType<typeof evaluateTurn>>) : evaluateTurn({ config, graph, turn: submission.turn, history, accepted: store.evidence(pinnedRevision), deviceId: store.deviceId, fetcher, corrected: true, checkpoint: store.checkpoint(submission.id, owner) });
    const personal = new PersonalReads(store, graph, submission.preferences);
    // Response generation consumes the pinned snapshot. It does not wait for this turn's Evidence.
    const responseLane = createLearnerAwareReply({ config, graph, personal, text: submission.turn.text, correctionMode: submission.turn.correctionMode,
      history: history.map(t => ({ role: t.role, text: t.text, correction: t.correction?.text ?? null })),
      submissionId: submission.id, stateRevision: pinnedRevision, preferences: submission.preferences, fetcher });
    const responseResult = await Promise.allSettled([responseLane]);
    if (responseResult[0].status === "rejected") {
      try { store.recordStage(submission.id, owner, "reply_generated", "retryable_error", { reason: responseResult[0].reason instanceof Error ? responseResult[0].reason.message.slice(0, 500) : "model_unavailable" }); } catch { /* retain the original response failure */ }
      try {
        const decisions = await evidenceLane;
        if (!submission.evidenceDone) submission = store.accept(submission.id, owner, decisions);
      } catch { /* preserve the response error as the retryable failure */ }
      throw responseResult[0].reason;
    }
    const reply = responseResult[0].value;
    let evidenceDecisions: Awaited<ReturnType<typeof evaluateTurn>> = [];
    const evidenceStatus = await Promise.race([
      evidenceLane.then(decisions => ({ done: true as const, decisions })).catch(error => ({ done: true as const, error })),
      Promise.resolve({ done: false as const }),
    ]);
    if (evidenceStatus.done && !("error" in evidenceStatus)) {
      evidenceDecisions = evidenceStatus.decisions;
      if (!submission.evidenceDone) submission = store.accept(submission.id, owner, evidenceDecisions);
    } else if (evidenceStatus.done && "error" in evidenceStatus) {
      try { store.recordStage(submission.id, owner, "evidence_committed", "retryable_error", { reason: "model_unavailable" }); } catch { /* response publication remains independent */ }
    } else {
      void evidenceLane.then(decisions => store.commitEvidence(submission.id, decisions)).catch(() => undefined);
    }
    const assistant: ConversationTurn = { id: randomUUID(), conversationId: submission.turn.conversationId, sequence: submission.turn.sequence + 1,
      role: "assistant", contextId: submission.turn.contextId, text: reply.text, occurredAt: new Date().toISOString(), suppliedItemIds: [],
      correctionMode: submission.turn.correctionMode, correction: reply.correction ? { sourceTurnId: submission.turn.id, text: reply.correction } : null };
    const suppliedResult = await Promise.allSettled([evaluateTurn({ config, graph, turn: assistant, history: [...history, submission.turn], accepted: store.evidence(), deviceId: store.deviceId, fetcher, corrected: true })]);
    const supplied = suppliedResult[0].status === "fulfilled" ? suppliedResult[0].value : [];
    const delivered = { ...assistant, suppliedItemIds: [...new Set(supplied.flatMap(d => d.event?.kind === "supplied" ? [d.event.itemId] : []))] };
    return store.finish(submission.id, owner, reply, delivered, supplied, reply.analysis);
  } finally { store.release(submission.id, owner); }
}
