import assert from "node:assert/strict";
import test from "node:test";

import {
  AGENT_DEFAULTS,
  AGENT_TOOLS,
  FORBIDDEN_GAMIFICATION_KEYS,
  NON_COERCIVE,
  PROVIDER_PRESETS,
  STAGES,
  createAgentProfile,
  createLearnerProfile,
  createMaterial,
  createPathStage,
  createPreferences,
  createProviderConfig,
  describeProgress,
  findForbiddenKeys,
  resolveProvider,
} from "../src/model/entities.js";
import { createGuiModel, GUI_TOOLS } from "../src/model/gui.js";
import { createDefaultPathStages, createWebUiModel, WEBUI_TOOLS } from "../src/model/webui.js";
import {
  emptyExplainState,
  emptyLexicalEntryState,
  listTrackedExpressions,
  requestExplain,
  requestLexicalEntry,
} from "../src/model/empty.js";

test("neither shell model contains功利化 keys (XP, streak, badge, chest, goal ring)", () => {
  for (const model of [createWebUiModel(), createGuiModel(), createDefaultPathStages()]) {
    assert.deepEqual(findForbiddenKeys(model), [], "gamification key leaked into a shell model");
  }
  assert.ok(FORBIDDEN_GAMIFICATION_KEYS.includes("xp"));
  assert.ok(FORBIDDEN_GAMIFICATION_KEYS.includes("streak"));
  assert.ok(FORBIDDEN_GAMIFICATION_KEYS.includes("chest"));
});

test("non-coercive stance is encoded, not just documented", () => {
  assert.equal(NON_COERCIVE.minTurnsPerItem, null);
  assert.equal(NON_COERCIVE.requiredContextSwitch, false);
  assert.equal(NON_COERCIVE.scheduledReview, false);
  assert.equal(NON_COERCIVE.lockedStages, false);
  assert.equal(NON_COERCIVE.remindersByDefault, false);
  for (const model of [createWebUiModel(), createGuiModel()]) {
    assert.deepEqual(model.progress, NON_COERCIVE);
    assert.equal(model.native.notifications, false, "notifications must be opt-in");
  }
});

test("path stages describe rather than gate", () => {
  const stages = createDefaultPathStages();
  assert.equal(stages.length, 3);
  for (const stage of stages) {
    assert.deepEqual(Object.keys(stage).sort(), ["description", "examples", "id", "title"]);
    assert.ok(!("locked" in stage) && !("unlockAfter" in stage) && !("reward" in stage));
  }
});

test("progress reads as an evidence sentence, never a percentage", () => {
  const zero = describeProgress({ stage: "understood", independentUses: 0, independentContexts: 0, lastIndependentAt: null, itemLabel: "figure out" });
  assert.match(zero, /还没有独立使用的记录/);
  const some = describeProgress({ stage: "spontaneous_production", independentUses: 2, independentContexts: 2, lastIndependentAt: "2026-10-02", itemLabel: "figure out" });
  assert.equal(some, "figure out：已在 2 个情境中独立使用 2 次，最近一次是 2026-10-02。");
  for (const text of [zero, some]) assert.ok(!text.includes("%"));
});

test("both shells share the seven screens and identical tool states", () => {
  const web = createWebUiModel();
  const gui = createGuiModel();
  assert.deepEqual(web.screens, gui.screens);
  assert.deepEqual(web.screens, ["conversation", "new", "recent", "language", "path", "library", "settings"]);
  assert.deepEqual(web.tools, gui.tools);
  assert.equal(WEBUI_TOOLS.find((t) => t.id === "explain").state, "empty");
  assert.equal(GUI_TOOLS.find((t) => t.id === "explain").state, "empty");
  assert.equal(web.tools.length, 5, "rewrite, scenario, listening, review, explain");
});

test("shells differ in storage, navigation and secrets as modelled", () => {
  const web = createWebUiModel();
  const gui = createGuiModel();

  assert.equal(web.storage.conversations, "indexeddb");
  assert.equal(web.storage.keys, "browser-secure-store");
  assert.equal(web.navigation.history, "browser");
  assert.equal(web.routes.settings, "/settings");
  assert.equal(web.session.multiTabLock, true);
  assert.equal(web.engine.requiresServer, false);

  assert.equal(gui.storage.conversations, "sqlite");
  assert.equal(gui.storage.keys, "os-keychain");
  assert.equal(gui.navigation.history, "in-app-stack");
  assert.equal(gui.navigation.deepLinks, "unjot://");
  assert.equal(gui.window.singleInstance, true);
  assert.equal(gui.window.inlineBuild, true);
  assert.equal(gui.engine.placement, "in-process");
});

test("Explain and lexical entries stay empty and say why", () => {
  assert.deepEqual(emptyExplainState(), {
    status: "empty",
    reason: "explain-deferred",
    request: null,
    result: null,
  });
  assert.equal(requestExplain({ text: "Could I get a flat white?" }).status, "unavailable");

  const entry = emptyLexicalEntryState();
  assert.equal(entry.status, "empty");
  assert.equal(entry.reason, "lexical-entry-deferred");
  assert.equal(entry.item, null);
  assert.equal(entry.progress, null);
  assert.deepEqual(entry.related, []);
  assert.equal(requestLexicalEntry("sense:figure_out%2:31:00::").status, "unavailable");
  assert.deepEqual(listTrackedExpressions(), []);
});

test("entity builders stay aligned with the protocol vocabulary", () => {
  assert.equal(STAGES.length, 5);
  assert.equal(createLearnerProfile().statedLevel, null);
  assert.throws(() => createLearnerProfile({ statedLevel: "A2" }), /levelSource/);
  assert.equal(createLearnerProfile({ statedLevel: "A2", levelSource: "self_reported" }).statedLevel, "A2");

  const prefs = createPreferences();
  assert.equal(prefs.correctionMode, false, "correction mode defaults off");
  assert.equal(prefs.reminders, false);
  assert.deepEqual(findForbiddenKeys(prefs), []);

  assert.throws(() => createMaterial({ id: "m1", kind: "video", title: "x" }), /unknown material kind/);
  const article = createMaterial({ id: "m2", kind: "article", title: "Coffee", wordCount: 620, level: "B1" });
  assert.equal(article.level, "B1");
  assert.equal(createPathStage({ id: "s", title: "t", description: "d" }).examples.length, 0);
});

test("agent defaults answer rather than push, and never expose the empty Explain tool", () => {
  assert.equal(AGENT_DEFAULTS.proactive, "respond_only");
  assert.equal(AGENT_DEFAULTS.correction, "on_request");
  assert.equal(AGENT_DEFAULTS.memory, "all_history");
  assert.equal(AGENT_DEFAULTS.level, "follow_learner");
  assert.deepEqual(AGENT_TOOLS, ["rewrite", "scenario", "listening"]);

  const agent = createAgentProfile();
  assert.equal(agent.name, "Unjot");
  assert.equal(agent.proactive, "respond_only");
  assert.deepEqual(agent.tools, ["rewrite", "scenario", "listening"]);
  assert.ok(!agent.tools.includes("explain"), "Explain is unmodelled, so it cannot be an agent tool");
  assert.deepEqual(findForbiddenKeys(agent), []);
});

test("agent profile validates its enums and tool list", () => {
  assert.throws(() => createAgentProfile({ proactive: "nag" }), /unknown proactive/);
  assert.throws(() => createAgentProfile({ memory: "forever" }), /unknown memory/);
  assert.throws(() => createAgentProfile({ correction: "always" }), /unknown correction/);
  assert.throws(() => createAgentProfile({ tools: ["explain"] }), /cannot use tool/);
  assert.equal(createAgentProfile({ proactive: "ask_followup", memory: "session" }).memory, "session");
});

test("provider presets cover mainstream services, with a key page for the hosted ones", () => {
  const ids = PROVIDER_PRESETS.map((preset) => preset.id);
  for (const id of ["openai", "anthropic", "google", "deepseek", "moonshot", "qwen", "zhipu", "openrouter", "ollama"]) {
    assert.ok(ids.includes(id), `missing provider preset: ${id}`);
  }
  for (const preset of PROVIDER_PRESETS) {
    if (preset.local) {
      assert.ok(preset.baseUrl, `${preset.id} runs locally and needs a baseUrl`);
      assert.equal(preset.keysUrl, undefined);
    } else {
      assert.match(preset.keysUrl, /^https:\/\//, `${preset.id} needs an https key page`);
    }
    // 界面上的"拿 Key 的入口"整列由模型渲染，所以每一项都得有可点的链接
    const entry = preset.keysUrl ?? preset.downloadUrl;
    assert.match(entry, /^https:\/\//, `${preset.id} needs a keys or download link`);
  }
});

test("custom provider space needs a base URL and never stores the raw secret", () => {
  const custom = createProviderConfig({ provider: "custom", baseUrl: "https://gateway.internal/v1", model: "qwen-plus" });
  assert.equal(custom.baseUrl, "https://gateway.internal/v1");
  assert.equal(custom.keyRef, null);

  assert.throws(() => createProviderConfig({ provider: "custom" }), /needs a baseUrl/);
  assert.throws(() => createProviderConfig({ provider: "nope" }), /unknown provider/);
  assert.throws(() => createProviderConfig({ provider: "openai", keyRef: "sk-abc123" }), /key store/);

  const safe = createProviderConfig({ provider: "openai", keyRef: "browser-secure-store:openai" });
  assert.equal(safe.keyRef, "browser-secure-store:openai");
  assert.deepEqual(findForbiddenKeys(safe), []);
});

test("picking a mainstream provider auto-fills its endpoint and default model", () => {
  for (const preset of PROVIDER_PRESETS) {
    assert.match(preset.baseUrl, /^https?:\/\//, `${preset.id} needs an endpoint`);
    assert.ok(preset.defaultModel, `${preset.id} needs a default model`);

    const config = createProviderConfig({ provider: preset.id });
    assert.equal(config.baseUrl, preset.baseUrl);
    assert.equal(config.model, preset.defaultModel);
    assert.equal(config.keyRef, null);
  }

  const openai = createProviderConfig({ provider: "openai" });
  assert.equal(openai.baseUrl, "https://api.openai.com/v1");
  const overridden = createProviderConfig({ provider: "openai", baseUrl: "https://gateway.internal/v1", model: "gpt-4o" });
  assert.equal(overridden.baseUrl, "https://gateway.internal/v1");
  assert.equal(overridden.model, "gpt-4o");
});

test("custom provider keeps its own base URL and rejects malformed ones", () => {
  const custom = createProviderConfig({ provider: "custom", baseUrl: "http://192.168.1.9:8000/v1" });
  assert.equal(custom.provider, "custom");
  assert.equal(custom.baseUrl, "http://192.168.1.9:8000/v1");
  assert.equal(custom.model, null);

  assert.throws(() => createProviderConfig({ provider: "custom" }), /needs a baseUrl/);
  assert.throws(() => createProviderConfig({ provider: "custom", baseUrl: "gateway.internal/v1" }), /absolute http\(s\) URL/);
  assert.equal(resolveProvider("openai").id, "openai");
  assert.equal(resolveProvider("custom"), null);
  assert.equal(resolveProvider("nope"), null);
});
