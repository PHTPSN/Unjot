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
    store.savePreferences({ maxUnfamiliarRatio: .5, correctionMode: true });
    store.close(); store = new LearnerStore(path);
    assert.equal(store.preferences().maxUnfamiliarRatio, .5);
    assert.equal(store.correctionMode(), true);
    assert.deepEqual(store.begin("submission-1", turn.turn.text, false).preferences, next);
    assert.equal(store.turns().length, 1);
    assert.throws(() => store.savePreferences({ mastery: 100 }), StoreError);
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
