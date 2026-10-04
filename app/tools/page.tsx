"use client";

import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { BookOpen, MessageSquare, Play, WandSparkles } from "lucide-react";
import type { ExplainResult, ScenarioResult } from "../../packages/protocol/src/m7-workflows.ts";
import { localized, useInterfaceLanguage, type InterfaceLanguage } from "../use-interface-language.ts";
import "./tools.css";

export default function ToolsPage() {
  const language = useInterfaceLanguage();
  const text = localized(language, { en: { explainFailed: "Explain failed.", scenarioFailed: "Scenario failed.", conversation: "Conversation", tools: "Tools", title: "Practice with context", intro: "Explain a language item or start a bounded scenario. Generated language is checked against your current learner state.", explain: "Explain", explainIntro: "Get a contextual explanation, alternatives, register, and nuance for an expression or question.", expression: "Expression or question", expressionPlaceholder: "What does “figure out” mean here?", context: "Context", optional: "optional", contextPlaceholder: "Add the sentence or situation.", explaining: "Explaining…", explanation: "Explanation", register: "Register", nuance: "Nuance", notSpecified: "Not specified", alternatives: "Alternatives", scenario: "Scenario", scenarioIntro: "Turn a real situation into a short speaking opportunity. Unobserved success is never credited automatically.", situation: "Situation", situationPlaceholder: "I need to explain a delayed project to a client.", target: "Target sense ID", creating: "Creating…", start: "Start scenario", yourRole: "Your role", partnerRole: "Partner role", checked: "Checked result" }, zh: { explainFailed: "解释失败。", scenarioFailed: "创建情境失败。", conversation: "对话", tools: "工具", title: "在情境中练习", intro: "解释一个语言项，或开始一个有限情境。生成的语言会根据你当前的学习者状态进行检查。", explain: "解释", explainIntro: "获取表达或问题在具体语境中的解释、替代表达、语域和细微差别。", expression: "表达或问题", expressionPlaceholder: "这里的“figure out”是什么意思？", context: "语境", optional: "可选", contextPlaceholder: "补充句子或情境。", explaining: "解释中…", explanation: "解释", register: "语域", nuance: "细微差别", notSpecified: "未指定", alternatives: "替代表达", scenario: "情境", scenarioIntro: "把真实情况转化为简短的口语练习机会。未观察到的成功不会被自动计入。", situation: "情况", situationPlaceholder: "我需要向客户解释项目延期。", target: "目标 sense ID", creating: "创建中…", start: "开始情境", yourRole: "你的角色", partnerRole: "对方角色", checked: "已检查结果" } });
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
    try { const response = await fetch("/api/tools/explain", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workflow: "explain", text: explainText, context: explainContext, itemId: null }) }); const value = await response.json(); if (!response.ok) throw new Error(language === "zh" ? text.explainFailed : value.error ?? text.explainFailed); setExplainResult(value); }
    catch (e) { setError(language === "zh" ? text.explainFailed : e instanceof Error ? e.message : text.explainFailed); }
    finally { setBusy(null); }
  }
  async function submitScenario(event: FormEvent) {
    event.preventDefault(); if (!scenarioDescription.trim() || busy) return;
    setBusy("scenario"); setError("");
    try { const targetItemIds = scenarioTarget.trim() ? [scenarioTarget.trim()] : []; const response = await fetch("/api/tools/scenario", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workflow: "scenario", description: scenarioDescription, targetItemIds }) }); const value = await response.json(); if (!response.ok) throw new Error(language === "zh" ? text.scenarioFailed : value.error ?? text.scenarioFailed); setScenarioResult(value); }
    catch (e) { setError(language === "zh" ? text.scenarioFailed : e instanceof Error ? e.message : text.scenarioFailed); }
    finally { setBusy(null); }
  }
  return <main className="tools-shell">
    <header className="tools-header"><a href="/" className="tools-back">← {text.conversation}</a><div><p className="eyebrow">M7 {text.tools}</p><h1>{text.title}</h1><p>{text.intro}</p></div></header>
    {error && <p className="tools-error" role="alert">{error}</p>}
    <div className="tools-grid">
      <section className="tool-panel"><div className="tool-title"><BookOpen size={18} /><h2>{text.explain}</h2></div><p>{text.explainIntro}</p><form onSubmit={submitExplain}><label>{text.expression}<textarea value={explainText} onChange={e => setExplainText(e.target.value)} maxLength={4000} rows={3} placeholder={text.expressionPlaceholder} required /></label><label>{text.context} <span>({text.optional})</span><textarea value={explainContext} onChange={e => setExplainContext(e.target.value)} maxLength={2000} rows={2} placeholder={text.contextPlaceholder} /></label><button type="submit" disabled={busy !== null || !explainText.trim()}><WandSparkles size={16} />{busy === "explain" ? text.explaining : text.explain}</button></form>{explainResult && <WorkflowResult language={language} title={explainResult.target?.canonicalForm ?? text.explanation}><p>{explainResult.explanation}</p><dl><dt>{text.register}</dt><dd>{explainResult.register || text.notSpecified}</dd><dt>{text.nuance}</dt><dd>{explainResult.nuance || text.notSpecified}</dd></dl>{explainResult.alternatives.length > 0 && <><h3>{text.alternatives}</h3><ul>{explainResult.alternatives.map(item => <li key={item}>{item}</li>)}</ul></>}</WorkflowResult>}</section>
      <section className="tool-panel"><div className="tool-title"><MessageSquare size={18} /><h2>{text.scenario}</h2></div><p>{text.scenarioIntro}</p><form onSubmit={submitScenario}><label>{text.situation}<textarea value={scenarioDescription} onChange={e => setScenarioDescription(e.target.value)} maxLength={2000} rows={4} placeholder={text.situationPlaceholder} required /></label><label>{text.target} <span>({text.optional})</span><input value={scenarioTarget} onChange={e => setScenarioTarget(e.target.value)} maxLength={300} placeholder="sense:figure_out%2:31:00::" /></label><button type="submit" disabled={busy !== null || !scenarioDescription.trim()}><Play size={16} />{busy === "scenario" ? text.creating : text.start}</button></form>{scenarioResult && <WorkflowResult language={language} title={scenarioResult.objective}><p><strong>{scenarioResult.situation}</strong></p><p>{scenarioResult.opening}</p><dl><dt>{text.yourRole}</dt><dd>{scenarioResult.learnerRole}</dd><dt>{text.partnerRole}</dt><dd>{scenarioResult.aiRole}</dd></dl></WorkflowResult>}</section>
    </div>
  </main>;
}

function WorkflowResult({ language, title, children }: { language: InterfaceLanguage; title: string; children: ReactNode }) { return <article className="workflow-result"><div className="result-label">{language === "zh" ? "已检查结果" : "Checked result"}</div><h3>{title}</h3>{children}</article>; }
