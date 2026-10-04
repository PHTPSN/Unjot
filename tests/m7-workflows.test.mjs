import assert from "node:assert/strict";
import test from "node:test";
import { LearnerStore } from "../lib/learner-store.ts";
import { runExplain, runScenario } from "../lib/m7-workflows.ts";

const id = "sense:bank%1:14:00::";
const item = { id, canonicalForm: "bank", language: "en", partOfSpeech: "n", definition: "a financial institution", forms: ["bank"], lexemeId: "lex:bank", conceptId: "concept:bank", source: "oewn-2025" };
const graph = {
  findSenseIds: async form => String(form).toLowerCase() === "bank" ? [id] : [],
  getItem: async value => value === id ? item : null,
  getNeighbors: async () => [],
};
const config = { provider: "test", model: "test", apiKey: "secret", baseUrl: "https://example.test/v1" };
function response(name, value) { return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", tool_calls: [{ id: name, type: "function", function: { name, arguments: JSON.stringify(value) } }] } }] })); }

test("Explain uses graph facts and records an explicit practice target without writing Evidence", async () => {
  const store = new LearnerStore(":memory:");
  try {
    const result = await runExplain({ workflow: "explain", text: "bank", context: "The bank approved the loan.", itemId: null }, { config, graph, store, fetcher: async () => response("explain_response", { explanation: "这里解释 bank。", alternatives: [], register: "neutral", nuance: "这里是金融语境。", language: "mixed" }) });
    assert.equal(result.target.id, id);
    assert.deepEqual(result.targetBudgetException.itemIds, [id]);
    assert.equal(result.practiceTarget, id);
    assert.equal(store.evidence().length, 0);
  } finally { store.close(); }
});
test("Scenario creates a real application context and does not credit unobserved success", async () => {
  const store = new LearnerStore(":memory:");
  try {
    const result = await runScenario({ workflow: "scenario", description: "Explain a financial decision.", targetItemIds: [id] }, { config, graph, store, fetcher: async () => response("scenario_response", { situation: "你要向客户解释 bank 的决定。", learnerRole: "项目负责人", aiRole: "客户", objective: "Explain the decision clearly.", difficulty: "accessible", opening: "请开始。", language: "chinese" }) });
    assert.match(result.contextId, /^scenario:/);
    assert.deepEqual(result.targetItemIds, [id]);
    assert.equal(store.evidence().length, 0);
    assert.equal(store.workflowRuns("scenario").length, 1);
    assert.equal(store.workflowRun(result.plan.submissionId).contextId, result.contextId);
  } finally { store.close(); }
});
