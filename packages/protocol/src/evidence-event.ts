import type { LexicalItem } from "./lexical-item.ts";

export type EvidenceKind =
  | "encountered"
  | "recognized"
  | "help_requested"
  | "supplied"
  | "assisted_production"
  | "spontaneous_production"
  | "failed_opportunity"
  | "uncertain";

/** An immutable observation accepted by program policy, never a user/model state patch. */
export interface EvidenceEvent {
  readonly id: string;
  /** Local installation identity; does not require an account. */
  readonly deviceId: string;
  readonly itemId: LexicalItem["id"];
  readonly kind: EvidenceKind;
  readonly conversationId: string;
  readonly turnId: string;
  readonly contextId: string;
  readonly occurredAt: string;
  readonly source: "conversation";
  /** Which field contains the observation. Production requires original learner text. */
  readonly textSource: "text" | "correction";
  /** Half-open UTF-16 offsets into that field; identifies the actual observed expression. */
  readonly observedSpan: { readonly start: number; readonly end: number };
  /** Actual help adopted for assisted use, not simply the most recent mention. */
  readonly supportTurnId: string | null;
  readonly rationale: string;
  readonly policyVersion: "m0-v2";
}
