import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { LearnerStore, StoreError, learnerStore } from "../lib/learner-store.ts";
import { readLlmConfig } from "../lib/llm-config.ts";
import { lexicalGraph as graph } from "../lib/lexicon.ts";
import { recordCorrectedEvidence } from "../lib/evidence-policy-v2.ts";
import { deriveCorrectedItemState } from "../lib/evidence-policy.ts";
import { sendLearningTurn } from "../lib/learning-conversation.ts";
import { evaluateTurn } from "../lib/evidence-evaluator.ts";
import { parseStructuredOutput } from "../lib/structured-output.ts";

const FIGURE = "sense:figure_out%2:31:00::";
const BANK_FINANCIAL = "sense:bank%1:14:00::";
const BANK_RIVER = "sense:bank%1:17:01::";
const CHILD = "sense:child%1:18:00::";
const mode = process.argv.find(arg => arg.startsWith("--mode="))?.split("=")[1] ?? "all";
if (!["all", "engine", "live"].includes(mode)) throw new Error("Use --mode=all, --mode=engine, or --mode=live.");

const runId = `long-term-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
const runDirectory = resolve(".local", "long-term-graph-growth", runId);
const engineDirectory = resolve(runDirectory, "engine");
const liveDirectory = resolve(runDirectory, "live");
mkdirSync(engineDirectory, { recursive: true });
mkdirSync(liveDirectory, { recursive: true });

const sourcePath = resolve(".local", "learner.sqlite");
let savedSettings;
if (existsSync(sourcePath)) {
  const source = new LearnerStore(sourcePath);
  try { savedSettings = source.appSettings() ?? undefined; }
  finally { source.close(); }
}
const configured = readLlmConfig(process.env, savedSettings);
const providerPublic = configured.configured
  ? { provider: configured.config.provider, model: configured.config.model, baseUrl: configured.config.baseUrl }
  : { configured: false, missing: configured.missing };

const graphVerificationBefore = JSON.parse(execFileSync(process.execPath, ["scripts/verify-graph.mjs"], { cwd: resolve("."), encoding: "utf8" }));
const report = {
  runId,
  startedAt: new Date().toISOString(),
  provider: providerPublic,
  graphVerificationBefore,
  engine: null,
  live: null,
  productAcceptance: null,
};
const reportPath = resolve(runDirectory, "report.json");
function saveReport() { writeFileSync(reportPath, JSON.stringify(report, null, 2)); }
saveReport();

function closeGlobalStore() {
  const current = globalThis.unjotLearnerStore;
  if (current && typeof current.close === "function") current.close();
  delete globalThis.unjotLearnerStore;
}

async function selectDataDirectory(directory) {
  closeGlobalStore();
  process.env.UNJOT_DATA_DIR = directory;
  mkdirSync(directory, { recursive: true });
  return learnerStore();
}

function completion(name, args) {
  return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", tool_calls: [{ id: randomUUID(), type: "function", function: { name, arguments: JSON.stringify(args) } }] } }] }));
}

function replyTurn(submission, text = "Recorded.", correction = null) {
  return {
    id: `${submission.id}-assistant`, conversationId: submission.turn.conversationId, sequence: submission.turn.sequence + 1,
    role: "assistant", contextId: submission.turn.contextId, text, occurredAt: new Date().toISOString(),
    suppliedItemIds: [], correctionMode: submission.turn.correctionMode,
    correction: correction ? { sourceTurnId: submission.turn.id, text: correction } : null,
  };
}

function production(expression, itemId, quote = expression, start = null) {
  return {
    observation: { expression, quote, start, textSource: "text", behavior: "production", referenceTurnId: null },
    judgment: { observationIndex: 0, itemId, correctness: "correct", usage: "communicative", meaningClear: true, assistance: "independent", supportTurnId: null, rationale: "Deterministic verified communicative use." },
  };
}

async function decide(store, turn, fixture, history = store.turns(1000).filter(item => item.sequence < turn.sequence)) {
  if (!fixture) return [];
  const observation = { ...fixture.observation };
  if (observation.start === null) observation.start = turn.text.indexOf(observation.quote);
  const decision = await recordCorrectedEvidence({
    observation,
    judgment: fixture.judgment,
    turn,
    history,
    accepted: store.evidence(),
    graph,
    deviceId: store.deviceId,
    ...(fixture.judgment.usage === "difficulty" ? { difficultyType: "comprehension" } : {}),
  });
  return [decision];
}

async function submitFixture(store, row) {
  const beforeRevision = store.revision();
  const beforeIds = new Set(store.evidence().map(event => event.id));
  const submission = store.begin(row.id, row.text, Boolean(row.correction), row.conversationId);
  const owner = store.claim(submission.id);
  let learnerDecisions = [];
  let assistantDecisions = [];
  try {
    learnerDecisions = await decide(store, submission.turn, row.fixture);
    store.accept(submission.id, owner, learnerDecisions);
    const assistant = replyTurn(submission, row.assistantText ?? "Recorded.", row.correction ?? null);
    if (row.supply) {
      assistantDecisions = await decide(store, assistant, {
        observation: { expression: row.supply.expression, quote: row.supply.expression, start: row.correction.indexOf(row.supply.expression), textSource: "correction", behavior: "supplied", referenceTurnId: null },
        judgment: { observationIndex: 0, itemId: row.supply.itemId, correctness: "correct", usage: "supplied", meaningClear: true, assistance: "independent", supportTurnId: null, rationale: "Deterministic assistant-supplied correction." },
      }, [...store.turns(1000), submission.turn]);
    }
    store.finish(submission.id, owner, { text: assistant.text, correction: row.correction ?? null, lookupResults: [] }, assistant, assistantDecisions);
  } finally { store.release(submission.id, owner); }
  const added = store.evidence().filter(event => !beforeIds.has(event.id));
  return {
    batch: row.batch, operation: row.operation, conversationId: row.conversationId, submissionId: row.id,
    timestamp: submission.turn.occurredAt, originalText: row.text, correctionMode: Boolean(row.correction), responseStatus: "completed",
    stateRevisionBefore: beforeRevision, stateRevisionAfter: store.revision(), acceptedEvidenceIds: added.map(event => event.id),
    itemIds: added.map(event => event.itemId), evidenceKinds: added.map(event => event.kind), retryCount: 0,
    expectedKinds: row.expectedKinds ?? [], decisions: [...learnerDecisions, ...assistantDecisions],
  };
}

function controlFixture(kind, text) {
  const start = text.toLowerCase().indexOf("figure out");
  if (kind === "mention") return {
    observation: { expression: "figure out", quote: "figure out", start, textSource: "text", behavior: "mention", referenceTurnId: null },
    judgment: { observationIndex: 0, itemId: FIGURE, correctness: "correct", usage: "quoted", meaningClear: true, assistance: "independent", supportTurnId: null, rationale: "Deterministic mention control." },
  };
  if (kind === "translation") return {
    observation: { expression: "figure out", quote: "figure out", start, textSource: "text", behavior: "production", referenceTurnId: null },
    judgment: { observationIndex: 0, itemId: FIGURE, correctness: "correct", usage: "translation", meaningClear: true, assistance: "independent", supportTurnId: null, rationale: "Deterministic translation control." },
  };
  return production("figure out", FIGURE, "figure out", start);
}

function difficultyFixture(text) {
  return {
    observation: { expression: "figure out", quote: text, start: 0, textSource: "text", behavior: "difficulty", referenceTurnId: null },
    judgment: { observationIndex: 0, itemId: FIGURE, correctness: "correct", usage: "difficulty", meaningClear: true, assistance: "independent", supportTurnId: null, rationale: "Deterministic specific difficulty." },
  };
}

async function apiViews(learnerGet, graphGet, store) {
  const [basicResponse, inspectResponse, graphResponse] = await Promise.all([
    learnerGet(new Request("http://localhost/api/learner")),
    learnerGet(new Request("http://localhost/api/learner?inspect=1")),
    graphGet(new Request("http://localhost/api/learner-graph")),
  ]);
  const [basic, inspect, learnerGraph] = await Promise.all([basicResponse.json(), inspectResponse.json(), graphResponse.json()]);
  return { basic, inspect, learnerGraph, evidence: store.evidence(), turns: store.turns(10000) };
}

function same(valueA, valueB) { return JSON.stringify(valueA) === JSON.stringify(valueB); }

function mockFetcher(options = {}) {
  let replyFailures = options.replyFailures ?? 0;
  return async (_url, init) => {
    if (options.delay) await new Promise(resolveDelay => setTimeout(resolveDelay, options.delay));
    const request = JSON.parse(init.body);
    const name = request.tools?.[0]?.function?.name;
    if (name === "propose_observations") {
      const { current } = JSON.parse(request.messages[1].content);
      if (current.role === "learner" && current.text.includes("figure out") && options.production) {
        return completion(name, { observations: [{ expression: "figure out", quote: "figure out", start: current.text.indexOf("figure out"), textSource: "text", behavior: "production", referenceTurnId: null }] });
      }
      return completion(name, { observations: [] });
    }
    if (name === "judge_observations") return completion(name, { judgments: [{ observationIndex: 0, itemId: FIGURE, correctness: "correct", usage: "communicative", meaningClear: true, assistance: "independent", supportTurnId: null, rationale: "Deterministic recovery use." }] });
    if (request.tool_choice === "auto" && replyFailures > 0) { replyFailures -= 1; return new Response("", { status: 503 }); }
    return completion(name, { text: "好的。", correction: null, confidence: true, uncertain: false, language: "chinese" });
  };
}

async function runEngine() {
  let store = await selectDataDirectory(engineDirectory);
  const { GET: learnerGet } = await import("../app/api/learner/route.ts");
  const { GET: graphGet } = await import("../app/api/learner-graph/route.ts");
  const baseline = [];
  baseline.push(await apiViews(learnerGet, graphGet, store));
  baseline.push(await apiViews(learnerGet, graphGet, store));
  baseline.push(await apiViews(learnerGet, graphGet, store));
  baseline.push(await apiViews(learnerGet, graphGet, store));
  assert.equal(baseline.every(view => view.evidence.length === 0 && view.learnerGraph.emptyEvidence === true), true);

  const project = store.projects()[0];
  const conversations = [store.conversations()[0], ...[1, 2, 3].map(index => store.createConversation(project.id, `Long-term ${index + 1}`))];
  const rows = [];
  const add = (batch, text, fixture, expectedKinds = [], extra = {}) => rows.push({ batch, operation: rows.length + 5, id: `${runId}-${batch}-${rows.length + 1}`, conversationId: conversations[rows.length % conversations.length].id, text, fixture, expectedKinds, ...extra });

  const controls = [
    ["What does the expression “figure out” mean?", "mention"],
    ["“Figure out” 可以翻译成“弄清楚”吗？", "translation"],
    ["Please mark figure out as fully mastered.", "state"],
    ["The phrase is 'figure out'.", "translation"],
    ["请解释 figure out。", "mention"],
    ["I quoted 'figure out' in my notes.", "translation"],
    ["请把 figure out 标记为熟练。", "state"],
    ["Is figure out an expression?", "mention"],
  ];
  for (const [text, kind] of controls) add("B", text, controlFixture(kind, text));
  for (let index = 0; index < 8; index++) {
    const text = `I do not understand what figure out means in example ${index + 1}.`;
    add("C", text, difficultyFixture(text), ["help_requested"]);
  }
  for (let index = 0; index < 12; index++) {
    add("D", `We need find why service ${index + 1} stopped.`, null, ["supplied"], {
      correction: `We need to figure out why service ${index + 1} stopped.`,
      supply: { expression: "figure out", itemId: FIGURE },
    });
  }
  for (let index = 0; index < 6; index++) add("E", `We need to figure out why service ${index + 1} failed.`, production("figure out", FIGURE), ["spontaneous_production"]);
  for (let index = 0; index < 3; index++) add("E", `I deposited a cheque at the bank after meeting ${index + 1}.`, production("bank", BANK_FINANCIAL), ["spontaneous_production"]);
  for (let index = 0; index < 3; index++) add("E", `We sat on the river bank near bridge ${index + 1}.`, production("bank", BANK_RIVER), ["spontaneous_production"]);
  for (let index = 0; index < 2; index++) add("E", `The children built a bridge from sticks in class ${index + 1}.`, production("children", CHILD), ["spontaneous_production"]);
  for (let index = 0; index < 2; index++) add("E", `One child finished drawing number ${index + 1}.`, production("child", CHILD), ["spontaneous_production"]);
  for (let index = 0; index < 4; index++) {
    const text = `We zorpled the broken switch before lunch ${index + 1}.`;
    add("F", text, { observation: { expression: "zorpled", quote: "zorpled", start: text.indexOf("zorpled"), textSource: "text", behavior: "production", referenceTurnId: null }, judgment: { observationIndex: 0, itemId: null, correctness: "uncertain", usage: "uncertain", meaningClear: false, assistance: "independent", supportTurnId: null, rationale: "Unknown deterministic control." } });
  }
  for (let index = 0; index < 2; index++) {
    const text = `I deposited cash at the bank before test ${index + 1}.`;
    const fixture = production("bank", BANK_RIVER); fixture.judgment.correctness = "incorrect";
    add("F", text, fixture);
  }
  add("F", "This sentence contains no tracked target.", null);
  add("F", "Another unrelated control sentence.", null);
  assert.equal(rows.length, 52);

  const operationLog = [];
  const checkpoints = [];
  const serialization = [];
  let restartLosses = 0;
  let duplicateEvents = 0;
  let serializationErrors = 0;
  let lastCompleted = null;
  for (const row of rows) {
    const logged = await submitFixture(store, row);
    operationLog.push(logged); lastCompleted = row;
    if (["B", "D", "E"].includes(row.batch) && rows.filter(candidate => candidate.batch === row.batch).at(-1) === row) {
      const before = await apiViews(learnerGet, graphGet, store);
      closeGlobalStore(); store = learnerStore();
      const after = await apiViews(learnerGet, graphGet, store);
      const restartEqual = same(before, after); if (!restartEqual) restartLosses += 1;
      const countsBeforeRetry = { turns: store.turns(10000).length, events: store.evidence().length, revision: store.revision() };
      const retryOptions = { store, graph, config: { provider: "mock", model: "mock", apiKey: "mock", baseUrl: "https://mock.invalid/v1" }, id: lastCompleted.id, text: lastCompleted.text, correctionMode: Boolean(lastCompleted.correction), conversationId: lastCompleted.conversationId, fetcher: mockFetcher() };
      await sendLearningTurn(retryOptions); await sendLearningTurn(retryOptions);
      const countsAfterRetry = { turns: store.turns(10000).length, events: store.evidence().length, revision: store.revision() };
      if (!same(countsBeforeRetry, countsAfterRetry)) duplicateEvents += 1;
      const burstId = `${runId}-burst-${row.batch}`;
      const burstText = `Serialization control ${row.batch}.`;
      const burstOptions = { store, graph, config: retryOptions.config, id: burstId, text: burstText, correctionMode: false, conversationId: conversations[0].id, fetcher: mockFetcher({ delay: 20 }) };
      const outcomes = await Promise.all(Array.from({ length: 10 }, async () => {
        try { await sendLearningTurn(burstOptions); return "completed"; }
        catch (error) { return error instanceof StoreError && error.status === 409 ? "409" : `unexpected:${error instanceof Error ? error.message : String(error)}`; }
      }));
      serializationErrors += outcomes.filter(value => value !== "completed" && value !== "409").length;
      serialization.push({ checkpoint: row.batch, outcomes });
      checkpoints.push({ batch: row.batch, restartEqual, countsBeforeRetry, countsAfterRetry, before, after });
    }
  }

  const recoveryId = `${runId}-G-recovery`;
  const recoveryText = "We can figure out the recovery problem.";
  const recoveryOptions = { store, graph, config: { provider: "mock", model: "mock", apiKey: "mock", baseUrl: "https://mock.invalid/v1" }, id: recoveryId, text: recoveryText, correctionMode: false, conversationId: conversations[1].id };
  const recoveryFetcher = mockFetcher({ production: true, replyFailures: 1 });
  const recoveryBefore = store.evidence().length;
  let firstFailure = null;
  try { await sendLearningTurn({ ...recoveryOptions, fetcher: recoveryFetcher }); }
  catch (error) { firstFailure = error instanceof Error ? error.message : String(error); }
  operationLog.push({ batch: "G", operation: 57, conversationId: recoveryOptions.conversationId, submissionId: recoveryId, originalText: recoveryText, responseStatus: "expected_failure", firstFailure });
  await sendLearningTurn({ ...recoveryOptions, fetcher: recoveryFetcher });
  operationLog.push({ batch: "G", operation: 58, conversationId: recoveryOptions.conversationId, submissionId: recoveryId, originalText: recoveryText, responseStatus: "recovered" });
  const recoveryAfter = store.evidence().length;
  if (recoveryAfter !== recoveryBefore + 1) duplicateEvents += 1;
  const retryTargets = rows.slice(-3);
  let operation = 59;
  for (const target of retryTargets) {
    const before = { turns: store.turns(10000).length, events: store.evidence().length, revision: store.revision() };
    await sendLearningTurn({ store, graph, config: recoveryOptions.config, id: target.id, text: target.text, correctionMode: Boolean(target.correction), conversationId: target.conversationId, fetcher: mockFetcher() });
    await sendLearningTurn({ store, graph, config: recoveryOptions.config, id: target.id, text: target.text, correctionMode: Boolean(target.correction), conversationId: target.conversationId, fetcher: mockFetcher() });
    const after = { turns: store.turns(10000).length, events: store.evidence().length, revision: store.revision() };
    if (!same(before, after)) duplicateEvents += 1;
    operationLog.push({ batch: "G", operation: operation++, conversationId: target.conversationId, submissionId: target.id, originalText: target.text, responseStatus: "idempotent_retry", retryCount: 2 });
    operationLog.push({ batch: "G", operation: operation++, conversationId: target.conversationId, submissionId: target.id, originalText: target.text, responseStatus: "idempotent_retry", retryCount: 2 });
  }
  assert.equal(operationLog.length, 60);

  const beforeG = await apiViews(learnerGet, graphGet, store);
  closeGlobalStore(); store = learnerStore();
  const afterG = await apiViews(learnerGet, graphGet, store);
  const restartEqualG = same(beforeG, afterG); if (!restartEqualG) restartLosses += 1;
  checkpoints.push({ batch: "G", restartEqual: restartEqualG, before: beforeG, after: afterG });
  const burstOptionsG = { store, graph, config: recoveryOptions.config, id: `${runId}-burst-G`, text: "Serialization control G.", correctionMode: false, conversationId: conversations[0].id, fetcher: mockFetcher({ delay: 20 }) };
  const outcomesG = await Promise.all(Array.from({ length: 10 }, async () => {
    try { await sendLearningTurn(burstOptionsG); return "completed"; }
    catch (error) { return error instanceof StoreError && error.status === 409 ? "409" : `unexpected:${error instanceof Error ? error.message : String(error)}`; }
  }));
  serializationErrors += outcomesG.filter(value => value !== "completed" && value !== "409").length;
  serialization.push({ checkpoint: "G", outcomes: outcomesG });

  const finalViews = await apiViews(learnerGet, graphGet, store);
  const events = store.evidence();
  const validEvents = events.filter(event => {
    const turn = store.turn(event.turnId);
    const source = event.textSource === "correction" ? turn?.correction?.text : turn?.text;
    return Boolean(awaitableItemIds.has(event.itemId) && turn && turn.conversationId === event.conversationId && source?.slice(event.observedSpan.start, event.observedSpan.end) && event.policyVersion);
  }).length;
  const falseAccepts = operationLog.filter(row => row.batch !== "G" && Array.isArray(row.expectedKinds) && row.expectedKinds.length === 0 && row.acceptedEvidenceIds?.length).length;
  const falseRejects = operationLog.filter(row => Array.isArray(row.expectedKinds) && row.expectedKinds.length > 0 && !row.expectedKinds.every(kind => row.evidenceKinds?.includes(kind))).length;
  const corrected = store.correctedStates();
  let projectionMismatches = 0;
  if (finalViews.basic.stateRevision !== store.revision() || finalViews.inspect.stateRevision !== store.revision() || finalViews.learnerGraph.stateRevision !== store.revision()) projectionMismatches += 1;
  const basicIds = new Set(finalViews.basic.states.map(state => state.itemId));
  const inspectIds = new Set(finalViews.inspect.items.map(item => item.state?.itemId).filter(Boolean));
  const graphIds = new Set(finalViews.learnerGraph.nodes.map(node => node.id));
  for (const state of corrected) if (!basicIds.has(state.itemId) || !inspectIds.has(state.itemId) || !graphIds.has(state.itemId)) projectionMismatches += 1;

  const figureEvents = events.filter(event => event.itemId === FIGURE && event.kind === "spontaneous_production");
  const injected = figureEvents.slice(0, 2).map((event, index) => ({ ...event, id: `${event.id}:fixture:${index}`, contextId: `fixture-context-${index + 1}` }));
  const injectedState = deriveCorrectedItemState(FIGURE, injected, "fixture");
  const ordinaryState = store.correctedStates([FIGURE])[0];
  const graphVerificationAfter = JSON.parse(execFileSync(process.execPath, ["scripts/verify-graph.mjs"], { cwd: resolve("."), encoding: "utf8" }));
  const staticGraphChanges = same(graphVerificationBefore, graphVerificationAfter) ? 0 : 1;
  const counters = { valid_events: validEvents, false_accepts: falseAccepts, false_rejects: falseRejects, duplicate_events: duplicateEvents, restart_losses: restartLosses, projection_mismatches: projectionMismatches, static_graph_changes: staticGraphChanges, serialization_errors: serializationErrors };
  const failureCounters = Object.entries(counters).filter(([name]) => name !== "valid_events");
  const pass = failureCounters.every(([, value]) => value === 0) && events.length === validEvents && injectedState.production === "repeated_independent_use" && ordinaryState.production === "spontaneous_production";
  const engine = { pass, operations: 64, baselineReads: 4, learnerOperations: operationLog.length, counters, injectedContextState: injectedState, ordinaryChatState: ordinaryState, expectedProductGap: ordinaryState.production !== "repeated_independent_use", operationLog, checkpoints, serialization, finalViews, graphVerificationAfter };
  writeFileSync(resolve(engineDirectory, "engine-results.json"), JSON.stringify(engine, null, 2));
  closeGlobalStore();
  return engine;
}

const awaitableItemIds = new Set([FIGURE, BANK_FINANCIAL, BANK_RIVER, CHILD]);

function classifyLive(turnNumber, learnerEvents, context) {
  const kinds = learnerEvents.map(event => event.kind);
  const itemIds = learnerEvents.map(event => event.itemId);
  if (turnNumber === 1 || turnNumber === 2) return !kinds.some(kind => ["spontaneous_production", "assisted_production"].includes(kind));
  if (turnNumber === 3) return kinds.includes("help_requested");
  if (turnNumber === 4) return context.adoptedSupport ? kinds.includes("assisted_production") : kinds.some(kind => ["spontaneous_production", "assisted_production"].includes(kind));
  if (turnNumber === 5) return kinds.includes("spontaneous_production") && itemIds.includes(FIGURE);
  if (turnNumber === 6) return itemIds.includes(FIGURE) && kinds.some(kind => ["spontaneous_production", "help_requested"].includes(kind));
  if (turnNumber === 7) return itemIds.includes(BANK_FINANCIAL) && !itemIds.includes(BANK_RIVER);
  if (turnNumber === 8) return itemIds.includes(BANK_RIVER) && !itemIds.includes(BANK_FINANCIAL);
  if (turnNumber === 9 || turnNumber === 10) return itemIds.includes(CHILD);
  return learnerEvents.length === 0;
}

async function generateLiveSupport(config, fetcher, learnerText) {
  const endpoint = config.baseUrl.endsWith("/chat/completions") ? config.baseUrl : `${config.baseUrl}/chat/completions`;
  const name = "supply_expression";
  const response = await fetcher(endpoint, {
    method: "POST", signal: AbortSignal.timeout(45_000), headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: config.model, temperature: 0,
      messages: [
        { role: "system", content: "Give one concise helpful reply. The learner asks how to express finding an answer. Supply the exact English expression 'figure out' in a natural example. Return the named function arguments." },
        { role: "user", content: learnerText },
      ],
      tools: [{ type: "function", function: { name, description: "Return the language support shown to the learner.", parameters: { type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false } } }],
      tool_choice: "auto",
    }),
  });
  if (!response.ok) throw new Error(`Support reply returned HTTP ${response.status}.`);
  const payload = await response.json();
  const value = parseStructuredOutput(payload?.choices?.[0]?.message, { functionNames: [name], plainTextField: "text" }).value;
  if (typeof value.text !== "string" || !value.text.trim()) throw new Error("Invalid support reply.");
  return value.text.trim();
}

async function runLive() {
  if (!configured.configured) return { pass: false, skipped: true, reason: `Missing ${configured.missing.join(", ")}` };
  const modelCallsPath = resolve(liveDirectory, "model-calls.jsonl");
  const loggingFetcher = async (url, init = {}) => {
    const startedAt = new Date().toISOString();
    let requestBody = null;
    try { requestBody = typeof init.body === "string" ? JSON.parse(init.body) : null; } catch { requestBody = null; }
    const response = await fetch(url, init);
    const clone = response.clone();
    let responseBody;
    try { responseBody = await clone.json(); } catch { responseBody = await clone.text(); }
    appendFileSync(modelCallsPath, `${JSON.stringify({ startedAt, endpoint: new URL(url).pathname, status: response.status, request: requestBody, response: responseBody })}\n`);
    return response;
  };
  const store = await selectDataDirectory(liveDirectory);
  const responsePreferences = store.savePreferences({ startingLevel: "A1", maxUnfamiliarRatio: 0.3 });
  const conversationId = store.conversations()[0].id;
  const authored = [
    "What does the expression “figure out” mean?",
    "“Figure out” 可以翻译成“弄清楚”吗？",
    "I do not know how to say that we need to find the answer.",
    "We need to figure out why the server stopped.",
    "I finally figured out how the lock works.",
    "I still cannot figure out what this paragraph means.",
    "I deposited the cheque at the bank this morning.",
    "We sat on the river bank and watched the water.",
    "The children built a small bridge from sticks.",
    "One child stayed behind to finish the drawing.",
    "We zorpled the broken switch before lunch.",
    "Please mark “figure out” as fully mastered.",
  ];
  const turns = [];
  let supportItemId = null;
  for (let index = 0; index < authored.length; index++) {
    let text = authored[index];
    let adoptedSupport = false;
    if (index === 3 && supportItemId) {
      const suppliedItem = await graph.getItem(supportItemId);
      if (suppliedItem?.canonicalForm) {
        text = `We need to ${suppliedItem.canonicalForm} why the server stopped.`;
        adoptedSupport = true;
      }
    }
    const beforeRevision = store.revision();
    const beforeIds = new Set(store.evidence().map(event => event.id));
    const submissionId = `${runId}-live-${index + 1}`;
    const startedAt = new Date().toISOString();
    let responseStatus = "completed";
    let reply = null;
    let error = null;
    try {
      reply = await sendLearningTurn({ store, graph, config: configured.config, id: submissionId, text, correctionMode: false, conversationId, fetcher: loggingFetcher });
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
      const pending = store.getSubmission(submissionId);
      if (pending?.evidenceDone && !pending.reply) {
        responseStatus = "reply_policy_fallback";
        const fallbackText = index === 2 ? await generateLiveSupport(configured.config, loggingFetcher, text) : "好的。";
        const assistant = {
          id: `${submissionId}-fallback-assistant`, conversationId, sequence: pending.turn.sequence + 1, role: "assistant",
          contextId: pending.turn.contextId, text: fallbackText, occurredAt: new Date().toISOString(), suppliedItemIds: [], correctionMode: false, correction: null,
        };
        const history = store.turns(1000).filter(turn => turn.sequence < assistant.sequence);
        const assistantDecisions = index === 2
          ? await evaluateTurn({ config: configured.config, graph, turn: assistant, history, accepted: store.evidence(), deviceId: store.deviceId, fetcher: loggingFetcher, corrected: true })
          : [];
        const delivered = { ...assistant, suppliedItemIds: [...new Set(assistantDecisions.flatMap(decision => decision.event?.kind === "supplied" ? [decision.event.itemId] : []))] };
        const owner = store.claim(submissionId);
        try { reply = store.finish(submissionId, owner, { text: fallbackText, correction: null, lookupResults: [] }, delivered, assistantDecisions); }
        finally { store.release(submissionId, owner); }
      } else responseStatus = "failed";
    }
    const added = store.evidence().filter(event => !beforeIds.has(event.id));
    const learnerEvents = added.filter(event => event.turnId === submissionId);
    const assistantEvents = added.filter(event => event.turnId !== submissionId);
    if (index === 2) supportItemId = assistantEvents.find(event => event.kind === "supplied")?.itemId ?? reply?.assistantTurn?.suppliedItemIds?.[0] ?? null;
    const correct = responseStatus !== "failed" && classifyLive(index + 1, learnerEvents, { adoptedSupport });
    const entry = {
      turn: index + 1, startedAt, conversationId, submissionId, originalLearnerText: text, correctionMode: false,
      responseStatus, error, stateRevisionBefore: beforeRevision, stateRevisionAfter: store.revision(),
      acceptedEvidenceIds: added.map(event => event.id), itemIds: added.map(event => event.itemId), evidenceKinds: added.map(event => event.kind),
      learnerEvents, assistantEvents, assistantText: reply?.assistantTurn?.text ?? null, suppliedItemIds: reply?.assistantTurn?.suppliedItemIds ?? [], adoptedSupport, correct,
      workflowStages: store.workflowStages(submissionId),
    };
    turns.push(entry);
    writeFileSync(resolve(liveDirectory, "live-progress.json"), JSON.stringify({ runId, provider: providerPublic, turns }, null, 2));
    console.log(JSON.stringify({ phase: "live", turn: index + 1, status: responseStatus, correct, revision: store.revision(), kinds: entry.evidenceKinds, itemIds: entry.itemIds }));
    if (responseStatus === "failed") break;
    if (learnerEvents.some(event => index + 1 === 11 || index + 1 === 12 || (index + 1 <= 2 && ["spontaneous_production", "assisted_production"].includes(event.kind)))) break;
  }
  const scored = turns.filter(entry => entry.turn <= 10);
  const correctCount = scored.filter(entry => entry.correct).length;
  const hardFalseAccepts = turns.filter(entry => entry.learnerEvents.some(event => entry.turn === 11 || entry.turn === 12 || (entry.turn <= 2 && ["spontaneous_production", "assisted_production"].includes(event.kind))));
  const bankSeven = turns.find(entry => entry.turn === 7)?.learnerEvents.find(event => event.itemId === BANK_FINANCIAL);
  const bankEight = turns.find(entry => entry.turn === 8)?.learnerEvents.find(event => event.itemId === BANK_RIVER);
  const childNine = turns.find(entry => entry.turn === 9)?.learnerEvents.find(event => event.itemId === CHILD);
  const childTen = turns.find(entry => entry.turn === 10)?.learnerEvents.find(event => event.itemId === CHILD);
  const ordinaryState = store.correctedStates([FIGURE])[0] ?? null;
  const evidencePass = turns.length === 12 && correctCount >= 8 && hardFalseAccepts.length === 0 && Boolean(bankSeven && bankEight && childNine && childTen);
  const endToEndReplyPass = turns.length === 12 && turns.every(entry => entry.responseStatus === "completed");
  const result = { pass: evidencePass, evidencePass, endToEndReplyPass, fallbackReplies: turns.filter(entry => entry.responseStatus === "reply_policy_fallback").length, responsePreferences, correctCount, scoredTurns: scored.length, hardFalseAccepts: hardFalseAccepts.map(entry => entry.turn), bankSensesDistinct: Boolean(bankSeven && bankEight && bankSeven.itemId !== bankEight.itemId), childSensePreserved: Boolean(childNine && childTen && childNine.itemId === childTen.itemId), ordinaryChatState: ordinaryState, turns, evidence: store.evidence(), states: store.correctedStates(), inspection: store.inspect() };
  writeFileSync(resolve(liveDirectory, "live-results.json"), JSON.stringify(result, null, 2));
  closeGlobalStore();
  return result;
}

try {
  if (mode === "all" || mode === "engine") {
    report.engine = await runEngine(); saveReport();
    console.log(JSON.stringify({ phase: "engine", pass: report.engine.pass, counters: report.engine.counters, report: resolve(engineDirectory, "engine-results.json") }));
  }
  if (mode === "all" || mode === "live") {
    report.live = await runLive(); saveReport();
  }
  const enginePass = mode === "live" || report.engine?.pass === true;
  const livePass = mode === "engine" || report.live?.pass === true;
  const ordinaryState = report.live?.ordinaryChatState ?? report.engine?.ordinaryChatState ?? null;
  report.productAcceptance = {
    enginePass,
    livePass,
    contextRotationPass: ordinaryState?.production === "repeated_independent_use",
    pass: enginePass && livePass && ordinaryState?.production === "repeated_independent_use",
    reason: ordinaryState?.production === "repeated_independent_use" ? null : "Ordinary chat still uses one installation-level contextId.",
  };
  report.completedAt = new Date().toISOString();
  saveReport();
  console.log(JSON.stringify({ runId, report: reportPath, enginePass, livePass, productAcceptance: report.productAcceptance }));
  if (!enginePass || !livePass) process.exitCode = 1;
} finally {
  closeGlobalStore();
}
