import type { ChatHistoryEntry } from "../../../../lib/lookup-chat.ts";
import { createLookupReply } from "../../../../lib/lookup-chat.ts";
import { readLlmConfig } from "../../../../lib/llm-config.ts";
import { lexicalGraph } from "../../../../lib/lexicon.ts";

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

  const history = body.history.slice(-20).map((entry): ChatHistoryEntry => ({
    role: entry.role,
    text: entry.text.slice(0, 4000),
    correction: entry.correction?.slice(0, 4000) ?? null,
  }));

  try {
    const reply = await createLookupReply({
      config: config.config,
      graph: lexicalGraph,
      text: body.text,
      correctionMode: body.correctionMode,
      history,
    });
    return Response.json({ assistantMessage: reply });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The model request failed.";
    return Response.json({ error: message }, { status: 502 });
  }
}

type TurnRequest = {
  text: string;
  correctionMode: boolean;
  history: Array<{ role: "learner" | "assistant"; text: string; correction?: string | null }>;
};

function isTurnRequest(value: unknown): value is TurnRequest {
  if (typeof value !== "object" || value === null) return false;
  const body = value as Partial<TurnRequest>;
  return typeof body.text === "string" && body.text.trim().length > 0 && body.text.length <= 4000 &&
    typeof body.correctionMode === "boolean" && Array.isArray(body.history) &&
    body.history.length <= 100 && body.history.every(entry =>
      typeof entry === "object" && entry !== null &&
      (entry.role === "learner" || entry.role === "assistant") &&
      typeof entry.text === "string" &&
      (entry.correction == null || typeof entry.correction === "string")
    );
}
