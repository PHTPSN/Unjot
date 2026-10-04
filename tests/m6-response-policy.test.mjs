import assert from "node:assert/strict";
import test from "node:test";
import { budgetFor, complexityForText, segmentEnglishUnits } from "../lib/response-policy.ts";
import { createLearnerAwareReply } from "../lib/learner-aware-reply.ts";
import { DEFAULT_RESPONSE_PREFERENCES } from "../packages/protocol/src/comprehension.ts";

const sense = "sense:figure_out%2:31:00::";
const graph = {
  findSenseIds: async form => form.toLowerCase() === "figure out" ? [sense] : form.toLowerCase() === "bank" ? ["sense:bank%1:14:00::", "sense:bank%1:17:01::"] : form.toLowerCase() === "water" ? ["sense:water%1:13:00::"] : [],
};

test("M6 segmentation prefers a verified multiword span and retains ambiguity", async () => {
  const units = await segmentEnglishUnits("We can figure out the bank.", graph);
  assert.equal(units.find(unit => unit.text === "figure out").itemId, sense);
  const bank = units.find(unit => unit.text === "bank");
  assert.equal(bank.itemId, null);
  assert.equal(bank.unresolvedReason, "ambiguous_meaning");
  assert.equal(units.every(unit => unit.span.end > unit.span.start), true);
});
test("M6 budget counts repeated unfamiliar occurrences and excludes Chinese from the denominator", () => {
  const units = [
    { span: { start: 0, end: 4 }, text: "word", candidateIds: [sense], itemId: sense, unresolvedReason: null },
    { span: { start: 5, end: 9 }, text: "word", candidateIds: [sense], itemId: sense, unresolvedReason: null },
  ];
  const assessments = units.map(() => ({ assessment: "unobserved", itemId: sense, evidenceIds: [], span: { start: 0, end: 4 }, modality: "reading", reason: "none", stateRevision: "0", policyVersion: "reading-v1" }));
  const result = budgetFor(units, assessments, true, [sense], 0.05);
  assert.equal(result.englishOccurrences, 2);
  assert.equal(result.unfamiliarOccurrences, 2);
  assert.equal(result.unfamiliarRatio, 1);
  assert.deepEqual(result.distinctUnfamiliarKeys, [sense]);
  assert.equal(result.unresolvedOccurrences, 0);
  assert.equal(complexityForText("中文回答。", []).passed, true);
});

test("M6 synthesis records its mode and falls back once when its structured output is malformed", async () => {
  const personal = {
    preferences: DEFAULT_RESPONSE_PREFERENCES,
    get_corrected_learner_states: async () => ({ items: [] }),
    assess_comprehension: async request => request.units.map(unit => ({ assessment: "provisional", itemId: unit.itemId, evidenceIds: [], baseline: { startingLevel: "A1", starterSetVersion: "unjot-starter-v1", source: "Unjot editorial seed, 2026-10-03" }, span: unit.span, modality: "reading", reason: "seed", stateRevision: "0", policyVersion: "reading-v1" })),
  };
  let calls = 0;
  const reply = await createLearnerAwareReply({
    config: { provider: "test", model: "test", apiKey: "secret", baseUrl: "https://example.test/v1" }, graph, personal,
    text: "Please answer in Chinese.", correctionMode: false, history: [], submissionId: "s1", stateRevision: "0",
    preferences: DEFAULT_RESPONSE_PREFERENCES, fetcher: async () => {
      calls += 1;
      const args = calls === 1 ? "not-json" : JSON.stringify({ text: "这里是答案。", correction: null, confidence: true, language: "chinese" });
      return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", tool_calls: [{ id: String(calls), type: "function", function: { name: calls === 1 ? "synthesize_response" : "stepwise_response", arguments: args } }] } }] }));
    },
  });
  assert.equal(reply.analysis.orchestrationMode, "stepwise");
  assert.equal(reply.analysis.strategyVersion, "m6-response-v1");
  assert.equal(calls, 2);
});
