import { learnerStore } from "../../../lib/learner-store.ts";

export const runtime = "nodejs";
export async function GET() {
  const store = learnerStore();
  const turns = await store.historyPage();
  const unfinished = store.pending();
  const lookupResultsByTurnId = Object.fromEntries(turns.filter(t => t.role === "learner").flatMap(t => {
    const reply = store.getSubmission(t.id)?.reply;
    return reply?.assistantTurn ? [[reply.assistantTurn.id, reply.lookupResults]] : [];
  }));
  return Response.json({ turns, correctionMode: store.correctionMode(), lookupResultsByTurnId,
    unfinished: unfinished ? { id: unfinished.id, turn: unfinished.turn } : null },
    { headers: { "cache-control": "no-store" } });
}
