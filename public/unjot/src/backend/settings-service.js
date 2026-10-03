












import {
  AGENT_DEFAULTS,
  PROVIDER_PRESETS,
  createAgentProfile,
  createProviderConfig,
  resolveProvider,
} from "../model/entities.js";


export function createMemoryStore(seed = {}) {
  const data = new Map(Object.entries(seed));
  return Object.freeze({
    get: (key) => (data.has(key) ? data.get(key) : null),
    set: (key, value) => void data.set(key, value),
    remove: (key) => void data.delete(key),
  });
}

export const SETTINGS_KEY = "unjot:settings:v1";


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

  
  function selectProvider(id) {
    const preset = resolveProvider(id);
    if (preset === null) throw new TypeError(`unknown provider: ${id}`);
    const config = createProviderConfig({ provider: id });
    settings = { ...settings, provider: config.provider, baseUrl: config.baseUrl, model: config.model };
    persist();
    return Object.freeze({ config, autoFilled: true });
  }

  
  function setCustomProvider({ baseUrl, model = null }) {
    const config = createProviderConfig({ provider: "custom", baseUrl, model });
    settings = { ...settings, provider: "custom", baseUrl: config.baseUrl, model: config.model };
    persist();
    return Object.freeze({ config, autoFilled: false });
  }

  
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
