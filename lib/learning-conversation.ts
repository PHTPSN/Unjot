import { randomUUID } from "node:crypto";
import type { ConversationTurn } from "../packages/protocol/src/conversation-turn.ts";
import type { LexicalGraph } from "../packages/lexical-core/src/graph.ts";
import { evaluateTurn } from "./evidence-evaluator.ts";
import { createLookupReply } from "./lookup-chat.ts";
import { PersonalReads } from "./personal-reads.ts";
import type { LearnerStore } from "./learner-store.ts";
import type { LlmConfig } from "./llm-config.ts";

export async function sendLearningTurn(options: { store: LearnerStore; graph: LexicalGraph; config: LlmConfig; id: string; text: string; correctionMode: boolean; fetcher?: typeof fetch }) {
  const { store, graph, config, fetcher } = options;
  let submission = store.begin(options.id, options.text, options.correctionMode);
  if (submission.reply) return submission.reply;
  const owner = store.claim(submission.id);
  try {
    const history = store.turns(21).filter(t => t.sequence < submission.turn.sequence);
    if (!submission.evidenceDone) {
      const decisions = await evaluateTurn({ config, graph, turn: submission.turn, history, accepted: store.evidence(), deviceId: store.deviceId, fetcher, corrected: true, checkpoint: store.checkpoint(submission.id, owner) });
      submission = store.accept(submission.id, owner, decisions);
    }
    const personal = new PersonalReads(store, graph, submission.preferences);
    const reply = await createLookupReply({ config, graph, text: submission.turn.text, correctionMode: submission.turn.correctionMode,
      history: history.map(t => ({ role: t.role, text: t.text, correction: t.correction?.text ?? null })),
      personal, stateRevision: submission.stateRevision!, fetcher });
    const assistant: ConversationTurn = { id: randomUUID(), conversationId: submission.turn.conversationId, sequence: submission.turn.sequence + 1,
      role: "assistant", contextId: submission.turn.contextId, text: reply.text, occurredAt: new Date().toISOString(), suppliedItemIds: [],
      correctionMode: submission.turn.correctionMode, correction: reply.correction ? { sourceTurnId: submission.turn.id, text: reply.correction } : null };
    const supplied = await evaluateTurn({ config, graph, turn: assistant, history: [...history, submission.turn], accepted: store.evidence(), deviceId: store.deviceId, fetcher, corrected: true });
    const delivered = { ...assistant, suppliedItemIds: [...new Set(supplied.flatMap(d => d.event?.kind === "supplied" ? [d.event.itemId] : []))] };
    return store.finish(submission.id, owner, reply, delivered, supplied);
  } finally { store.release(submission.id, owner); }
}
