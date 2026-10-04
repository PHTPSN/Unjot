import { readLlmConfig } from "../../../lib/llm-config.ts";
import { learnerStore } from "../../../lib/learner-store.ts";

export const runtime = "nodejs";

export async function GET() {
  const result = readLlmConfig(process.env, learnerStore().appSettings() ?? undefined);
  return Response.json(result.configured
    ? { configured: true, provider: result.config.provider, model: result.config.model }
    : { configured: false, provider: null, model: null, missing: result.missing });
}
