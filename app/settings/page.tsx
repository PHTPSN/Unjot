"use client";

import { useEffect, useRef, useState } from "react";
import { PREFERENCE_BOUNDS, type ResponsePreferences } from "../../packages/protocol/src/comprehension.ts";
import { UnjotMark } from "../unjot-mark.tsx";
import "./settings.css";

type Language = "zh" | "en";
type PublicSettings = {
  provider: string;
  model: string;
  baseUrl: string;
  language: Language;
  apiKeyConfigured: boolean;
  configured: boolean;
  settingsSource: "saved" | "environment";
};
type ArchivedConversation = { id: string; title: string; updatedAt: string };

const copy = {
  zh: {
    settings: "设置",
    provider: "模型提供商",
    model: "模型",
    apiKey: "API Key",
    baseUrl: "Base URL",
    connection: "连接状态",
    connected: "已配置",
    disconnected: "未配置",
    configurationSource: "配置来源",
    savedSource: "前端保存的设置",
    environmentSource: ".env 环境配置",
    configurationHelp: "前端保存的模型设置会覆盖 .env。若要让 .env 生效，请移除覆盖项；修改 .env 后还需要重启服务器。",
    useEnvironment: "使用 .env 配置",
    resettingEnvironment: "正在重置…",
    environmentApplied: "已移除前端覆盖，当前使用 .env 配置。",
    environmentResetError: "无法切换到 .env 配置。",
    language: "界面语言",
    archived: "已归档会话",
    noArchived: "没有已归档会话",
    restore: "恢复",
    delete: "删除",
    responsePreferences: "回复偏好",
    unfamiliarRatio: "陌生英语比例",
    ratioHint: "控制回复中尚未熟悉的英语比例",
    chineseSupport: "中文辅助",
    chineseSupportHelpLabel: "中文辅助说明",
    chineseSupportHelp: "如果当前水平不足且陌生英语比例过低，关闭此选项可能导致回复失败。",
    replyStrategy: "回复策略",
    replyStrategyHelpLabel: "为什么会有这个设置",
    replyStrategyHelp: "将多轮工作流合并，提升回复速度。使用大模型时建议打开。",
    synthesis: "综合生成",
    stepwise: "分步生成",
    startingLevel: "起始水平",
    noEstimate: "不设置",
    savePreferences: "保存偏好",
    saving: "保存中…",
    saved: "已保存",
    testConnection: "测试连接",
    testing: "测试中…",
    testSucceeded: "连接成功",
    testFailed: "连接失败",
    loadArchivedError: "无法加载已归档会话。",
    loadPreferencesError: "无法加载回复偏好。",
    savePreferencesError: "无法保存回复偏好。",
    restoreError: "无法恢复会话。",
    deleteError: "无法删除会话。",
    clearData: "清空用户数据",
    clearDataDescription: "永久删除所有对话、项目、学习 evidence、回复偏好和前端保存的模型配置。.env 与内置 WordNet 数据会保留。",
    clearDataButton: "清空所有数据",
    clearingData: "正在清空…",
    clearDataWarning: "要永久清空所有用户数据吗？所有对话、项目、学习 evidence、回复偏好和前端保存的模型配置（包括 API Key）都会被删除，且无法撤销。.env 与内置 WordNet 数据不会被删除。",
    clearDataError: "无法清空用户数据。",
  },
  en: {
    settings: "Settings",
    provider: "Model provider",
    model: "Model",
    apiKey: "API Key",
    baseUrl: "Base URL",
    connection: "Connection",
    connected: "Configured",
    disconnected: "Not configured",
    configurationSource: "Configuration source",
    savedSource: "Frontend-saved settings",
    environmentSource: ".env environment settings",
    configurationHelp: "Frontend-saved model settings override .env. Remove the override to use .env, and restart the server after changing the environment file.",
    useEnvironment: "Use .env configuration",
    resettingEnvironment: "Resetting…",
    environmentApplied: "Frontend override removed. The app is now using .env configuration.",
    environmentResetError: "Could not switch to .env configuration.",
    language: "Interface language",
    archived: "Archived conversations",
    noArchived: "No archived conversations",
    restore: "Restore",
    delete: "Delete",
    responsePreferences: "Response preferences",
    unfamiliarRatio: "Unfamiliar English ratio",
    ratioHint: "Controls the share of unfamiliar English in replies",
    chineseSupport: "Chinese support",
    chineseSupportHelpLabel: "About Chinese support",
    chineseSupportHelp: "If the current level is insufficient and the unfamiliar-English ratio is too low, disabling this option may cause reply generation to fail.",
    replyStrategy: "Reply strategy",
    replyStrategyHelpLabel: "Why this setting exists",
    replyStrategyHelp: "Combines a multi-step workflow to improve reply speed. Recommended when using a large model.",
    synthesis: "Synthesis",
    stepwise: "Stepwise",
    startingLevel: "Starting level",
    noEstimate: "No estimate",
    savePreferences: "Save preferences",
    saving: "Saving…",
    saved: "Saved",
    testConnection: "Test connection",
    testing: "Testing…",
    testSucceeded: "Connection successful",
    testFailed: "Connection failed",
    loadArchivedError: "Could not load archived conversations.",
    loadPreferencesError: "Could not load response preferences.",
    savePreferencesError: "Could not save response preferences.",
    restoreError: "Could not restore conversation.",
    deleteError: "Could not delete conversation.",
    clearData: "Clear user data",
    clearDataDescription: "Permanently deletes all conversations, projects, learning evidence, response preferences, and frontend-saved model settings. Your .env file and bundled WordNet data are kept.",
    clearDataButton: "Clear all data",
    clearingData: "Clearing…",
    clearDataWarning: "Permanently clear all user data? All conversations, projects, learning evidence, response preferences, and frontend-saved model settings (including the API key) will be deleted. This cannot be undone. Your .env file and bundled WordNet data will not be deleted.",
    clearDataError: "Could not clear user data.",
  },
} as const;

const emptySettings: PublicSettings = {
  provider: "",
  model: "",
  baseUrl: "",
  language: "en",
  apiKeyConfigured: false,
  configured: false,
  settingsSource: "environment",
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<PublicSettings>(emptySettings);
  const [apiKey, setApiKey] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [archivedConversations, setArchivedConversations] = useState<ArchivedConversation[]>([]);
  const [workspaceError, setWorkspaceError] = useState("");
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [preferences, setPreferences] = useState<ResponsePreferences | null>(null);
  const [preferencesBusy, setPreferencesBusy] = useState(false);
  const [preferencesMessage, setPreferencesMessage] = useState("");
  const [testBusy, setTestBusy] = useState(false);
  const [testMessage, setTestMessage] = useState("");
  const [configurationBusy, setConfigurationBusy] = useState(false);
  const [configurationMessage, setConfigurationMessage] = useState("");
  const [dataBusy, setDataBusy] = useState(false);
  const [dataMessage, setDataMessage] = useState("");
  const clearInProgress = useRef(false);
  const lastSaved = useRef("");
  const text = copy[settings.language];
  useEffect(() => { document.documentElement.lang = settings.language === "zh" ? "zh-CN" : "en"; }, [settings.language]);

  useEffect(() => {
    let active = true;
    void fetch("/api/settings", { cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<PublicSettings>;
      })
      .then(value => {
        if (!active) return;
        setSettings(value);
        lastSaved.current = signature(value, "");
        setLoaded(true);
      })
      .catch(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, []);

  async function loadArchivedConversations() {
    const response = await fetch("/api/workspace", { cache: "no-store" });
    const value = await response.json() as { archivedConversations?: ArchivedConversation[]; error?: string };
    if (!response.ok) throw new Error(settings.language === "zh" ? text.loadArchivedError : value.error || text.loadArchivedError);
    setArchivedConversations(value.archivedConversations ?? []);
  }

  useEffect(() => { void loadArchivedConversations().catch(cause => setWorkspaceError(settings.language === "zh" ? text.loadArchivedError : cause instanceof Error ? cause.message : text.loadArchivedError)); }, [settings.language, text.loadArchivedError]);
  useEffect(() => {
    void fetch("/api/response-preferences", { cache: "no-store" })
      .then(async response => { const value = await response.json(); if (!response.ok) throw new Error(value.error); setPreferences(value); })
      .catch(cause => setPreferencesMessage(settings.language === "zh" ? text.loadPreferencesError : cause instanceof Error ? cause.message : text.loadPreferencesError));
  }, [settings.language, text.loadPreferencesError]);

  async function savePreferences() {
    if (!preferences || preferencesBusy) return;
    setPreferencesBusy(true); setPreferencesMessage("");
    try {
      const { maxUnfamiliarRatio, allowChineseSupport, startingLevel, orchestrationMode } = preferences;
      const response = await fetch("/api/response-preferences", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ maxUnfamiliarRatio, allowChineseSupport, startingLevel, orchestrationMode }) });
      const value = await response.json() as ResponsePreferences & { error?: string };
      if (!response.ok) throw new Error(settings.language === "zh" ? text.savePreferencesError : value.error || text.savePreferencesError);
      setPreferences(value); setPreferencesMessage(text.saved);
    } catch (cause) { setPreferencesMessage(settings.language === "zh" ? text.savePreferencesError : cause instanceof Error ? cause.message : text.savePreferencesError); }
    finally { setPreferencesBusy(false); }
  }

  async function changeReplyStrategy(orchestrationMode: ResponsePreferences["orchestrationMode"]) {
    if (!preferences || preferencesBusy) return;
    const previous = preferences;
    setPreferences({ ...preferences, orchestrationMode });
    setPreferencesBusy(true); setPreferencesMessage("");
    try {
      const response = await fetch("/api/response-preferences", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ orchestrationMode }) });
      const value = await response.json() as ResponsePreferences & { error?: string };
      if (!response.ok) throw new Error(settings.language === "zh" ? text.savePreferencesError : value.error || text.savePreferencesError);
      setPreferences(value); setPreferencesMessage(text.saved);
    } catch (cause) {
      setPreferences(previous);
      setPreferencesMessage(settings.language === "zh" ? text.savePreferencesError : cause instanceof Error ? cause.message : text.savePreferencesError);
    } finally { setPreferencesBusy(false); }
  }

  async function testConnection() {
    if (testBusy) return;
    setTestBusy(true); setTestMessage("");
    try {
      const response = await fetch("/api/settings/test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: settings.provider, model: settings.model, apiKey, baseUrl: settings.baseUrl }) });
      const value = await response.json() as { error?: string };
      if (!response.ok) throw new Error(value.error || text.testFailed);
      setTestMessage(text.testSucceeded);
    } catch (cause) { setTestMessage(settings.language === "zh" ? text.testFailed : `${text.testFailed}: ${cause instanceof Error ? cause.message : ""}`); }
    finally { setTestBusy(false); }
  }

  async function useEnvironmentConfiguration() {
    if (configurationBusy || settings.settingsSource === "environment") return;
    setConfigurationBusy(true); setConfigurationMessage("");
    try {
      const response = await fetch("/api/settings", { method: "DELETE" });
      const value = await response.json() as PublicSettings & { error?: string };
      if (!response.ok) throw new Error(value.error || text.environmentResetError);
      setApiKey("");
      setSettings(value);
      lastSaved.current = signature(value, "");
      setConfigurationMessage(text.environmentApplied);
    } catch {
      setConfigurationMessage(text.environmentResetError);
    } finally {
      setConfigurationBusy(false);
    }
  }

  async function restoreConversation(id: string) {
    setWorkspaceBusy(true); setWorkspaceError("");
    try {
      const response = await fetch("/api/workspace", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "conversation", id, archived: false }) });
      const value = await response.json() as { error?: string };
      if (!response.ok) throw new Error(settings.language === "zh" ? text.restoreError : value.error || text.restoreError);
      await loadArchivedConversations();
    } catch (cause) { setWorkspaceError(settings.language === "zh" ? text.restoreError : cause instanceof Error ? cause.message : text.restoreError); }
    finally { setWorkspaceBusy(false); }
  }

  async function deleteConversation(conversation: ArchivedConversation) {
    const warning = settings.language === "zh"
      ? `要永久删除“${conversation.title}”吗？对话内容及其派生的全部学习 evidence 都将被删除，且无法撤销。`
      : `Permanently delete “${conversation.title}”? The transcript and all learning evidence derived from it will be removed. This cannot be undone.`;
    if (!window.confirm(warning)) return;
    setWorkspaceBusy(true); setWorkspaceError("");
    try {
      const response = await fetch("/api/workspace", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "conversation", id: conversation.id }) });
      const value = await response.json() as { error?: string };
      if (!response.ok) throw new Error(settings.language === "zh" ? text.deleteError : value.error || text.deleteError);
      await loadArchivedConversations();
    } catch (cause) { setWorkspaceError(settings.language === "zh" ? text.deleteError : cause instanceof Error ? cause.message : text.deleteError); }
    finally { setWorkspaceBusy(false); }
  }

  async function clearUserData() {
    if (dataBusy || !window.confirm(text.clearDataWarning)) return;
    clearInProgress.current = true;
    setDataBusy(true); setDataMessage("");
    try {
      const response = await fetch("/api/data", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmation: "CLEAR_USER_DATA" }),
      });
      const value = await response.json() as { error?: string };
      if (!response.ok) throw new Error(settings.language === "zh" ? text.clearDataError : value.error || text.clearDataError);
      window.location.replace("/");
    } catch (cause) {
      clearInProgress.current = false;
      setDataMessage(settings.language === "zh" ? text.clearDataError : cause instanceof Error ? cause.message : text.clearDataError);
      setDataBusy(false);
    }
  }

  useEffect(() => {
    if (!loaded || dataBusy || clearInProgress.current) return;
    const currentSignature = signature(settings, apiKey);
    if (currentSignature === lastSaved.current) return;
    const timeout = window.setTimeout(() => {
      if (clearInProgress.current) return;
      void fetch("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: settings.provider, model: settings.model, apiKey, baseUrl: settings.baseUrl, language: settings.language }),
      }).then(async response => {
        const value = await response.json() as PublicSettings & { error?: string };
        if (!response.ok) throw new Error(value.error);
        lastSaved.current = currentSignature;
        setSettings(current => ({ ...current, apiKeyConfigured: value.apiKeyConfigured, configured: value.configured, settingsSource: value.settingsSource }));
      }).catch(() => setSettings(current => ({ ...current, configured: false })));
    }, 600);
    return () => window.clearTimeout(timeout);
  }, [apiKey, dataBusy, loaded, settings]);

  return (
    <main className="settings-shell">
      <nav className="settings-nav">
        <a className="settings-back" href="/" aria-label={settings.language === "zh" ? "对话" : "Conversation"}>←</a>
        <a className="settings-brand" href="/"><UnjotMark className="settings-brand-mark" priority />Unjot</a>
      </nav>

      <section className="settings-content">
        <h1>{text.settings}</h1>

        <div className="settings-card">
          <div className="configuration-note">
            <div>
              <strong>{text.configurationSource}: {settings.settingsSource === "saved" ? text.savedSource : text.environmentSource}</strong>
              <p>{text.configurationHelp}</p>
            </div>
            <button type="button" disabled={configurationBusy || settings.settingsSource === "environment"} onClick={() => void useEnvironmentConfiguration()}>
              {configurationBusy ? text.resettingEnvironment : text.useEnvironment}
            </button>
          </div>
          {configurationMessage && <p className="configuration-message" role="status">{configurationMessage}</p>}
          <label>
            <span>{text.provider}</span>
            <input value={settings.provider} onChange={event => setSettings(current => ({ ...current, provider: event.target.value }))} />
          </label>
          <label>
            <span>{text.model}</span>
            <input value={settings.model} onChange={event => setSettings(current => ({ ...current, model: event.target.value }))} />
          </label>
          <label>
            <span>{text.apiKey}</span>
            <input type="password" autoComplete="new-password" placeholder={settings.apiKeyConfigured ? "••••••••••••" : ""} value={apiKey} onChange={event => setApiKey(event.target.value)} />
          </label>
          <label>
            <span>{text.baseUrl}</span>
            <input type="url" value={settings.baseUrl} onChange={event => setSettings(current => ({ ...current, baseUrl: event.target.value }))} />
          </label>
          <div className="connection-row">
            <span>{text.connection}</span>
            <strong className={settings.configured ? "connected" : ""} aria-live="polite">
              <i />{settings.configured ? text.connected : text.disconnected}
            </strong>
          </div>
          <div className="settings-test-row"><button type="button" disabled={testBusy} onClick={() => void testConnection()}>{testBusy ? text.testing : text.testConnection}</button><span role="status">{testMessage}</span></div>
          {preferences && <div className="setting-row">
            <span className="setting-title">{text.replyStrategy}<HelpTip label={text.replyStrategyHelpLabel}>{text.replyStrategyHelp}</HelpTip></span>
            <select aria-label={text.replyStrategy} disabled={preferencesBusy} value={preferences.orchestrationMode} onChange={event => void changeReplyStrategy(event.target.value as ResponsePreferences["orchestrationMode"])}><option value="synthesis">{text.synthesis}</option><option value="stepwise">{text.stepwise}</option></select>
          </div>}
        </div>

        <div className="settings-card language-card">
          <span>{text.language}</span>
          <div className="language-switch" role="group" aria-label={text.language}>
            <button className={settings.language === "zh" ? "active" : ""} type="button" onClick={() => setSettings(current => ({ ...current, language: "zh" }))}>中文</button>
            <button className={settings.language === "en" ? "active" : ""} type="button" onClick={() => setSettings(current => ({ ...current, language: "en" }))}>English</button>
          </div>
        </div>

        <div className="settings-card preferences-card">
          <h2>{text.responsePreferences}</h2>
          {preferences && <>
            <label className="ratio-setting"><span>{text.unfamiliarRatio}<small>{text.ratioHint}</small></span><div><input type="range" min={PREFERENCE_BOUNDS.minRatio} max={PREFERENCE_BOUNDS.maxRatio} step="0.01" value={preferences.maxUnfamiliarRatio} onChange={event => setPreferences({ ...preferences, maxUnfamiliarRatio: event.target.valueAsNumber })} /><output>{Math.round(preferences.maxUnfamiliarRatio * 100)}%</output></div></label>
            <label><span>{text.startingLevel}</span><select value={preferences.startingLevel ?? ""} onChange={event => setPreferences({ ...preferences, startingLevel: (event.target.value || null) as ResponsePreferences["startingLevel"] })}><option value="">{text.noEstimate}</option>{["A1", "A2", "B1", "B2", "C1", "C2"].map(level => <option key={level}>{level}</option>)}</select></label>
            <div className="preference-switch-row"><span className="setting-title">{text.chineseSupport}<HelpTip label={text.chineseSupportHelpLabel}>{text.chineseSupportHelp}</HelpTip></span><label className="settings-switch"><input type="checkbox" checked={preferences.allowChineseSupport} onChange={event => setPreferences({ ...preferences, allowChineseSupport: event.target.checked })} /><span /></label></div>
            <div className="preferences-actions"><button type="button" disabled={preferencesBusy} onClick={() => void savePreferences()}>{preferencesBusy ? text.saving : text.savePreferences}</button><span role="status">{preferencesMessage}</span></div>
          </>}
          {!preferences && preferencesMessage && <p className="archive-error" role="alert">{preferencesMessage}</p>}
        </div>

        <div className="settings-card archive-card">
          <h2>{text.archived}</h2>
          {workspaceError && <p className="archive-error" role="alert">{workspaceError}</p>}
          {!archivedConversations.length && !workspaceError && <p className="archive-empty">{text.noArchived}</p>}
          {archivedConversations.map(conversation => (
            <div className="archived-conversation" key={conversation.id}>
              <span>{conversation.title}</span>
              <div><button type="button" disabled={workspaceBusy} onClick={() => void restoreConversation(conversation.id)}>{text.restore}</button><button className="danger" type="button" disabled={workspaceBusy} onClick={() => void deleteConversation(conversation)}>{text.delete}</button></div>
            </div>
          ))}
        </div>

        <div className="settings-card danger-zone">
          <div>
            <h2>{text.clearData}</h2>
            <p>{text.clearDataDescription}</p>
          </div>
          <button type="button" disabled={dataBusy} onClick={() => void clearUserData()}>{dataBusy ? text.clearingData : text.clearDataButton}</button>
          {dataMessage && <p className="danger-message" role="alert">{dataMessage}</p>}
        </div>
      </section>
    </main>
  );
}

function signature(settings: PublicSettings, apiKey: string) {
  return JSON.stringify([settings.provider, settings.model, apiKey, settings.baseUrl, settings.language]);
}

function HelpTip({ label, children }: { label: string; children: string }) {
  return <details className="setting-help"><summary aria-label={label} title={label}>!</summary><p>{children}</p></details>;
}
