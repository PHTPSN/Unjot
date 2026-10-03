import type { EvidenceEvent } from "./evidence-event.ts";
import type { LearnerItemState } from "./learner-item-state.ts";
import type { LexicalItem } from "./lexical-item.ts";

export const RESPONSE_CONTRACT_VERSION = "m3-response-v1" as const;
export const COMPREHENSION_POLICY_VERSION = "reading-v1" as const;
export const SEGMENTATION_POLICY_VERSION = "english-units-v1" as const;
export const COMPLEXITY_POLICY = {
  version: "simple-reply-v1", maxWordsPerSentence: 20, maxClausesPerSentence: 2,
  maxSubordinateDepth: 1, maxNewMeaningsPerSentence: 1,
  separateBlockMinUnits: 5,
} as const;
export const PERSONAL_READ_LIMITS = { items: 100, evidence: 50, textCharacters: 8000, units: 1000, contextCharacters: 2000 } as const;
export type SenseId = LexicalItem["id"];
export type StartingLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
/** First-party conservative seed; not CEFR annotation supplied by OEWN. */
export const STARTER_SET = {
  version: "unjot-starter-v1", source: "Unjot editorial seed, 2026-10-03", graphVersion: "oewn-2025",
  minimumStartingLevel: "A1",
  itemIds: ["sense:cat%1:05:00::", "sense:dog%1:05:00::", "sense:water%1:13:00::"],
} as const;
export interface ResponsePreferences {
  contractVersion: typeof RESPONSE_CONTRACT_VERSION;
  profileVersion: string;
  maxUnfamiliarRatio: number;
  maxNewExpressions: number;
  supportLanguage: "zh";
  allowChineseSupport: boolean;
  startingLevel: StartingLevel | null;
  starterSetVersion: typeof STARTER_SET.version | null;
  complexityPolicyVersion: typeof COMPLEXITY_POLICY.version;
  comprehensionPolicyVersion: typeof COMPREHENSION_POLICY_VERSION;
}
export const DEFAULT_RESPONSE_PREFERENCES: Readonly<ResponsePreferences> = Object.freeze({
  contractVersion: RESPONSE_CONTRACT_VERSION, profileVersion: "default-v1",
  maxUnfamiliarRatio: 0.05, maxNewExpressions: 2, supportLanguage: "zh", allowChineseSupport: true,
  startingLevel: null, starterSetVersion: null,
  complexityPolicyVersion: COMPLEXITY_POLICY.version, comprehensionPolicyVersion: COMPREHENSION_POLICY_VERSION,
});
export const PREFERENCE_BOUNDS = { minRatio: 0, maxRatio: 1, minNewExpressions: 0, maxNewExpressions: 20 } as const;
export function validResponsePreferences(value: ResponsePreferences): boolean {
  return value.contractVersion === RESPONSE_CONTRACT_VERSION && typeof value.profileVersion === "string" && value.profileVersion.length > 0 &&
    Number.isFinite(value.maxUnfamiliarRatio) && value.maxUnfamiliarRatio >= 0 && value.maxUnfamiliarRatio <= 1 &&
    Number.isInteger(value.maxNewExpressions) && value.maxNewExpressions >= 0 && value.maxNewExpressions <= 20 &&
    value.supportLanguage === "zh" && typeof value.allowChineseSupport === "boolean" &&
    (value.startingLevel === null || ["A1", "A2", "B1", "B2", "C1", "C2"].includes(value.startingLevel)) &&
    (value.starterSetVersion === null || (value.starterSetVersion === STARTER_SET.version && value.startingLevel !== null)) &&
    value.complexityPolicyVersion === COMPLEXITY_POLICY.version && value.comprehensionPolicyVersion === COMPREHENSION_POLICY_VERSION;
}
/** Half-open UTF-16 offsets in the unchanged text of the referenced block. */
export interface TextSpan { start: number; end: number }
export type UnresolvedReason = "missing_coverage" | "ambiguous_meaning" | "unverified_meaning";
export interface EnglishUnit {
  span: TextSpan;
  text: string;
  candidateIds: readonly SenseId[];
  itemId: SenseId | null;
  unresolvedReason: UnresolvedReason | null;
}
interface AssessmentBase {
  span: TextSpan;
  modality: "reading";
  reason: string;
  stateRevision: string;
  policyVersion: typeof COMPREHENSION_POLICY_VERSION;
}
/** Discriminated variants prevent treating missing coverage as personal failure. */
export type ComprehensionAssessment = AssessmentBase & (
  | { assessment: "supported" | "needs_support"; itemId: SenseId; evidenceIds: readonly [string, ...string[]] }
  | { assessment: "unobserved"; itemId: SenseId; evidenceIds: readonly [] }
  | { assessment: "provisional"; itemId: SenseId; evidenceIds: readonly []; baseline: { startingLevel: StartingLevel; starterSetVersion: typeof STARTER_SET.version; source: typeof STARTER_SET.source } }
  | { assessment: "unresolved"; itemId: null; evidenceIds: readonly []; unresolvedReason: UnresolvedReason }
);
export interface LearnerStateBatchRequest { itemIds: readonly SenseId[]; stateRevision: string }
export type PersonalItemRead =
  | { itemId: SenseId; status: "unobserved"; state: null; receptiveEvidenceIds: readonly []; productionEvidenceIds: readonly [] }
  | { itemId: SenseId; status: "observed"; state: LearnerItemState; receptiveEvidenceIds: readonly string[]; productionEvidenceIds: readonly string[] };
export interface LearnerStateBatchResult { contractVersion: typeof RESPONSE_CONTRACT_VERSION; stateRevision: string; items: readonly PersonalItemRead[] }
export interface ItemEvidenceRequest { itemId: SenseId; stateRevision: string; limit?: number; cursor?: string }
export interface ItemEvidenceResult {
  itemId: SenseId; stateRevision: string; events: readonly EvidenceEvent[];
  supportReferences: readonly { eventId: string; turnId: string; span: TextSpan; textSource: "text" | "correction" }[];
  nextCursor: string | null;
}
export interface AssessComprehensionRequest {
  text: string; context: string; units: readonly EnglishUnit[]; modality: "reading";
  stateRevision: string; profileVersion: string; policyVersion: typeof COMPREHENSION_POLICY_VERSION;
}
export interface ResponsePlan {
  contractVersion: typeof RESPONSE_CONTRACT_VERSION;
  submissionId: string;
  contentToAnswer: string;
  familiarCandidateIds: readonly SenseId[];
  unfamiliarTargetIds: readonly SenseId[];
  preferences: Readonly<ResponsePreferences>;
  complexity: typeof COMPLEXITY_POLICY;
  stateRevision: string;
  graphVersion: "oewn-2025";
  segmentationPolicyVersion: typeof SEGMENTATION_POLICY_VERSION;
}
export interface BudgetResult {
  englishOccurrences: number; unfamiliarOccurrences: number; unfamiliarRatio: number;
  distinctUnfamiliarKeys: readonly string[]; provisionalOccurrences: number;
  ratioPassed: boolean; distinctPassed: boolean; complexityPassed: boolean; passed: boolean;
}
export interface BlockAnalysis {
  id: string; kind: "reply" | "correction" | "example"; text: string;
  units: readonly EnglishUnit[]; assessments: readonly ComprehensionAssessment[];
  budget: BudgetResult;
}
export interface ReplyAnalysis {
  contractVersion: typeof RESPONSE_CONTRACT_VERSION;
  assistantTurnId: string; submissionId: string;
  plan: ResponsePlan;
  blocks: readonly BlockAnalysis[];
  combinedBudget: BudgetResult;
  supportSpans: readonly { blockId: string; span: TextSpan; itemId: SenseId | null }[];
  languageDecision: "english" | "mixed" | "chinese";
  generationAttempts: 1 | 2 | 3;
}
