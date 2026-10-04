"use client";

import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { BookOpen, MessageSquare, Play, WandSparkles } from "lucide-react";
import type { ExplainResult, ScenarioResult } from "../../packages/protocol/src/m7-workflows.ts";
import "./tools.css";

export default function ToolsPage() {
  const [explainText, setExplainText] = useState("");
  const [explainContext, setExplainContext] = useState("");
  const [explainResult, setExplainResult] = useState<ExplainResult | null>(null);
  const [scenarioDescription, setScenarioDescription] = useState("");
  const [scenarioTarget, setScenarioTarget] = useState("");
  const [scenarioResult, setScenarioResult] = useState<ScenarioResult | null>(null);
  const [busy, setBusy] = useState<"explain" | "scenario" | null>(null);
  const [error, setError] = useState("");

  async function submitExplain(event: FormEvent) {
    event.preventDefault(); if (!explainText.trim() || busy) return;
    setBusy("explain"); setError("");
    try { const response = await fetch("/api/tools/explain", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workflow: "explain", text: explainText, context: explainContext, itemId: null }) }); const value = await response.json(); if (!response.ok) throw new Error(value.error ?? "Explain failed."); setExplainResult(value); }
    catch (e) { setError(e instanceof Error ? e.message : "Explain failed."); }
    finally { setBusy(null); }
  }
  async function submitScenario(event: FormEvent) {
    event.preventDefault(); if (!scenarioDescription.trim() || busy) return;
    setBusy("scenario"); setError("");
    try { const targetItemIds = scenarioTarget.trim() ? [scenarioTarget.trim()] : []; const response = await fetch("/api/tools/scenario", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workflow: "scenario", description: scenarioDescription, targetItemIds }) }); const value = await response.json(); if (!response.ok) throw new Error(value.error ?? "Scenario failed."); setScenarioResult(value); }
    catch (e) { setError(e instanceof Error ? e.message : "Scenario failed."); }
    finally { setBusy(null); }
  }
  return <main className="tools-shell">
    <header className="tools-header"><a href="/" className="tools-back">← Conversation</a><div><p className="eyebrow">M7 tools</p><h1>Practice with context</h1><p>Explain a language item or start a bounded scenario. Generated language is checked against your current learner state.</p></div></header>
    {error && <p className="tools-error" role="alert">{error}</p>}
    <div className="tools-grid">
      <section className="tool-panel"><div className="tool-title"><BookOpen size={18} /><h2>Explain</h2></div><p>Get a contextual explanation, alternatives, register, and nuance for an expression or question.</p><form onSubmit={submitExplain}><label>Expression or question<textarea value={explainText} onChange={e => setExplainText(e.target.value)} maxLength={4000} rows={3} placeholder="What does “figure out” mean here?" required /></label><label>Context <span>(optional)</span><textarea value={explainContext} onChange={e => setExplainContext(e.target.value)} maxLength={2000} rows={2} placeholder="Add the sentence or situation." /></label><button type="submit" disabled={busy !== null || !explainText.trim()}><WandSparkles size={16} />{busy === "explain" ? "Explaining…" : "Explain"}</button></form>{explainResult && <WorkflowResult title={explainResult.target?.canonicalForm ?? "Explanation"}><p>{explainResult.explanation}</p><dl><dt>Register</dt><dd>{explainResult.register || "Not specified"}</dd><dt>Nuance</dt><dd>{explainResult.nuance || "Not specified"}</dd></dl>{explainResult.alternatives.length > 0 && <><h3>Alternatives</h3><ul>{explainResult.alternatives.map(item => <li key={item}>{item}</li>)}</ul></>}</WorkflowResult>}</section>
      <section className="tool-panel"><div className="tool-title"><MessageSquare size={18} /><h2>Scenario</h2></div><p>Turn a real situation into a short speaking opportunity. Unobserved success is never credited automatically.</p><form onSubmit={submitScenario}><label>Situation<textarea value={scenarioDescription} onChange={e => setScenarioDescription(e.target.value)} maxLength={2000} rows={4} placeholder="I need to explain a delayed project to a client." required /></label><label>Target sense ID <span>(optional)</span><input value={scenarioTarget} onChange={e => setScenarioTarget(e.target.value)} maxLength={300} placeholder="sense:figure_out%2:31:00::" /></label><button type="submit" disabled={busy !== null || !scenarioDescription.trim()}><Play size={16} />{busy === "scenario" ? "Creating…" : "Start scenario"}</button></form>{scenarioResult && <WorkflowResult title={scenarioResult.objective}><p><strong>{scenarioResult.situation}</strong></p><p>{scenarioResult.opening}</p><dl><dt>Your role</dt><dd>{scenarioResult.learnerRole}</dd><dt>Partner role</dt><dd>{scenarioResult.aiRole}</dd></dl></WorkflowResult>}</section>
    </div>
  </main>;
}

function WorkflowResult({ title, children }: { title: string; children: ReactNode }) { return <article className="workflow-result"><div className="result-label">Checked result</div><h3>{title}</h3>{children}</article>; }
