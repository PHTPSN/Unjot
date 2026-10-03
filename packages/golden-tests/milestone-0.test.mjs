import assert from "node:assert/strict";
import test from "node:test";
import { target, acceptancePolicy, scenarios } from "./fixtures/figure-out.ts";

const scenario = id => {
  const found = scenarios.find(candidate => candidate.id === id);
  assert.ok(found, `Missing scenario: ${id}`);
  return found;
};

test("M0 uses one real OEWN sense and permits evidence from the first learner message", () => {
  assert.equal(target.id, "sense:figure_out%2:31:00::");
  assert.equal(target.lexemeId, "lex:figure out");
  assert.equal(target.conceptId, "concept:00636568-v");
  assert.equal(target.source, "oewn-2025");
  assert.deepEqual(acceptancePolicy, {
    version: "m0-v2", conversation: "free_chat",
    stateMutationAuthority: "program_evidence_policy",
    correctionModeDefault: false, productionTextSource: "original_learner_text",
  });
  const ordinary = scenario("ordinary-correct-use");
  assert.equal(ordinary.turns[0].sequence, 1);
  assert.equal(ordinary.expectedEvidence[0].turnId, ordinary.turns[0].id);
  assert.equal(ordinary.expectedEvidence[0].kind, "spontaneous_production");
});

for (const fixture of scenarios) {
  test(`M0 fixture references, provenance, and snapshots: ${fixture.id}`, () => {
    const byId = new Map(fixture.turns.map(turn => [turn.id, turn]));
    assert.equal(byId.size, fixture.turns.length);
    for (const [index, turn] of fixture.turns.entries()) {
      assert.equal(turn.sequence, index + 1); // Ordering only, not an eligibility rule.
      assert.equal(new Date(turn.occurredAt).toISOString(), turn.occurredAt);
      if (index > 0) assert.ok(turn.occurredAt > fixture.turns[index - 1].occurredAt);
      if (turn.role === "learner") {
        assert.equal(turn.correction, null);
        assert.deepEqual(turn.suppliedItemIds, []);
      }
      if (!turn.correctionMode) assert.equal(turn.correction, null);
      if (turn.correction) {
        assert.equal(turn.role, "assistant");
        const original = byId.get(turn.correction.sourceTurnId);
        assert.equal(original?.role, "learner");
        assert.ok(original.sequence < turn.sequence);
        assert.equal(original.correctionMode, true);
        assert.ok(turn.correction.text.length > 0);
      }
    }
    for (const event of fixture.expectedEvidence) {
      const turn = byId.get(event.turnId);
      assert.ok(turn);
      assert.equal(event.itemId, target.id);
      assert.equal(event.conversationId, turn.conversationId);
      assert.equal(event.contextId, turn.contextId);
      assert.equal(event.occurredAt, turn.occurredAt);
      assert.equal(event.policyVersion, acceptancePolicy.version);
      const observed = event.textSource === "text" ? turn.text : turn.correction?.text;
      assert.equal(typeof observed, "string");
      assert.ok(event.observedSpan.start >= 0 && event.observedSpan.end <= observed.length);
      assert.ok(event.observedSpan.start < event.observedSpan.end);
      assert.equal(observed.slice(event.observedSpan.start, event.observedSpan.end), target.canonicalForm);
      if (event.kind.endsWith("production")) {
        assert.equal(turn.role, "learner");
        assert.equal(event.textSource, "text");
      }
      if (event.kind === "supplied") {
        assert.equal(turn.role, "assistant");
        assert.ok(turn.suppliedItemIds.includes(target.id));
      }
      if (event.supportTurnId !== null) {
        const support = byId.get(event.supportTurnId);
        assert.equal(support?.role, "assistant");
        assert.ok(support.sequence < turn.sequence);
        assert.ok(support.suppliedItemIds.includes(target.id));
      }
      if (event.kind === "assisted_production") assert.notEqual(event.supportTurnId, null);
    }
    if (fixture.expectedEvidence.length === 0) {
      assert.deepEqual(fixture.expectedState, fixture.initialState);
    } else {
      const state = fixture.expectedState;
      assert.ok(state);
      const expectedIds = [...(fixture.initialState?.evidenceIds ?? []), ...fixture.expectedEvidence.map(event => event.id)];
      assert.deepEqual(state.evidenceIds, expectedIds);
      assert.equal(new Set(expectedIds).size, expectedIds.length);
      for (const [kind, count] of Object.entries(state.counts)) {
        assert.equal(count, (fixture.initialState?.counts[kind] ?? 0)
          + fixture.expectedEvidence.filter(event => event.kind === kind).length);
      }
      const independent = fixture.expectedEvidence.filter(event => event.kind === "spontaneous_production");
      assert.deepEqual(state.independentContextIds, [...new Set([
        ...(fixture.initialState?.independentContextIds ?? []), ...independent.map(event => event.contextId),
      ])]);
      assert.equal(state.lastEvidenceAt, fixture.expectedEvidence.at(-1).occurredAt);
      assert.equal(state.lastSpontaneousAt, independent.at(-1)?.occurredAt ?? fixture.initialState?.lastSpontaneousAt ?? null);
      assert.equal(state.policyVersion, acceptancePolicy.version);
    }
    if (fixture.expectedNotice) assert.ok(fixture.turns.some(turn =>
      turn.role === "assistant" && turn.text.includes(fixture.expectedNotice)
    ));
    if (fixture.rejectedStatePatch) assert.notEqual(fixture.expectedState?.stage, fixture.rejectedStatePatch.stage);
  });
}

test("M0 expectations separate state-change requests from actual communicative use", () => {
  for (const id of ["state-request-english", "state-request-chinese-with-correction"]) {
    const fixture = scenario(id);
    assert.deepEqual(fixture.expectedEvidence, []);
    assert.deepEqual(fixture.expectedState, fixture.initialState);
    assert.ok(fixture.expectedNotice);
  }
  const mixed = scenario("correct-use-plus-state-request");
  assert.equal(mixed.expectedEvidence.length, 1);
  const span = mixed.expectedEvidence[0].observedSpan;
  assert.ok(span.end < mixed.turns[0].text.indexOf("Also,"));
  assert.equal(mixed.expectedState.stage, "spontaneous_production");
  assert.equal(mixed.expectedState.counts.spontaneous_production, 1);
  assert.deepEqual(scenario("incorrect-target-use").expectedEvidence, []);
});

test("M0 corrections preserve the original and do not count generated text as independent use", () => {
  const on = scenario("correction-on-mixed-language");
  const off = scenario("correction-off-mixed-language");
  assert.equal(on.turns[0].text, off.turns[0].text);
  assert.ok(on.turns[0].text.includes("弄明白"));
  assert.ok(on.turns[1].correction.text.includes(target.canonicalForm));
  assert.equal(off.turns[1].correction, null);
  assert.deepEqual(on.expectedEvidence.map(event => event.kind), ["supplied"]);
  assert.deepEqual(off.expectedEvidence, []);
  assert.equal(on.expectedState.stage, "encountered");
  const copied = scenario("copied-correction-is-assisted");
  assert.equal(copied.expectedState.stage, "assisted_production");
  assert.equal(copied.expectedState.counts.spontaneous_production, 0);
  const alreadyCorrect = scenario("correction-preserves-original-credit");
  assert.equal(alreadyCorrect.expectedEvidence.length, 1);
  assert.equal(alreadyCorrect.expectedEvidence[0].textSource, "text");
  const toggled = scenario("turning-correction-off-keeps-history");
  assert.deepEqual(toggled.expectedState, on.expectedState);
  assert.equal(toggled.turns.at(-1).correctionMode, false);
});
