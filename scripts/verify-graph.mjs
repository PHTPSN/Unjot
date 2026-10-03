import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { CORPUS_COUNTS, createGraphLoader } from "../lib/graph-loader.ts";
import { nodeShard, formShard } from "../packages/lexical-core/src/keys.ts";

const directory = resolve("public/graph-data/oewn-2025");
const manifest = await createGraphLoader(directory).readManifest();
const files = await readdir(directory);
assert.equal(files.filter(f => /^node-[a-f0-9]{3}\.json$/.test(f)).length, 4096);
assert.equal(files.filter(f => /^forms-[a-f0-9]{2}\.json$/.test(f)).length, 256);
const counts = { nodes: 0, lexemes: 0, senses: 0, concepts: 0, frames: 0, sourceRelations: 0 };
const ids = new Set(), targets = new Set();
let indexedForms = 0;
for (const file of files.filter(f => f.startsWith("node-"))) {
  const nodes = JSON.parse(await readFile(resolve(directory, file), "utf8"));
  for (const [id, node] of Object.entries(nodes)) {
    assert.equal(id, node.id); assert.equal(file, `node-${nodeShard(id)}.json`); assert.ok(!ids.has(id)); ids.add(id);
    counts.nodes++;
    const key = { lexeme: "lexemes", sense: "senses", concept: "concepts", frame: "frames" }[node.kind];
    if (key) counts[key]++;
    if (node.parent) targets.add(node.parent);
    for (const child of node.children) targets.add(child);
    for (const relation of node.relations) {
      targets.add(relation.target);
      if (!relation.incoming && !["word_form", "uses_pattern"].includes(relation.type)) counts.sourceRelations++;
    }
  }
}
for (const file of files.filter(f => f.startsWith("forms-"))) {
  const forms = JSON.parse(await readFile(resolve(directory, file), "utf8"));
  for (const [form, lexemes] of Object.entries(forms)) {
    assert.equal(file, `forms-${formShard(form)}.json`); indexedForms++;
    for (const id of lexemes) { assert.ok(id.startsWith("lex:")); targets.add(id); }
  }
}
for (const target of targets) assert.ok(ids.has(target), `Dangling graph target: ${target}`);
for (const [key, count] of Object.entries(counts)) { assert.equal(count, manifest.counts[key]); assert.equal(count, CORPUS_COUNTS[key]); }
console.log(JSON.stringify({ version: manifest.version, sourceArchiveSha256: manifest.sha256, verified: counts, indexedForms, danglingTargets: 0 }, null, 2));
