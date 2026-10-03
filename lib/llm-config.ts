export type LlmConfig = {
  readonly provider: string;
  readonly model: string;
  readonly apiKey: string;
  readonly baseUrl: string;
};

export type LlmConfigResult =
  | { readonly configured: true; readonly config: LlmConfig }
  | { readonly configured: false; readonly missing: readonly string[] };

export function readLlmConfig(env: NodeJS.ProcessEnv = process.env): LlmConfigResult {
  const provider = env.LLM_PROVIDER?.trim() || "openai-compatible";
  const model = env.LLM_MODEL?.trim() || "";
  const apiKey = env.LLM_API_KEY?.trim() || "";
  const baseUrl = (env.LLM_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/+$/, "");
  const missing = [
    ...(model ? [] : ["LLM_MODEL"]),
    ...(apiKey ? [] : ["LLM_API_KEY"]),
  ];

  try {
    const url = new URL(baseUrl);
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      missing.push("LLM_BASE_URL (use HTTPS, or localhost for a local provider)");
    }
  } catch {
    missing.push("LLM_BASE_URL (must be a valid URL)");
  }

  if (missing.length > 0) return { configured: false, missing };
  return { configured: true, config: { provider, model, apiKey, baseUrl } };
}
