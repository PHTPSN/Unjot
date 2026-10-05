export type StructuredOutputMessage = {
  content?: unknown;
  reasoning?: unknown;
  tool_calls?: unknown;
};

export type ParsedStructuredOutput = {
  value: Record<string, unknown>;
  functionName: string | null;
  source: "tool_call" | "content";
};

export class StructuredOutputError extends Error {
  constructor(message = "Invalid structured model output.") {
    super(message);
    this.name = "StructuredOutputError";
  }
}

function parseJson(text: string, maxChars: number): unknown {
  if (!text.trim() || text.length > maxChars) throw new StructuredOutputError();
  try { return JSON.parse(text); }
  catch { throw new StructuredOutputError(); }
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new StructuredOutputError();
  return value as Record<string, unknown>;
}

function unwrap(
  raw: unknown,
  allowedNames: ReadonlySet<string>,
  maxChars: number,
): { value: Record<string, unknown>; functionName: string | null } {
  const object = asObject(raw);
  if (!("arguments" in object)) return { value: object, functionName: null };
  const name = object.name;
  if (typeof name !== "string" || !allowedNames.has(name)) throw new StructuredOutputError();
  const args = typeof object.arguments === "string" ? parseJson(object.arguments, maxChars) : object.arguments;
  return { value: asObject(args), functionName: name };
}

/**
 * Normalizes the supported final-output shapes used by OpenAI-compatible providers.
 * Provider-specific reasoning is intentionally never treated as final output.
 */
export function parseStructuredOutput(message: StructuredOutputMessage | null | undefined, options: {
  functionNames: readonly string[];
  maxChars?: number;
  plainTextField?: string;
}): ParsedStructuredOutput {
  const maxChars = options.maxChars ?? 60_000;
  const allowedNames = new Set(options.functionNames);
  const calls = Array.isArray(message?.tool_calls)
    ? message.tool_calls as Array<{ function?: { name?: unknown; arguments?: unknown } }>
    : [];
  const matching = calls.filter(call => typeof call.function?.name === "string" && allowedNames.has(call.function.name));
  if (matching.length > 1) throw new StructuredOutputError();
  const call = matching[0];
  if (call && typeof call.function?.arguments === "string" && call.function.arguments.trim()) {
    try {
      return {
        value: asObject(parseJson(call.function.arguments, maxChars)),
        functionName: call.function.name as string,
        source: "tool_call",
      };
    } catch (error) {
      if (!(error instanceof StructuredOutputError)) throw error;
      // Some providers also include a valid final object in content. Try it below.
    }
  }

  let content = message?.content;
  if (typeof content === "string") {
    const contentText = content;
    if (contentText.trim().length > maxChars) throw new StructuredOutputError();
    try { content = parseJson(contentText, maxChars); }
    catch (error) {
      if (options.plainTextField && contentText.trim()) {
        return { value: { [options.plainTextField]: contentText }, functionName: null, source: "content" };
      }
      throw error;
    }
  }
  const parsed = unwrap(content, allowedNames, maxChars);
  return { ...parsed, source: "content" };
}
