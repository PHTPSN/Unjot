"use client";

import { useEffect, useState } from "react";

type Inspection = { stateRevision: string; totalItems: number; items: Array<{ lexical: { canonicalForm: string; definition: string } | null; assessment: { assessment: string; reason: string } | null; state: { itemId: string; stage: string; counts: Record<string, number>; evidenceIds: string[] } | null; evidence: Array<{ id: string; itemId: string; kind: string; rationale: string; turnId: string; originalText: string | null; quote: string | null; policyVersion: string; occurredAt: string }> }> };

export default function LearningPage() {
  const [data, setData] = useState<Inspection | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { fetch("/api/learner?inspect=1").then(async response => { const value = await response.json(); if (!response.ok) throw new Error(value.error); setData(value); }).catch(e => setError(e.message)); }, []);
  return <main className="learning-page">
    <nav><a href="/">← Conversation</a><span>Evidence and learner state</span></nav>
    <h1>Learning evidence</h1>
    <p>These records show the observations accepted from your original messages. A response or setting cannot assign mastery.</p>
    {error && <p role="alert">{error}</p>}
    {!data && !error && <p role="status">Loading local records…</p>}
    {data && <>
      <p className="revision">State revision {data.stateRevision} · Showing {data.items.length} of {data.totalItems} expressions, up to 50 recent observations each.</p>
      {data.items.length === 0 ? <p>No accepted evidence yet.</p> : data.items.map(item => <article className="evidence-item" key={item.state?.itemId ?? item.evidence[0]?.itemId}>
        <h2>{item.lexical?.canonicalForm ?? item.state?.itemId}</h2>
        <p>{item.lexical?.definition}</p>
        <p>Observed stage: <strong>{item.state?.stage.replaceAll("_", " ") ?? "unobserved"}</strong></p>
        {item.assessment && <p>Reading: <strong>{item.assessment.assessment.replaceAll("_", " ")}</strong>. {item.assessment.reason}</p>}
        {item.evidence.map(event => <details key={event.id}><summary>{event.kind.replaceAll("_", " ")} · {new Date(event.occurredAt).toLocaleString()}</summary><blockquote>{event.originalText}</blockquote><p>Observed span: “{event.quote}”</p><p>{event.rationale}</p><small>Turn {event.turnId} · {event.policyVersion}</small></details>)}
      </article>)}
    </>}
  </main>;
}
