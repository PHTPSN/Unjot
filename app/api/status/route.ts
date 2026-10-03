import { readLlmConfig } from "../../../lib/llm-config.ts";

export const runtime = "nodejs";

export async function GET() {
  const result = readLlmConfig();
  return Response.json(result.configured
    ? { configured: true, provider: result.config.provider, model: result.config.model }
    : { configured: false, provider: null, model: null, missing: result.missing });
}
