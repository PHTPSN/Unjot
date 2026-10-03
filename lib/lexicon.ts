import { LexicalGraph } from "../packages/lexical-core/src/graph.ts";
import { KnowledgeGraph } from "../packages/lexical-core/src/knowledge.ts";
import { createGraphLoader } from "./graph-loader.ts";

const loader = createGraphLoader();
export const lexicalGraph = new LexicalGraph(loader.load);
export const knowledgeGraph = new KnowledgeGraph(lexicalGraph);
export const readGraphManifest = loader.readManifest;
export const resolve_expression_candidates = knowledgeGraph.resolve_expression_candidates.bind(knowledgeGraph);
export const get_knowledge_node = knowledgeGraph.get_knowledge_node.bind(knowledgeGraph);
export const get_knowledge_neighborhood = knowledgeGraph.get_knowledge_neighborhood.bind(knowledgeGraph);
