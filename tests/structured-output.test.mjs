import assert from "node:assert/strict";
import test from "node:test";
import { parseStructuredOutput, StructuredOutputError } from "../lib/structured-output.ts";

test("structured output adapter reads named tool arguments", () => {
  const parsed = parseStructuredOutput({ tool_calls: [{ function: { name: "propose", arguments: JSON.stringify({ observations: [] }) } }] }, { functionNames: ["propose"] });
  assert.deepEqual(parsed.value, { observations: [] });
  assert.equal(parsed.functionName, "propose");
  assert.equal(parsed.source, "tool_call");
});

test("structured output adapter reads a provider content wrapper when tool arguments are empty", () => {
  const parsed = parseStructuredOutput({
    reasoning: JSON.stringify({ observations: [{ unsafe: true }] }),
    tool_calls: [{ function: { name: "propose", arguments: "" } }],
    content: JSON.stringify({ name: "propose", arguments: { observations: [] } }),
  }, { functionNames: ["propose"] });
  assert.deepEqual(parsed.value, { observations: [] });
  assert.equal(parsed.source, "content");
});

test("structured output adapter never promotes reasoning to final output", () => {
  assert.throws(() => parseStructuredOutput({
    reasoning: JSON.stringify({ observations: [] }),
    tool_calls: [{ function: { name: "propose", arguments: "" } }],
    content: "",
  }, { functionNames: ["propose"] }), StructuredOutputError);
});

test("structured output adapter rejects a wrapper for a different function", () => {
  assert.throws(() => parseStructuredOutput({
    content: JSON.stringify({ name: "write_state", arguments: { observations: [] } }),
  }, { functionNames: ["propose"] }), StructuredOutputError);
});
