import {
  COMPREHENSION_POLICY_VERSION, COMPLEXITY_POLICY, DEFAULT_RESPONSE_PREFERENCES,
  RESPONSE_CONTRACT_VERSION, SEGMENTATION_POLICY_VERSION, STARTER_SET,
  type ComprehensionAssessment, type LearnerStateBatchResult, type ReplyAnalysis, type ResponsePlan,
} from "../../protocol/src/comprehension.ts";

// Synthetic examples only. M4 will implement personal reads and Evidence policy.
const base = { span: { start: 0, end: 4 }, modality: "reading", stateRevision: "fixture-1", policyVersion: COMPREHENSION_POLICY_VERSION } as const;
export const assessmentFixtures = {
  financialBank: { ...base, itemId: "sense:bank%1:14:00::", assessment: "supported", evidenceIds: ["fixture-recognized-bank"], reason: "Accepted recognition supports this financial meaning; no production claim." },
  riverBank: { ...base, itemId: "sense:bank%1:17:01::", assessment: "unobserved", evidenceIds: [], reason: "Evidence for the financial meaning does not support the river meaning." },
  missing: { ...base, itemId: null, assessment: "unresolved", unresolvedReason: "missing_coverage", evidenceIds: [], reason: "No graph candidate, not proof of learner difficulty." },
  ambiguous: { ...base, itemId: null, assessment: "unresolved", unresolvedReason: "ambiguous_meaning", evidenceIds: [], reason: "Multiple candidate meanings; none selected." },
  provisional: { ...base, span: { start: 0, end: 3 }, itemId: STARTER_SET.itemIds[1], assessment: "provisional", evidenceIds: [], baseline: { startingLevel: "A1", starterSetVersion: STARTER_SET.version, source: STARTER_SET.source }, reason: "Explicit starting estimate and exact editorial seed meaning; not accepted Evidence." },
  recentDifficulty: { ...base, itemId: "sense:bank%1:14:00::", assessment: "needs_support", evidenceIds: ["fixture-located-difficulty"], reason: "Recent validated difficulty takes precedence over older independent use." },
} as const satisfies Record<string, ComprehensionAssessment>;

export const absentPersonalState = {
  contractVersion: RESPONSE_CONTRACT_VERSION, stateRevision: "fixture-empty",
  items: [{ itemId: "sense:figure_out%2:31:00::", status: "unobserved", state: null, receptiveEvidenceIds: [], productionEvidenceIds: [] }],
} as const satisfies LearnerStateBatchResult;

export const responsePlanFixture = {
  contractVersion: RESPONSE_CONTRACT_VERSION, submissionId: "fixture-submission", contentToAnswer: "Explain the financial meaning of bank.",
  familiarCandidateIds: [], unfamiliarTargetIds: [], preferences: DEFAULT_RESPONSE_PREFERENCES,
  complexity: COMPLEXITY_POLICY, stateRevision: "fixture-empty", graphVersion: "oewn-2025", segmentationPolicyVersion: SEGMENTATION_POLICY_VERSION,
  orchestrationMode: "synthesis", strategyVersion: "m6-response-v1",
} as const satisfies ResponsePlan;
const chineseBudget = { englishOccurrences: 0, unfamiliarOccurrences: 0, unfamiliarRatio: 0, distinctUnfamiliarKeys: [], provisionalOccurrences: 0, ratioPassed: true, distinctPassed: true, complexityPassed: true, passed: true } as const;
export const replyAnalysisFixture = {
  contractVersion: RESPONSE_CONTRACT_VERSION, assistantTurnId: "fixture-assistant", submissionId: "fixture-submission", plan: responsePlanFixture,
  blocks: [{ id: "reply", kind: "reply", text: "这里指接受存款、发放贷款的金融机构。", units: [], assessments: [], budget: chineseBudget }],
  combinedBudget: chineseBudget, supportSpans: [], languageDecision: "chinese", generationAttempts: 1,
  orchestrationMode: "synthesis", strategyVersion: "m6-response-v1",
} as const satisfies ReplyAnalysis;
