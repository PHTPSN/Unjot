import { randomUUID } from "node:crypto";
import type { LexicalGraph } from "../packages/lexical-core/src/graph.ts";
import { COMPLEXITY_POLICY, RESPONSE_CONTRACT_VERSION, SEGMENTATION_POLICY_VERSION, type ReplyAnalysis, type ResponsePlan, type ResponsePreferences, type SenseId } from "../packages/protocol/src/comprehension.ts";
import type { ExplainRequest, ExplainResult, ScenarioRequest, ScenarioResult } from "../packages/protocol/src/m7-workflows.ts";
import { M7_WORKFLOW_VERSION } from "../packages/protocol/src/m7-workflows.ts";
import type { LearnerStore } from "./learner-store.ts";
import { PersonalReads } from "./personal-reads.ts";
import type { LlmConfig } from "./llm-config.ts";
import { analyzeBlock, combinedBudget, languageDecision } from "./response-policy.ts";

const MAX_OUTPUT_CHARS = 4000;
type ModelCall = { config: LlmConfig; system: string; user: string; name: string; properties: Record<string, unknown>; required: readonly string[]; fetcher?: typeof fetch };

export type M7WorkflowOptions = { config: LlmConfig; graph: LexicalGraph; store: LearnerStore; fetcher?: typeof fetch };

export async function runExplain(input: ExplainRequest, options: M7WorkflowOptions): Promise<ExplainResult> {
  validateExplainRequest(input);
  const stateRevision = options.store.revision();
  const personal = new PersonalReads(options.store, options.graph);
  const candidates = input.itemId ? [input.itemId] : await options.graph.findSenseIds(input.text.trim());
  const target = input.itemId ? await options.graph.getItem(input.itemId) : candidates.length === 1 ? await options.graph.getItem(candidates[0]) : null;
  const targetCandidates = [...new Set(candidates)].slice(0, 100) as SenseId[];
  const plan = await makePlan({ submissionId: `explain:${randomUUID()}`, content: input.text, targetIds: target ? [target.id] : [], preferences: personal.preferences, stateRevision, graph: options.graph, store: options.store });
  const neighborhood = target ? await options.graph.getNeighbors(target.id) : [];
  const draft = await generateExplain({ input, target, targetCandidates, neighborhood, plan, options });
  let checked = await checkWorkflowText({ text: `${draft.explanation}${draft.alternatives.join(" ")}${draft.nuance}`, context: input.context, plan, personal, graph: options.graph, targetIds: target ? [target.id] : [] });
  if (!checked.analysis.combinedBudget.passed && (input.allowChineseSupport ?? personal.preferences.allowChineseSupport)) {
    const supported = await generateExplain({ input, target, targetCandidates, neighborhood, plan, options, instruction: "Use Chinese support where necessary, while preserving the exact explanation and useful English examples." });
    checked = await checkWorkflowText({ text: `${supported.explanation}${supported.alternatives.join(" ")}${supported.nuance}`, context: input.context, plan, personal, graph: options.graph, targetIds: target ? [target.id] : [] });
    if (checked.analysis.combinedBudget.passed) return buildExplainResult(input, target, targetCandidates, plan, supported, checked.analysis);
  }
  if (!checked.analysis.combinedBudget.passed) throw new Error("The explanation could not pass the learner's language budget.");
  return buildExplainResult(input, target, targetCandidates, plan, draft, checked.analysis);
}

export async function runScenario(input: ScenarioRequest, options: M7WorkflowOptions): Promise<ScenarioResult> {
  validateScenarioRequest(input);
  const targetIds = [...new Set(input.targetItemIds ?? [])].slice(0, 2) as SenseId[];
  const targetItems = await Promise.all(targetIds.map(id => options.graph.getItem(id)));
  if (targetItems.some(item => item === null)) throw new Error("Scenario target is not a verified lexical sense.");
  const stateRevision = options.store.revision();
  const personal = new PersonalReads(options.store, options.graph);
  const plan = await makePlan({ submissionId: `scenario:${randomUUID()}`, content: input.description, targetIds, preferences: personal.preferences, stateRevision, graph: options.graph, store: options.store });
  const draft = await generateScenario({ input, targetItems: targetItems.filter(Boolean), plan, options });
  let checked = await checkWorkflowText({ text: `${draft.situation} ${draft.opening}`, context: input.description, plan, personal, graph: options.graph, targetIds });
  let finalDraft = draft;
  if (!checked.analysis.combinedBudget.passed && personal.preferences.allowChineseSupport) {
    finalDraft = await generateScenario({ input, targetItems: targetItems.filter(Boolean), plan, options, instruction: "Use Chinese support where accessible English cannot convey the scenario, while preserving the practical objective." });
    checked = await checkWorkflowText({ text: `${finalDraft.situation} ${finalDraft.opening}`, context: input.description, plan, personal, graph: options.graph, targetIds });
  }
  if (!checked.analysis.combinedBudget.passed) throw new Error("The scenario could not pass the learner's language budget.");
  const result: ScenarioResult = {
    workflow: "scenario", workflowVersion: M7_WORKFLOW_VERSION, situation: finalDraft.situation, learnerRole: finalDraft.learnerRole,
    aiRole: finalDraft.aiRole, objective: finalDraft.objective, difficulty: finalDraft.difficulty, targetItemIds: targetIds,
    opening: finalDraft.opening, language: languageDecision(`${finalDraft.situation} ${finalDraft.opening}`),
    targetBudgetException: { itemIds: targetIds, reason: "explicit_scenario_target" }, plan, analysis: checked.analysis,
    contextId: options.store.createWorkflowContext("scenario"),
  };
  options.store.saveWorkflowRun({ id: result.plan.submissionId, kind: "scenario", contextId: result.contextId, body: result });
  return result;
}

async function makePlan(input: { submissionId: string; content: string; targetIds: readonly SenseId[]; preferences: ResponsePreferences; stateRevision: string; graph: LexicalGraph; store: LearnerStore }): Promise<ResponsePlan> {
  const reads = new PersonalReads(input.store, input.graph, input.preferences);
  const states = input.targetIds.length ? await reads.get_corrected_learner_states({ itemIds: input.targetIds, stateRevision: input.stateRevision }) : { items: [] };
  const familiarCandidateIds = states.items.filter(item => item.receptive === "understood").map(item => item.itemId);
  return {
    contractVersion: RESPONSE_CONTRACT_VERSION, submissionId: input.submissionId, contentToAnswer: input.content,
    familiarCandidateIds, unfamiliarTargetIds: input.targetIds.filter(id => !familiarCandidateIds.includes(id)).slice(0, 2),
    preferences: input.preferences, complexity: COMPLEXITY_POLICY, stateRevision: input.stateRevision, graphVersion: "oewn-2025",
    segmentationPolicyVersion: SEGMENTATION_POLICY_VERSION, orchestrationMode: input.preferences.orchestrationMode, strategyVersion: "m6-response-v1",
  };
}

async function generateExplain(args: { input: ExplainRequest; target: Awaited<ReturnType<LexicalGraph["getItem"]>>; targetCandidates: readonly SenseId[]; neighborhood: readonly unknown[]; plan: ResponsePlan; options: M7WorkflowOptions; instruction?: string }) {
  const value = await callModel({
    config: args.options.config, fetcher: args.options.fetcher, name: "explain_response",
    system: `Explain the selected language in context. Use lexical facts only from the supplied graph item and relations. Do not claim learner mastery or write Evidence. ${args.instruction ?? "Use accessible English, with concise examples."}`,
    user: JSON.stringify({ request: args.input, target: args.target, targetCandidates: args.targetCandidates, neighborhood: args.neighborhood.slice(0, 20), plan: args.plan }),
    properties: { explanation: { type: "string", maxLength: MAX_OUTPUT_CHARS }, alternatives: { type: "array", maxItems: 4, items: { type: "string", maxLength: 300 } }, register: { type: "string", maxLength: 120 }, nuance: { type: "string", maxLength: 1000 }, language: { type: "string", enum: ["english", "mixed", "chinese"] }, confidence: { type: "boolean" } },
    required: ["explanation", "alternatives", "register", "nuance", "language"],
  });
  if (typeof value.explanation !== "string" || !value.explanation.trim()) throw new Error("Invalid explanation output.");
  return { explanation: value.explanation.trim(), alternatives: Array.isArray(value.alternatives) ? value.alternatives.filter((item): item is string => typeof item === "string").slice(0, 4) : [], register: typeof value.register === "string" ? value.register : "", nuance: typeof value.nuance === "string" ? value.nuance : "", language: value.language === "chinese" || value.language === "mixed" ? value.language : "english" as const };
}

async function generateScenario(args: { input: ScenarioRequest; targetItems: readonly unknown[]; plan: ResponsePlan; options: M7WorkflowOptions; instruction?: string }) {
  const value = await callModel({
    config: args.options.config, fetcher: args.options.fetcher, name: "scenario_response",
    system: `Create a structured language-learning scenario. It must create an opportunity for the learner to produce language; never claim that the learner succeeded and never write Evidence. ${args.instruction ?? "Use accessible language."}`,
    user: JSON.stringify({ request: args.input, targetItems: args.targetItems, plan: args.plan }),
    properties: { situation: { type: "string", maxLength: 1200 }, learnerRole: { type: "string", maxLength: 300 }, aiRole: { type: "string", maxLength: 300 }, objective: { type: "string", maxLength: 500 }, difficulty: { type: "string", enum: ["accessible", "stretch"] }, opening: { type: "string", maxLength: MAX_OUTPUT_CHARS }, language: { type: "string", enum: ["english", "mixed", "chinese"] } },
    required: ["situation", "learnerRole", "aiRole", "objective", "difficulty", "opening", "language"],
  });
  const required = ["situation", "learnerRole", "aiRole", "objective", "opening"];
  if (required.some(key => typeof value[key] !== "string" || !(value[key] as string).trim())) throw new Error("Invalid scenario output.");
  return { situation: String(value.situation).trim(), learnerRole: String(value.learnerRole).trim(), aiRole: String(value.aiRole).trim(), objective: String(value.objective).trim(), opening: String(value.opening).trim(), difficulty: value.difficulty === "stretch" ? "stretch" as const : "accessible" as const };
}

async function checkWorkflowText(input: { text: string; context: string; plan: ResponsePlan; personal: PersonalReads; graph: LexicalGraph; targetIds: readonly SenseId[] }) {
  const block = await analyzeBlock({ id: input.plan.submissionId, kind: "example", text: input.text, context: input.context, graph: input.graph, personal: input.personal, stateRevision: input.plan.stateRevision, unfamiliarTargetIds: input.plan.unfamiliarTargetIds, ratioCap: input.plan.preferences.maxUnfamiliarRatio });
  let budget = combinedBudget([block], input.plan.preferences.maxUnfamiliarRatio, input.plan.unfamiliarTargetIds);
  // A selected target is an explicit M7 exception, recorded in the result rather than hidden in ordinary preferences.
  if (!budget.passed && input.targetIds.length > 0) {
    const targetKeys = new Set(input.targetIds);
    const remaining = block.units.map((unit, index) => ({ unit, assessment: block.assessments[index] })).filter(item => !targetKeys.has(item.unit.itemId as SenseId));
    const remainingUnknown = remaining.filter(item => item.assessment?.assessment !== "supported" && item.assessment?.assessment !== "provisional").length;
    const ratio = remaining.length ? remainingUnknown / remaining.length : 0;
    if (ratio <= input.plan.preferences.maxUnfamiliarRatio && block.budget.complexityPassed) budget = { ...budget, ratioPassed: true, passed: true };
  }
  const analysis: ReplyAnalysis = { contractVersion: RESPONSE_CONTRACT_VERSION, assistantTurnId: "pending-workflow", submissionId: input.plan.submissionId, plan: input.plan, blocks: [block], combinedBudget: budget, supportSpans: [], languageDecision: languageDecision(input.text), generationAttempts: 1, orchestrationMode: input.plan.orchestrationMode, strategyVersion: "m6-response-v1" };
  return { analysis };
}

function buildExplainResult(input: ExplainRequest, target: Awaited<ReturnType<LexicalGraph["getItem"]>>, candidates: readonly SenseId[], plan: ResponsePlan, draft: Awaited<ReturnType<typeof generateExplain>>, analysis: ReplyAnalysis): ExplainResult {
  return { workflow: "explain", workflowVersion: M7_WORKFLOW_VERSION, target, targetCandidates: candidates, context: input.context, explanation: draft.explanation, alternatives: draft.alternatives, register: draft.register, nuance: draft.nuance, language: languageDecision(draft.explanation), targetBudgetException: { itemIds: target ? [target.id] : [], reason: "explicit_explain_target" }, plan, analysis, practiceTarget: target?.id ?? null };
}

async function callModel(input: ModelCall): Promise<Record<string, unknown>> {
  const endpoint = input.config.baseUrl.endsWith("/chat/completions") ? input.config.baseUrl : `${input.config.baseUrl}/chat/completions`;
  const response = await (input.fetcher ?? fetch)(endpoint, { method: "POST", signal: AbortSignal.timeout(45_000), headers: { authorization: `Bearer ${input.config.apiKey}`, "content-type": "application/json" }, body: JSON.stringify({ model: input.config.model, temperature: 0.2, messages: [{ role: "system", content: input.system }, { role: "user", content: input.user }], tools: [{ type: "function", function: { name: input.name, description: "Return only the bounded workflow object. Never return state patches.", parameters: { type: "object", properties: input.properties, required: input.required, additionalProperties: false } } }], tool_choice: { type: "function", function: { name: input.name } } }) });
  if (!response.ok) throw new Error(`Model provider returned HTTP ${response.status}.`);
  const payload = await response.json() as { choices?: Array<{ message?: { tool_calls?: Array<{ function?: { arguments?: unknown } }> } }> };
  const raw = payload.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (typeof raw !== "string" || raw.length > 60000) throw new Error("Invalid M7 workflow output.");
  try { const parsed: unknown = JSON.parse(raw); if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(); return parsed as Record<string, unknown>; } catch { throw new Error("Invalid M7 workflow output."); }
}

function validateExplainRequest(input: ExplainRequest) {
  if (!input || input.workflow !== "explain" || typeof input.text !== "string" || !input.text.trim() || input.text.length > 4000 || typeof input.context !== "string" || input.context.length > 2000 || (input.itemId !== null && (typeof input.itemId !== "string" || input.itemId.length > 300))) throw new Error("Invalid explain request.");
}
function validateScenarioRequest(input: ScenarioRequest) {
  if (!input || input.workflow !== "scenario" || typeof input.description !== "string" || !input.description.trim() || input.description.length > 2000 || (input.learnerRole !== undefined && input.learnerRole.length > 300) || (input.aiRole !== undefined && input.aiRole.length > 300) || (input.objective !== undefined && input.objective.length > 500) || (input.targetItemIds !== undefined && (!Array.isArray(input.targetItemIds) || input.targetItemIds.length > 2))) throw new Error("Invalid scenario request.");
}
