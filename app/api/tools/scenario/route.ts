import { lexicalGraph } from "../../../../lib/lexicon.ts";
import { readLlmConfig } from "../../../../lib/llm-config.ts";
import { learnerStore } from "../../../../lib/learner-store.ts";
import { runScenario } from "../../../../lib/m7-workflows.ts";
import type { ScenarioRequest } from "../../../../packages/protocol/src/m7-workflows.ts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ runs: learnerStore().workflowRuns("scenario") });
  const run = learnerStore().workflowRun(id);
  return run ? Response.json(run) : Response.json({ error: "Scenario run not found." }, { status: 404 });
}

export async function POST(request: Request) {
  const store = learnerStore();
  const config = readLlmConfig(process.env, store.appSettings() ?? undefined);
  if (!config.configured) return Response.json({ error: `Set ${config.missing.join(", ")} in .env to enable the model.` }, { status: 503 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  try {
    const result = await runScenario(body as ScenarioRequest, { config: config.config, graph: lexicalGraph, store });
    return Response.json(result);
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Scenario workflow failed." }, { status: 400 }); }
}
