/** M6 implements response stages; M5R implements the Evidence lane and durable contracts. */
export const WORKFLOW_VERSION = "m5r-workflow-v1" as const;
export const WORKFLOW_DEPENDENCIES = {
  captured: [], snapshot_pinned: ["captured"],
  observations_proposed: ["snapshot_pinned"], observations_validated: ["observations_proposed"],
  evidence_committed: ["observations_validated"],
  reply_planned: ["snapshot_pinned"], reply_generated: ["reply_planned"],
  reply_checked: ["reply_generated"], support_validated: ["reply_checked"],
  published: ["support_validated"], completed: ["published", "evidence_committed"],
} as const;
export type WorkflowStage = keyof typeof WORKFLOW_DEPENDENCIES;
export type WorkflowStageStatus = "accepted" | "rejected" | "uncertain" | "retryable_error";
export interface WorkflowStageRecord {
  version: typeof WORKFLOW_VERSION;
  submissionId: string;
  stage: WorkflowStage;
  attempt: number;
  status: WorkflowStageStatus;
  reasonCode: "validated" | "empty" | "rejected_observations" | "uncertain_observations" | "model_unavailable" | "invalid_model_output" | "graph_unavailable";
  policyVersion: string;
  inputRefs: readonly string[];
  outputRefs: readonly string[];
  body: unknown;
  updatedAt: string;
}
export interface StageCheckpoint {
  run<T>(stage: "observations_proposed" | "observations_validated", task: () => Promise<T>): Promise<T>;
}
