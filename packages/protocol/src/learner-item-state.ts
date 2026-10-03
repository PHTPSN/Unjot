import type { EvidenceKind } from "./evidence-event.ts";
import type { LexicalItem } from "./lexical-item.ts";

export type LearnerStage =
  | "encountered"
  | "understood"
  | "assisted_production"
  | "spontaneous_production"
  | "repeated_independent_use";

/** A projection of accepted Evidence, never an independently edited mastery score. */
export interface LearnerItemState {
  readonly itemId: LexicalItem["id"];
  readonly stage: LearnerStage;
  /** Unique IDs in conversation sequence order; each event contributes once. */
  readonly evidenceIds: readonly string[];
  readonly counts: Readonly<Record<EvidenceKind, number>>;
  /** Distinct contexts with spontaneous production, in first-observed order. */
  readonly independentContextIds: readonly string[];
  readonly lastEvidenceAt: string;
  readonly lastSpontaneousAt: string | null;
  readonly policyVersion: "m0-v2" | "m4-evidence-v1";
}
