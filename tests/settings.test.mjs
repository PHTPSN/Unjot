import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LearnerStore } from "../lib/learner-store.ts";
import { readLlmConfig, testLlmConnection } from "../lib/llm-config.ts";

test("application settings persist locally and override environment defaults", async t => {
  const directory = await mkdtemp(join(tmpdir(), "unjot-settings-"));
  const path = join(directory, "learner.sqlite");
  t.after(async () => { await rm(directory, { recursive: true, force: true }); });

  const first = new LearnerStore(path);
  first.saveAppSettings({
    provider: "saved-provider",
    model: "saved-model",
    apiKey: "saved-secret",
    baseUrl: "http://127.0.0.1:1234/v1/",
    language: "zh",
  });
  first.close();

  const reopened = new LearnerStore(path);
  const saved = reopened.appSettings();
  const resolved = readLlmConfig({
    LLM_PROVIDER: "environment-provider",
    LLM_MODEL: "environment-model",
    LLM_API_KEY: "environment-secret",
    LLM_BASE_URL: "https://environment.example/v1",
  }, saved ?? undefined);
  reopened.close();

  assert.deepEqual(saved, {
    provider: "saved-provider",
    model: "saved-model",
    apiKey: "saved-secret",
    baseUrl: "http://127.0.0.1:1234/v1",
    language: "zh",
  });
  assert.equal(resolved.configured, true);
  assert.equal(resolved.config.provider, "saved-provider");
  assert.equal(resolved.config.model, "saved-model");
  assert.equal(resolved.config.apiKey, "saved-secret");
  assert.equal(resolved.config.baseUrl, "http://127.0.0.1:1234/v1");
});

test("application settings reject unsafe remote HTTP endpoints", () => {
  const store = new LearnerStore(":memory:");
  assert.throws(() => store.saveAppSettings({
    provider: "openai-compatible",
    model: "model",
    apiKey: "secret",
    baseUrl: "http://provider.example/v1",
    language: "en",
  }), /Base URL must use HTTPS/);
  store.close();
});

test("connection test calls the provider models endpoint without exposing the key in its result", async () => {
  let request;
  await testLlmConnection({ provider: "compatible", model: "test-model", apiKey: "private-key", baseUrl: "https://provider.example/v1/" }, async (url, init) => {
    request = { url, authorization: init.headers.authorization };
    return new Response(JSON.stringify({ data: [] }), { status: 200 });
  });
  assert.deepEqual(request, { url: "https://provider.example/v1/models", authorization: "Bearer private-key" });
});

test("connection test reports provider failures", async () => {
  await assert.rejects(() => testLlmConnection({ provider: "compatible", model: "test-model", apiKey: "private-key", baseUrl: "https://provider.example/v1" }, async () => new Response("denied", { status: 401 })), /Provider returned 401: denied/);
});
