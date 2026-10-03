import assert from "node:assert/strict";
import test from "node:test";
import { assessmentFixtures as cases, absentPersonalState, replyAnalysisFixture } from "./fixtures/comprehension.ts";
import { DEFAULT_RESPONSE_PREFERENCES, STARTER_SET, validResponsePreferences } from "../protocol/src/comprehension.ts";
import { get_knowledge_node } from "../../lib/lexicon.ts";

test("contract separates meaning identity, reading support, production and absent observations", async () => {
  assert.notEqual(cases.financialBank.itemId, cases.riverBank.itemId);
  assert.equal(cases.financialBank.assessment, "supported"); assert.equal(cases.financialBank.modality, "reading");
  assert.equal(cases.riverBank.assessment, "unobserved"); assert.deepEqual(cases.riverBank.evidenceIds, []);
  assert.equal(cases.missing.assessment, "unresolved"); assert.equal(cases.missing.itemId, null);
  assert.equal(cases.ambiguous.unresolvedReason, "ambiguous_meaning");
  assert.equal(cases.recentDifficulty.assessment, "needs_support");
  assert.equal(absentPersonalState.items[0].status, "unobserved"); assert.equal(absentPersonalState.items[0].state, null);
  for (const item of Object.values(cases)) if (item.itemId) assert.equal((await get_knowledge_node(item.itemId)).status, "found");
});
test("starter allowances cite exact meanings and a versioned source, without accepted Evidence", async () => {
  assert.deepEqual(cases.provisional.evidenceIds, []); assert.equal(cases.provisional.baseline.starterSetVersion, STARTER_SET.version);
  assert.equal(DEFAULT_RESPONSE_PREFERENCES.startingLevel, null); assert.equal(DEFAULT_RESPONSE_PREFERENCES.starterSetVersion, null);
  for (const id of STARTER_SET.itemIds) assert.equal((await get_knowledge_node(id)).node.kind, "sense");
});
test("preference numeric bounds include zero novelty and reject invalid or unversioned settings", () => {
  assert.ok(validResponsePreferences(DEFAULT_RESPONSE_PREFERENCES));
  assert.ok(validResponsePreferences({ ...DEFAULT_RESPONSE_PREFERENCES, maxUnfamiliarRatio: 0, maxNewExpressions: 0 }));
  for (const maxUnfamiliarRatio of [-1, 1.1, NaN, Infinity]) assert.equal(validResponsePreferences({ ...DEFAULT_RESPONSE_PREFERENCES, maxUnfamiliarRatio }), false);
  for (const maxNewExpressions of [-1, 21, 1.5]) assert.equal(validResponsePreferences({ ...DEFAULT_RESPONSE_PREFERENCES, maxNewExpressions }), false);
  assert.equal(validResponsePreferences({ ...DEFAULT_RESPONSE_PREFERENCES, starterSetVersion: STARTER_SET.version }), false);
});
test("delivered analysis records a Chinese cold-start answer with no invented known vocabulary", () => {
  assert.equal(replyAnalysisFixture.languageDecision, "chinese");
  assert.equal(replyAnalysisFixture.combinedBudget.englishOccurrences, 0);
  assert.deepEqual(replyAnalysisFixture.plan.familiarCandidateIds, []);
  assert.equal(replyAnalysisFixture.plan.preferences.maxUnfamiliarRatio, .05);
  assert.equal(replyAnalysisFixture.plan.preferences.maxNewExpressions, 2);
});
