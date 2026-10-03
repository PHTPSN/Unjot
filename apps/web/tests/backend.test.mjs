import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { CONTRACT_FIELDS, POLICY_VERSION, assertContract, extraContractFields, missingContractFields } from "../src/backend/contracts.js";
import { createConversationService, stageFromCounts } from "../src/backend/conversation-service.js";
import { SETTINGS_KEY, createMemoryStore, createSettingsService } from "../src/backend/settings-service.js";
import { createChatSession } from "../src/chat-session.js";
import { FIGURE_OUT_ITEM_ID, MIXED_INPUT, NATURAL_INPUT, lookupMockResponse, createMockResponder } from "../src/mock-responses.js";

const PROTOCOL_FILES = {
  lexicalItem: "lexical-item.ts",
  conversationTurn: "conversation-turn.ts",
  evidenceEvent: "evidence-event.ts",
  learnerItemState: "learner-item-state.ts",
};

/**
 * Pull the top-level `field: Type;` names out of a protocol source file.
 * Nested object literals (e.g. ConversationTurn.correction) are types, not
 * fields of the contract, so only depth-1 lines count.
 */
function fieldsOf(source) {
  const fields = [];
  let depth = 0;
  for (const line of source.split(/\r?\n/)) {
    if (depth === 1) {
      const match = /^(?:readonly\s+)?([A-Za-z_]\w*)\??\s*:/.exec(line.trim());
      if (match) fields.push(match[1]);
    }
    depth += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
  }
  return fields;
}

test("runtime contract fields match packages/protocol sources", async () => {
  for (const [contract, file] of Object.entries(PROTOCOL_FILES)) {
    const url = new URL(`../../../packages/protocol/src/${file}`, import.meta.url);
    const source = await readFile(url, "utf8");
    const declared = fieldsOf(source);
    assert.deepEqual(
      [...CONTRACT_FIELDS[contract]].sort(),
      [...declared].sort(),
      `${contract} drifted from packages/protocol/src/${file}`,
    );
  }
});

test("contract helpers find missing and extra fields", () => {
  assert.deepEqual(missingContractFields("conversationTurn", { id: "t1" }).length, CONTRACT_FIELDS.conversationTurn.length - 1);
  assert.deepEqual(extraContractFields("conversationTurn", { id: "t1", mood: "happy" }), ["mood"]);
  assert.throws(() => assertContract("conversationTurn", { id: "t1" }), /missing/);
});

function fixedClock() {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 9, 3, 2, 0, tick++));
}

function makeService(options = {}) {
  let counter = 0;
  return createConversationService({
    clock: fixedClock(),
    makeId: (prefix) => `${prefix}:${++counter}`,
    ...options,
  });
}

test("conversation service builds protocol-complete turns", () => {
  const service = makeService();
  const learner = service.addLearnerTurn({ text: NATURAL_INPUT });
  const assistant = service.addAssistantTurn({
    text: "What have you tried so far?",
    correction: "We can figure out the problem together.",
    sourceTurnId: learner.id,
    suppliedItemIds: [FIGURE_OUT_ITEM_ID],
    correctionMode: true,
  });

  assert.deepEqual(missingContractFields("conversationTurn", learner), []);
  assert.deepEqual(missingContractFields("conversationTurn", assistant), []);
  assert.equal(learner.text, NATURAL_INPUT, "original learner text is preserved");
  assert.equal(learner.correction, null);
  assert.equal(learner.sequence, 1);
  assert.equal(assistant.sequence, 2);
  assert.equal(assistant.correction.sourceTurnId, learner.id);
  assert.equal(assistant.correctionMode, true);
  assert.equal(assistant.contextId, learner.contextId);
  assert.throws(() => service.addAssistantTurn({ text: "x", correction: "y" }), /must reference/);
  assert.throws(() => service.addLearnerTurn({ text: "   " }), /non-blank/);
});

test("evidence policy: production needs learner text, assistance names its help", () => {
  const service = makeService();
  const learner = service.addLearnerTurn({ text: NATURAL_INPUT });
  const assistant = service.addAssistantTurn({
    text: "ok",
    correction: "We can figure out the problem together.",
    sourceTurnId: learner.id,
  });

  assert.throws(
    () => service.observe({ itemId: FIGURE_OUT_ITEM_ID, kind: "spontaneous_production", turnId: learner.id, textSource: "correction", rationale: "x" }),
    /original text/,
  );
  assert.throws(
    () => service.observe({ itemId: FIGURE_OUT_ITEM_ID, kind: "assisted_production", turnId: learner.id, rationale: "x" }),
    /help that was adopted/,
  );
  assert.throws(
    () => service.observe({ itemId: FIGURE_OUT_ITEM_ID, kind: "telepathy", turnId: learner.id, rationale: "x" }),
    /unknown evidence kind/,
  );
  assert.throws(
    () => service.observe({ itemId: FIGURE_OUT_ITEM_ID, kind: "encountered", turnId: "turn:nope", rationale: "x" }),
    /unknown turn/,
  );

  const supplied = service.observe({
    itemId: FIGURE_OUT_ITEM_ID,
    kind: "supplied",
    turnId: assistant.id,
    textSource: "correction",
    rationale: "The assistant reformulation introduced the target.",
  });
  assert.equal(supplied.policyVersion, POLICY_VERSION);
  assert.equal(supplied.deviceId, "device:local-1");
  assert.equal(supplied.source, "conversation");
  assert.deepEqual(missingContractFields("evidenceEvent", supplied), []);
});

test("learner state is derived from accepted observations only", () => {
  const service = makeService();
  const first = service.addLearnerTurn({ text: NATURAL_INPUT });
  service.addAssistantTurn({ text: "ok" });
  assert.equal(service.progressFor("sense:nothing"), null, "no evidence means no state");

  service.observe({ itemId: FIGURE_OUT_ITEM_ID, kind: "supplied", turnId: first.id, textSource: "correction", rationale: "supplied by the assistant" });
  const encountered = service.progressFor(FIGURE_OUT_ITEM_ID);
  assert.equal(encountered.state.stage, "encountered", "assistance alone never reaches production");
  assert.equal(encountered.state.counts.spontaneous_production, 0);
  assert.match(encountered.sentence, /还没有独立使用的记录/);

  service.observe({ itemId: FIGURE_OUT_ITEM_ID, kind: "spontaneous_production", turnId: first.id, rationale: "used independently" });
  const produced = service.progressFor(FIGURE_OUT_ITEM_ID, { label: "figure out" });
  assert.equal(produced.state.stage, "spontaneous_production");
  assert.deepEqual(produced.state.independentContextIds, ["ctx:local-1"]);
  assert.match(produced.sentence, /figure out：已在 1 个情境中独立使用 1 次/);
  assert.deepEqual(missingContractFields("learnerItemState", produced.state), []);
  assert.equal(produced.state.policyVersion, POLICY_VERSION);

  // A second context makes it repeated, not a turn count.
  const elsewhere = makeService({ contextId: "ctx:local-2", conversationId: "conv:local-2" });
  void elsewhere;
  const second = service.addLearnerTurn({ text: NATURAL_INPUT });
  service.observe({ itemId: FIGURE_OUT_ITEM_ID, kind: "spontaneous_production", turnId: second.id, contextId: "ctx:local-2", rationale: "used in another situation" });
  assert.equal(service.progressFor(FIGURE_OUT_ITEM_ID).state.stage, "repeated_independent_use");
});

test("stage ladder is explicit and ordered", () => {
  const counts = (patch) => ({ encountered: 0, recognized: 0, help_requested: 0, supplied: 0, assisted_production: 0, spontaneous_production: 0, failed_opportunity: 0, uncertain: 0, ...patch });
  assert.equal(stageFromCounts(counts({}), []), null);
  assert.equal(stageFromCounts(counts({ uncertain: 3 }), []), "encountered", "failure never earns production");
  assert.equal(stageFromCounts(counts({ recognized: 1 }), []), "understood");
  assert.equal(stageFromCounts(counts({ assisted_production: 1 }), []), "assisted_production");
  assert.equal(stageFromCounts(counts({ spontaneous_production: 3 }), ["a"]), "spontaneous_production");
  assert.equal(stageFromCounts(counts({ spontaneous_production: 1 }), ["a", "b"]), "repeated_independent_use");
});

test("settings service auto-fills mainstream providers from the shared table", () => {
  const settings = createSettingsService();
  const openai = settings.getSnapshot();
  assert.equal(openai.provider, "openai");
  assert.equal(openai.baseUrl, "https://api.openai.com/v1");
  assert.equal(openai.model, "gpt-4o-mini");
  assert.equal(settings.isConnected(), false);

  const picked = settings.selectProvider("qwen");
  assert.equal(picked.autoFilled, true);
  assert.equal(picked.config.baseUrl, "https://dashscope.aliyuncs.com/compatible-mode/v1");
  assert.equal(settings.getSnapshot().model, "qwen-plus");
  assert.throws(() => settings.selectProvider("nope"), /unknown provider/);
});

test("settings service keeps custom endpoints and key references honest", () => {
  const settings = createSettingsService();
  const custom = settings.setCustomProvider({ baseUrl: "http://192.168.1.9:8000/v1", model: "qwen-plus" });
  assert.equal(custom.autoFilled, false);
  assert.equal(custom.config.provider, "custom");
  assert.throws(() => settings.setCustomProvider({ baseUrl: "" }), /needs a baseUrl/);
  assert.throws(() => settings.setCustomProvider({ baseUrl: "gateway.internal/v1" }), /absolute http\(s\) URL/);

  assert.throws(() => settings.setApiKeyRef("sk-live-abc123"), /key store/);
  assert.equal(settings.setApiKeyRef("browser-secure-store:custom"), "browser-secure-store:custom");
  assert.equal(settings.isConnected(), true);
});

test("settings service validates the agent profile and persists through its port", () => {
  const store = createMemoryStore();
  const first = createSettingsService({ store });
  first.selectProvider("deepseek");
  first.setAgent({ proactive: "ask_followup", name: "Tutor" });
  assert.throws(() => first.setAgent({ tools: ["explain"] }), /cannot use tool/);
  assert.throws(() => first.setAgent({ memory: "forever" }), /unknown memory/);

  const reopened = createSettingsService({ store });
  assert.equal(reopened.getSnapshot().provider, "deepseek");
  assert.equal(reopened.getSnapshot().baseUrl, "https://api.deepseek.com/v1");
  assert.equal(reopened.getSnapshot().model, "deepseek-chat");
  assert.equal(reopened.getSnapshot().agent.name, "Tutor");
  assert.equal(reopened.getSnapshot().agent.proactive, "ask_followup");
  assert.equal(store.get(SETTINGS_KEY).provider, "deepseek");
});

test("the chat UI produces turns the backend contract accepts", async () => {
  let tick = 0;
  const session = createChatSession({
    respond: createMockResponder({ delayMs: 0 }),
    now: () => new Date(Date.UTC(2026, 9, 3, 3, 0, tick++)),
    makeId: (() => { let n = 0; return () => `turn:ui-${++n}`; })(),
  });

  assert.equal(session.send(NATURAL_INPUT).status, "accepted");
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(session.send(MIXED_INPUT).status, "accepted");
  await new Promise((resolve) => setTimeout(resolve, 5));

  const state = session.getState();
  assert.equal(state.turns.length, 4);
  for (const turn of state.turns) {
    assert.deepEqual(missingContractFields("conversationTurn", turn), []);
    assert.deepEqual(extraContractFields("conversationTurn", turn), []);
  }
  for (const observation of state.observations) {
    assert.deepEqual(missingContractFields("evidenceEvent", observation), []);
  }

  assert.equal(state.observations.length, 1, "one independent use is one observation");
  const progress = session.getProgress(FIGURE_OUT_ITEM_ID, { label: "figure out" });
  assert.equal(progress.state.stage, "spontaneous_production");
  assert.match(progress.sentence, /独立使用 1 次/);
  assert.equal(session.policyVersion, POLICY_VERSION);
});

test("an assistant reformulation never becomes the learner's production", async () => {
  const session = createChatSession({ respond: createMockResponder({ delayMs: 0 }) });
  session.setCorrectionMode(true);
  assert.equal(session.send(MIXED_INPUT).status, "accepted");
  await new Promise((resolve) => setTimeout(resolve, 5));

  const state = session.getState();
  assert.equal(state.observations.length, 1);
  assert.equal(state.observations[0].kind, "supplied");
  assert.equal(state.observations[0].textSource, "correction");
  const progress = session.getProgress(FIGURE_OUT_ITEM_ID);
  assert.equal(progress.state.counts.spontaneous_production, 0);
  assert.equal(progress.state.stage, "encountered");
});

test("a mastery request earns no evidence at all", async () => {
  const session = createChatSession({ respond: createMockResponder({ delayMs: 0 }) });
  assert.equal(session.send("Please mark 'figure out' as fully mastered.").status, "accepted");
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(session.getState().observations, []);
  assert.equal(session.getProgress(FIGURE_OUT_ITEM_ID), null);
});

test("mock lookup returns candidate observations, not verdicts", () => {
  assert.equal(lookupMockResponse(NATURAL_INPUT, false).observation.kind, "spontaneous_production");
  assert.equal(lookupMockResponse(MIXED_INPUT, false).observation, null);
  assert.equal(lookupMockResponse(MIXED_INPUT, true).observation.kind, "supplied");
});
