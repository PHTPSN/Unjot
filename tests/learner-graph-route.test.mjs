import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const dataDir = await mkdtemp(join(tmpdir(), "unjot-learner-graph-"));
process.env.UNJOT_DATA_DIR = dataDir;
const { GET } = await import("../app/api/learner-graph/route.ts");

test.after(async () => {
  globalThis.unjotLearnerStore?.close();
  await rm(dataDir, { recursive: true, force: true });
});

test("default learner graph loads real WordNet structure with an empty evidence ledger", async () => {
    const response = await GET(new Request("http://localhost/api/learner-graph"));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.graphVersion, "oewn-2025");
    assert.equal(body.emptyEvidence, true);
    assert.ok(body.nodes.some(node => node.id === "english"));
    assert.ok(body.nodes.some(node => node.id === "lexicon"));
    assert.ok(body.edges.some(edge => edge.type === "contains"));
    assert.ok(body.nodes.every(node => node.tone === "unobserved" || node.tone === "aggregate"));
});

test("missing focused graph nodes return an explicit error", async () => {
    const response = await GET(new Request("http://localhost/api/learner-graph?focus=missing-node"));
    assert.equal(response.status, 404);
    assert.match((await response.json()).error, /not found/i);
});
