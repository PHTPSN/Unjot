import { learnerStore, StoreError } from "../../../../lib/learner-store.ts";
import { resolveAppSettings, testLlmConnection } from "../../../../lib/llm-config.ts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { provider?: unknown; model?: unknown; apiKey?: unknown; baseUrl?: unknown };
    if (typeof body.provider !== "string" || typeof body.model !== "string" || typeof body.apiKey !== "string" || typeof body.baseUrl !== "string") throw new StoreError("Invalid connection settings.");
    const current = resolveAppSettings(process.env, learnerStore().appSettings() ?? undefined);
    const apiKey = body.apiKey.trim() || current.apiKey;
    const baseUrl = body.baseUrl.trim().replace(/\/+$/, "");
    if (!body.model.trim() || !apiKey || !baseUrl) throw new StoreError("Model, API key, and Base URL are required.");
    await testLlmConnection({ provider: body.provider.trim(), model: body.model.trim(), apiKey, baseUrl });
    return Response.json({ ok: true });
  } catch (error) {
    const timeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return Response.json({ error: timeout ? "Connection timed out." : error instanceof Error ? error.message : "Connection test failed." }, { status: error instanceof StoreError ? error.status : 502 });
  }
}
