import type { LexicalItem } from "./lexical-item.ts";
import type { ReplyAnalysis, ResponsePlan, SenseId } from "./comprehension.ts";

export const M7_WORKFLOW_VERSION = "m7-workflow-v1" as const;
export type WorkflowLanguage = "english" | "mixed" | "chinese";

export interface ExplainRequest {
  workflow: "explain";
  text: string;
  context: string;
  itemId: SenseId | null;
  allowChineseSupport?: boolean;
}

export interface ExplainResult {
  workflow: "explain";
  workflowVersion: typeof M7_WORKFLOW_VERSION;
  target: LexicalItem | null;
  targetCandidates: readonly SenseId[];
  context: string;
  explanation: string;
  alternatives: readonly string[];
  register: string;
  nuance: string;
  language: WorkflowLanguage;
  targetBudgetException: { itemIds: readonly SenseId[]; reason: "explicit_explain_target" };
  plan: ResponsePlan;
  analysis: ReplyAnalysis;
  practiceTarget: SenseId | null;
}

export interface ScenarioRequest {
  workflow: "scenario";
  description: string;
  learnerRole?: string;
  aiRole?: string;
  objective?: string;
  difficulty?: "accessible" | "stretch";
  targetItemIds?: readonly SenseId[];
}

export interface ScenarioResult {
  workflow: "scenario";
  workflowVersion: typeof M7_WORKFLOW_VERSION;
  situation: string;
  learnerRole: string;
  aiRole: string;
  objective: string;
  difficulty: "accessible" | "stretch";
  targetItemIds: readonly SenseId[];
  opening: string;
  language: WorkflowLanguage;
  targetBudgetException: { itemIds: readonly SenseId[]; reason: "explicit_scenario_target" };
  plan: ResponsePlan;
  analysis: ReplyAnalysis;
  contextId: string;
}
