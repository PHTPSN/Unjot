import assert from "node:assert/strict";
import test from "node:test";
import { lexicalGraph as graph } from "../lib/lexicon.ts";
import { recordEvidence, deriveItemState } from "../lib/evidence-policy.ts";
import { scenarios, target } from "../packages/golden-tests/fixtures/figure-out.ts";
import { LearnerStore } from "../lib/learner-store.ts";
import { PersonalReads } from "../lib/personal-reads.ts";

const base = scenarios[0].turns[0];
const observation = { expression: "figure out", quote: "figure out", start: 7, textSource: "text", behavior: "production", referenceTurnId: null };
const judgment = { observationIndex: 0, itemId: target.id, correctness: "correct", usage: "communicative", meaningClear: true, assistance: "independent", supportTurnId: null, rationale: "Correct use to describe solving a problem." };
const decide = (turn = base, o = {}, j = {}, history = [], accepted = []) => recordEvidence({ turn, observation: { ...observation, ...o }, judgment: { ...judgment, ...j }, history, accepted, graph, deviceId: "test" });

test("original use earns one stable observation; invalid spans and fabricated/neighbor senses earn none", async () => {
  const good = await decide();
  assert.equal(good.event.kind, "spontaneous_production");
  assert.equal((await decide()).event.id, good.event.id);
  const broad = await decide(base, { quote: base.text, start: 0 });
  assert.deepEqual(broad.event.observedSpan, { start: 7, end: 17 });
  assert.equal(broad.event.id, good.event.id);
  assert.equal(deriveItemState(target.id, [good.event, good.event]).counts.spontaneous_production, 1);
  for (const [o, j] of [[{ start: -1 }, {}], [{ start: 8 }, {}], [{}, { itemId: "sense:invented" }], [{}, { itemId: "sense:cat%1:05:00::" }], [{}, { correctness: "incorrect" }], [{}, { usage: "translation" }]]) assert.equal((await decide(base, o, j)).event, null);
  assert.equal((await decide(base, {}, { correctness: "uncertain" })).event.kind, "uncertain");
});

test("state requests and quotations cannot override policy; separate valid communication remains eligible", async () => {
  for (const id of ["state-request-english", "state-request-chinese-with-correction"]) {
    const turn = scenarios.find(s => s.id === id).turns[0];
    assert.equal((await decide(turn, { start: turn.text.indexOf("figure out") })).event, null);
  }
  const quoted = { ...base, text: "The phrase is 'figure out'." };
  assert.equal((await decide(quoted, { start: quoted.text.indexOf("figure out") })).event, null);
  const mixed = scenarios.find(s => s.id === "correct-use-plus-state-request").turns[0];
  assert.equal((await decide(mixed)).event.kind, "spontaneous_production");
});

test("assistant corrections supply language; copies are assisted even with an independent proposal", async () => {
  const fixture = scenarios.find(s => s.id === "copied-correction-is-assisted");
  const [learner, assistant, copied] = fixture.turns;
  const supply = await decide(assistant, { behavior: "supplied", textSource: "correction" }, { usage: "supplied" }, [learner]);
  assert.equal(supply.event.kind, "supplied");
  const copy = await decide(copied, { start: 15 }, {}, [learner, assistant], [supply.event]);
  assert.equal(copy.event.kind, "assisted_production");
  assert.equal(copy.event.supportTurnId, assistant.id);
  const original = scenarios.find(s => s.id === "correction-preserves-original-credit");
  assert.equal((await decide(original.turns[1], { behavior: "supplied", textSource: "correction" }, { usage: "supplied" }, [original.turns[0]])).event, null);
});

test("receptive paraphrase is recognized only with verified prior supplied meaning", async () => {
  const assistant = { ...scenarios[0].turns[1], sequence: 1, suppliedItemIds: [target.id] };
  const turn = { ...base, sequence: 2, text: "It means to find a solution." };
  const o = { behavior: "comprehension", quote: turn.text, start: 0, referenceTurnId: assistant.id };
  const result = await decide(turn, o, { usage: "paraphrase" }, [assistant]);
  assert.equal(result.event.kind, "recognized");
  assert.equal(deriveItemState(target.id, [result.event]).stage, "understood");
  assert.equal((await decide(turn, o, { usage: "paraphrase" }, [{ ...assistant, suppliedItemIds: [] }])).event, null);
  assert.equal((await decide(turn, { ...o, behavior: "production" }, {}, [assistant])).event, null);
});

test("M0 ledgers replay unchanged under their recorded policy", () => {
  for (const scenario of scenarios.filter(s => !s.initialState)) {
    assert.deepEqual(deriveItemState(target.id, scenario.expectedEvidence), scenario.expectedState, scenario.id);
  }
});

test("personal reads separate absent, provisional, receptive, difficulty and unresolved meanings", async () => {
  const store = new LearnerStore(":memory:");
  try {
    const assess = async (text, id, candidates = [id]) => {
      const reads = new PersonalReads(store, graph);
      return (await reads.assess_comprehension({ text, context: "reading", units: [{ text, span: { start: 0, end: text.length }, itemId: id, candidateIds: candidates, unresolvedReason: null }], modality: "reading", stateRevision: store.revision(), policyVersion: "reading-v1", profileVersion: reads.preferences.profileVersion }))[0];
    };
    assert.equal((await assess("figure out", target.id)).assessment, "unobserved");
    assert.equal((await assess("nonsensezz", null, [])).unresolvedReason, "missing_coverage");
    assert.equal((await assess("bank", null, [])).unresolvedReason, "ambiguous_meaning");
    store.savePreferences({ startingLevel: "A1" });
    assert.equal((await assess("cat", "sense:cat%1:05:00::")).assessment, "provisional");
    const first = store.begin("first", base.text, false); const owner = store.claim(first.id);
    const positive = await decide(first.turn);
    store.accept(first.id, owner, [positive]);
    store.finish(first.id, owner, { text: "Okay", correction: null, lookupResults: [] }, { ...scenarios[0].turns[1], id: "reply-1" }, []);
    assert.equal((await assess("figure out", target.id)).assessment, "supported");
    const second = store.begin("second", "I don't understand figure out.", false); const nextOwner = store.claim(second.id);
    const difficulty = await decide(second.turn, { behavior: "difficulty", quote: second.turn.text, start: 0 }, { usage: "difficulty" });
    assert.equal(difficulty.event.kind, "help_requested");
    store.accept(second.id, nextOwner, [difficulty]);
    assert.equal((await assess("figure out", target.id)).assessment, "needs_support");
    const reads = new PersonalReads(store, graph);
    const page = await reads.get_item_evidence({ itemId: target.id, stateRevision: store.revision(), limit: 1 });
    const next = await reads.get_item_evidence({ itemId: target.id, stateRevision: store.revision(), cursor: page.nextCursor });
    assert.equal(next.events[0].kind, "help_requested");
    await assert.rejects(reads.get_item_evidence({ itemId: target.id, stateRevision: "1", cursor: page.nextCursor }));
    assert.equal((await reads.get_learner_states({ itemIds: ["sense:cat%1:05:00::"], stateRevision: store.revision() })).items[0].status, "unobserved");
  } finally { store.close(); }
});
