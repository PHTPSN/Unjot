/** M3 read contracts. Graph facts never contain personal learning state. */
export const KNOWLEDGE_VERSION = "oewn-2025" as const;
export const KNOWLEDGE_LIMITS = { expression: 300, context: 2000, results: 100, defaultResults: 20, relationTypes: 16 } as const;

export interface GraphManifest {
  version: typeof KNOWLEDGE_VERSION;
  source: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string;
  sha256: string;
  attribution: string;
  transformations: string[];
  counts: { lexicalEntries: number; lexemes: number; senses: number; concepts: number; sourceRelations: number; frames: number; nodes: number };
  coverage: { included: string[]; missing: string[] };
}
export interface Provenance {
  source: typeof KNOWLEDGE_VERSION;
  origin: "source" | "import_navigation";
}
/** Adjacency is returned only through the paginated neighborhood operation. */
export interface KnowledgeNode {
  id: string;
  label: string;
  kind: "root" | "layer" | "pos" | "domain" | "concept" | "sense" | "lexeme" | "frame";
  definition: string;
  pos?: string;
  lexemeId?: string;
  conceptId?: string;
  provenance: Provenance;
}
export interface KnowledgeEdge {
  source: string;
  target: string;
  type: string;
  category: "semantic" | "navigation" | "syntactic";
  provenance: Provenance;
}
export interface PageInfo {
  total: number;
  truncated: boolean;
  nextCursor: string | null;
}
export interface ResolveExpressionInput {
  expression: string;
  context?: string;
  limit?: number;
  cursor?: string;
}
export interface ExpressionCandidates extends PageInfo {
  graphVersion: typeof KNOWLEDGE_VERSION;
  expression: string;
  context: string;
  status: "matched" | "ambiguous" | "missing";
  candidates: KnowledgeNode[];
  selectedItemId: null;
}
export interface NeighborhoodInput {
  id: string;
  depth?: 1;
  direction?: "incoming" | "outgoing" | "both";
  relationTypes?: string[];
  limit?: number;
  cursor?: string;
}
export interface KnowledgeNeighborhood extends PageInfo {
  graphVersion: typeof KNOWLEDGE_VERSION;
  status: "found" | "missing";
  rootId: string;
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
}
export type KnowledgeNodeResult = {
  graphVersion: typeof KNOWLEDGE_VERSION;
} & ({ status: "found"; node: KnowledgeNode } | { status: "missing"; node: null });
