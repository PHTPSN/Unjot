import type { LexicalGraph, GraphNode } from "../packages/lexical-core/src/graph.ts";
import type { LexicalItem } from "../packages/protocol/src/lexical-item.ts";
import type { AssistantReply, LexicalToolResult } from "./chat-types.ts";
import type { LlmConfig } from "./llm-config.ts";

type ChatMessage = Record<string, unknown>;
type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
type CompletionMessage = { role?: string; content?: unknown; tool_calls?: unknown };

const MAX_TOOL_ROUNDS = 6;
const MAX_TOOL_CALLS = 8;
const MAX_OUTPUT_CHARS = 4000;

const tools = [
  {
    type: "function",
    function: {
      name: "find_by_form",
      description: "Look up an English expression in the local OEWN lexical index. Use this before explaining a lexical item.",
      parameters: {
        type: "object",
        properties: { form: { type: "string", description: "The exact English word or expression to look up." } },
        required: ["form"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_item",
      description: "Retrieve a lexical sense by its exact ID returned from find_by_form.",
      parameters: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_neighbors",
      description: "Retrieve immediate stored graph neighbors for a lexical sense ID.",
      parameters: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "finish_response",
      description: "Return the final conversational answer after any needed lexical lookup. Keep a correction separate from the reply; use null when no correction is needed or correction mode is off.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "The conversational reply." },
          correction: { type: ["string", "null"], description: "A natural English reformulation, only when requested and useful." },
        },
        required: ["text", "correction"],
        additionalProperties: false,
      },
    },
  },
];

export type ChatHistoryEntry = { readonly role: "learner" | "assistant"; readonly text: string; readonly correction?: string | null };

export async function createLookupReply(options: {
  config: LlmConfig;
  graph: LexicalGraph;
  text: string;
  correctionMode: boolean;
  history: readonly ChatHistoryEntry[];
  fetcher?: typeof fetch;
}): Promise<AssistantReply> {
  const fetcher = options.fetcher ?? fetch;
  const endpoint = options.config.baseUrl.endsWith("/chat/completions")
    ? options.config.baseUrl
    : `${options.config.baseUrl}/chat/completions`;
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: [
        "You are Unjot, a language-learning conversation partner.",
        "When the learner asks about an English word or expression, use find_by_form before explaining it. Base lexical facts only on tool results; do not invent definitions or relations.",
        "The local lexicon is the complete pinned OEWN 2025 core. It has limited coverage of grammar, collocations and emerging vocabulary. Say when no local match is found; multiple senses remain candidates, not a selected meaning.",
        "Never claim to change learner mastery or state. No state-writing tools exist.",
        `Correction mode is ${options.correctionMode ? "on" : "off"}. When it is on and correction is useful, return it separately through finish_response; never rewrite the learner's stored original.`,
        "Use finish_response for the final answer after tool results are available.",
      ].join(" "),
    },
    ...options.history.map(entry => ({
      role: entry.role === "learner" ? "user" : "assistant",
      content: entry.role === "assistant" && entry.correction
        ? `Natural version: ${entry.correction}\nReply: ${entry.text}`
        : entry.text,
    })),
    { role: "user", content: options.text },
  ];
  const lookupResults: LexicalToolResult[] = [];
  let toolCallCount = 0;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const response = await fetcher(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${options.config.apiKey}`,
        "content-type": "application/json",
      },
      signal: AbortSignal.timeout(45_000),
      body: JSON.stringify({
        model: options.config.model,
        messages,
        tools,
        tool_choice: "auto",
        temperature: 0.4,
      }),
    });
    if (!response.ok) throw new Error(`Model provider returned HTTP ${response.status}. Check the model, base URL, and API credentials.`);

    const payload = await response.json() as { choices?: Array<{ message?: CompletionMessage }> };
    const message = payload.choices?.[0]?.message;
    if (!message || message.role !== "assistant") throw new Error("Model provider returned an invalid chat completion.");
    const calls = parseToolCalls(message.tool_calls);
    if (calls.length === 0) {
      if (typeof message.content === "string" && message.content.trim()) {
        return { text: message.content.slice(0, MAX_OUTPUT_CHARS), correction: null, lookupResults };
      }
      throw new Error("Model returned neither a final answer nor a supported tool call.");
    }
    toolCallCount += calls.length;
    if (toolCallCount > MAX_TOOL_CALLS) throw new Error("Model exceeded the lexical tool-call limit.");

    messages.push({ role: "assistant", content: message.content ?? null, tool_calls: calls });
    const hasLookupInBatch = calls.some(call => call.function.name !== "finish_response");
    let finalReply: AssistantReply | null = null;

    for (const call of calls) {
      const args = parseArguments(call.function.arguments);
      if (call.function.name === "finish_response") {
        if (hasLookupInBatch) {
          messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ error: "Wait for lexical tool results, then call finish_response in a later assistant turn." }) });
          continue;
        }
        finalReply = parseFinalReply(args, options.correctionMode, lookupResults);
        messages.push({ role: "tool", tool_call_id: call.id, content: "Final response accepted." });
        continue;
      }

      const result = await executeLookup(call.function.name, args, options.graph);
      if (result.trace) lookupResults.push(result.trace);
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result.value) });
    }

    if (finalReply) return finalReply;
  }

  throw new Error("Model did not finish the response within the lexical tool-call limit.");
}

function parseToolCalls(value: unknown): ToolCall[] {
  if (!Array.isArray(value)) return [];
  return value.filter((call): call is ToolCall => {
    if (typeof call !== "object" || call === null) return false;
    const item = call as Partial<ToolCall>;
    return item.type === "function" && typeof item.id === "string" &&
      typeof item.function?.name === "string" && typeof item.function?.arguments === "string";
  });
}

function parseArguments(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

async function executeLookup(name: string, args: Record<string, unknown>, graph: LexicalGraph): Promise<{ value: unknown; trace?: LexicalToolResult }> {
  if (name === "find_by_form" && typeof args.form === "string" && args.form.trim().length <= 300) {
    const form = args.form.trim();
    const result: LexicalItem[] = await graph.findByForm(form);
    return { value: result, trace: { tool: name, form, result } };
  }
  if (name === "get_item" && typeof args.id === "string" && args.id.length <= 300) {
    const id = args.id;
    const result = await graph.getItem(id);
    return { value: result, trace: { tool: name, id, result } };
  }
  if (name === "get_neighbors" && typeof args.id === "string" && args.id.length <= 300) {
    const id = args.id;
    const result: GraphNode[] = (await graph.getNeighbors(id)).map(node => ({
      ...node, childCount: node.children.length, children: node.children.slice(0, 20), relations: node.relations.slice(0, 20),
    }));
    return { value: result.slice(0, 20), trace: { tool: name, id, result: result.slice(0, 20) } };
  }
  return { value: { error: "Unsupported tool or invalid arguments." } };
}

function parseFinalReply(args: Record<string, unknown>, correctionMode: boolean, lookupResults: readonly LexicalToolResult[]): AssistantReply {
  const text = typeof args.text === "string" ? args.text.trim().slice(0, MAX_OUTPUT_CHARS) : "";
  const correction = correctionMode && typeof args.correction === "string"
    ? args.correction.trim().slice(0, MAX_OUTPUT_CHARS) || null
    : null;
  if (!text) throw new Error("Model returned an empty final answer.");
  return { text, correction, lookupResults };
}
