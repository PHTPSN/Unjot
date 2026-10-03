import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolve_expression_candidates, get_knowledge_neighborhood, get_knowledge_node, readGraphManifest } from "../lib/lexicon.ts";
import { createGraphLoader, CORPUS_COUNTS } from "../lib/graph-loader.ts";
import { LexicalGraph, nodeShard } from "../packages/lexical-core/src/graph.ts";
import { KnowledgeGraph, GraphInputError, GraphLoadError } from "../packages/lexical-core/src/knowledge.ts";
import { GET } from "../app/api/knowledge/route.ts";

const figure = "sense:figure_out%2:31:00::";
test("full OEWN manifest is pinned and figure out retains the M0/M1 identity", async () => {
  assert.deepEqual((await readGraphManifest()).counts, CORPUS_COUNTS);
  const result = await resolve_expression_candidates({ expression: " FIGURE_out " });
  assert.equal(result.status, "matched"); assert.equal(result.candidates[0].id, figure);
  assert.equal(result.candidates[0].conceptId, "concept:00636568-v");
});
test("bank exposes all meanings and ambiguity even when the page holds only one candidate", async () => {
  const first = await resolve_expression_candidates({ expression: "bank", context: "I deposited money.", limit: 1 });
  assert.equal(first.status, "ambiguous"); assert.equal(first.selectedItemId, null); assert.ok(first.total >= 18); assert.ok(first.truncated);
  const second = await resolve_expression_candidates({ expression: "bank", context: "I deposited money.", limit: 100, cursor: first.nextCursor });
  assert.notEqual(first.candidates[0].id, second.candidates[0].id);
  assert.equal(second.candidates.length + 1, first.total); assert.equal(second.nextCursor, null);
  assert.ok(second.candidates.some(n => /financial institution/.test(n.definition)));
  assert.ok(second.candidates.some(n => /sloping land/.test(n.definition)));
  await assert.rejects(resolve_expression_candidates({ expression: "dog", cursor: first.nextCursor }), GraphInputError);
});
test("inflections share stable sense IDs; unknown forms and unknown nodes stay explicit", async () => {
  const children = await resolve_expression_candidates({ expression: "children" });
  const child = await resolve_expression_candidates({ expression: "child" });
  assert.deepEqual(children.candidates, child.candidates); assert.ok(children.total > 0);
  assert.equal((await resolve_expression_candidates({ expression: "unjot-no-such-expression" })).status, "missing");
  assert.equal((await resolve_expression_candidates({ expression: "unjot-proto-no-such" })).status, "missing");
  assert.equal((await get_knowledge_node("constructor")).status, "missing");
  assert.deepEqual(await get_knowledge_node("sense:missing"), { graphVersion: "oewn-2025", status: "missing", node: null });
});
test("neighborhood preserves actual edge direction, categories, filters and pagination", async () => {
  const both = await get_knowledge_neighborhood({ id: figure, limit: 100 });
  assert.ok(both.edges.some(e => e.category === "semantic" && e.type === "also" && e.target === figure));
  assert.ok(both.edges.some(e => e.category === "semantic" && e.type === "also" && e.source === figure));
  assert.ok(both.edges.some(e => e.category === "navigation" && e.type === "word_form"));
  assert.ok(both.edges.some(e => e.category === "syntactic" && e.type === "uses_pattern"));
  assert.ok(both.edges.every(e => both.nodes.some(n => n.id === e.source) && both.nodes.some(n => n.id === e.target)));
  for (const direction of ["incoming", "outgoing"]) {
    const view = await get_knowledge_neighborhood({ id: figure, direction, relationTypes: ["also"] });
    assert.ok(view.edges.length); assert.ok(view.edges.every(e => e.type === "also" && e[direction === "incoming" ? "target" : "source"] === figure));
  }
  const first = await get_knowledge_neighborhood({ id: figure, limit: 1 });
  assert.equal(first.edges.length, 1); assert.ok(first.nextCursor); assert.ok(first.truncated);
  const next = await get_knowledge_neighborhood({ id: figure, cursor: first.nextCursor, limit: 100 });
  assert.equal(next.edges.length + 1, both.edges.length);
  const lexeme = await get_knowledge_neighborhood({ id: "lex:figure out", direction: "incoming" });
  assert.ok(lexeme.edges.some(e => e.source === figure && e.type === "word_form"));
  const concept = await get_knowledge_neighborhood({ id: "concept:00636568-v", limit: 100 });
  assert.ok(concept.edges.some(e => e.category === "semantic"));
  assert.equal((await get_knowledge_neighborhood({ id: "missing" })).status, "missing");
});
test("bounds reject malformed queries instead of silently dropping constraints", async () => {
  for (const limit of [0, -1, 101, 1.5, NaN]) await assert.rejects(resolve_expression_candidates({ expression: "bank", limit }), GraphInputError);
  await assert.rejects(resolve_expression_candidates({ expression: "a".repeat(301) }), GraphInputError);
  await assert.rejects(resolve_expression_candidates({ expression: "bank", context: "x".repeat(2001) }), GraphInputError);
  await assert.rejects(get_knowledge_neighborhood({ id: figure, depth: 2 }), GraphInputError);
  await assert.rejects(get_knowledge_neighborhood({ id: figure, direction: "sideways" }), GraphInputError);
  await assert.rejects(get_knowledge_neighborhood({ id: figure, relationTypes: Array(17).fill("also") }), GraphInputError);
  await assert.rejects(get_knowledge_neighborhood({ id: figure, cursor: "bad" }), GraphInputError);
});
test("missing, corrupt or mismatched assets fail safely and an import can recover without a restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "unjot-graph-"));
  try {
    const loader = createGraphLoader(directory), graph = new KnowledgeGraph(new LexicalGraph(loader.load));
    await assert.rejects(graph.get_knowledge_node(figure), GraphLoadError);
    const manifest = await readGraphManifest();
    await writeFile(join(directory, "manifest.json"), JSON.stringify({ ...manifest, version: "bad" }));
    await assert.rejects(graph.get_knowledge_node(figure), GraphLoadError);
    await writeFile(join(directory, "manifest.json"), JSON.stringify(manifest));
    await writeFile(join(directory, `node-${nodeShard(figure)}.json`), "invalid-json");
    await assert.rejects(graph.get_knowledge_node(figure), GraphLoadError);
    await writeFile(join(directory, `node-${nodeShard(figure)}.json`), "{}");
    assert.equal((await graph.get_knowledge_node(figure)).status, "missing");
    await assert.rejects(loader.load("../../.env"), GraphLoadError);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test("knowledge HTTP boundary returns bounded real graph results and safe validation errors", async () => {
  const request = query => GET(new Request(`http://localhost/api/knowledge?${query}`));
  assert.equal((await request("operation=resolve_expression_candidates&expression=bank&limit=1")).status, 200);
  const unknown = await (await request("operation=resolve_expression_candidates&expression=unjot-no-such-expression")).json();
  assert.equal(unknown.status, "missing");
  for (const query of ["operation=write_mastery", "operation=get_knowledge_neighborhood&id=english&depth=2", "operation=resolve_expression_candidates&expression=bank&limit=101"]) assert.equal((await request(query)).status, 400);
});
