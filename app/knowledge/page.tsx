"use client";

import { useEffect, useState } from "react";
import type { ExpressionCandidates, GraphManifest, KnowledgeNeighborhood, KnowledgeNode } from "../../packages/protocol/src/knowledge.ts";
import { absentPersonalState, assessmentFixtures } from "../../packages/golden-tests/fixtures/comprehension.ts";
import { COMPLEXITY_POLICY, DEFAULT_RESPONSE_PREFERENCES, STARTER_SET } from "../../packages/protocol/src/comprehension.ts";
import { localized, useInterfaceLanguage } from "../use-interface-language.ts";
import "./knowledge.css";

async function queryGraph<T>(params: Record<string, string>): Promise<T> {
  const response = await fetch(`/api/knowledge?${new URLSearchParams(params)}`);
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? "Graph request failed.");
  return value as T;
}
export default function KnowledgePage() {
  const language = useInterfaceLanguage();
  const text = localized(language, {
    en: { error: "Graph request failed.", conversation: "Conversation", inspection: "Read-only inspection", title: "Knowledge graph", intro: "Find stored meanings and follow their source relationships. A graph match does not describe what you understand.", source: "Corpus source", sourceDetails: "Source version and coverage", nodes: "nodes", senses: "senses", sourceRelations: "source relations", expression: "Expression", pageSize: "Page size", loading: "Loading…", find: "Find meanings", try: "Try", candidates: "Candidate meanings", searchPrompt: "Search an expression to inspect its meanings.", matched: "Matched", ambiguousStatus: "Ambiguous", missingStatus: "Missing", candidateCount: "candidate meanings", partial: "partial page", complete: "complete", ambiguous: "Multiple meanings are available. No meaning has been selected automatically.", missing: "No matching form exists in this corpus. This is missing coverage, not evidence of difficulty.", concept: "Open concept", nextMeanings: "Next meanings", relationships: "Stored relationships", direction: "Direction", both: "Both", incoming: "Incoming", outgoing: "Outgoing", relationType: "Relation type", allTypes: "All types", apply: "Apply filters", select: "Select a meaning or concept to inspect its immediate relationships.", edges: "matching edges", nextRelationships: "Next relationships", nodesEdges: "Nodes and directed edges", examples: "Response contract examples", exampleIntro: "Synthetic examples, not your learning history.", meaningExamples: "Meaning, comprehension, provisional estimates and absent state", preferenceExamples: "Default preferences and versioned limits" },
    zh: { error: "图谱请求失败。", conversation: "对话", inspection: "只读检查", title: "知识图谱", intro: "查找已存储的含义，并沿着来源关系进行浏览。图谱匹配并不代表你已经理解。", source: "语料来源", sourceDetails: "来源版本与覆盖范围", nodes: "个节点", senses: "个含义", sourceRelations: "条来源关系", expression: "表达", pageSize: "每页数量", loading: "加载中…", find: "查找含义", try: "试试", candidates: "候选含义", searchPrompt: "搜索一个表达以查看其含义。", matched: "已匹配", ambiguousStatus: "存在歧义", missingStatus: "未找到", candidateCount: "个候选含义", partial: "部分结果", complete: "完整结果", ambiguous: "存在多个含义，系统不会自动选择。", missing: "该语料库中没有匹配形式。这表示覆盖缺失，不代表学习困难。", concept: "打开概念", nextMeanings: "下一页含义", relationships: "已存储关系", direction: "方向", both: "双向", incoming: "传入", outgoing: "传出", relationType: "关系类型", allTypes: "全部类型", apply: "应用筛选", select: "选择一个含义或概念以查看其直接关系。", edges: "条匹配关系", nextRelationships: "下一页关系", nodesEdges: "节点与有向边", examples: "回复契约示例", exampleIntro: "合成示例，不属于你的学习记录。", meaningExamples: "含义、理解、临时估计和缺失状态", preferenceExamples: "默认偏好与版本化限制" },
  });
  const [manifest, setManifest] = useState<GraphManifest | null>(null);
  const [expression, setExpression] = useState("bank");
  const [result, setResult] = useState<ExpressionCandidates | null>(null);
  const [view, setView] = useState<KnowledgeNeighborhood | null>(null);
  const [direction, setDirection] = useState("both");
  const [relation, setRelation] = useState("");
  const [limit, setLimit] = useState("10");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { queryGraph<GraphManifest>({ operation: "manifest" }).then(setManifest).catch(e => setError(language === "zh" ? text.error : e instanceof Error ? e.message : text.error)); }, [language, text.error]);

  async function search(term: string, cursor?: string) {
    setPending(true); setError(""); setView(null);
    try {
      const next = await queryGraph<ExpressionCandidates>({ operation: "resolve_expression_candidates", expression: term, limit, ...(cursor ? { cursor } : {}) });
      setResult(next);
      if (!manifest) setManifest(await queryGraph<GraphManifest>({ operation: "manifest" }));
    } catch (e) { setResult(null); setError(language === "zh" ? text.error : e instanceof Error ? e.message : text.error); }
    finally { setPending(false); }
  }
  async function inspect(id: string, cursor?: string) {
    setPending(true); setError("");
    try { setView(await queryGraph<KnowledgeNeighborhood>({ operation: "get_knowledge_neighborhood", id, direction, limit, ...(relation ? { relationType: relation } : {}), ...(cursor ? { cursor } : {}) })); }
    catch (e) { setView(null); setError(language === "zh" ? text.error : e instanceof Error ? e.message : text.error); }
    finally { setPending(false); }
  }
  const nodeLabel = (id: string) => view?.nodes.find(n => n.id === id)?.label ?? id;
  function nodeButton(node: KnowledgeNode) {
    return <button disabled={pending} onClick={() => inspect(node.id)}><strong>{node.label}</strong> <span>{node.pos ?? node.kind}</span><small>{node.id}</small></button>;
  }
  return <main className="knowledge-page">
    <nav><a href="/">← {text.conversation}</a><span>M3 · {text.inspection}</span></nav>
    <h1>{text.title}</h1>
    <p>{text.intro}</p>
    {manifest && <section className="corpus-summary" aria-label={text.source}>
      <strong>{manifest.source}</strong><span>{manifest.counts.nodes.toLocaleString(language)} {text.nodes} · {manifest.counts.senses.toLocaleString(language)} {text.senses} · {manifest.counts.sourceRelations.toLocaleString(language)} {text.sourceRelations}</span>
      <small>{manifest.attribution} · <a href={manifest.licenseUrl}>{manifest.license}</a></small>
      <details><summary>{text.sourceDetails}</summary><pre>{JSON.stringify(manifest, null, 2)}</pre></details>
    </section>}
    <form onSubmit={event => { event.preventDefault(); void search(expression); }}>
      <label>{text.expression}<input value={expression} onChange={e => setExpression(e.target.value)} maxLength={300} required /></label>
      <label>{text.pageSize}<input type="number" min="1" max="100" value={limit} onChange={e => setLimit(e.target.value)} required /></label>
      <button disabled={pending} type="submit">{pending ? text.loading : text.find}</button>
    </form>
    <div className="query-examples">{text.try}: {["bank", "children", "figure out", "unjot-no-such-expression"].map(term => <button key={term} disabled={pending} onClick={() => { setExpression(term); void search(term); }}>{term}</button>)}</div>
    {error && <p role="alert" className="graph-error">{error}</p>}
    <div className="knowledge-columns">
      <section aria-label={text.candidates}><h2>{text.candidates}</h2>
        {!result && <p>{text.searchPrompt}</p>}
        {result && <><p role="status">{{ matched: text.matched, ambiguous: text.ambiguousStatus, missing: text.missingStatus }[result.status]} · {result.total} {text.candidateCount} · {result.truncated ? text.partial : text.complete}</p>
          {result.status === "ambiguous" && <p>{text.ambiguous}</p>}
          {result.status === "missing" && <p>{text.missing}</p>}
          <ol className="candidate-list">{result.candidates.map(node => <li key={node.id}>{nodeButton(node)}<p>{node.definition}</p>{node.conceptId && <button disabled={pending} onClick={() => inspect(node.conceptId!)}>{text.concept}</button>}</li>)}</ol>
          {result.nextCursor && <button disabled={pending} onClick={() => search(result.expression, result.nextCursor!)}>{text.nextMeanings}</button>}
        </>}
      </section>
      <section aria-label={text.relationships}><h2>{text.relationships}</h2>
        <div className="edge-filters"><label>{text.direction}<select value={direction} onChange={e => setDirection(e.target.value)}><option value="both">{text.both}</option><option value="incoming">{text.incoming}</option><option value="outgoing">{text.outgoing}</option></select></label>
          <label>{text.relationType}<input placeholder={text.allTypes} value={relation} onChange={e => setRelation(e.target.value)} maxLength={80} /></label>
          <button disabled={pending || !view} onClick={() => view && inspect(view.rootId)}>{text.apply}</button></div>
        {!view && <p>{text.select}</p>}
        {view && <><h3>{nodeLabel(view.rootId)}</h3><code>{view.rootId}</code><p>{view.total} {text.edges} · {view.truncated ? text.partial : text.complete}</p>
          <ol className="edge-list">{view.edges.map(e => <li key={JSON.stringify([e.source, e.type, e.target])}>
            <button disabled={pending} onClick={() => inspect(e.source)}>{nodeLabel(e.source)}</button><strong> → {e.type} → </strong><button disabled={pending} onClick={() => inspect(e.target)}>{nodeLabel(e.target)}</button>
            <small>{e.category} · {e.provenance.source} · {e.provenance.origin}</small><code>{e.source} → {e.target}</code>
          </li>)}</ol>
          {view.nextCursor && <button disabled={pending} onClick={() => inspect(view.rootId, view.nextCursor!)}>{text.nextRelationships}</button>}
          <details><summary>{text.nodesEdges}</summary><pre>{JSON.stringify(view, null, 2)}</pre></details>
        </>}
      </section>
    </div>
    <section className="contract-examples"><h2>{text.examples}</h2><p>{text.exampleIntro}</p>
      <details><summary>{text.meaningExamples}</summary><pre>{JSON.stringify({ assessmentFixtures, absentPersonalState }, null, 2)}</pre></details>
      <details><summary>{text.preferenceExamples}</summary><pre>{JSON.stringify({ preferences: DEFAULT_RESPONSE_PREFERENCES, complexity: COMPLEXITY_POLICY, starter: STARTER_SET }, null, 2)}</pre></details>
    </section>
  </main>;
}
