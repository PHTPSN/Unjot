"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { ArrowUp, Bot, Check, LoaderCircle, MessageSquareText, RotateCcw, Sparkles } from "lucide-react";
import type { LexicalToolResult, PublicModelStatus } from "../lib/chat-types.ts";
import { ConversationController, createApiReplyProvider } from "../lib/conversation.ts";

export default function ConversationPage() {
  const controller = useMemo(() => new ConversationController(createApiReplyProvider()), []);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [draft, setDraft] = useState("");
  const [modelStatus, setModelStatus] = useState<PublicModelStatus>({ configured: false, provider: null, model: null });
  const messagesEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void fetch("/api/status")
      .then(response => response.json())
      .then((status: PublicModelStatus) => setModelStatus(status))
      .catch(() => setModelStatus({ configured: false, provider: null, model: null }));
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (state.pending || !draft.trim()) return;
    const sending = controller.send(draft);
    setDraft("");
    await sending;
    messagesEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  };

  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#conversation" aria-label="Unjot conversation">
          <span className="brand-mark"><MessageSquareText size={19} strokeWidth={2.1} /></span>
          <span>unjot</span>
        </a>
        <div className="topbar-meta">
          <a href="/knowledge">Knowledge graph</a>
          <span className={`connection-dot ${modelStatus.configured ? "ready" : "not-ready"}`} />
          <span>{modelStatus.configured ? `${modelStatus.provider} · ${modelStatus.model}` : "Model setup needed"}</span>
        </div>
      </header>

      <section className="conversation" id="conversation" aria-labelledby="conversation-title">
        <div className="conversation-heading">
          <div>
            <h1 id="conversation-title">Conversation</h1>
          </div>
          <div className={`mock-label ${modelStatus.configured ? "ready" : "not-ready"}`}>
            <span /><span>{modelStatus.configured ? "LLM · local lexical tools" : "LLM not configured"}</span>
          </div>
        </div>

        <div className="message-list" aria-live="polite" aria-busy={state.pending}>
          {state.turns.length === 0 && !state.pending && (
            <div className="empty-state">
              <div className="empty-icon"><Sparkles size={20} /></div>
              <p>What would you like to talk about?</p>
            </div>
          )}
          {state.turns.map(turn => (
            <article className={`message-row ${turn.role}`} key={turn.id}>
              {turn.role === "assistant" && (
                <div className="assistant-avatar" aria-hidden="true"><Bot size={17} /></div>
              )}
              <div className="message-content">
                {turn.role === "assistant" && turn.correction && (
                  <div className="correction-block" data-source-turn={turn.correction.sourceTurnId}>
                    <div className="correction-label"><Sparkles size={13} /> Natural version</div>
                    <p>{turn.correction.text}</p>
                  </div>
                )}
                {turn.role === "assistant" && (state.lookupResultsByTurnId[turn.id] ?? []).map((result, index) => (
                  <LookupResult key={`${turn.id}-${index}`} result={result} />
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
              <div className="assistant-avatar"><Bot size={17} /></div>
          <div className="pending-bubble"><LoaderCircle size={15} className="spinner" /><span>Contacting model</span><i /><i /><i /></div>
            </div>
          )}
          <div ref={messagesEnd} />
        </div>

        {state.error && (
          <div className="error-banner" role="alert">
            <span>{state.error}</span>
            <button className="retry-button" type="button" onClick={() => void controller.retry()}>
              <RotateCcw size={14} /> Retry
            </button>
          </div>
        )}

        <form className="composer" onSubmit={submit}>
          <label className="sr-only" htmlFor="message-input">Message</label>
          <textarea
            id="message-input"
            value={draft}
            onChange={event => setDraft(event.target.value)}
            onKeyDown={onComposerKeyDown}
            placeholder="Write a message..."
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
                onChange={event => controller.setCorrectionMode(event.target.checked)}
              />
              <span className="switch-track"><span /></span>
              <span>Correction</span>
            </label>
            <div className="composer-actions">
              <span className="key-hint">Enter to send · Shift + Enter for a new line</span>
              <button
                className="send-button"
                type="submit"
                disabled={state.pending || !draft.trim()}
                aria-label="Send message"
                title="Send message"
              >
                {state.pending ? <LoaderCircle size={17} className="spinner" /> : <ArrowUp size={18} />}
              </button>
            </div>
          </div>
        </form>
        <p className="privacy-note"><Check size={13} /> API key stays on this server</p>
      </section>
    </main>
  );
}

function LookupResult({ result }: { result: LexicalToolResult }) {
  const title = result.tool === "find_by_form"
    ? `Lookup: ${result.form}`
    : result.tool === "get_item"
      ? `Lexical item: ${result.id}`
      : `Immediate neighbors: ${result.id}`;
  const items = result.tool === "find_by_form"
    ? result.result
    : result.tool === "get_item"
      ? result.result ? [result.result] : []
      : result.result;

  return (
    <aside className="lookup-result" aria-label="Local lexical lookup result">
      <div className="lookup-heading"><span>{title}</span><small>OEWN · local</small></div>
      {items.length === 0 ? <p>No local match.</p> : (
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
