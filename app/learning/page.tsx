"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minus, Plus, RotateCcw, Search, X } from "lucide-react";
import type { PointerEvent as ReactPointerEvent, WheelEvent } from "react";
import type { LearningGraphRelation, LearningGraphRenderModel, LearningGraphRenderNode, LearningVisualTone } from "../../lib/graph/learning-adapter.ts";
import { localized, useInterfaceLanguage, type InterfaceLanguage } from "../use-interface-language.ts";
import "./learning.css";

const VIEWBOX = { width: 1000, height: 590 };
const TONE_LABELS_EN: Record<LearningVisualTone, string> = {
  unobserved: "Not observed",
  encountered: "Encountered",
  understood: "Understanding evidence",
  assisted: "Used with support",
  spontaneous: "Used independently",
  repeated: "Repeated independent use",
  needs_support: "Needs support",
  aggregate: "Coverage group",
};
const TONE_LABELS_ZH: Record<LearningVisualTone, string> = { unobserved: "尚未观察", encountered: "已接触", understood: "有理解证据", assisted: "在辅助下使用", spontaneous: "独立使用", repeated: "多次独立使用", needs_support: "需要帮助", aggregate: "覆盖组" };
const RECEPTIVE_LABELS = {
  en: { unobserved: "Not observed", encountered: "Encountered", understood: "Understood", needs_support: "Needs support" },
  zh: { unobserved: "尚未观察", encountered: "已接触", understood: "已理解", needs_support: "需要帮助" },
} as const;
const PRODUCTION_LABELS = {
  en: { none: "Not used", assisted_production: "Used with support", spontaneous_production: "Used independently", repeated_independent_use: "Repeated independent use" },
  zh: { none: "尚未使用", assisted_production: "在辅助下使用", spontaneous_production: "独立使用", repeated_independent_use: "多次独立使用" },
} as const;
const EMPTY_MODEL: LearningGraphRenderModel = { graphVersion: "oewn-2025", projectionVersion: "m5r-graph-v1", stateRevision: "0", nodes: [], edges: [] };
type Point = { x: number; y: number };
type GraphResponse = LearningGraphRenderModel & { hasMore?: boolean; emptyEvidence?: boolean; trackedCount?: number };

export default function LearningPage() {
  const language = useInterfaceLanguage();
  const text = localized(language, { en: { loadError: "Learning graph could not be loaded.", conversation: "Conversation", graph: "My language · evidence graph", eyebrow: "PERSONAL LANGUAGE GRAPH", title: "My language", intro: "See the expressions you have encountered, understood, and used, connected to the WordNet graph.", visible: "visible nodes", revision: "State revision", retry: "Retry", loading: "Loading your evidence graph…", emptyTitle: "No learning evidence yet", emptyBody: "Start a conversation and return here after an expression has been observed.", go: "Go to conversation", noEvidence: "No accepted learning evidence yet. The grey graph is real WordNet structure; its colours will reflect your evidence as you use English.", navigation: "Graph navigation", zoomIn: "Zoom in", zoomOut: "Zoom out", fit: "Fit graph", reset: "Reset view", hint: "Drag to pan · scroll to zoom · select a node for evidence", board: "Learner evidence graph", select: "Select a node", selectBody: "Its evidence and stored relationships will appear here.", limit: "Showing a bounded working set around your most recent evidence. Select a node to expand its neighborhood." }, zh: { loadError: "无法加载学习图谱。", conversation: "对话", graph: "我的语言 · evidence 图谱", eyebrow: "个人语言图谱", title: "我的语言", intro: "查看你接触、理解和使用过的表达，以及它们与 WordNet 图谱的联系。", visible: "个可见节点", revision: "状态版本", retry: "重试", loading: "正在加载你的 evidence 图谱…", emptyTitle: "还没有学习 evidence", emptyBody: "开始一段对话，在观察到表达后返回这里。", go: "前往对话", noEvidence: "尚无已接受的学习 evidence。灰色图谱是真实的 WordNet 结构；随着你使用英语，颜色会反映你的 evidence。", navigation: "图谱导航", zoomIn: "放大", zoomOut: "缩小", fit: "适应画布", reset: "重置视图", hint: "拖动平移 · 滚动缩放 · 选择节点查看 evidence", board: "学习者 evidence 图谱", select: "选择一个节点", selectBody: "其 evidence 和已存储关系会显示在这里。", limit: "当前显示最近 evidence 周围的有限工作集。选择节点可展开其邻域。" } });
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
      if (!response.ok) throw new Error(language === "zh" ? text.loadError : (value as unknown as { error?: string }).error ?? text.loadError);
      setModel(value); setFitKey(key => key + 1);
      if (focus && value.nodes.some(node => node.id === focus)) setSelectedId(focus);
    } catch (cause) { setError(language === "zh" ? text.loadError : cause instanceof Error ? cause.message : text.loadError); }
    finally { setLoading(false); }
  }, [language, text.loadError]);

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
    <nav className="learning-graph-nav"><a href="/">← {text.conversation}</a><span>{text.graph}</span></nav>
    <header className="learning-graph-heading">
      <div><p className="eyebrow">{text.eyebrow}</p><h1>{text.title}</h1><p>{text.intro}</p></div>
      <div className="graph-meta"><span>{model.nodes.length} {text.visible}</span><span>{text.revision} {model.stateRevision}</span></div>
    </header>

    {error && <div className="graph-alert" role="alert"><span>{error}</span><button type="button" onClick={() => void loadGraph(selectedId ?? undefined)}><RotateCcw size={14} /> {text.retry}</button></div>}
    {loading && <p className="graph-status" role="status">{text.loading}</p>}
    {!loading && !error && !model.nodes.length && <section className="graph-empty" aria-live="polite"><div className="empty-mark"><Search size={20} /></div><h2>{text.emptyTitle}</h2><p>{text.emptyBody}</p><a href="/">{text.go}</a></section>}

    {!loading && !error && model.nodes.length > 0 && <>
      {model.emptyEvidence && <p className="graph-evidence-note" role="status">{text.noEvidence}</p>}
      <section className="graph-toolbar" aria-label={text.navigation}>
        <div className="graph-zoom-controls">
          <button type="button" onClick={() => setZoom(value => Math.min(2.4, value * 1.15))} title={text.zoomIn} aria-label={text.zoomIn}><Plus size={16} /></button>
          <button type="button" onClick={() => setZoom(value => Math.max(.45, value * .87))} title={text.zoomOut} aria-label={text.zoomOut}><Minus size={16} /></button>
          <button type="button" onClick={() => setFitKey(key => key + 1)} title={text.fit} aria-label={text.fit}><Maximize2 size={16} /></button>
          <button type="button" onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }} title={text.reset} aria-label={text.reset}><RotateCcw size={16} /></button>
        </div>
        <span className="graph-hint">{text.hint}</span>
      </section>
      <section className="graph-layout">
        <div className="graph-board" aria-label={text.board}>
          <svg viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`} role="img" onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
            <g transform={`translate(${offset.x} ${offset.y}) scale(${zoom})`}>
              {model.edges.map(edge => <GraphEdge key={`${edge.source}-${edge.target}-${edge.type}`} edge={edge} positions={positions} selectedId={selectedId} />)}
              {model.nodes.map(node => <GraphNodeView key={node.id} language={language} node={node} point={positions.get(node.id)!} selected={node.id === selectedId} onSelect={() => setSelectedId(node.id)} />)}
            </g>
          </svg>
        </div>
        <aside className="node-inspector" aria-live="polite">
          {!selected && <div className="inspector-empty"><p>{text.select}</p><span>{text.selectBody}</span></div>}
          {selected && <NodeInspector language={language} node={selected} edges={selectedEdges} model={model} onSelect={setSelectedId} onExpand={() => void loadGraph(selected.id)} />}
        </aside>
      </section>
      <GraphLegend language={language} />
      {model.hasMore && <p className="graph-limit">{text.limit}</p>}
    </>}
  </main>;
}

function GraphNodeView({ language, node, point, selected, onSelect }: { language: InterfaceLanguage; node: LearningGraphRenderNode; point: Point; selected: boolean; onSelect: () => void }) {
  const label = node.label.length > 21 ? `${node.label.slice(0, 20)}…` : node.label;
  const coverage = node.aggregateCoverage && `${node.aggregateCoverage.observed}/${node.aggregateCoverage.total}`;
  const needsSupport = node.state?.needsSupport ?? node.tone === "needs_support";
  const tones = language === "zh" ? TONE_LABELS_ZH : TONE_LABELS_EN;
  return <g className={`learning-node node-${node.tone} ${needsSupport ? "has-support" : ""} ${selected ? "is-selected" : ""}`} transform={`translate(${point.x} ${point.y})`} onClick={event => { event.stopPropagation(); onSelect(); }} role="button" tabIndex={0} aria-label={`${node.label}, ${tones[node.tone]}${needsSupport && node.tone !== "needs_support" ? language === "zh" ? "，需要帮助" : ", needs support" : ""}`} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(); } }}>
    <rect x="-70" y="-27" width="140" height="54" rx="8" />
    <text className="node-label" textAnchor="middle" y={coverage ? -4 : 4}>{label}</text>
    <text className="node-kind" textAnchor="middle" y={coverage ? 13 : 19}>{coverage ? `${coverage} ${language === "zh" ? "个后代节点" : "descendants"}` : nodeTypeLabel(node.type, language)}</text>
    {needsSupport && <path className="support-mark" d="M56-20l8 8m0-8-8 8" />}
  </g>;
}

function GraphEdge({ edge, positions, selectedId }: { edge: LearningGraphRelation; positions: ReadonlyMap<string, Point>; selectedId: string | null }) {
  const source = positions.get(edge.source), target = positions.get(edge.target);
  if (!source || !target) return null;
  const active = selectedId === edge.source || selectedId === edge.target;
  return <line className={`graph-edge edge-${edge.category} ${active ? "is-active" : ""}`} x1={source.x} y1={source.y} x2={target.x} y2={target.y} />;
}

function NodeInspector({ language, node, edges, model, onSelect, onExpand }: { language: InterfaceLanguage; node: LearningGraphRenderNode; edges: readonly LearningGraphRelation[]; model: LearningGraphRenderModel; onSelect: (id: string) => void; onExpand: () => void }) {
  const text = localized(language, { en: { selected: "SELECTED NODE", close: "Close details", noDefinition: "No definition in this graph record.", evidence: "learning evidence", descendants: "descendants observed", understanding: "Understanding", use: "Use", learningEvidence: "Learning evidence", noEvidence: "No accepted evidence is attached to this node. Its grey state describes observation coverage, not a judgment about ability.", expand: "Expand neighborhood", relationships: "Stored relationships", none: "No displayed relationships." }, zh: { selected: "已选节点", close: "关闭详情", noDefinition: "此图谱记录中没有释义。", evidence: "条学习 evidence", descendants: "个后代节点已观察", understanding: "理解", use: "使用", learningEvidence: "学习 evidence", noEvidence: "此节点没有关联已接受的 evidence。灰色状态表示观察覆盖范围，而不是能力判断。", expand: "展开邻域", relationships: "已存储关系", none: "没有显示的关系。" } });
  const tones = language === "zh" ? TONE_LABELS_ZH : TONE_LABELS_EN;
  const other = (edge: LearningGraphRelation) => edge.source === node.id ? edge.target : edge.source;
  return <div>
    <div className="inspector-heading"><div><p className="eyebrow">{text.selected}</p><h2>{node.label}</h2></div><button className="icon-button" type="button" onClick={() => onSelect("")} title={text.close} aria-label={text.close}><X size={16} /></button></div>
    <p className="node-definition">{node.definition || text.noDefinition}</p>
    <div className={`state-callout node-${node.tone}`}><strong>{tones[node.tone]}</strong>{node.state && <span>{node.state.evidenceCount} {text.evidence} {node.state.lastObservedAt ? `· ${formatDate(node.state.lastObservedAt)}` : ""}</span>}{node.aggregateCoverage && <span>{node.aggregateCoverage.observed}/{node.aggregateCoverage.total} {text.descendants}</span>}</div>
    {node.state && <dl className="state-details"><div><dt>{text.understanding}</dt><dd>{RECEPTIVE_LABELS[language][node.state.receptive]}</dd></div><div><dt>{text.use}</dt><dd>{PRODUCTION_LABELS[language][node.state.production]}</dd></div><div><dt>{text.learningEvidence}</dt><dd>{Math.round(node.state.learningMetric * 100)} / 100</dd></div></dl>}
    {!node.state && node.tone === "unobserved" && <p className="muted-copy">{text.noEvidence}</p>}
    <div className="inspector-actions"><button type="button" onClick={onExpand}>{text.expand}</button></div>
    <div className="relationship-list"><h3>{text.relationships} <span>{edges.length}</span></h3>{edges.length ? edges.slice(0, 12).map(edge => <button type="button" key={`${edge.source}-${edge.target}-${edge.type}`} onClick={() => onSelect(other(edge))}><span>{edge.type}</span><strong>{model.nodes.find(item => item.id === other(edge))?.label ?? other(edge)}</strong></button>) : <p className="muted-copy">{text.none}</p>}</div>
    <p className="node-id">{node.id}</p>
  </div>;
}

function GraphLegend({ language }: { language: InterfaceLanguage }) {
  const tones: LearningVisualTone[] = ["unobserved", "encountered", "understood", "assisted", "spontaneous", "repeated", "needs_support"];
  const labels = language === "zh" ? TONE_LABELS_ZH : TONE_LABELS_EN;
  const text = localized(language, { en: { label: "Graph legend", key: "Visual key", note: "Colour depth reflects learning evidence, not a mastery probability.", group: "Group coverage" }, zh: { label: "图谱图例", key: "视觉说明", note: "颜色深度反映学习 evidence，而不是掌握概率。", group: "组覆盖范围" } });
  return <section className="graph-legend" aria-label={text.label}><div><strong>{text.key}</strong><span>{text.note}</span></div><div className="legend-items">{tones.map(tone => <span key={tone}><i className={`legend-swatch node-${tone}`} />{labels[tone]}</span>)}<span><i className="legend-swatch node-aggregate" />{text.group}</span></div></section>;
}

function layout(nodes: readonly LearningGraphRenderNode[]): Map<string, Point> {
  const result = new Map<string, Point>();
  const columns = 6;
  nodes.forEach((node, index) => result.set(node.id, { x: 95 + (index % columns) * 165, y: 62 + Math.floor(index / columns) * 94 }));
  return result;
}

function nodeTypeLabel(type: LearningGraphRenderNode["type"], language: InterfaceLanguage) {
  const labels = language === "zh"
    ? { root: "根节点", layer: "层级", pos: "词性", domain: "领域", concept: "概念", sense: "含义", lexeme: "词项", frame: "句型" }
    : { root: "Root", layer: "Layer", pos: "Part of speech", domain: "Domain", concept: "Concept", sense: "Meaning", lexeme: "Lexeme", frame: "Frame" };
  return labels[type];
}

function formatDate(value: string) { return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
