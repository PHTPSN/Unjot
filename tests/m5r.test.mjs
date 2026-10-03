import assert from "node:assert/strict";
import test from "node:test";
import { deriveCorrectedItemState } from "../lib/evidence-policy.ts";
import { LearnerStore } from "../lib/learner-store.ts";

const base = { deviceId: "device", itemId: "sense:figure_out%2:31:00::", conversationId: "local", source: "conversation", textSource: "text", supportTurnId: null, rationale: "validated", policyVersion: "m4-evidence-v1" };
const event = (id, kind, contextId, occurredAt, extra = {}) => ({ ...base, id, kind, contextId, occurredAt, turnId: id, observedSpan: { start: 0, end: 10 }, ...extra });

test("M5R derives independent receptive and production axes without rewriting legacy history", () => {
  const events = [
    event("e1", "recognized", "conversation-a", "2026-01-01T00:00:00.000Z"),
    event("e2", "spontaneous_production", "conversation-a", "2026-01-02T00:00:00.000Z"),
    event("e3", "help_requested", "conversation-a", "2026-01-03T00:00:00.000Z", { policyVersion: "m5r-evidence-v1", difficultyType: "comprehension" }),
    event("e4", "spontaneous_production", "conversation-b", "2026-01-04T00:00:00.000Z"),
  ];
  const state = deriveCorrectedItemState(base.itemId, events, "4");
  assert.equal(state.receptive, "needs_support");
  assert.equal(state.production, "repeated_independent_use");
  assert.deepEqual(state.independentContextIds, ["conversation-a", "conversation-b"]);
  assert.deepEqual(state.difficultyEvidenceIds, ["e3"]);
  assert.equal(events[0].policyVersion, "m4-evidence-v1");
});

test("M5R uses a stored conversation context and persists retry stages", () => {
  const store = new LearnerStore(":memory:");
  try {
    const submission = store.begin("submission", "hello", false);
    assert.notEqual(submission.turn.contextId, "free-chat");
    const owner = store.claim(submission.id);
    store.recordStage(submission.id, owner, "reply_planned", "retryable_error", { reason: "model_unavailable" });
    const stage = store.workflowStages(submission.id).find(item => item.stage === "reply_planned");
    assert.equal(stage.status, "retryable_error");
    assert.equal(stage.attempt, 1);
    store.release(submission.id, owner);
  } finally { store.close(); }
});
