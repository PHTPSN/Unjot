/**
 * Frontend data model for unjot — shared vocabulary for both shells.
 *
 * Derived from the prototype's seven screens, with two decisions applied:
 *   1. Non-coercive: no gates, no minimum turns, no scheduled review, no locks.
 *   2. De-gamified: no XP, streaks, badges, goal rings, chests, or confetti.
 *      Progress is described with evidence sentences, never a score.
 *
 * Field names for conversations and observations stay aligned with the shared
 * contracts in packages/protocol/src so the UI model can be filled by them.
 */

/** Learner stages, mirroring packages/protocol/src/learner-item-state.ts. */
export const STAGES = Object.freeze([
  "encountered",
  "understood",
  "assisted_production",
  "spontaneous_production",
  "repeated_independent_use",
]);

/** Observation kinds, mirroring packages/protocol/src/evidence-event.ts. */
export const OBSERVATION_KINDS = Object.freeze([
  "encountered",
  "recognized",
  "help_requested",
  "supplied",
  "assisted_production",
  "spontaneous_production",
  "failed_opportunity",
  "uncertain",
]);

/**
 * Keys that must never appear in a shell model. They are the功利化 surface of the
 * prototype (XP, streaks, badges, goal rings, reward chests, celebration).
 */
export const FORBIDDEN_GAMIFICATION_KEYS = Object.freeze([
  "xp", "xpNum", "streak", "streakDays", "badge", "badges",
  "levelUp", "reward", "rewards", "chest", "goalPercent", "goalRing",
  "goalCount", "weekDots", "score", "points", "confetti", "leaderboard",
  "rank", "combo",
]);

/** Non-coercive rules the models are expected to honour. */
export const NON_COERCIVE = Object.freeze({
  minTurnsPerItem: null,
  requiredContextSwitch: false,
  scheduledReview: false,
  lockedStages: false,
  remindersByDefault: false,
  progressDisplay: "evidence_sentence",
});

/** @param {unknown} root @param {readonly string[]} keys */
export function findForbiddenKeys(root, keys = FORBIDDEN_GAMIFICATION_KEYS) {
  const found = new Set();
  const seen = new WeakSet();
  const walk = (node) => {
    if (node === null || typeof node !== "object") return;
    if (seen.has(node)) return;
    seen.add(node);
    for (const [key, value] of Object.entries(node)) {
      if (keys.includes(key)) found.add(key);
      walk(value);
    }
  };
  walk(root);
  return [...found];
}

/**
 * Describe item progress the way the product wants to show it: concrete
 * evidence, never a percentage.
 *
 * @param {object} progress
 * @param {string} progress.stage
 * @param {number} progress.independentUses
 * @param {number} progress.independentContexts
 * @param {string | null} progress.lastIndependentAt
 * @param {string} progress.itemLabel
 */
export function describeProgress({ stage, independentUses, independentContexts, lastIndependentAt, itemLabel }) {
  if (!STAGES.includes(stage)) throw new TypeError(`unknown stage: ${stage}`);
  if (independentUses === 0) return `${itemLabel}：还没有独立使用的记录。`;
  const contexts = independentContexts === 1 ? "1 个情境" : `${independentContexts} 个情境`;
  const when = lastIndependentAt === null ? "" : `，最近一次是 ${lastIndependentAt}`;
  return `${itemLabel}：已在 ${contexts}中独立使用 ${independentUses} 次${when}。`;
}

/** @param {object} input */
export function createLearnerProfile({
  nativeLanguage = "zh",
  targetLanguage = "en",
  statedLevel = null,
  levelSource = null,
} = {}) {
  if (statedLevel !== null && levelSource === null) {
    throw new TypeError("a stated level needs levelSource: 'self_reported' or 'inferred'");
  }
  if (levelSource !== null && !["self_reported", "inferred"].includes(levelSource)) {
    throw new TypeError(`unknown levelSource: ${levelSource}`);
  }
  return Object.freeze({ nativeLanguage, targetLanguage, statedLevel, levelSource });
}

/** @param {object} input */
export function createPreferences({
  correctionMode = false,
  thinkFirst = false,
  vocabularyFollowsLevel = true,
  theme = "dark",
  accent = "grad",
  uiLanguage = "zh",
  textSize = "normal",
  reducedMotion = null,
  sound = false,
  reminders = false,
} = {}) {
  return Object.freeze({
    correctionMode, thinkFirst, vocabularyFollowsLevel,
    theme, accent, uiLanguage, textSize,
    reducedMotion, sound, reminders,
  });
}

/** Path stages describe what becomes possible; they never gate access. */
export function createPathStage({ id, title, description, examples = [] }) {
  return Object.freeze({ id, title, description, examples: Object.freeze([...examples]) });
}

/**
 * Mainstream model providers: endpoint, default model, and where the learner
 * gets a key. The settings screen auto-fills the first two from this table, so
 * the UI never hardcodes a URL that the backend does not also know.
 * `local` providers run on the machine and need no key.
 */
export const PROVIDER_PRESETS = Object.freeze([
  { id: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", defaultModel: "gpt-4o-mini", keysUrl: "https://platform.openai.com/api-keys" },
  { id: "anthropic", label: "Anthropic Claude", baseUrl: "https://api.anthropic.com/v1", defaultModel: "claude-3-5-sonnet-latest", keysUrl: "https://console.anthropic.com/settings/keys" },
  { id: "google", label: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta", defaultModel: "gemini-2.0-flash", keysUrl: "https://aistudio.google.com/app/apikey" },
  { id: "deepseek", label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", defaultModel: "deepseek-chat", keysUrl: "https://platform.deepseek.com/api_keys" },
  { id: "moonshot", label: "Moonshot / Kimi", baseUrl: "https://api.moonshot.cn/v1", defaultModel: "moonshot-v1-8k", keysUrl: "https://platform.moonshot.cn/console/api-keys" },
  { id: "qwen", label: "阿里通义百炼", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", defaultModel: "qwen-plus", keysUrl: "https://bailian.console.aliyun.com/" },
  { id: "zhipu", label: "智谱 GLM", baseUrl: "https://open.bigmodel.cn/api/paas/v4", defaultModel: "glm-4-plus", keysUrl: "https://open.bigmodel.cn/usercenter/apikeys" },
  { id: "openrouter", label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", defaultModel: "openai/gpt-4o-mini", keysUrl: "https://openrouter.ai/keys" },
  {
    id: "ollama",
    label: "Ollama（本地）",
    baseUrl: "http://localhost:11434/v1",
    defaultModel: "llama3.2",
    local: true,
    downloadUrl: "https://ollama.com/download",
  },
]);

/** @param {string} id @returns {(typeof PROVIDER_PRESETS)[number] | null} */
export function resolveProvider(id) {
  return PROVIDER_PRESETS.find((preset) => preset.id === id) ?? null;
}

/** The Explain tool is deliberately unmodelled, so it is never an agent tool. */
export const AGENT_TOOLS = Object.freeze(["rewrite", "scenario", "listening"]);

/** Agent defaults follow the non-coercive stance: it answers, it does not push. */
export const AGENT_DEFAULTS = Object.freeze({
  uiLanguage: "follow_ui",
  correction: "on_request",
  proactive: "respond_only",
  memory: "all_history",
  level: "follow_learner",
  tools: AGENT_TOOLS,
});

const AGENT_ENUMS = Object.freeze({
  uiLanguage: ["follow_ui", "zh", "en"],
  correction: ["never", "on_request", "when_natural"],
  proactive: ["respond_only", "ask_followup", "suggest_practice"],
  memory: ["session", "all_history"],
  level: ["follow_learner", "simpler", "natural"],
});

/** @param {object} input */
export function createAgentProfile({
  name = "Unjot",
  uiLanguage = AGENT_DEFAULTS.uiLanguage,
  model = null,
  correction = AGENT_DEFAULTS.correction,
  proactive = AGENT_DEFAULTS.proactive,
  memory = AGENT_DEFAULTS.memory,
  level = AGENT_DEFAULTS.level,
  instructions = "",
  tools = AGENT_TOOLS,
} = {}) {
  const chosen = { uiLanguage, correction, proactive, memory, level };
  for (const [field, allowed] of Object.entries(AGENT_ENUMS)) {
    if (!allowed.includes(chosen[field])) {
      throw new TypeError(`unknown ${field}: ${chosen[field]}`);
    }
  }
  for (const tool of tools) {
    if (!AGENT_TOOLS.includes(tool)) {
      throw new TypeError(`agent cannot use tool: ${tool}`);
    }
  }
  return Object.freeze({
    name,
    uiLanguage,
    model,
    correction,
    proactive,
    memory,
    level,
    instructions,
    tools: Object.freeze([...tools]),
  });
}

/** Raw secrets never enter the model; only a reference to a local key store does. */
const RAW_SECRET = /^(sk-|sk_|AIza|gsk_|Bearer\s)/;

/**
 * @param {object} input
 * Mainstream providers auto-fill `baseUrl` and `model` from the preset;
 * `provider: "custom"` is the only case that must bring its own `baseUrl`.
 */
export function createProviderConfig({ provider, baseUrl = null, model = null, keyRef = null }) {
  const preset = resolveProvider(provider);
  if (preset === null && provider !== "custom") {
    throw new TypeError(`unknown provider: ${provider}`);
  }
  const resolvedBaseUrl = baseUrl ?? preset?.baseUrl ?? null;
  if (!resolvedBaseUrl) {
    throw new TypeError("a custom provider needs a baseUrl");
  }
  if (!/^https?:\/\/[^\s]+$/.test(resolvedBaseUrl)) {
    throw new TypeError(`baseUrl must be an absolute http(s) URL: ${resolvedBaseUrl}`);
  }
  if (typeof keyRef === "string" && RAW_SECRET.test(keyRef)) {
    throw new TypeError("keyRef must reference a key store, not hold the secret");
  }
  return Object.freeze({
    provider,
    baseUrl: resolvedBaseUrl,
    model: model ?? preset?.defaultModel ?? null,
    keyRef,
  });
}

/** @param {object} input */
export function createScenario({ situation, learnerRole, aiRole, goals = [], difficulty = null, targetExpressions = [] }) {
  return Object.freeze({
    situation, learnerRole, aiRole,
    goals: Object.freeze([...goals]),
    difficulty,
    targetExpressions: Object.freeze([...targetExpressions]),
  });
}

/** @param {object} input */
export function createMaterial({ id, kind, title, wordCount = null, durationSec = null, level = null, saved = false, sourceConversationId = null }) {
  if (!["article", "audio"].includes(kind)) throw new TypeError(`unknown material kind: ${kind}`);
  return Object.freeze({ id, kind, title, wordCount, durationSec, level, saved, sourceConversationId });
}
