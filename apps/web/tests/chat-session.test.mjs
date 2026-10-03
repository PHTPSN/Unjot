import assert from "node:assert/strict";
import test from "node:test";

import { createChatSession, REJECTED } from "../src/chat-session.js";
import {
  FIGURE_OUT_ITEM_ID,
  FALLBACK_REPLY,
  MASTERY_NOTICE,
  MASTERY_REQUEST_INPUT,
  MIXED_INPUT,
  MIXED_INPUT_CORRECTION,
  NATURAL_INPUT,
  NATURAL_REPLY,
  lookupMockResponse,
} from "../src/mock-responses.js";

let idCounter = 0;
function makeId() {
  idCounter += 1;
  return `turn:test-${idCounter}`;
}

/** Let every pending microtask finish before the test asserts. */
function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Session with a responder whose promise the test controls. */
function createControlledSession(options = {}) {
  idCounter = 0;
  const calls = [];
  /** @type {Array<{resolve: (value: object) => void, reject: (reason?: unknown) => void}>} */
  const queue = [];
  const session = createChatSession({
    makeId,
    now: () => new Date("2026-10-03T00:00:00.000Z"),
    respond: (request) => {
      calls.push(request);
      return new Promise((resolve, reject) => queue.push({ resolve, reject }));
    },
    ...options,
  });
  return {
    session,
    calls,
    /** Settle the oldest outstanding request. */
    async settle(result) {
      const next = queue.shift();
      assert.ok(next, "expected an outstanding request");
      next.resolve(result);
      await flush();
    },
    async fail(error) {
      const next = queue.shift();
      assert.ok(next, "expected an outstanding request");
      next.reject(error);
      await flush();
    },
  };
}

const reply = (text) => ({ text });

test("rejects blank and whitespace-only submissions without a request", () => {
  const { session, calls } = createControlledSession();

  assert.deepEqual(session.send(""), { status: "rejected", reason: REJECTED.blank });
  assert.deepEqual(session.send("   \n\t "), { status: "rejected", reason: REJECTED.blank });

  assert.equal(calls.length, 0);
  assert.equal(session.getState().turns.length, 0);
  assert.equal(session.getState().busy, false);
});

test("appends the learner turn and one assistant turn using the shared contract fields", async () => {
  const { session, calls, settle } = createControlledSession();

  assert.deepEqual(session.send(NATURAL_INPUT), { status: "accepted", learnerTurnId: "turn:test-1" });
  assert.equal(session.getState().busy, true);
  assert.deepEqual(calls, [{ text: NATURAL_INPUT, correctionMode: false, learnerTurnId: "turn:test-1" }]);

  await settle(lookupMockResponse(NATURAL_INPUT, false));

  const [learner, assistant] = session.getState().turns;
  assert.equal(learner.role, "learner");
  assert.equal(learner.text, NATURAL_INPUT);
  assert.equal(learner.sequence, 1);
  assert.equal(learner.correction, null);
  assert.equal(learner.correctionMode, false);
  assert.deepEqual(learner.suppliedItemIds, []);
  assert.equal(new Date(learner.occurredAt).toISOString(), learner.occurredAt);

  assert.equal(assistant.role, "assistant");
  assert.equal(assistant.text, NATURAL_REPLY);
  assert.equal(assistant.sequence, 2);
  assert.equal(assistant.correction, null);
  assert.equal(assistant.contextId, learner.contextId);

  const ids = session.getState().turns.map((turn) => turn.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(session.getState().busy, false);
});

test("prevents duplicate sends while a request is pending", async () => {
  const { session, calls, settle } = createControlledSession();
  session.send(NATURAL_INPUT);

  assert.deepEqual(session.send("Another message"), { status: "rejected", reason: REJECTED.pending });
  assert.deepEqual(session.retry(), { status: "rejected", reason: REJECTED.pending });
  assert.equal(calls.length, 1);
  assert.equal(session.canSend("Another message"), false);

  await settle(reply(FALLBACK_REPLY));
  assert.equal(session.getState().turns.length, 2);
  assert.equal(session.canSend("Another message"), true);
});

test("captures the correction preference at submission and ignores later toggles for that request", async () => {
  const { session, calls, settle } = createControlledSession();

  session.send(MIXED_INPUT);
  session.setCorrectionMode(true);

  assert.equal(calls[0].correctionMode, false);
  assert.equal(session.getState().correctionMode, true);
  assert.equal(session.getState().pending.correctionMode, false);

  await settle(lookupMockResponse(MIXED_INPUT, calls[0].correctionMode));
  assert.equal(session.getState().turns[1].correction, null);

  session.send(MIXED_INPUT);
  assert.equal(calls[1].correctionMode, true);

  await settle(lookupMockResponse(MIXED_INPUT, true));
  const assistant = session.getState().turns[3];
  assert.equal(assistant.correction.text, MIXED_INPUT_CORRECTION);
  assert.equal(assistant.correction.sourceTurnId, session.getState().turns[2].id);
  assert.deepEqual(assistant.suppliedItemIds, [FIGURE_OUT_ITEM_ID]);
  assert.equal(assistant.text, NATURAL_REPLY);
});

test("keeps the learner's original text verbatim when correction mode is on", async () => {
  const { session, settle } = createControlledSession();
  session.setCorrectionMode(true);
  session.send(MIXED_INPUT);
  await settle(lookupMockResponse(MIXED_INPUT, true));

  const [learner] = session.getState().turns;
  assert.equal(learner.text, MIXED_INPUT);
  assert.equal(learner.correction, null);
  assert.equal(learner.correctionMode, true);
});

test("uses exact lookup for the fixed examples and falls back otherwise", async () => {
  const { session, settle } = createControlledSession();

  for (const [text, expected] of [
    [NATURAL_INPUT, NATURAL_REPLY],
    [MASTERY_REQUEST_INPUT, MASTERY_NOTICE],
    ["Anything else entirely", FALLBACK_REPLY],
  ]) {
    session.send(text);
    await settle(lookupMockResponse(text, false));
    const assistant = session.getState().turns.at(-1);
    assert.equal(assistant.text, expected);
    assert.equal(assistant.correction, null);
  }
});

test("shows a readable error and retries the original submission once", async () => {
  const { session, calls, settle, fail } = createControlledSession();
  session.setCorrectionMode(true);
  session.send(MIXED_INPUT);

  await fail(new Error("Mock request failed (injected)."));

  const failedState = session.getState();
  assert.equal(failedState.turns.length, 1);
  assert.equal(failedState.busy, false);
  assert.equal(failedState.error.learnerTurnId, failedState.turns[0].id);
  assert.match(failedState.error.message, /injected/);

  // Preference changes after the failure must not leak into the retried request.
  session.setCorrectionMode(false);
  assert.deepEqual(session.retry(), { status: "accepted", learnerTurnId: failedState.turns[0].id });
  assert.equal(calls[1].correctionMode, true);
  assert.equal(calls[1].text, MIXED_INPUT);
  assert.equal(session.getState().error, null);

  await settle(lookupMockResponse(MIXED_INPUT, calls[1].correctionMode));

  const state = session.getState();
  assert.equal(state.turns.length, 2, "retry must not append another learner message");
  assert.equal(state.turns.filter((turn) => turn.role === "learner").length, 1);
  assert.equal(state.turns.filter((turn) => turn.role === "assistant").length, 1);
  assert.equal(state.turns[1].correction.text, MIXED_INPUT_CORRECTION);
  assert.equal(state.error, null);
});

test("reports a failed retry again instead of silently succeeding", async () => {
  const { session, fail } = createControlledSession();
  session.send(NATURAL_INPUT);
  await fail(new Error("first failure"));
  session.retry();
  await fail(new Error("second failure"));

  const state = session.getState();
  assert.match(state.error.message, /second failure/);
  assert.equal(state.turns.length, 1);
});

test("rejects retry when there is nothing to retry", () => {
  const { session } = createControlledSession();
  assert.deepEqual(session.retry(), { status: "rejected", reason: REJECTED.noError });
});

test("treats a malformed responder result as a readable failure", async () => {
  const { session, settle } = createControlledSession();
  session.send(NATURAL_INPUT);
  await settle({ correction: 42 });

  const state = session.getState();
  assert.equal(state.turns.length, 1);
  assert.match(state.error.message, /text string/);
});

test("subscribers see loading, reply, and error states", async () => {
  const { session, settle, fail } = createControlledSession();
  const seen = [];
  session.subscribe((state) => seen.push({ busy: state.busy, error: state.error !== null, turns: state.turns.length }));

  session.send(NATURAL_INPUT);
  await settle(reply(NATURAL_REPLY));
  session.send("second");
  await fail(new Error("boom"));

  assert.deepEqual(seen, [
    { busy: true, error: false, turns: 1 },
    { busy: false, error: false, turns: 2 },
    { busy: true, error: false, turns: 3 },
    { busy: false, error: true, turns: 3 },
  ]);
});
