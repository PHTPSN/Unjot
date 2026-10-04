import type { LexicalItem } from "../packages/protocol/src/lexical-item.ts";
import type { GraphNode } from "../packages/lexical-core/src/graph.ts";
import type { ReplyAnalysis } from "../packages/protocol/src/comprehension.ts";

export type LexicalToolResult =
  | { readonly tool: "find_by_form"; readonly form: string; readonly result: readonly LexicalItem[] }
  | { readonly tool: "get_item"; readonly id: string; readonly result: LexicalItem | null }
  | { readonly tool: "get_neighbors"; readonly id: string; readonly result: readonly GraphNode[] };

export type AssistantReply = {
  readonly text: string;
  readonly correction: string | null;
  readonly lookupResults: readonly LexicalToolResult[];
  readonly assistantTurn?: import("../packages/protocol/src/conversation-turn.ts").ConversationTurn;
  readonly analysis?: ReplyAnalysis;
};

export type PublicModelStatus = {
  readonly configured: boolean;
  readonly provider: string | null;
  readonly model: string | null;
};
