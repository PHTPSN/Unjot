import assert from "node:assert/strict";
import test from "node:test";
import { LexicalGraph } from "../lexical-core/src/graph.ts";
import { fixtureLoader } from "./fixtures/graph.ts";

const graph = new LexicalGraph(fixtureLoader);

test("M1A resolves figure out through the OEWN form index to its stable sense", async () => {
  const items = await graph.findByForm("  FIGURE   OUT ");
  assert.equal(items.length, 1);
  assert.deepEqual(items[0], {
    id: "sense:figure_out%2:31:00::",
    canonicalForm: "figure out",
    language: "en",
    partOfSpeech: "v",
    definition: "find the solution to (a problem or question) or understand the meaning of",
    forms: ["figure out"],
    lexemeId: "lex:figure out",
    conceptId: "concept:00636568-v",
    source: "oewn-2025",
  });
});

test("M1A can retrieve one sense and its immediate graph neighbors", async () => {
  const item = await graph.getItem("sense:figure_out%2:31:00::");
  assert.equal(item?.canonicalForm, "figure out");
  assert.equal(await graph.getItem("lex:figure out"), null);

  const neighbors = await graph.getNeighbors("sense:figure_out%2:31:00::");
  assert.deepEqual(new Set(neighbors.map(node => node.id)), new Set([
    "concept:00636568-v",
    "lex:figure out",
    "frame:vtai",
    "sense:figure%2:31:00::",
  ]));
  assert.deepEqual(await graph.getNeighbors("missing"), []);
});

test("M1A preserves ordinary OEWN ambiguity and reports unknown forms", async () => {
  const figures = await graph.findByForm("figure");
  assert.ok(figures.some(item => item.id === "sense:figure%2:31:00::"));
  assert.deepEqual(await graph.findByForm("not in oewn"), []);
});
