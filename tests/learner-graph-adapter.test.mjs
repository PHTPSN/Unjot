import assert from "node:assert/strict";
import test from "node:test";
import { evidenceMetric, learningStateFromCorrected, toLearningGraphRenderModel } from "../lib/graph/learning-adapter.ts";

const state = (itemId, receptive, production, evidenceCount = 1, needsSupport = receptive === "needs_support") => learningStateFromCorrected({
  itemId, receptive, production, receptiveEvidenceIds: [], productionEvidenceIds: [], difficultyEvidenceIds: [], supportEvidenceIds: [], evidencePolicyVersions: ["m5r-evidence-v1"], independentEventIds: [], independentContextIds: [], stateRevision: "7", derivationPolicyVersion: "m5r-state-v1",
}, evidenceCount, "2026-10-04T00:00:00.000Z", evidenceMetric(receptive, production, evidenceCount), needsSupport);

test("maps corrected receptive and production states to distinct visual tones", () => {
  const structure = { graphVersion: "oewn-2025", nodes: [
    { id: "a", label: "a", type: "sense", definition: "" },
    { id: "b", label: "b", type: "sense", definition: "" },
    { id: "c", label: "c", type: "sense", definition: "" },
    { id: "d", label: "d", type: "sense", definition: "" },
    { id: "e", label: "e", type: "sense", definition: "" },
    { id: "f", label: "f", type: "sense", definition: "" },
  ], edges: [] };
  const model = toLearningGraphRenderModel(structure, [
    state("a", "encountered", "none"), state("b", "understood", "none"), state("c", "understood", "assisted_production"),
    state("d", "understood", "spontaneous_production"), state("e", "understood", "repeated_independent_use"), state("f", "needs_support", "none"),
  ]);
  assert.deepEqual(model.nodes.map(node => node.tone), ["encountered", "understood", "assisted", "spontaneous", "repeated", "needs_support"]);
  assert.equal(model.nodes[4].state.production, "repeated_independent_use");
});

test("independent production remains visible alongside a separate support flag", () => {
  const model = toLearningGraphRenderModel({ graphVersion: "oewn-2025", nodes: [{ id: "mixed", label: "mixed", type: "sense", definition: "" }], edges: [] }, [
    state("mixed", "needs_support", "repeated_independent_use", 4),
  ]);
  assert.equal(model.nodes[0].tone, "repeated");
  assert.equal(model.nodes[0].state.needsSupport, true);
});

test("aggregate coverage reports descendants without inheriting a child's mastery", () => {
  const structure = { graphVersion: "oewn-2025", nodes: [
    { id: "group", label: "group", type: "concept", definition: "", children: ["strong", "quiet"] },
    { id: "strong", label: "strong", type: "sense", definition: "" },
    { id: "quiet", label: "quiet", type: "sense", definition: "" },
  ], edges: [{ source: "group", target: "strong", type: "contains", category: "navigation" }] };
  const model = toLearningGraphRenderModel(structure, [state("strong", "understood", "repeated_independent_use", 4)]);
  const group = model.nodes.find(node => node.id === "group");
  assert.equal(group.tone, "aggregate");
  assert.deepEqual(group.aggregateCoverage, { observed: 1, total: 2 });
  assert.notEqual(group.tone, "repeated");
});

test("unobserved nodes remain neutral and metric values are bounded", () => {
  const model = toLearningGraphRenderModel({ graphVersion: "oewn-2025", nodes: [{ id: "new", label: "new", type: "sense", definition: "" }], edges: [] }, []);
  assert.equal(model.nodes[0].tone, "unobserved");
  assert.equal(model.nodes[0].state, null);
  assert.equal(evidenceMetric("understood", "repeated_independent_use", 99), 1);
});
