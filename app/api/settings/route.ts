import { learnerStore, StoreError } from "../../../lib/learner-store.ts";
import { readLlmConfig, resolveAppSettings, type PersistedAppSettings } from "../../../lib/llm-config.ts";

export const runtime = "nodejs";

export async function GET() {
  return Response.json(publicSettings());
}

export async function PATCH(request: Request) {
  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  if (!isSettingsPatch(body)) return Response.json({ error: "Invalid application settings." }, { status: 400 });

  try {
    const store = learnerStore();
    const current = resolveAppSettings(process.env, store.appSettings() ?? undefined);
    store.saveAppSettings({
      provider: body.provider,
      model: body.model,
      apiKey: body.apiKey.trim() || current.apiKey,
      baseUrl: body.baseUrl,
      language: body.language,
    });
    return Response.json(publicSettings());
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Invalid application settings." }, { status: error instanceof StoreError ? error.status : 400 });
  }
}

function publicSettings() {
  const store = learnerStore();
  const saved = store.appSettings() ?? undefined;
  const current = resolveAppSettings(process.env, saved);
  const result = readLlmConfig(process.env, saved);
  return {
    provider: current.provider,
    model: current.model,
    baseUrl: current.baseUrl,
    language: current.language,
    apiKeyConfigured: Boolean(current.apiKey),
    configured: result.configured,
  };
}

function isSettingsPatch(value: unknown): value is PersistedAppSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const body = value as Partial<PersistedAppSettings>;
  return typeof body.provider === "string" && typeof body.model === "string" && typeof body.apiKey === "string" && typeof body.baseUrl === "string" && (body.language === "zh" || body.language === "en");
}
