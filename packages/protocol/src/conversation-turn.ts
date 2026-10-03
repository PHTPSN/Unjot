import type { LexicalItem } from "./lexical-item.ts";

/** One completed message. Streaming drafts are outside the M0 contract. */
export interface ConversationTurn {
  readonly id: string;
  readonly conversationId: string;
  /** One-based ordering only. Never a delay, eligibility gate, or chat schedule. */
  readonly sequence: number;
  readonly role: "learner" | "assistant";
  /** Identifies the actual situation, not a new ID for every message. */
  readonly contextId: string;
  /** Original learner input, or the assistant's conversational reply. Never overwrite input. */
  readonly text: string;
  /** ISO 8601 UTC, captured when the message is completed. */
  readonly occurredAt: string;
  /** Target forms deliberately supplied by this assistant turn; empty for learners. */
  readonly suppliedItemIds: readonly LexicalItem["id"][];
  /** Effective user preference for this exchange; false by default. */
  readonly correctionMode: boolean;
  /** Assistant-authored reformulation, rendered before text; always null for learners. */
  readonly correction: {
    readonly sourceTurnId: string;
    readonly text: string;
  } | null;
}
