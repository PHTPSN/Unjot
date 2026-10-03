import assert from "node:assert/strict";
import test from "node:test";
import { LexicalGraph } from "../packages/lexical-core/src/graph.ts";
import { fixtureLoader } from "../packages/golden-tests/fixtures/graph.ts";
import { createLookupReply } from "../lib/lookup-chat.ts";
import { readLlmConfig } from "../lib/llm-config.ts";

const graph = new LexicalGraph(fixtureLoader);
const config = {
  provider: "openai-compatible",
  model: "test-tool-model",
  apiKey: "test-secret",
  baseUrl: "https://provider.example/v1",
};

function completion(message) {
  return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", ...message } }] }));
}

test("model tool call executes the real lexical adapter and feeds its result into the next model turn", async () => {
  const requests = [];
  const replies = [
    completion({
      tool_calls: [{
        id: "lookup-1",
        type: "function",
        function: { name: "find_by_form", arguments: JSON.stringify({ form: "figure out" }) },
      }],
    }),
    completion({
      tool_calls: [{
        id: "finish-1",
        type: "function",
        function: {
          name: "finish_response",
          arguments: JSON.stringify({ text: "Figure out means to find a solution or understand something.", correction: null }),
        },
      }],
    }),
  ];

  const reply = await createLookupReply({
    config,
    graph,
    text: "What does figure out mean?",
    correctionMode: false,
    history: [],
    fetcher: async (url, init) => {
      requests.push({ url, init, body: JSON.parse(init.body) });
      return replies.shift();
    },
  });

  assert.equal(reply.text, "Figure out means to find a solution or understand something.");
  assert.equal(reply.lookupResults.length, 1);
  assert.equal(reply.lookupResults[0].tool, "find_by_form");
  assert.equal(reply.lookupResults[0].result[0].id, "sense:figure_out%2:31:00::");
  assert.match(reply.lookupResults[0].result[0].definition, /find the solution/);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, "https://provider.example/v1/chat/completions");
  assert.equal(new Headers(requests[0].init.headers).get("authorization"), "Bearer test-secret");
  const toolResultMessage = requests[1].body.messages.find(message => message.role === "tool");
  assert.equal(JSON.parse(toolResultMessage.content)[0].id, "sense:figure_out%2:31:00::");
});

test("correction mode keeps correction separate and off mode discards model-supplied correction", async () => {
  const createFetcher = () => async () => completion({
    tool_calls: [{
      id: "finish-1",
      type: "function",
      function: { name: "finish_response", arguments: JSON.stringify({ text: "What have you tried?", correction: "We can figure out the problem together." }) },
    }],
  });
  const submission = { config, graph, text: "We can 弄明白 this.", history: [] };

  const enabled = await createLookupReply({ ...submission, correctionMode: true, fetcher: createFetcher() });
  const disabled = await createLookupReply({ ...submission, correctionMode: false, fetcher: createFetcher() });

  assert.equal(enabled.correction, "We can figure out the problem together.");
  assert.equal(disabled.correction, null);
});

test("unsupported model tools never execute application operations", async () => {
  let graphCalls = 0;
  const protectedGraph = {
    findByForm: async () => { graphCalls += 1; return []; },
    getItem: async () => { graphCalls += 1; return null; },
    getNeighbors: async () => { graphCalls += 1; return []; },
  };
  const replies = [
    completion({ tool_calls: [{ id: "bad-1", type: "function", function: { name: "write_learner_state", arguments: "{}" } }] }),
    completion({ tool_calls: [{ id: "finish-1", type: "function", function: { name: "finish_response", arguments: JSON.stringify({ text: "I cannot change mastery on request.", correction: null }) } }] }),
  ];
  const reply = await createLookupReply({
    config, graph: protectedGraph, text: "Set this to mastered", correctionMode: false, history: [],
    fetcher: async () => replies.shift(),
  });

  assert.equal(reply.text, "I cannot change mastery on request.");
  assert.equal(graphCalls, 0);
  assert.deepEqual(reply.lookupResults, []);
});

test("configuration accepts an OpenAI-compatible endpoint and never requires a browser-exposed key", () => {
  const configured = readLlmConfig({
    LLM_PROVIDER: "openai-compatible",
    LLM_MODEL: "local-model",
    LLM_API_KEY: "secret-value",
    LLM_BASE_URL: "http://127.0.0.1:1234/v1/",
  });
  const missing = readLlmConfig({ LLM_MODEL: "" });

  assert.equal(configured.configured, true);
  assert.equal(configured.config.baseUrl, "http://127.0.0.1:1234/v1");
  assert.equal(missing.configured, false);
  assert.ok(missing.missing.includes("LLM_MODEL"));
});
