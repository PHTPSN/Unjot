// Explicit live acceptance: node --env-file=.env scripts/evaluate-learning.mjs
// Uses only synthetic fixtures and an isolated local database. Never prints credentials.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { evaluateTurn } from "../lib/evidence-evaluator.ts";
import { readLlmConfig } from "../lib/llm-config.ts";
import { lexicalGraph as graph } from "../lib/lexicon.ts";
import { scenarios, target } from "../packages/golden-tests/fixtures/figure-out.ts";
import { LearnerStore } from "../lib/learner-store.ts";
import { sendLearningTurn } from "../lib/learning-conversation.ts";

const configured = readLlmConfig();
if (!configured.configured) throw new Error("Configure the provider in .env before live evaluation.");
const results = [];
const directory = resolve(".local", `learning-eval-${Date.now()}`);
mkdirSync(directory, { recursive: true });
function saveReport() { writeFileSync(resolve(directory, "results.json"), JSON.stringify({ model: configured.config.model, date: new Date().toISOString(), results }, null, 2)); }
for (const scenario of scenarios.filter(s => !process.env.EVAL_CASE || s.id === process.env.EVAL_CASE)) {
  const accepted = [];
  const decisions = [];
  for (let i = 0; i < scenario.turns.length; i++) {
    const next = await evaluateTurn({ config: configured.config, graph, turn: scenario.turns[i], history: scenario.turns.slice(0, i), accepted, deviceId: "live-acceptance" });
    decisions.push(...next);
    accepted.push(...next.flatMap(d => d.event ? [d.event] : []));
  }
  const expected = scenario.expectedEvidence.map(e => e.kind);
  const actual = accepted.filter(e => e.itemId === target.id).map(e => e.kind);
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  results.push({ id: scenario.id, pass, expected, actual, decisions });
  saveReport();
  console.log(JSON.stringify({ id: scenario.id, pass, expected, actual, ...(pass ? {} : { decisions }) }));
}
if (process.env.EVAL_CASE) { console.log(directory); process.exit(results.every(r => r.pass) ? 0 : 1); }
const assistant = { ...scenarios[0].turns[1], sequence: 1, text: "Figure out means to find a solution or understand something.", suppliedItemIds: [target.id] };
for (const [id, text, expected] of [
  ["receptive-paraphrase", "So it means to find a solution to a problem.", "recognized"],
  ["specific-difficulty", "I don't understand what figure out means here.", "help_requested"],
  ["mere-continuation", "Thanks. Let's move on.", null],
  ["quoted-translation", "Translate 'figure out' into Chinese.", null],
  ["ambiguous-meaning", "bank", null],
]) {
  const turn = { ...scenarios[0].turns[0], id, sequence: 2, text };
  const decisions = await evaluateTurn({ config: configured.config, graph, turn, history: [assistant], accepted: [], deviceId: "live-acceptance" });
  const actual = decisions.flatMap(d => d.event?.itemId === target.id && d.event.kind !== "uncertain" ? [d.event.kind] : []);
  const pass = JSON.stringify(actual) === JSON.stringify(expected ? [expected] : []);
  results.push({ id, pass, expected, actual, decisions });
  console.log(JSON.stringify({ id, pass, actual }));
}
const path = resolve(directory, "learner.sqlite");
let store = new LearnerStore(path);
try {
  const options = { store, graph, config: configured.config, id: "live-conversation", text: "We can figure out the problem together.", correctionMode: true };
  const reply = await sendLearningTurn(options);
  const before = { turns: store.turns(), evidence: store.evidence(), states: store.states() };
  store.close(); store = new LearnerStore(path);
  const after = { turns: store.turns(), evidence: store.evidence(), states: store.states() };
  const cached = await sendLearningTurn({ ...options, store });
  const pass = JSON.stringify(before) === JSON.stringify(after) && reply.assistantTurn.id === cached.assistantTurn.id;
  results.push({ id: "real-conversation-reopen-retry", pass, originalTurns: after.turns, evidence: after.evidence });
  console.log(JSON.stringify({ id: "real-conversation-reopen-retry", pass }));
} finally { store.close(); }
writeFileSync(resolve(directory, "results.json"), JSON.stringify({ model: configured.config.model, date: new Date().toISOString(), results }, null, 2));
console.log(JSON.stringify({ report: resolve(directory, "results.json"), passed: results.filter(r => r.pass).length, total: results.length }));
if (results.some(r => !r.pass)) process.exitCode = 1;
