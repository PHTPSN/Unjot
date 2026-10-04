import { knowledgeGraph, lexicalGraph } from "../../../lib/lexicon.ts";
import { learnerStore, StoreError } from "../../../lib/learner-store.ts";
import { evidenceMetric, learningStateFromCorrected, toLearningGraphRenderModel, type LearningGraphStructure, type LearningGraphRelation, type LearningGraphStructureNode, type LearningStateInput } from "../../../lib/graph/learning-adapter.ts";
import type { CorrectedLearnerItemRead } from "../../../packages/protocol/src/comprehension.ts";
import type { EvidenceEvent } from "../../../packages/protocol/src/evidence-event.ts";
import { KNOWLEDGE_VERSION } from "../../../packages/protocol/src/knowledge.ts";

export const runtime = "nodejs";
const MAX_SEEDS = 24;
const MAX_NODES = 120;
const NEIGHBOR_LIMIT = 24;

export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    const focus = query.get("focus")?.trim() || null;
    if (focus && focus.length > 300) throw new StoreError("Invalid graph focus.");
    const store = learnerStore();
    const stateRevision = store.revision();
    const events = store.evidence(stateRevision);
    const corrected = store.correctedStates(undefined, stateRevision);
    const states = corrected.map(stateInput(events));
    const stateIds = new Set(states.map(state => state.itemId));
    const recentIds = [...states].sort((a, b) => (b.lastObservedAt ?? "").localeCompare(a.lastObservedAt ?? "")).slice(0, MAX_SEEDS).map(state => state.itemId);
    const emptyEvidence = recentIds.length === 0;
    const seedIds = [...new Set([...(focus ? [focus] : emptyEvidence ? ["english"] : []), ...recentIds])].slice(0, MAX_SEEDS + 1);

    if (!seedIds.length) {
      return Response.json({ graphVersion: KNOWLEDGE_VERSION, stateRevision, projectionVersion: "m5r-graph-v1", nodes: [], edges: [], trackedCount: states.length, shownSeedCount: 0, hasMore: false, emptyEvidence });
    }

    const neighborhoods = await Promise.all(seedIds.map(async id => {
      const neighborhood = await knowledgeGraph.get_knowledge_neighborhood({ id, limit: NEIGHBOR_LIMIT });
      return neighborhood.status === "found" ? neighborhood : null;
    }));
    const nodeIds = new Set<string>(seedIds);
    const edgeMap = new Map<string, LearningGraphRelation>();
    for (const neighborhood of neighborhoods) {
      if (!neighborhood) continue;
      for (const node of neighborhood.nodes) nodeIds.add(node.id);
      for (const edge of neighborhood.edges) edgeMap.set(JSON.stringify([edge.source, edge.target, edge.type]), edge);
    }
    const loaded = (await Promise.all([...nodeIds].map(id => lexicalGraph.getNode(id)))).filter((node): node is NonNullable<typeof node> => node !== null);
    if (focus && !loaded.some(node => node.id === focus)) return Response.json({ error: "The selected graph node was not found." }, { status: 404 });
    const loadedById = new Map(loaded.map(node => [node.id, node]));
    const limitedNodes = [...new Set([...seedIds, ...loaded.map(node => node.id).sort()])].map(id => loadedById.get(id)).filter((node): node is NonNullable<typeof node> => node !== undefined).slice(0, MAX_NODES);
    const visible = new Set(limitedNodes.map(node => node.id));
    const structure: LearningGraphStructure = {
      graphVersion: KNOWLEDGE_VERSION,
      nodes: limitedNodes.map(node => ({
        id: node.id, label: node.label, type: node.kind, definition: node.definition,
        ...(node.parent ? { parentId: node.parent } : {}),
        ...(node.children.length ? { children: [...new Set([...node.children.slice(0, 200), ...node.children.filter(child => stateIds.has(child))])] } : {}),
        ...(node.children.length ? { descendantCount: node.childCount ?? node.children.length } : {}),
      } satisfies LearningGraphStructureNode)),
      edges: [...edgeMap.values()].filter(edge => visible.has(edge.source) && visible.has(edge.target)),
    };
    const model = toLearningGraphRenderModel(structure, states);
    return Response.json({ ...model, trackedCount: states.length, shownSeedCount: seedIds.length, hasMore: states.length > MAX_SEEDS, focusedId: focus, emptyEvidence });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Learning graph could not be loaded." }, { status: error instanceof StoreError ? error.status : 503 });
  }
}

function stateInput(events: readonly EvidenceEvent[]) {
  return (state: CorrectedLearnerItemRead): LearningStateInput => {
    const relevant = events.filter(event => event.itemId === state.itemId);
    return learningStateFromCorrected(state, relevant.length, relevant.at(-1)?.occurredAt ?? null, evidenceMetric(state.receptive, state.production, relevant.length));
  };
}
