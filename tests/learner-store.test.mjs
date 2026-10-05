import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LearnerStore, StoreError } from "../lib/learner-store.ts";
import { DEFAULT_RESPONSE_PREFERENCES } from "../packages/protocol/src/comprehension.ts";

function tempStore() {
  const directory = mkdtempSync(join(tmpdir(), "unjot-learner-"));
  const store = new LearnerStore(join(directory, "learner.sqlite"));
  return { store, cleanup: () => { store.close(); rmSync(directory, { recursive: true, force: true }); } };
}

test("preferences survive reopening and each submission captures the effective profile", () => {
  const directory = mkdtempSync(join(tmpdir(), "unjot-reopen-"));
  const path = join(directory, "learner.sqlite");
  let store = new LearnerStore(path);
  try {
    assert.deepEqual(store.preferences(), DEFAULT_RESPONSE_PREFERENCES);
    const next = store.savePreferences({ maxUnfamiliarRatio: 0, maxNewExpressions: 0, allowChineseSupport: false, startingLevel: "A1" });
    assert.equal(next.allowChineseSupport, false);
    const turn = store.begin("submission-1", "We can figure out the problem.", false);
    assert.equal(turn.preferences.maxUnfamiliarRatio, 0);
    assert.equal(turn.preferences.startingLevel, "A1");
    store.savePreferences({ maxUnfamiliarRatio: .3, correctionMode: true });
    store.close(); store = new LearnerStore(path);
    assert.equal(store.preferences().maxUnfamiliarRatio, .3);
    assert.equal(store.correctionMode(), true);
    assert.deepEqual(store.begin("submission-1", turn.turn.text, false).preferences, next);
    assert.equal(store.turns().length, 1);
    assert.throws(() => store.savePreferences({ mastery: 100 }), StoreError);
    assert.throws(() => store.savePreferences({ maxUnfamiliarRatio: .31 }), StoreError);
    assert.throws(() => store.savePreferences({ maxUnfamiliarRatio: 2 }), StoreError);
    assert.equal(store.revision(), "0");
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("submission IDs are idempotent and reject changed retry input", () => {
  const { store, cleanup } = tempStore();
  try {
    const first = store.begin("submission-1", "hello", false);
    assert.deepEqual(store.begin("submission-1", "hello", false).turn, first.turn);
    assert.throws(() => store.begin("submission-1", "changed", false), StoreError);
  } finally { cleanup(); }
});

test("history is bounded and unfinished learner turns remain visible", async () => {
  const { store, cleanup } = tempStore();
  try {
    store.begin("submission-1", "hello", false);
    assert.deepEqual((await store.historyPage()).map(turn => turn.text), ["hello"]);
    assert.equal(store.pending()?.id, "submission-1");
  } finally { cleanup(); }
});

test("unfinished submissions are scoped to their conversation", () => {
  const { store, cleanup } = tempStore();
  try {
    const firstConversationId = store.defaultConversationId();
    const secondConversationId = store.createConversation()?.id;
    assert.ok(secondConversationId);
    store.begin("submission-1", "hello", false, firstConversationId);
    assert.equal(store.pending(firstConversationId)?.id, "submission-1");
    assert.equal(store.pending(secondConversationId), null);
    assert.doesNotThrow(() => store.begin("submission-2", "another conversation", false, secondConversationId));
    assert.equal(store.pending(secondConversationId)?.id, "submission-2");
  } finally { cleanup(); }
});

test("pending status distinguishes active processing from a retryable submission", () => {
  const { store, cleanup } = tempStore();
  try {
    store.begin("submission-1", "hello", false);
    assert.equal(store.pendingStatus()?.processing, false);
    const owner = store.claim("submission-1");
    assert.equal(store.pendingStatus()?.processing, true);
    store.release("submission-1", owner);
    assert.equal(store.pendingStatus()?.processing, false);
    assert.equal(store.pending()?.id, "submission-1");
  } finally { cleanup(); }
});

test("conversation turns restore in chronological order after multiple completed replies", () => {
  const { store, cleanup } = tempStore();
  try {
    const conversationId = store.defaultConversationId();
    for (const [index, text] of ["first", "second"].entries()) {
      const id = `submission-${index + 1}`;
      const submission = store.begin(id, text, false, conversationId);
      const owner = store.claim(id);
      const assistant = {
        id: `assistant-${index + 1}`, conversationId, sequence: 0, role: "assistant",
        contextId: submission.turn.contextId, text: `reply ${index + 1}`,
        occurredAt: submission.turn.occurredAt, suppliedItemIds: [], correctionMode: false, correction: null,
      };
      store.finish(id, owner, { text: assistant.text, correction: null, lookupResults: [] }, assistant, []);
      store.release(id, owner);
    }
    assert.deepEqual(store.conversationTurns(conversationId).map(turn => turn.id), [
      "submission-1", "assistant-1", "submission-2", "assistant-2",
    ]);
  } finally { cleanup(); }
});
