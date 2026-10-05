import { learnerStore } from "../../../lib/learner-store.ts";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const store = learnerStore();
  const query = new URL(request.url).searchParams;
  const conversationId = query.get("conversationId") || store.defaultConversationId();
  const turns = store.conversationTurns(conversationId);
  const pending = store.pendingStatus(conversationId);
  const completed = turns.filter(t => t.role === "learner").flatMap(t => {
    const reply = store.getSubmission(t.id)?.reply;
    return reply?.assistantTurn ? [{ id: reply.assistantTurn.id, lookupResults: reply.lookupResults, analysis: reply.analysis ?? store.replyAnalysis(reply.assistantTurn.id) }] : [];
  });
  const lookupResultsByTurnId = Object.fromEntries(completed.map(item => [item.id, item.lookupResults]));
  const analysisByTurnId = Object.fromEntries(completed.filter(item => item.analysis).map(item => [item.id, item.analysis]));
  return Response.json({ turns, conversationId, projects: store.projects(), conversations: store.conversations(), correctionMode: store.correctionMode(), lookupResultsByTurnId, analysisByTurnId,
    processing: pending?.processing ? { id: pending.submission.id, turn: pending.submission.turn } : null,
    unfinished: pending && !pending.processing ? { id: pending.submission.id, turn: pending.submission.turn, stages: store.workflowStages(pending.submission.id) } : null },
    { headers: { "cache-control": "no-store" } });
}
