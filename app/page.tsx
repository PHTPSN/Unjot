"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { ArrowUp, Check, LoaderCircle, RotateCcw, Sparkles } from "lucide-react";
import type { LexicalToolResult, PublicModelStatus } from "../lib/chat-types.ts";
import { ConversationController, createApiReplyProvider } from "../lib/conversation.ts";
import { WorkspaceSidebar } from "./workspace-sidebar.tsx";
import { localized, useInterfaceLanguage } from "./use-interface-language.ts";
import { UnjotMark } from "./unjot-mark.tsx";

export default function ConversationPage() {
  const controller = useMemo(() => new ConversationController(createApiReplyProvider()), []);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [draft, setDraft] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [savingCorrection, setSavingCorrection] = useState(false);
  const [settingError, setSettingError] = useState("");
  const [modelStatus, setModelStatus] = useState<PublicModelStatus>({ configured: false, provider: null, model: null });
  const messagesEnd = useRef<HTMLDivElement>(null);
  const language = useInterfaceLanguage();
  const text = localized(language, {
    en: { brandAria: "Unjot conversation", loadError: "Could not load saved conversation. Reload to retry.", saveError: "Could not save correction preference. Try again.", chatError: "The message could not be completed.", knowledge: "Knowledge graph", learning: "My language graph", tools: "Tools", settings: "Settings", setup: "Model setup needed", conversation: "Conversation", ready: "LLM · local lexical tools", notReady: "LLM not configured", loading: "Loading saved conversation…", empty: "What would you like to talk about?", natural: "Natural version", contacting: "Contacting model", retry: "Retry", message: "Message", placeholder: "Write a message...", correction: "Correction", hint: "Enter to send · Shift + Enter for a new line", send: "Send message", privacy: "API key stays on this server" },
    zh: { brandAria: "Unjot 对话", loadError: "无法加载已保存的会话，请刷新重试。", saveError: "无法保存纠错偏好，请重试。", chatError: "消息未能完成。", knowledge: "知识图谱", learning: "我的语言图谱", tools: "工具", settings: "设置", setup: "需要配置模型", conversation: "对话", ready: "LLM · 本地词汇工具", notReady: "LLM 未配置", loading: "正在加载已保存的会话…", empty: "你想聊些什么？", natural: "自然表达", contacting: "正在联系模型", retry: "重试", message: "消息", placeholder: "输入消息…", correction: "纠错", hint: "回车发送 · Shift + 回车换行", send: "发送消息", privacy: "API Key 仅保存在此服务器" },
  });

  useEffect(() => {
    let active = true;
    const conversationId = new URLSearchParams(window.location.search).get("conversationId");
    fetch(`/api/conversation${conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : ""}`).then(async response => {
      if (!response.ok) throw new Error(text.loadError);
      const saved = await response.json();
      if (active) { controller.restore(saved); setLoaded(true); }
    }).catch(e => { if (active) setLoadError(e.message); });
    return () => { active = false; };
  }, [controller, text.loadError]);
  useEffect(() => {
    void fetch("/api/status")
      .then(response => response.json())
      .then((status: PublicModelStatus) => setModelStatus(status))
      .catch(() => setModelStatus({ configured: false, provider: null, model: null }));
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!loaded || savingCorrection || state.pending || state.error || !draft.trim()) return;
    const sending = controller.send(draft);
    setDraft("");
    await sending;
    messagesEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  };

  async function saveCorrection(correctionMode: boolean) {
    setSavingCorrection(true); setSettingError("");
    try {
      const response = await fetch("/api/response-preferences", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ correctionMode }) });
      if (!response.ok) throw new Error(text.saveError);
      controller.setCorrectionMode(correctionMode);
    } catch (e) { setSettingError(e instanceof Error ? e.message : text.saveError); }
    finally { setSavingCorrection(false); }
  }

  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  return (
    <main className="app-shell">
      <WorkspaceSidebar />
      <header className="topbar">
        <a className="brand" href="#conversation" aria-label={text.brandAria}>
          <UnjotMark className="brand-mark" priority />
          <span>unjot</span>
        </a>
        <div className="topbar-meta">
          <a href="/knowledge">{text.knowledge}</a>
          <a href="/learning">{text.learning}</a>
          <a href="/tools">{text.tools}</a>
          <a href="/settings">{text.settings}</a>
          <span className={`connection-dot ${modelStatus.configured ? "ready" : "not-ready"}`} />
          <span>{modelStatus.configured ? `${modelStatus.provider} · ${modelStatus.model}` : text.setup}</span>
        </div>

      </header>

      <section className="conversation" id="conversation" aria-labelledby="conversation-title">
        <div className="conversation-heading">
          <div>
            <h1 id="conversation-title">{text.conversation}</h1>
          </div>
          <div className={`mock-label ${modelStatus.configured ? "ready" : "not-ready"}`}>
            <span /><span>{modelStatus.configured ? text.ready : text.notReady}</span>
          </div>
        </div>

        {!loaded && <p role="status">{loadError || text.loading}</p>}
        {settingError && <p role="alert">{settingError}</p>}
        <div className="message-list" aria-live="polite" aria-busy={state.pending}>
          {loaded && state.turns.length === 0 && !state.pending && (
            <div className="empty-state">
              <div className="empty-icon"><Sparkles size={20} /></div>
              <p>{text.empty}</p>
            </div>
          )}
          {state.turns.map(turn => (
            <article className={`message-row ${turn.role}`} key={turn.id}>
              {turn.role === "assistant" && (
                <UnjotMark className="assistant-avatar" />
              )}
              <div className="message-content">
                {turn.role === "assistant" && turn.correction && (
                  <div className="correction-block" data-source-turn={turn.correction.sourceTurnId}>
                    <div className="correction-label"><Sparkles size={13} /> {text.natural}</div>
                    <p>{turn.correction.text}</p>
                  </div>
                )}
                {turn.role === "assistant" && (state.lookupResultsByTurnId[turn.id] ?? []).map((result, index) => (
                  <LookupResult key={`${turn.id}-${index}`} result={result} language={language} />
                ))}
                <div className={`bubble ${turn.role}`}>
                  {turn.role === "assistant" && <div className="speaker-label">Unjot</div>}
                  <p>{turn.text}</p>
                </div>
              </div>
            </article>
          ))}
          {state.pending && (
            <div className="pending-row" role="status">
              <UnjotMark className="assistant-avatar" />
          <div className="pending-bubble"><LoaderCircle size={15} className="spinner" /><span>{text.contacting}</span><i /><i /><i /></div>
            </div>
          )}
          <div ref={messagesEnd} />
        </div>

        {state.error && (
          <div className="error-banner" role="alert">
            <span>{language === "zh" ? text.chatError : state.error}</span>
            <button className="retry-button" type="button" onClick={() => void controller.retry()}>
              <RotateCcw size={14} /> {text.retry}
            </button>
          </div>
        )}

        <form className="composer" onSubmit={submit}>
          <label className="sr-only" htmlFor="message-input">{text.message}</label>
          <textarea
            id="message-input"
            value={draft}
            onChange={event => setDraft(event.target.value)}
            onKeyDown={onComposerKeyDown}
            placeholder={text.placeholder}
            rows={2}
            maxLength={4000}
            autoComplete="off"
          />
          <div className="composer-toolbar">
            <label
              className={`correction-toggle ${state.correctionMode ? "active" : ""}`}
            >
              <input
                className="switch-input"
                type="checkbox"
                checked={state.correctionMode}
                disabled={!loaded || savingCorrection}
                onChange={event => void saveCorrection(event.target.checked)}
              />
              <span className="switch-track"><span /></span>
              <span>{text.correction}</span>
            </label>
            <div className="composer-actions">
              <span className="key-hint">{text.hint}</span>
              <button
                className="send-button"
                type="submit"
                disabled={!loaded || savingCorrection || state.pending || !!state.error || !draft.trim()}
                aria-label={text.send}
                title={text.send}
              >
                {state.pending ? <LoaderCircle size={17} className="spinner" /> : <ArrowUp size={18} />}
              </button>
            </div>
          </div>
        </form>
        <p className="privacy-note"><Check size={13} /> {text.privacy}</p>
      </section>
    </main>
  );
}

function LookupResult({ result, language }: { result: LexicalToolResult; language: "zh" | "en" }) {
  const copy = localized(language, { en: { lookup: "Lookup", item: "Lexical item", neighbors: "Immediate neighbors", local: "local", noMatch: "No local match." }, zh: { lookup: "查询", item: "词汇项", neighbors: "直接相邻项", local: "本地", noMatch: "没有本地匹配。" } });
  const title = result.tool === "find_by_form"
    ? `${copy.lookup}: ${result.form}`
    : result.tool === "get_item"
      ? `${copy.item}: ${result.id}`
      : `${copy.neighbors}: ${result.id}`;
  const items = result.tool === "find_by_form"
    ? result.result
    : result.tool === "get_item"
      ? result.result ? [result.result] : []
      : result.result;

  return (
    <aside className="lookup-result" aria-label={language === "zh" ? "本地词汇查询结果" : "Local lexical lookup result"}>
      <div className="lookup-heading"><span>{title}</span><small>OEWN · {copy.local}</small></div>
      {items.length === 0 ? <p>{copy.noMatch}</p> : (
        <ul>
          {items.slice(0, 4).map(item => (
            <li key={item.id}>
              <strong>{"canonicalForm" in item ? item.canonicalForm : item.label}</strong>
              <span>{item.definition}</span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
