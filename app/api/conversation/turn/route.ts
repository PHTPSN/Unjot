import { readLlmConfig } from "../../../../lib/llm-config.ts";
import { lexicalGraph } from "../../../../lib/lexicon.ts";
import { learnerStore, StoreError } from "../../../../lib/learner-store.ts";
import { sendLearningTurn } from "../../../../lib/learning-conversation.ts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const config = readLlmConfig();
  if (!config.configured) {
    return Response.json({
      error: `Set ${config.missing.join(", ")} in .env to enable the model.`,
    }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (!isTurnRequest(body)) return Response.json({ error: "A non-empty learner message is required." }, { status: 400 });

  try {
    const reply = await sendLearningTurn({
      config: config.config,
      graph: lexicalGraph,
      text: body.text,
      correctionMode: body.correctionMode,
      id: body.submissionId,
      store: learnerStore(),
    });
    return Response.json({ assistantMessage: { ...reply, learnerTurn: learnerStore().getSubmission(body.submissionId)!.turn } });
  } catch (error) {
    if (error instanceof StoreError) return Response.json({ error: error.message }, { status: error.status });
    const message = error instanceof Error ? error.message : "The model request failed.";
    return Response.json({ error: message }, { status: 502 });
  }
}

type TurnRequest = {
  submissionId: string;
  text: string;
  correctionMode: boolean;
  history?: Array<{ role: "learner" | "assistant"; text: string; correction?: string | null }>;
};

function isTurnRequest(value: unknown): value is TurnRequest {
  if (typeof value !== "object" || value === null) return false;
  const body = value as Partial<TurnRequest>;
  return typeof body.submissionId === "string" && body.submissionId.length <= 200 && body.submissionId.length > 0 && typeof body.text === "string" && body.text.trim().length > 0 && body.text.length <= 4000 &&
    typeof body.correctionMode === "boolean" &&
    (body.history === undefined || (Array.isArray(body.history) && body.history.length <= 100 && body.history.every(entry =>
      typeof entry === "object" && entry !== null && (entry.role === "learner" || entry.role === "assistant") && typeof entry.text === "string" && (entry.correction == null || typeof entry.correction === "string"))));
}
