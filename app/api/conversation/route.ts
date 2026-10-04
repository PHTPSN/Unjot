import { learnerStore } from "../../../lib/learner-store.ts";

export const runtime = "nodejs";
export async function GET() {
  const store = learnerStore();
  const turns = await store.historyPage();
  const unfinished = store.pending();
  const completed = turns.filter(t => t.role === "learner").flatMap(t => {
    const reply = store.getSubmission(t.id)?.reply;
    return reply?.assistantTurn ? [{ id: reply.assistantTurn.id, lookupResults: reply.lookupResults, analysis: reply.analysis ?? store.replyAnalysis(reply.assistantTurn.id) }] : [];
  });
  const lookupResultsByTurnId = Object.fromEntries(completed.map(item => [item.id, item.lookupResults]));
  const analysisByTurnId = Object.fromEntries(completed.filter(item => item.analysis).map(item => [item.id, item.analysis]));
  return Response.json({ turns, correctionMode: store.correctionMode(), lookupResultsByTurnId, analysisByTurnId,
    unfinished: unfinished ? { id: unfinished.id, turn: unfinished.turn, stages: store.workflowStages(unfinished.id) } : null },
    { headers: { "cache-control": "no-store" } });
}
