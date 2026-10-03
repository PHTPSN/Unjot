import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { normalizeForm, nodeShard, formShard } from "../packages/lexical-core/src/keys.ts";

// Only generated corpus assets are written. Raw downloaded source is never edited.
const source = resolve(process.argv[2] || ".local/graph-source/oewn-2025");
const output = resolve("public/graph-data/oewn-2025");
const archive = resolve(process.argv[3] || ".local/graph-source/english-wordnet-2025-json.zip");
const expectedHash = "7d749f6e2c39e6970e4997839dcf6e42fd281f3c2fae0171d2192bae8cfa4b51";
if (!existsSync(archive) || createHash("sha256").update(readFileSync(archive)).digest("hex") !== expectedHash) throw new Error("The pinned source archive checksum does not match.");
const nodes = new Map();
const forms = new Map();
const make = (id, label, kind, definition, parent) => {
  const node = { id, label, kind, definition, children: [], relations: [], ...(parent ? { parent } : {}) };
  nodes.set(id, node);
  if (parent) nodes.get(parent).children.push(id);
  return node;
};
make("english", "English", "root", "An expandable English knowledge network. Lexical meanings and verb patterns are imported; other language layers are not yet covered.");
make("lexicon", "Words & meanings", "layer", "The complete Open English WordNet 2025 core, not a sample.", "english");
make("patterns", "Verb patterns", "layer", "All syntactic frames supplied by WordNet. These are verb-complement patterns, not a complete English grammar.", "english");
const posLabels = { noun: "Nouns", verb: "Verbs", adj: "Adjectives", adv: "Adverbs" };
for (const [key, label] of Object.entries(posLabels)) make(`pos:${key}`, label, "pos", `${label} grouped by the source's lexical domains.`, "lexicon");
const frames = JSON.parse(readFileSync(join(source, "frames.json"), "utf8"));
for (const [key, label] of Object.entries(frames)) make(`frame:${key}`, label, "frame", "A syntactic frame from Open English WordNet. Click a linked sense to see which verb uses this pattern.", "patterns");
let conceptCount = 0, entryCount = 0, senseCount = 0, relationCount = 0;
const pending = [];
const addRelations = (node, record, test, prefix) => {
  for (const [type, values] of Object.entries(record)) {
    if (!Array.isArray(values)) continue;
    for (const target of values) if (typeof target === "string" && test(target)) { pending.push([node.id, prefix + target, type]); relationCount++; }
  }
};
const examples = values => (values || []).map(v => typeof v === "string" ? v : v.text).filter(Boolean);
for (const file of readdirSync(source).sort().filter(f => /^(noun|verb|adj|adv)\./.test(f))) {
  const domain = file.replace(/\.json$/, "");
  const [pos, category] = domain.split(".");
  make(`domain:${domain}`, category === "all" ? `All ${posLabels[pos].toLowerCase()}` : category === "Tops" ? "Foundational concepts" : category.replace(/_/g, " "), "domain", `WordNet lexical domain: ${domain}.`, `pos:${pos}`);
  for (const [key, value] of Object.entries(JSON.parse(readFileSync(join(source, file), "utf8")))) {
    const node = make(`concept:${key}`, value.members[0], "concept", value.definition.join("; "), `domain:${domain}`);
    Object.assign(node, { domain, pos: value.partOfSpeech, examples: examples(value.example) });
    addRelations(node, value, t => /^\d{8}-[nvars]$/.test(t), "concept:");
    conceptCount++;
  }
}
function addForm(form, id) {
  const key = normalizeForm(form);
  if (!key) return;
  if (!forms.has(key)) forms.set(key, new Set());
  forms.get(key).add(id);
}
for (const file of readdirSync(source).sort().filter(f => f.startsWith("entries-"))) {
  for (const [lemma, entries] of Object.entries(JSON.parse(readFileSync(join(source, file), "utf8")))) {
    const lexemeId = "lex:" + normalizeForm(lemma);
    let lexeme = nodes.get(lexemeId);
    if (!lexeme) lexeme = make(lexemeId, lemma, "lexeme", "A word or expression. Familiarity with its form is separate from demonstrated knowledge of each meaning.");
    addForm(lemma, lexemeId);
    for (const [pos, entry] of Object.entries(entries)) {
      entryCount++;
      for (const form of entry.form || []) addForm(typeof form === "string" ? form : form.writtenForm, lexemeId);
      for (const sense of entry.sense) {
        const concept = nodes.get(`concept:${sense.synset}`);
        if (!concept) throw new Error(`Missing concept: ${sense.synset}`);
        const node = make(`sense:${sense.id}`, lemma, "sense", concept.definition, concept.id);
        Object.assign(node, { pos, domain: concept.domain, lexeme: lexemeId, concept: concept.id, pronunciation: (entry.pronunciation || []).map(p => p.value), examples: [...examples(sense.sent), ...concept.examples] });
        lexeme.children.push(node.id);
        node.relations.push({ target: lexemeId, type: "word_form" });
        for (const frame of sense.subcat || []) {
          const frameNode = nodes.get(`frame:${frame}`);
          if (!frameNode) throw new Error(`Missing frame: ${frame}`);
          node.relations.push({ target: frameNode.id, type: "uses_pattern" });
          frameNode.children.push(node.id);
        }
        addRelations(node, sense, t => t.includes("%"), "sense:");
        senseCount++;
      }
    }
  }
}
const dangling = [];
for (const [sourceId, targetId, type] of pending) {
  if (!nodes.has(targetId)) { dangling.push({ sourceId, targetId, type }); continue; }
  nodes.get(sourceId).relations.push({ target: targetId, type });
  nodes.get(targetId).relations.push({ target: sourceId, type, incoming: true });
}
if (dangling.length) throw new Error(`Dangling source relations: ${JSON.stringify(dangling.slice(0, 4))}`);
// Deterministic pagination, independent of machine locale or insertion order.
for (const node of nodes.values()) node.children = [...new Set(node.children)].sort((a, b) => {
  const x = nodes.get(a).label.toLowerCase(), y = nodes.get(b).label.toLowerCase();
  return x < y ? -1 : x > y ? 1 : a < b ? -1 : 1;
});
mkdirSync(output, { recursive: true });
const buckets = Array.from({ length: 4096 }, () => ({}));
const lookup = Array.from({ length: 256 }, () => ({}));
for (const [id, node] of nodes) buckets[parseInt(nodeShard(id), 16)][id] = node;
for (const [form, ids] of forms) lookup[parseInt(formShard(form), 16)][form] = [...ids];
for (let i = 0; i < 256; i++) {
  const key = i.toString(16).padStart(2, "0");
  writeFileSync(join(output, `forms-${key}.json`), JSON.stringify(lookup[i]));
}
for (let i = 0; i < 4096; i++) writeFileSync(join(output, `node-${i.toString(16).padStart(3, "0")}.json`), JSON.stringify(buckets[i]));
const manifest = {
  version: "oewn-2025", source: "Open English WordNet 2025 core", sourceUrl: "https://en-word.net/downloads",
  license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/", sha256: expectedHash,
  attribution: "Open English WordNet Community, derived from Princeton WordNet. https://github.com/globalwordnet/english-wordnet/blob/main/AUTHORS.md",
  transformations: ["Reindexed as concepts, individual lexical senses, normalized word forms, and syntactic frames.", "Added navigation groups and inverse edges. No learner weights are part of the source ontology.", "Case-folded form lookup; original sense IDs, definitions, examples, and source relations preserved."],
  counts: { lexicalEntries: entryCount, lexemes: [...nodes.values()].filter(n => n.kind === "lexeme").length, senses: senseCount, concepts: conceptCount, sourceRelations: relationCount, frames: Object.keys(frames).length, nodes: nodes.size },
  coverage: { included: ["All lexical entries, senses, semantic and lexical relations in the pinned core JSON release", "Inflected forms and pronunciations supplied by the source", "All supplied verb-complement frames"], missing: ["Complete grammar and productive constructions", "Comprehensive idioms, collocations, function words, and emerging vocabulary", "Pragmatics, discourse, listening, and pronunciation assessment", "Context-conditioned frequency baselines"] },
};
if (entryCount !== 135969 || conceptCount !== 107519 || senseCount !== 185129) throw new Error("Pinned corpus counts changed.");
writeFileSync(join(output, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest.counts));
