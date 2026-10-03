import { get_knowledge_neighborhood, get_knowledge_node, readGraphManifest, resolve_expression_candidates } from "../../../lib/lexicon.ts";
import { GraphInputError } from "../../../packages/lexical-core/src/knowledge.ts";

export const runtime = "nodejs";
const output = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const limit = query.has("limit") ? Number(query.get("limit")) : undefined;
  const cursor = query.get("cursor") ?? undefined;
  try {
    switch (query.get("operation")) {
      case "manifest": return output(await readGraphManifest());
      case "resolve_expression_candidates": return output(await resolve_expression_candidates({ expression: query.get("expression") ?? "", context: query.get("context") ?? "", limit, cursor }));
      case "get_knowledge_node": return output(await get_knowledge_node(query.get("id") ?? ""));
      case "get_knowledge_neighborhood": return output(await get_knowledge_neighborhood({
        id: query.get("id") ?? "", limit, cursor,
        depth: query.has("depth") ? Number(query.get("depth")) as 1 : undefined,
        direction: (query.get("direction") ?? "both") as "incoming" | "outgoing" | "both",
        relationTypes: query.getAll("relationType"),
      }));
      default: throw new GraphInputError("Unknown knowledge operation.");
    }
  } catch (error) {
    if (error instanceof GraphInputError) return output({ status: "invalid_request", error: error.message }, 400);
    return output({ status: "unavailable", error: "The OEWN graph is unavailable. Run npm run graph:import, then retry." }, 503);
  }
}
