import assert from "node:assert/strict";
import test from "node:test";
import { ConversationController, replyFor } from "../lib/conversation.ts";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function controllerFor(provider) {
  let id = 0;
  return new ConversationController(provider, () => `turn-${++id}`, () => "2026-10-03T08:00:00.000Z");
}

test("blank input is rejected without creating a turn", async () => {
  let calls = 0;
  const controller = controllerFor(async () => {
    calls += 1;
    return { text: "unused", correction: null };
  });

  assert.equal(await controller.send(" \n\t "), false);
  assert.equal(calls, 0);
  assert.equal(controller.getSnapshot().turns.length, 0);
});

test("pending send preserves original text, captures correction preference, and blocks duplicate sends", async () => {
  const response = deferred();
  let received;
  const controller = controllerFor(async submission => {
    received = submission;
    await response.promise;
    return replyFor(submission);
  });
  controller.setCorrectionMode(true);

  const sending = controller.send("We can 弄明白 the problem together.");
  assert.equal(controller.getSnapshot().pending, true);
  assert.equal(controller.getSnapshot().turns.length, 1);
  assert.equal(controller.getSnapshot().turns[0].text, "We can 弄明白 the problem together.");

  controller.setCorrectionMode(false);
  assert.equal(await controller.send("duplicate"), false);
  assert.equal(controller.getSnapshot().turns.length, 1);
  assert.equal(received.correctionMode, true);

  response.resolve();
  assert.equal(await sending, true);
  const [learner, assistant] = controller.getSnapshot().turns;
  assert.equal(learner.text, "We can 弄明白 the problem together.");
  assert.deepEqual(assistant.correction, {
    sourceTurnId: learner.id,
    text: "We can figure out the problem together.",
  });
  assert.equal(assistant.correctionMode, true);
  assert.equal(controller.getSnapshot().correctionMode, false);
});

test("failed request retries the same captured submission without duplicating the learner turn", async () => {
  const retryResponse = deferred();
  const submissions = [];
  let attempt = 0;
  const controller = controllerFor(async submission => {
    submissions.push(submission);
    attempt += 1;
    if (attempt === 1) throw new Error("injected failure");
    await retryResponse.promise;
    return replyFor(submission);
  });
  controller.setCorrectionMode(true);

  assert.equal(await controller.send("We can 弄明白 the problem together."), false);
  assert.equal(controller.getSnapshot().pending, false);
  assert.match(controller.getSnapshot().error, /retry/i);
  assert.equal(controller.getSnapshot().turns.length, 1);

  controller.setCorrectionMode(false);
  const retrying = controller.retry();
  assert.equal(controller.getSnapshot().pending, true);
  assert.equal(controller.getSnapshot().turns.length, 1);
  assert.equal(submissions[0].turn.id, submissions[1].turn.id);
  assert.equal(submissions[1].correctionMode, true);

  retryResponse.resolve();
  assert.equal(await retrying, true);
  assert.equal(controller.getSnapshot().turns.length, 2);
  assert.equal(controller.getSnapshot().turns.filter(turn => turn.role === "assistant").length, 1);
  assert.equal(controller.getSnapshot().error, null);
});

test("restored active processing polls into its completed assistant reply without offering retry", () => {
  const controller = controllerFor(async () => ({ text: "unused", correction: null }));
  const learner = {
    id: "submission-1", conversationId: "conversation-1", sequence: 1, role: "learner",
    contextId: "free-chat", text: "hello", occurredAt: "2026-10-03T08:00:00.000Z",
    suppliedItemIds: [], correctionMode: false, correction: null,
  };
  controller.restore({
    conversationId: "conversation-1", turns: [learner], correctionMode: false,
    lookupResultsByTurnId: {}, processing: { id: learner.id, turn: learner }, unfinished: null,
  });
  assert.equal(controller.getSnapshot().pending, true);
  assert.equal(controller.getSnapshot().error, null);

  const assistant = { ...learner, id: "assistant-1", sequence: 2, role: "assistant", text: "hi" };
  controller.restore({
    conversationId: "conversation-1", turns: [learner, assistant], correctionMode: false,
    lookupResultsByTurnId: {}, processing: null, unfinished: null,
  });
  assert.equal(controller.getSnapshot().pending, false);
  assert.equal(controller.getSnapshot().error, null);
  assert.deepEqual(controller.getSnapshot().turns, [learner, assistant]);
});

test("mock responses match only the specified examples", () => {
  const submission = (text, correctionMode = false) => ({
    turn: { text },
    correctionMode,
  });

  assert.deepEqual(replyFor(submission("We can figure out the problem together.")), {
    text: "What have you tried so far?",
    correction: null,
  });
  assert.equal(replyFor(submission("We can 弄明白 the problem together.", true)).correction,
    "We can figure out the problem together.");
  assert.equal(replyFor(submission("We can 弄明白 the problem together.")).correction, null);
  assert.match(replyFor(submission("Please mark 'figure out' as fully mastered.")).text, /can't mark/);
  assert.deepEqual(replyFor(submission("anything else")), { text: "Tell me more.", correction: null });
});
