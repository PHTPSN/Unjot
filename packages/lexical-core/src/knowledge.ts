import { LexicalGraph, normalizeForm, type GraphNode } from "./graph.ts";
import {
  KNOWLEDGE_LIMITS, KNOWLEDGE_VERSION,
  type ExpressionCandidates, type KnowledgeEdge, type KnowledgeNeighborhood,
  type KnowledgeNode, type KnowledgeNodeResult, type NeighborhoodInput, type ResolveExpressionInput,
} from "../../protocol/src/knowledge.ts";

export class GraphInputError extends Error {}
export class GraphLoadError extends Error {
  constructor() { super("The OEWN graph is unavailable. Run npm run graph:import, then retry."); }
}

function boundedText(value: string, max: number, name: string, empty = false) {
  if (typeof value !== "string" || value.length > max || (!empty && !value.trim())) {
    throw new GraphInputError(`${name} must contain ${empty ? "0" : "1"}–${max} characters.`);
  }
}
function pagination(limit: number | undefined, cursor: string | undefined, scope: string) {
  const size = limit ?? KNOWLEDGE_LIMITS.defaultResults;
  if (!Number.isInteger(size) || size < 1 || size > KNOWLEDGE_LIMITS.results) throw new GraphInputError("Limit must be an integer from 1 to 100.");
  let offset = 0;
  if (cursor !== undefined) {
    try {
      if (typeof cursor !== "string" || cursor.length > 6000) throw new Error();
      const parsed = JSON.parse(cursor);
      if (parsed.scope !== scope || !Number.isSafeInteger(parsed.offset) || parsed.offset < 0) throw new Error();
      offset = parsed.offset;
    } catch { throw new GraphInputError("Invalid cursor for this graph query."); }
  }
  return { size, offset, page: (total: number) => {
    if (offset > total) throw new GraphInputError("Cursor exceeds the result count.");
    return { total, truncated: offset > 0 || offset + size < total, nextCursor: offset + size < total ? JSON.stringify({ scope, offset: offset + size }) : null };
  } };
}
function project(node: GraphNode): KnowledgeNode {
  return {
    id: node.id, label: node.label, kind: node.kind, definition: node.definition,
    ...(node.pos ? { pos: node.pos } : {}), ...(node.lexeme ? { lexemeId: node.lexeme } : {}),
    ...(node.concept ? { conceptId: node.concept } : {}),
    provenance: { source: KNOWLEDGE_VERSION, origin: ["root", "layer", "pos", "domain"].includes(node.kind) ? "import_navigation" : "source" },
  };
}
function edge(source: string, target: string, type: string): KnowledgeEdge {
  const category = type === "contains" || type === "word_form" ? "navigation" : type === "uses_pattern" ? "syntactic" : "semantic";
  return { source, target, type, category, provenance: { source: KNOWLEDGE_VERSION, origin: category === "navigation" ? "import_navigation" : "source" } };
}

/** Bounded, read-only operations over Language Lab's unchanged source identities. */
export class KnowledgeGraph {
  private graph: LexicalGraph;
  constructor(graph: LexicalGraph) { this.graph = graph; }

  async resolve_expression_candidates(input: ResolveExpressionInput): Promise<ExpressionCandidates> {
    boundedText(input.expression, KNOWLEDGE_LIMITS.expression, "Expression");
    boundedText(input.context ?? "", KNOWLEDGE_LIMITS.context, "Context", true);
    const expression = normalizeForm(input.expression), context = input.context ?? "";
    const paging = pagination(input.limit, input.cursor, JSON.stringify([KNOWLEDGE_VERSION, "resolve", expression, context]));
    // The index locates candidates, never chooses a meaning from context.
    const ids = await this.graph.findSenseIds(expression);
    const page = paging.page(ids.length);
    const nodes = await Promise.all(ids.slice(paging.offset, paging.offset + paging.size).map(id => this.graph.getNode(id)));
    if (nodes.some(node => !node)) throw new GraphLoadError();
    return { graphVersion: KNOWLEDGE_VERSION, expression, context, status: ids.length === 0 ? "missing" : ids.length === 1 ? "matched" : "ambiguous", candidates: nodes.map(node => project(node!)), selectedItemId: null, ...page };
  }

  async get_knowledge_node(id: string): Promise<KnowledgeNodeResult> {
    boundedText(id, 300, "Node ID");
    const node = await this.graph.getNode(id);
    return node ? { graphVersion: KNOWLEDGE_VERSION, status: "found", node: project(node) } : { graphVersion: KNOWLEDGE_VERSION, status: "missing", node: null };
  }

  async get_knowledge_neighborhood(input: NeighborhoodInput): Promise<KnowledgeNeighborhood> {
    boundedText(input.id, 300, "Node ID");
    if (input.depth !== undefined && input.depth !== 1) throw new GraphInputError("Only depth 1 is supported.");
    const direction = input.direction ?? "both";
    if (!["incoming", "outgoing", "both"].includes(direction)) throw new GraphInputError("Invalid direction.");
    const types = input.relationTypes ?? [];
    if (!Array.isArray(types) || types.length > KNOWLEDGE_LIMITS.relationTypes || types.some(type => typeof type !== "string" || !type.length || type.length > 80)) throw new GraphInputError("Invalid relation filter.");
    const paging = pagination(input.limit, input.cursor, JSON.stringify([KNOWLEDGE_VERSION, "neighbors", input.id, direction, [...new Set(types)].sort()]));
    const node = await this.graph.getNode(input.id);
    if (!node) return { graphVersion: KNOWLEDGE_VERSION, status: "missing", rootId: input.id, nodes: [], edges: [], ...paging.page(0) };
    const stored = node.relations.map(relation => relation.incoming ? edge(relation.target, node.id, relation.type) : edge(node.id, relation.target, relation.type));
    if (node.parent) stored.push(edge(node.parent, node.id, "contains"));
    for (const child of node.children) {
      // These importer child indexes are reverse lookups, not new semantic facts.
      stored.push(node.kind === "lexeme" ? edge(child, node.id, "word_form") : node.kind === "frame" ? edge(child, node.id, "uses_pattern") : edge(node.id, child, "contains"));
    }
    const unique = [...new Map(stored.map(e => [JSON.stringify([e.source, e.target, e.type]), e])).values()]
      .filter(e => (direction === "both" || (direction === "incoming" ? e.target : e.source) === node.id) && (!types.length || types.includes(e.type)))
      .sort((a, b) => { const x = JSON.stringify([a.type, a.source, a.target]), y = JSON.stringify([b.type, b.source, b.target]); return x < y ? -1 : x > y ? 1 : 0; });
    const page = paging.page(unique.length), edges = unique.slice(paging.offset, paging.offset + paging.size);
    const ids = [...new Set([node.id, ...edges.flatMap(e => [e.source, e.target])])];
    const nodes = await Promise.all(ids.map(id => this.graph.getNode(id)));
    if (nodes.some(n => !n)) throw new GraphLoadError();
    return { graphVersion: KNOWLEDGE_VERSION, status: "found", rootId: node.id, nodes: nodes.map(n => project(n!)), edges, ...page };
  }
}
