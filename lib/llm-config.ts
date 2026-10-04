export type LlmConfig = {
  readonly provider: string;
  readonly model: string;
  readonly apiKey: string;
  readonly baseUrl: string;
};

export type PersistedAppSettings = LlmConfig & {
  readonly language: "zh" | "en";
};

export type LlmConfigResult =
  | { readonly configured: true; readonly config: LlmConfig }
  | { readonly configured: false; readonly missing: readonly string[] };

export function resolveAppSettings(env: NodeJS.ProcessEnv = process.env, saved?: Partial<PersistedAppSettings>): PersistedAppSettings {
  const provider = saved?.provider?.trim() ?? (env.LLM_PROVIDER?.trim() || "openai-compatible");
  const model = saved?.model?.trim() ?? (env.LLM_MODEL?.trim() || "");
  const apiKey = saved?.apiKey?.trim() ?? (env.LLM_API_KEY?.trim() || "");
  const baseUrl = (saved?.baseUrl?.trim() ?? (env.LLM_BASE_URL?.trim() || "https://api.openai.com/v1")).replace(/\/+$/, "");
  return { provider, model, apiKey, baseUrl, language: saved?.language === "zh" ? "zh" : "en" };
}

export function readLlmConfig(env: NodeJS.ProcessEnv = process.env, saved?: Partial<PersistedAppSettings>): LlmConfigResult {
  const { provider, model, apiKey, baseUrl } = resolveAppSettings(env, saved);
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

export async function testLlmConnection(config: LlmConfig, fetcher: typeof fetch = fetch): Promise<void> {
  if (!config.model.trim() || !config.apiKey.trim() || !config.baseUrl.trim()) throw new Error("Model, API key, and Base URL are required.");
  const endpoint = config.baseUrl.replace(/\/+$/, "").endsWith("/models") ? config.baseUrl.replace(/\/+$/, "") : `${config.baseUrl.replace(/\/+$/, "")}/models`;
  const response = await fetcher(endpoint, { headers: { authorization: `Bearer ${config.apiKey}`, accept: "application/json" }, signal: AbortSignal.timeout(12_000), cache: "no-store" });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300).replace(/\s+/g, " ").trim();
    throw new Error(`Provider returned ${response.status}${detail ? `: ${detail}` : "."}`);
  }
}
