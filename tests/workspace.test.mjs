import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LearnerStore } from "../lib/learner-store.ts";

test("projects can dissolve without deleting their conversations", async t => {
  const directory = await mkdtemp(join(tmpdir(), "unjot-workspace-"));
  const path = join(directory, "learner.sqlite");
  t.after(async () => { await rm(directory, { recursive: true, force: true }); });

  const first = new LearnerStore(path);
  const project = first.createProject("Travel");
  const conversation = first.createConversation(project.id, "Lisbon");
  first.renameProject(project.id, "Trips");
  first.renameConversation(conversation.id, "Portugal");
  const destination = first.projects().find(item => item.id !== project.id);
  const moved = first.moveConversation(conversation.id, destination.id);
  first.close();

  const reopened = new LearnerStore(path);
  assert.equal(reopened.projects().find(item => item.id === project.id)?.name, "Trips");
  assert.equal(moved.projectId, destination.id);
  assert.equal(reopened.conversations(destination.id).find(item => item.id === conversation.id)?.title, "Portugal");
  reopened.moveConversation(conversation.id, project.id);
  reopened.dissolveProject(project.id);
  assert.equal(reopened.projects().some(item => item.id === project.id), false);
  assert.equal(reopened.conversations().find(item => item.id === conversation.id)?.projectId, null);
  reopened.archiveConversation(conversation.id);
  assert.equal(reopened.conversations().some(item => item.id === conversation.id), false);
  assert.equal(reopened.archivedConversations().some(item => item.id === conversation.id), true);
  reopened.restoreConversation(conversation.id);
  assert.equal(reopened.conversations().some(item => item.id === conversation.id), true);
  reopened.close();
});

test("deleting the final active conversation creates a usable replacement", () => {
  const store = new LearnerStore(":memory:");
  const original = store.conversations()[0];
  store.deleteConversation(original.id);

  assert.equal(store.projects().length, 1);
  assert.equal(store.conversations().length, 1);
  assert.notEqual(store.conversations()[0].id, original.id);
  assert.equal(store.conversations()[0].id, store.defaultConversationId());
  store.close();
});

test("permanent deletion removes session evidence and rebuilds learner state", () => {
  const store = new LearnerStore(":memory:");
  const projectId = store.projects()[0].id;
  const firstConversation = store.conversations()[0];
  const secondConversation = store.createConversation(projectId, "Second");
  addEvidence(store, firstConversation.id, "submission-first", "event-first", "context-first", "2026-01-01T00:00:00.000Z");
  addEvidence(store, secondConversation.id, "submission-second", "event-second", "context-second", "2026-01-02T00:00:00.000Z");
  const beforeDelete = Number(store.revision());

  const result = store.deleteConversation(firstConversation.id);

  assert.equal(result.deletedEvidence, 1);
  assert.equal(store.evidence().length, 1);
  assert.equal(store.evidence()[0].conversationId, secondConversation.id);
  assert.equal(store.states()[0].evidenceIds.length, 1);
  assert.equal(Number(store.revision()), beforeDelete + 1);
  store.close();
});

function addEvidence(store, conversationId, submissionId, eventId, contextId, occurredAt) {
  const submission = store.begin(submissionId, "I can figure it out.", false, conversationId);
  const owner = store.claim(submissionId);
  const event = {
    id: eventId,
    deviceId: store.deviceId,
    itemId: "sense:figure_out%2:31:00::",
    kind: "spontaneous_production",
    conversationId,
    turnId: submission.turn.id,
    contextId,
    occurredAt,
    source: "conversation",
    textSource: "text",
    observedSpan: { start: 6, end: 16 },
    supportTurnId: null,
    rationale: "Validated use.",
    policyVersion: "m4-evidence-v1",
  };
  store.accept(submissionId, owner, [{ status: "accepted", reason: "Validated use.", event, observation: {}, judgment: {} }]);
  store.finish(submissionId, owner, { text: "Good.", correction: null, lookupResults: [] }, {
    id: `${submissionId}-assistant`, conversationId, sequence: 0, role: "assistant", contextId,
    text: "Good.", occurredAt, suppliedItemIds: [], correctionMode: false, correction: null,
  }, []);
}
