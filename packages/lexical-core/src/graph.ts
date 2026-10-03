import type { LexicalItem } from "../../protocol/src/lexical-item.ts";
export { formShard, nodeShard, normalizeForm } from "./keys.ts";
import { formShard, nodeShard, normalizeForm } from "./keys.ts";

export type GraphRelation = {
  readonly target: string;
  readonly type: string;
  readonly incoming?: boolean;
};

export type GraphNode = {
  readonly id: string;
  readonly label: string;
  readonly kind: "root" | "layer" | "pos" | "domain" | "concept" | "sense" | "lexeme" | "frame";
  readonly definition: string;
  readonly children: readonly string[];
  readonly relations: readonly GraphRelation[];
  readonly parent?: string;
  readonly pos?: string;
  readonly domain?: string;
  readonly lexeme?: string;
  readonly concept?: string;
  readonly examples?: readonly string[];
  readonly pronunciation?: readonly string[];
  readonly forms?: readonly string[];
  readonly childCount?: number;
};

export type JsonLoader = <T>(path: string) => Promise<T>;

export class LexicalGraph {
  private readonly load: JsonLoader;
  private readonly cache = new Map<string, Promise<unknown>>();

  constructor(load: JsonLoader) {
    this.load = load;
  }

  private read<T>(name: string): Promise<T> {
    if (!this.cache.has(name)) {
      if (this.cache.size >= 48) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(name, this.load<T>(`graph-data/oewn-2025/${name}.json`).catch((error: unknown) => {
        this.cache.delete(name);
        throw error;
      }));
    }
    return this.cache.get(name) as Promise<T>;
  }

  async getNode(id: string): Promise<GraphNode | null> {
    if (!id || id.length > 300) return null;
    const shard = await this.read<Record<string, GraphNode>>(`node-${nodeShard(id)}`);
    return shard[id] ?? null;
  }

  private async getNodes(ids: readonly string[]): Promise<GraphNode[]> {
    const unique = [...new Set(ids)];
    const nodes = await Promise.all(unique.map(id => this.getNode(id)));
    return nodes.filter((node): node is GraphNode => node !== null);
  }

  async findByForm(form: string): Promise<LexicalItem[]> {
    const key = normalizeForm(form);
    if (!key) return [];
    const forms = await this.read<Record<string, string[]>>(`forms-${formShard(key)}`);
    const lexemes = await this.getNodes(forms[key] ?? []);
    const senses = await this.getNodes(lexemes.flatMap(node => node.children));
    return senses.filter(node => node.kind === "sense").map(toLexicalItem);
  }

  async getItem(id: string): Promise<LexicalItem | null> {
    const node = await this.getNode(id);
    if (!node || node.kind !== "sense") return null;
    return toLexicalItem(node);
  }

  async getNeighbors(id: string): Promise<GraphNode[]> {
    const node = await this.getNode(id);
    if (!node) return [];
    const neighborIds = [...(node.parent ? [node.parent] : []), ...node.children, ...node.relations.map(relation => relation.target)];
    return this.getNodes(neighborIds);
  }
}

function toLexicalItem(node: GraphNode): LexicalItem {
  if (node.kind !== "sense" || !node.lexeme || !node.concept || !node.pos) {
    throw new Error(`Malformed OEWN lexical sense: ${node.id}`);
  }
  const partOfSpeech = node.pos as LexicalItem["partOfSpeech"];
  if (!["n", "v", "a", "s", "r"].includes(partOfSpeech)) {
    throw new Error(`Unsupported OEWN part of speech: ${node.pos}`);
  }
  return {
    id: node.id as LexicalItem["id"],
    canonicalForm: node.label,
    language: "en",
    partOfSpeech,
    definition: node.definition,
    forms: [node.label],
    lexemeId: node.lexeme as LexicalItem["lexemeId"],
    conceptId: node.concept as LexicalItem["conceptId"],
    source: "oewn-2025",
  };
}
