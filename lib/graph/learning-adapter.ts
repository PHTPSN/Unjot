import type { CorrectedLearnerItemRead, ProductionState, ReceptiveState } from "../../packages/protocol/src/comprehension.ts";

export const LEARNING_GRAPH_PROJECTION_VERSION = "m5r-graph-v1" as const;

export type LearningGraphNodeType = "root" | "layer" | "pos" | "domain" | "concept" | "sense" | "lexeme" | "frame";
export type LearningGraphRelation = { source: string; target: string; type: string; category: "semantic" | "navigation" | "syntactic" };

/** Read-side graph facts. No database or persistence types cross this boundary. */
export interface LearningGraphStructureNode {
  id: string;
  label: string;
  type: LearningGraphNodeType;
  definition: string;
  parentId?: string;
  children?: readonly string[];
  descendantCount?: number;
}

export interface LearningGraphStructure {
  graphVersion: string;
  nodes: readonly LearningGraphStructureNode[];
  edges: readonly LearningGraphRelation[];
}

/** The stable learner projection consumed by the visual layer. */
export interface LearningStateInput {
  itemId: string;
  receptive: ReceptiveState;
  production: ProductionState;
  evidenceCount: number;
  lastObservedAt: string | null;
  learningMetric: number;
  needsSupport: boolean;
  stateRevision: string;
  projectionVersion: string;
}

export type LearningVisualTone = "unobserved" | "encountered" | "understood" | "assisted" | "spontaneous" | "repeated" | "needs_support" | "aggregate";

export interface LearningGraphRenderNode extends LearningGraphStructureNode {
  state: LearningStateInput | null;
  tone: LearningVisualTone;
  aggregateCoverage: { observed: number; total: number } | null;
}

export interface LearningGraphRenderModel {
  graphVersion: string;
  projectionVersion: typeof LEARNING_GRAPH_PROJECTION_VERSION;
  stateRevision: string;
  nodes: readonly LearningGraphRenderNode[];
  edges: readonly LearningGraphRelation[];
}

export function learningStateFromCorrected(
  state: CorrectedLearnerItemRead,
  evidenceCount: number,
  lastObservedAt: string | null,
  learningMetric: number,
  needsSupport = state.receptive === "needs_support",
): LearningStateInput {
  return {
    itemId: state.itemId,
    receptive: state.receptive,
    production: state.production,
    evidenceCount,
    lastObservedAt,
    learningMetric: clamp(learningMetric),
    needsSupport,
    stateRevision: state.stateRevision,
    projectionVersion: state.derivationPolicyVersion,
  };
}

/** A transparent display metric, used only to deepen the node colour. */
export function evidenceMetric(receptive: ReceptiveState, production: ProductionState, evidenceCount: number): number {
  const base = production === "repeated_independent_use" ? 1
    : production === "spontaneous_production" ? .84
      : production === "assisted_production" ? .66
        : receptive === "understood" ? .58
          : receptive === "needs_support" ? .2
            : receptive === "encountered" ? .28 : 0;
  return clamp(Math.max(base, base + Math.min(Math.max(evidenceCount, 0), 5) * .025));
}

/**
 * Turn the two read-side inputs into a renderer model. Aggregate nodes only
 * report descendant coverage; evidence from one child never becomes group mastery.
 */
export function toLearningGraphRenderModel(
  structure: LearningGraphStructure,
  states: readonly LearningStateInput[],
): LearningGraphRenderModel {
  const stateById = new Map(states.map(state => [state.itemId, state]));
  const stateRevision = states[0]?.stateRevision ?? "0";
  const nodes = structure.nodes.map(node => {
    const state = stateById.get(node.id) ?? null;
    const children = node.children ?? [];
    const aggregateCoverage = children.length || node.descendantCount
      ? { observed: children.filter(id => (stateById.get(id)?.evidenceCount ?? 0) > 0).length, total: Math.max(node.descendantCount ?? 0, children.length) }
      : null;
    const isAggregate = Boolean(aggregateCoverage && node.type !== "sense");
    return {
      ...node,
      state,
      tone: isAggregate ? (aggregateCoverage!.observed ? "aggregate" : "unobserved") : toneFor(state),
      aggregateCoverage,
    } satisfies LearningGraphRenderNode;
  });
  const visible = new Set(nodes.map(node => node.id));
  const edges = structure.edges.filter(edge => visible.has(edge.source) && visible.has(edge.target));
  return {
    graphVersion: structure.graphVersion,
    projectionVersion: LEARNING_GRAPH_PROJECTION_VERSION,
    stateRevision,
    nodes,
    edges: [...new Map(edges.map(edge => [JSON.stringify([edge.source, edge.target, edge.type]), edge])).values()],
  };
}

export function toneFor(state: LearningStateInput | null): LearningVisualTone {
  if (!state || state.evidenceCount === 0) return "unobserved";
  if (state.production === "repeated_independent_use") return "repeated";
  if (state.production === "spontaneous_production") return "spontaneous";
  if (state.production === "assisted_production") return "assisted";
  if (state.needsSupport || state.receptive === "needs_support") return "needs_support";
  if (state.receptive === "understood") return "understood";
  return "encountered";
}

function clamp(value: number) { return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)); }
