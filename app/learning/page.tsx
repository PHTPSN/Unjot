"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minus, Plus, RotateCcw, Search, X } from "lucide-react";
import type { PointerEvent as ReactPointerEvent, WheelEvent } from "react";
import type { LearningGraphRelation, LearningGraphRenderModel, LearningGraphRenderNode, LearningVisualTone } from "../../lib/graph/learning-adapter.ts";
import "./learning.css";

const VIEWBOX = { width: 1000, height: 590 };
const TONE_LABELS: Record<LearningVisualTone, string> = {
  unobserved: "Not observed",
  encountered: "Encountered",
  understood: "Understanding evidence",
  assisted: "Used with support",
  spontaneous: "Used independently",
  repeated: "Repeated independent use",
  needs_support: "Needs support",
  aggregate: "Coverage group",
};
const EMPTY_MODEL: LearningGraphRenderModel = { graphVersion: "oewn-2025", projectionVersion: "m5r-graph-v1", stateRevision: "0", nodes: [], edges: [] };
type Point = { x: number; y: number };
type GraphResponse = LearningGraphRenderModel & { hasMore?: boolean; emptyEvidence?: boolean; trackedCount?: number };

export default function LearningPage() {
  const [model, setModel] = useState<GraphResponse>(EMPTY_MODEL);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [fitKey, setFitKey] = useState(0);
  const drag = useRef<{ pointerId: number; start: Point; origin: Point } | null>(null);

  const loadGraph = useCallback(async (focus?: string) => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/learner-graph${focus ? `?focus=${encodeURIComponent(focus)}` : ""}`, { cache: "no-store" });
      const value = await response.json() as GraphResponse;
      if (!response.ok) throw new Error((value as unknown as { error?: string }).error ?? "Learning graph could not be loaded.");
      setModel(value); setFitKey(key => key + 1);
      if (focus && value.nodes.some(node => node.id === focus)) setSelectedId(focus);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Learning graph could not be loaded."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const focus = new URLSearchParams(window.location.search).get("focus") ?? undefined;
    void loadGraph(focus);
  }, [loadGraph]);
  const positions = useMemo(() => layout(model.nodes), [model.nodes]);
  const selected = model.nodes.find(node => node.id === selectedId) ?? null;
  const selectedEdges = selected ? model.edges.filter(edge => edge.source === selected.id || edge.target === selected.id) : [];

  useEffect(() => {
    if (!selectedId || model.nodes.some(node => node.id === selectedId)) return;
    setSelectedId(null);
  }, [model.nodes, selectedId]);
  useEffect(() => {
    if (!fitKey || !model.nodes.length) return;
    const xs = model.nodes.map(node => positions.get(node.id)?.x ?? VIEWBOX.width / 2);
    const ys = model.nodes.map(node => positions.get(node.id)?.y ?? VIEWBOX.height / 2);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const spanX = Math.max(maxX - minX + 240, 420), spanY = Math.max(maxY - minY + 160, 300);
    setZoom(Math.max(.55, Math.min(1.2, Math.min(VIEWBOX.width / spanX, VIEWBOX.height / spanY))));
    setOffset({ x: VIEWBOX.width / 2 - (minX + maxX) / 2, y: VIEWBOX.height / 2 - (minY + maxY) / 2 });
  }, [fitKey, model.nodes, positions]);

  function onWheel(event: WheelEvent<SVGSVGElement>) {
    event.preventDefault();
    setZoom(current => Math.max(.45, Math.min(2.4, current * (event.deltaY > 0 ? .9 : 1.1))));
  }
  function onPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, start: { x: event.clientX, y: event.clientY }, origin: offset };
  }
  function onPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    setOffset({ x: drag.current.origin.x + (event.clientX - drag.current.start.x), y: drag.current.origin.y + (event.clientY - drag.current.start.y) });
  }
  function onPointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
  }

  return <main className="learning-graph-page">
    <nav className="learning-graph-nav"><a href="/">← Conversation</a><span>My language · evidence graph</span></nav>
    <header className="learning-graph-heading">
      <div><p className="eyebrow">PERSONAL LANGUAGE GRAPH</p><h1>My language</h1><p>See the expressions you have encountered, understood, and used, connected to the WordNet graph.</p></div>
      <div className="graph-meta"><span>{model.nodes.length} visible nodes</span><span>State revision {model.stateRevision}</span></div>
    </header>

    {error && <div className="graph-alert" role="alert"><span>{error}</span><button type="button" onClick={() => void loadGraph(selectedId ?? undefined)}><RotateCcw size={14} /> Retry</button></div>}
    {loading && <p className="graph-status" role="status">Loading your evidence graph…</p>}
    {!loading && !error && !model.nodes.length && <section className="graph-empty" aria-live="polite"><div className="empty-mark"><Search size={20} /></div><h2>No learning evidence yet</h2><p>Start a conversation and return here after an expression has been observed.</p><a href="/">Go to conversation</a></section>}

    {!loading && !error && model.nodes.length > 0 && <>
      {model.emptyEvidence && <p className="graph-evidence-note" role="status">No accepted learning evidence yet. The grey graph is real WordNet structure; its colours will reflect your evidence as you use English.</p>}
      <section className="graph-toolbar" aria-label="Graph navigation">
        <div className="graph-zoom-controls">
          <button type="button" onClick={() => setZoom(value => Math.min(2.4, value * 1.15))} title="Zoom in" aria-label="Zoom in"><Plus size={16} /></button>
          <button type="button" onClick={() => setZoom(value => Math.max(.45, value * .87))} title="Zoom out" aria-label="Zoom out"><Minus size={16} /></button>
          <button type="button" onClick={() => setFitKey(key => key + 1)} title="Fit graph" aria-label="Fit graph"><Maximize2 size={16} /></button>
          <button type="button" onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }} title="Reset view" aria-label="Reset view"><RotateCcw size={16} /></button>
        </div>
        <span className="graph-hint">Drag to pan · scroll to zoom · select a node for evidence</span>
      </section>
      <section className="graph-layout">
        <div className="graph-board" aria-label="Learner evidence graph">
          <svg viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`} role="img" onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
            <g transform={`translate(${offset.x} ${offset.y}) scale(${zoom})`}>
              {model.edges.map(edge => <GraphEdge key={`${edge.source}-${edge.target}-${edge.type}`} edge={edge} positions={positions} selectedId={selectedId} />)}
              {model.nodes.map(node => <GraphNodeView key={node.id} node={node} point={positions.get(node.id)!} selected={node.id === selectedId} onSelect={() => setSelectedId(node.id)} />)}
            </g>
          </svg>
        </div>
        <aside className="node-inspector" aria-live="polite">
          {!selected && <div className="inspector-empty"><p>Select a node</p><span>Its evidence and stored relationships will appear here.</span></div>}
          {selected && <NodeInspector node={selected} edges={selectedEdges} model={model} onSelect={setSelectedId} onExpand={() => void loadGraph(selected.id)} />}
        </aside>
      </section>
      <GraphLegend />
      {model.hasMore && <p className="graph-limit">Showing a bounded working set around your most recent evidence. Select a node to expand its neighborhood.</p>}
    </>}
  </main>;
}

function GraphNodeView({ node, point, selected, onSelect }: { node: LearningGraphRenderNode; point: Point; selected: boolean; onSelect: () => void }) {
  const label = node.label.length > 21 ? `${node.label.slice(0, 20)}…` : node.label;
  const coverage = node.aggregateCoverage && `${node.aggregateCoverage.observed}/${node.aggregateCoverage.total}`;
  const needsSupport = node.state?.needsSupport ?? node.tone === "needs_support";
  return <g className={`learning-node node-${node.tone} ${needsSupport ? "has-support" : ""} ${selected ? "is-selected" : ""}`} transform={`translate(${point.x} ${point.y})`} onClick={event => { event.stopPropagation(); onSelect(); }} role="button" tabIndex={0} aria-label={`${node.label}, ${TONE_LABELS[node.tone]}${needsSupport && node.tone !== "needs_support" ? ", needs support" : ""}`} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(); } }}>
    <rect x="-70" y="-27" width="140" height="54" rx="8" />
    <text className="node-label" textAnchor="middle" y={coverage ? -4 : 4}>{label}</text>
    <text className="node-kind" textAnchor="middle" y={coverage ? 13 : 19}>{coverage ? `${coverage} descendants` : node.type}</text>
    {needsSupport && <path className="support-mark" d="M56-20l8 8m0-8-8 8" />}
  </g>;
}

function GraphEdge({ edge, positions, selectedId }: { edge: LearningGraphRelation; positions: ReadonlyMap<string, Point>; selectedId: string | null }) {
  const source = positions.get(edge.source), target = positions.get(edge.target);
  if (!source || !target) return null;
  const active = selectedId === edge.source || selectedId === edge.target;
  return <line className={`graph-edge edge-${edge.category} ${active ? "is-active" : ""}`} x1={source.x} y1={source.y} x2={target.x} y2={target.y} />;
}

function NodeInspector({ node, edges, model, onSelect, onExpand }: { node: LearningGraphRenderNode; edges: readonly LearningGraphRelation[]; model: LearningGraphRenderModel; onSelect: (id: string) => void; onExpand: () => void }) {
  const other = (edge: LearningGraphRelation) => edge.source === node.id ? edge.target : edge.source;
  return <div>
    <div className="inspector-heading"><div><p className="eyebrow">SELECTED NODE</p><h2>{node.label}</h2></div><button className="icon-button" type="button" onClick={() => onSelect("")} title="Close details" aria-label="Close details"><X size={16} /></button></div>
    <p className="node-definition">{node.definition || "No definition in this graph record."}</p>
    <div className={`state-callout node-${node.tone}`}><strong>{TONE_LABELS[node.tone]}</strong>{node.state && <span>{node.state.evidenceCount} learning evidence {node.state.lastObservedAt ? `· ${formatDate(node.state.lastObservedAt)}` : ""}</span>}{node.aggregateCoverage && <span>{node.aggregateCoverage.observed} of {node.aggregateCoverage.total} descendants observed</span>}</div>
    {node.state && <dl className="state-details"><div><dt>Understanding</dt><dd>{node.state.receptive.replaceAll("_", " ")}</dd></div><div><dt>Use</dt><dd>{node.state.production.replaceAll("_", " ")}</dd></div><div><dt>Learning evidence</dt><dd>{Math.round(node.state.learningMetric * 100)} / 100</dd></div></dl>}
    {!node.state && node.tone === "unobserved" && <p className="muted-copy">No accepted evidence is attached to this node. Its grey state describes observation coverage, not a judgment about ability.</p>}
    <div className="inspector-actions"><button type="button" onClick={onExpand}>Expand neighborhood</button></div>
    <div className="relationship-list"><h3>Stored relationships <span>{edges.length}</span></h3>{edges.length ? edges.slice(0, 12).map(edge => <button type="button" key={`${edge.source}-${edge.target}-${edge.type}`} onClick={() => onSelect(other(edge))}><span>{edge.type}</span><strong>{model.nodes.find(item => item.id === other(edge))?.label ?? other(edge)}</strong></button>) : <p className="muted-copy">No displayed relationships.</p>}</div>
    <p className="node-id">{node.id}</p>
  </div>;
}

function GraphLegend() {
  const tones: LearningVisualTone[] = ["unobserved", "encountered", "understood", "assisted", "spontaneous", "repeated", "needs_support"];
  return <section className="graph-legend" aria-label="Graph legend"><div><strong>Visual key</strong><span>Colour depth reflects learning evidence, not a mastery probability.</span></div><div className="legend-items">{tones.map(tone => <span key={tone}><i className={`legend-swatch node-${tone}`} />{TONE_LABELS[tone]}</span>)}<span><i className="legend-swatch node-aggregate" />Group coverage</span></div></section>;
}

function layout(nodes: readonly LearningGraphRenderNode[]): Map<string, Point> {
  const result = new Map<string, Point>();
  const columns = 6;
  nodes.forEach((node, index) => result.set(node.id, { x: 95 + (index % columns) * 165, y: 62 + Math.floor(index / columns) * 94 }));
  return result;
}

function formatDate(value: string) { return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
