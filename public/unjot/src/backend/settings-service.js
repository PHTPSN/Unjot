/**
 * Settings service: provider, endpoint and agent configuration for the UI.
 *
 * All validation and auto-fill comes from the shared model layer, so the menu
 * the learner sees cannot drift from what the backend accepts:
 *   · a mainstream provider auto-fills baseUrl + default model,
 *   · only `custom` brings its own base URL (absolute http(s)),
 *   · API keys are stored as a *reference*, never as the raw secret.
 *
 * Persistence is a port. The browser build plugs in its own store; the default
 * here is in-memory so tests and the CLI stay free of browser APIs.
 */

import {
  AGENT_DEFAULTS,
  PROVIDER_PRESETS,
  createAgentProfile,
  createProviderConfig,
  resolveProvider,
} from "../model/entities.js";

/** Minimal port: anything with get/set/remove works (localStorage, file, DB). */
export function createMemoryStore(seed = {}) {
  const data = new Map(Object.entries(seed));
  return Object.freeze({
    get: (key) => (data.has(key) ? data.get(key) : null),
    set: (key, value) => void data.set(key, value),
    remove: (key) => void data.delete(key),
  });
}

export const SETTINGS_KEY = "unjot:settings:v1";

/** @param {{ store?: ReturnType<typeof createMemoryStore> }} [options] */
export function createSettingsService({ store = createMemoryStore() } = {}) {
  const initial = {
    provider: PROVIDER_PRESETS[0].id,
    baseUrl: PROVIDER_PRESETS[0].baseUrl,
    model: PROVIDER_PRESETS[0].defaultModel,
    keyRef: null,
    agent: createAgentProfile(),
  };

  const saved = store.get(SETTINGS_KEY);
  let settings = saved === null || typeof saved !== "object" ? initial : { ...initial, ...saved };

  function persist() {
    store.set(SETTINGS_KEY, {
      provider: settings.provider,
      baseUrl: settings.baseUrl,
      model: settings.model,
      keyRef: settings.keyRef,
      agent: settings.agent,
    });
  }

  /** Pick a mainstream provider: endpoint and default model come from the table. */
  function selectProvider(id) {
    const preset = resolveProvider(id);
    if (preset === null) throw new TypeError(`unknown provider: ${id}`);
    const config = createProviderConfig({ provider: id });
    settings = { ...settings, provider: config.provider, baseUrl: config.baseUrl, model: config.model };
    persist();
    return Object.freeze({ config, autoFilled: true });
  }

  /** Custom provider: the learner brings the endpoint. */
  function setCustomProvider({ baseUrl, model = null }) {
    const config = createProviderConfig({ provider: "custom", baseUrl, model });
    settings = { ...settings, provider: "custom", baseUrl: config.baseUrl, model: config.model };
    persist();
    return Object.freeze({ config, autoFilled: false });
  }

  /** Only a reference is accepted; a raw `sk-…` string is rejected. */
  function setApiKeyRef(keyRef) {
    const config = createProviderConfig({
      provider: settings.provider,
      baseUrl: settings.baseUrl,
      model: settings.model,
      keyRef,
    });
    settings = { ...settings, keyRef: config.keyRef };
    persist();
    return settings.keyRef;
  }

  /** Patch the agent profile; every field is validated by the model layer. */
  function setAgent(patch) {
    const agent = createAgentProfile({ ...settings.agent, ...patch });
    settings = { ...settings, agent };
    persist();
    return agent;
  }

  return Object.freeze({
    providerPresets: PROVIDER_PRESETS,
    agentDefaults: AGENT_DEFAULTS,
    getSnapshot: () => Object.freeze({ ...settings }),
    selectProvider,
    setCustomProvider,
    setApiKeyRef,
    setAgent,
    isConnected: () => settings.keyRef !== null,
  });
}
