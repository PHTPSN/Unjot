import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LearnerStore } from "../lib/learner-store.ts";
import { sendLearningTurn } from "../lib/learning-conversation.ts";
import { ConversationController } from "../lib/conversation.ts";
import { lexicalGraph as graph } from "../lib/lexicon.ts";
import { deriveItemState } from "../lib/evidence-policy.ts";

const config = { provider: "test", model: "test", apiKey: "test-secret", baseUrl: "https://example.test/v1" };
function completion(name, args) { return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", tool_calls: [{ id: name, type: "function", function: { name, arguments: JSON.stringify(args) } }] } }] })); }

test("failure after accepted observations survives reopen and retry without duplicate turns or evidence", async () => {
  const directory = mkdtempSync(join(tmpdir(), "unjot-retry-"));
  const path = join(directory, "learner.sqlite");
  let store = new LearnerStore(path);
  let learnerEvaluations = 0, generation = 0;
  const profiles = [];
  const fetcher = async (_url, init) => {
    const request = JSON.parse(init.body);
    const tool = request.tool_choice?.function?.name;
    if (tool === "propose_observations") {
      const { current } = JSON.parse(request.messages[1].content);
      if (current.role === "assistant") return completion(tool, { observations: [] });
      learnerEvaluations++;
      return completion(tool, { observations: [{ expression: "figure out", quote: "figure out", start: 7, textSource: "text", behavior: "production", referenceTurnId: null }] });
    }
    if (tool === "judge_observations") return completion(tool, { judgments: [{ observationIndex: 0, itemId: "sense:figure_out%2:31:00::", correctness: "correct", usage: "communicative", meaningClear: true, assistance: "independent", supportTurnId: null, rationale: "Correct problem-solving use." }] });
    profiles.push(request.messages[0].content);
    if (++generation === 1) return new Response("", { status: 503 });
    return completion("finish_response", { text: "What have you tried?", correction: null });
  };
  const options = { graph, config, id: "persistent-id", text: "We can figure out the problem together.", correctionMode: true, fetcher };
  try {
    await assert.rejects(sendLearningTurn({ ...options, store }), /503/);
    const evidence = store.evidence();
    assert.equal(evidence.length, 1);
    assert.equal(store.pending().evidenceDone, true);
    const captured = store.pending().preferences;
    store.savePreferences({ maxUnfamiliarRatio: 0, allowChineseSupport: false, correctionMode: false });
    store.close(); store = new LearnerStore(path);
    let submitted;
    const controller = new ConversationController(async submission => { submitted = submission; return sendLearningTurn({ ...options, store, id: submission.submissionId, text: submission.turn.text, correctionMode: submission.correctionMode }); });
    controller.restore({ turns: await store.historyPage(), correctionMode: store.correctionMode(), lookupResultsByTurnId: {}, unfinished: store.pending() });
    assert.equal(await controller.send("blocked until retry"), false);
    assert.equal(await controller.retry(), true);
    assert.equal(submitted.submissionId, options.id);
    assert.equal(submitted.correctionMode, true);
    assert.equal(controller.getSnapshot().correctionMode, false);
    assert.equal(learnerEvaluations, 1);
    assert.deepEqual(store.evidence(), evidence);
    assert.deepEqual(store.states()[0], deriveItemState(evidence[0].itemId, evidence));
    assert.equal(store.getSubmission(options.id).preferences.profileVersion, captured.profileVersion);
    assert.equal(profiles[0], profiles[1]);
    assert.equal(store.turns().length, 2);
    assert.equal(controller.getSnapshot().turns[1].id, store.turns()[1].id);
    assert.equal(store.pending(), null);
    const again = await sendLearningTurn({ ...options, store });
    assert.equal(again.assistantTurn.id, store.turns()[1].id);
    assert.equal(generation, 2);
    assert.equal(store.turns().length, 2);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("evidence retries with content JSON when a provider leaves forced tool arguments empty", async () => {
  const directory = mkdtempSync(join(tmpdir(), "unjot-structured-output-"));
  const store = new LearnerStore(join(directory, "learner.sqlite"));
  const proposeChoices = [];
  let proposeCalls = 0;
  let learnerTurnId = "";
  const fetcher = async (_url, init) => {
    const request = JSON.parse(init.body);
    const name = request.tools?.[0]?.function?.name;
    if (name === "propose_observations") {
      proposeChoices.push(request.tool_choice);
      const { current } = JSON.parse(request.messages[1].content);
      if (current.role === "assistant") return completion(name, { observations: [] });
      learnerTurnId = current.id;
      proposeCalls += 1;
      const observations = [{ expression: "figure out", quote: "We can figure out the problem together.", start: 0, textSource: "text", behavior: "production", referenceTurnId: current.id }];
      if (proposeCalls === 1) return new Response(JSON.stringify({ choices: [{ message: {
        content: "", reasoning: JSON.stringify({ observations }),
        tool_calls: [{ type: "function", function: { name, arguments: "" } }],
      } }] }));
      return new Response(JSON.stringify({ choices: [{ message: {
        content: JSON.stringify({ name, arguments: { observations } }), tool_calls: [],
      } }] }));
    }
    if (name === "judge_observations") return completion(name, { judgments: [{ observationIndex: 0, itemId: "sense:figure_out%2:31:00::", correctness: "correct", usage: "communicative", meaningClear: true, assistance: "independent", supportTurnId: learnerTurnId, rationale: "Correct problem-solving use." }] });
    return completion("finish_response", { text: "What have you tried?", correction: null });
  };
  try {
    await sendLearningTurn({ store, graph, config, id: "structured-provider", text: "We can figure out the problem together.", correctionMode: false, fetcher });
    assert.equal(proposeCalls, 2);
    assert.equal(typeof proposeChoices[0], "object");
    assert.equal(proposeChoices[1], "auto");
    assert.equal(store.evidence().some(event => event.kind === "spontaneous_production"), true);
    assert.equal(store.getSubmission("structured-provider").evidenceDone, true);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});
