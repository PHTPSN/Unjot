"use client";

import { useEffect, useState } from "react";
import type { ExpressionCandidates, GraphManifest, KnowledgeNeighborhood, KnowledgeNode } from "../../packages/protocol/src/knowledge.ts";
import { absentPersonalState, assessmentFixtures } from "../../packages/golden-tests/fixtures/comprehension.ts";
import { COMPLEXITY_POLICY, DEFAULT_RESPONSE_PREFERENCES, STARTER_SET } from "../../packages/protocol/src/comprehension.ts";
import "./knowledge.css";

async function queryGraph<T>(params: Record<string, string>): Promise<T> {
  const response = await fetch(`/api/knowledge?${new URLSearchParams(params)}`);
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? "Graph request failed.");
  return value as T;
}
export default function KnowledgePage() {
  const [manifest, setManifest] = useState<GraphManifest | null>(null);
  const [expression, setExpression] = useState("bank");
  const [result, setResult] = useState<ExpressionCandidates | null>(null);
  const [view, setView] = useState<KnowledgeNeighborhood | null>(null);
  const [direction, setDirection] = useState("both");
  const [relation, setRelation] = useState("");
  const [limit, setLimit] = useState("10");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { queryGraph<GraphManifest>({ operation: "manifest" }).then(setManifest).catch(e => setError(e.message)); }, []);

  async function search(term: string, cursor?: string) {
    setPending(true); setError(""); setView(null);
    try {
      const next = await queryGraph<ExpressionCandidates>({ operation: "resolve_expression_candidates", expression: term, limit, ...(cursor ? { cursor } : {}) });
      setResult(next);
      if (!manifest) setManifest(await queryGraph<GraphManifest>({ operation: "manifest" }));
    } catch (e) { setResult(null); setError(e instanceof Error ? e.message : "Graph request failed."); }
    finally { setPending(false); }
  }
  async function inspect(id: string, cursor?: string) {
    setPending(true); setError("");
    try { setView(await queryGraph<KnowledgeNeighborhood>({ operation: "get_knowledge_neighborhood", id, direction, limit, ...(relation ? { relationType: relation } : {}), ...(cursor ? { cursor } : {}) })); }
    catch (e) { setView(null); setError(e instanceof Error ? e.message : "Graph request failed."); }
    finally { setPending(false); }
  }
  const nodeLabel = (id: string) => view?.nodes.find(n => n.id === id)?.label ?? id;
  function nodeButton(node: KnowledgeNode) {
    return <button disabled={pending} onClick={() => inspect(node.id)}><strong>{node.label}</strong> <span>{node.pos ?? node.kind}</span><small>{node.id}</small></button>;
  }
  return <main className="knowledge-page">
    <nav><a href="/">← Conversation</a><span>M3 · Read-only inspection</span></nav>
    <h1>Knowledge graph</h1>
    <p>Find stored meanings and follow their source relationships. A graph match does not describe what you understand.</p>
    {manifest && <section className="corpus-summary" aria-label="Corpus source">
      <strong>{manifest.source}</strong><span>{manifest.counts.nodes.toLocaleString("en-US")} nodes · {manifest.counts.senses.toLocaleString("en-US")} senses · {manifest.counts.sourceRelations.toLocaleString("en-US")} source relations</span>
      <small>{manifest.attribution} · <a href={manifest.licenseUrl}>{manifest.license}</a></small>
      <details><summary>Source version and coverage</summary><pre>{JSON.stringify(manifest, null, 2)}</pre></details>
    </section>}
    <form onSubmit={event => { event.preventDefault(); void search(expression); }}>
      <label>Expression<input value={expression} onChange={e => setExpression(e.target.value)} maxLength={300} required /></label>
      <label>Page size<input type="number" min="1" max="100" value={limit} onChange={e => setLimit(e.target.value)} required /></label>
      <button disabled={pending} type="submit">{pending ? "Loading…" : "Find meanings"}</button>
    </form>
    <div className="query-examples">Try: {["bank", "children", "figure out", "unjot-no-such-expression"].map(term => <button key={term} disabled={pending} onClick={() => { setExpression(term); void search(term); }}>{term}</button>)}</div>
    {error && <p role="alert" className="graph-error">{error}</p>}
    <div className="knowledge-columns">
      <section aria-label="Candidate meanings"><h2>Candidate meanings</h2>
        {!result && <p>Search an expression to inspect its meanings.</p>}
        {result && <><p role="status">{result.status} · {result.total} candidate meanings · {result.truncated ? "partial page" : "complete"}</p>
          {result.status === "ambiguous" && <p>Multiple meanings are available. No meaning has been selected automatically.</p>}
          {result.status === "missing" && <p>No matching form in this corpus. This is missing coverage, not evidence of difficulty.</p>}
          <ol className="candidate-list">{result.candidates.map(node => <li key={node.id}>{nodeButton(node)}<p>{node.definition}</p>{node.conceptId && <button disabled={pending} onClick={() => inspect(node.conceptId!)}>Open concept</button>}</li>)}</ol>
          {result.nextCursor && <button disabled={pending} onClick={() => search(result.expression, result.nextCursor!)}>Next meanings</button>}
        </>}
      </section>
      <section aria-label="Stored relationships"><h2>Stored relationships</h2>
        <div className="edge-filters"><label>Direction<select value={direction} onChange={e => setDirection(e.target.value)}><option value="both">Both</option><option value="incoming">Incoming</option><option value="outgoing">Outgoing</option></select></label>
          <label>Relation type<input placeholder="All types" value={relation} onChange={e => setRelation(e.target.value)} maxLength={80} /></label>
          <button disabled={pending || !view} onClick={() => view && inspect(view.rootId)}>Apply filters</button></div>
        {!view && <p>Select a meaning or concept to inspect its immediate relationships.</p>}
        {view && <><h3>{nodeLabel(view.rootId)}</h3><code>{view.rootId}</code><p>{view.total} matching edges · {view.truncated ? "partial page" : "complete"}</p>
          <ol className="edge-list">{view.edges.map(e => <li key={JSON.stringify([e.source, e.type, e.target])}>
            <button disabled={pending} onClick={() => inspect(e.source)}>{nodeLabel(e.source)}</button><strong> → {e.type} → </strong><button disabled={pending} onClick={() => inspect(e.target)}>{nodeLabel(e.target)}</button>
            <small>{e.category} · {e.provenance.source} · {e.provenance.origin}</small><code>{e.source} → {e.target}</code>
          </li>)}</ol>
          {view.nextCursor && <button disabled={pending} onClick={() => inspect(view.rootId, view.nextCursor!)}>Next relationships</button>}
          <details><summary>Nodes and directed edges</summary><pre>{JSON.stringify(view, null, 2)}</pre></details>
        </>}
      </section>
    </div>
    <section className="contract-examples"><h2>Response contract examples</h2><p>Synthetic M3 examples, not your learning history. Personal reads and comprehension assessment will be implemented in M4.</p>
      <details><summary>Meaning, comprehension, provisional estimates and absent state</summary><pre>{JSON.stringify({ assessmentFixtures, absentPersonalState }, null, 2)}</pre></details>
      <details><summary>Default preferences and versioned limits</summary><pre>{JSON.stringify({ preferences: DEFAULT_RESPONSE_PREFERENCES, complexity: COMPLEXITY_POLICY, starter: STARTER_SET }, null, 2)}</pre></details>
    </section>
  </main>;
}
