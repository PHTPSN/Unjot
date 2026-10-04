"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { usePathname } from "next/navigation";
import { Archive, FolderInput, FolderPlus, FolderX, Menu, MessageSquarePlus, MoreHorizontal, Pencil, Plus, Trash2, X } from "lucide-react";
import { localized, useInterfaceLanguage } from "./use-interface-language.ts";
import { UnjotMark } from "./unjot-mark.tsx";

type Project = { id: string; name: string };
type Conversation = { id: string; projectId: string | null; title: string };
type Workspace = { projects: Project[]; conversations: Conversation[]; archivedConversations: Conversation[]; defaultConversationId: string };
type DialogState =
  | { kind: "create-project"; value: string }
  | { kind: "rename-project"; project: Project; value: string }
  | { kind: "rename-conversation"; conversation: Conversation; value: string }
  | { kind: "move-conversation"; conversation: Conversation; projectId: string };

const EMPTY_WORKSPACE: Workspace = { projects: [], conversations: [], archivedConversations: [], defaultConversationId: "" };

export function WorkspaceSidebar() {
  const [workspace, setWorkspace] = useState<Workspace>(EMPTY_WORKSPACE);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pathname = usePathname();
  const language = useInterfaceLanguage();
  const text = localized(language, {
    en: { workspace: "Workspace", open: "Open workspace", close: "Close workspace", newProject: "New project", newConversation: "New conversation", conversations: "Conversations", manage: "Manage", rename: "Rename", move: "Move", archive: "Archive", delete: "Delete", dissolve: "Dissolve", loadError: "Could not load workspace.", updateError: "Could not update workspace.", createError: "Could not create conversation.", archiveError: "Could not archive conversation.", deleteError: "Could not delete conversation.", dissolveError: "Could not dissolve project.", archiveConfirm: (name: string) => `Archive “${name}”? Its learning evidence will be preserved.`, deleteConfirm: (name: string) => `Permanently delete “${name}”? The transcript and all learning evidence derived from it will be removed. This cannot be undone.`, dissolveConfirm: (name: string) => `Dissolve “${name}”? Its conversations will be kept and moved out of the project.`, project: "Project", noProject: "No project", name: "Name", cancel: "Cancel", save: "Save", saving: "Saving…", renameProject: "Rename project", renameConversation: "Rename conversation", moveConversation: "Move conversation" },
    zh: { workspace: "工作区", open: "打开工作区", close: "关闭工作区", newProject: "新建项目", newConversation: "新建会话", conversations: "会话", manage: "管理", rename: "重命名", move: "移动", archive: "归档", delete: "删除", dissolve: "解散", loadError: "无法加载工作区。", updateError: "无法更新工作区。", createError: "无法创建会话。", archiveError: "无法归档会话。", deleteError: "无法删除会话。", dissolveError: "无法解散项目。", archiveConfirm: (name: string) => `要归档“${name}”吗？其学习 evidence 将会保留。`, deleteConfirm: (name: string) => `要永久删除“${name}”吗？对话内容及其派生的全部学习 evidence 都将被删除，且无法撤销。`, dissolveConfirm: (name: string) => `要解散“${name}”吗？其中的会话会被保留并移出该项目。`, project: "项目", noProject: "不属于项目", name: "名称", cancel: "取消", save: "保存", saving: "保存中…", renameProject: "重命名项目", renameConversation: "重命名会话", moveConversation: "移动会话" },
  });
  const activeProjectId = pathname.match(/^\/projects\/([^/]+)$/)?.[1] ?? "";
  const activeConversationId = typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("conversationId") ?? workspace.defaultConversationId;

  async function loadWorkspace() {
    const response = await fetch("/api/workspace");
    const body = await response.json() as Workspace & { error?: string };
    if (!response.ok) throw new Error(language === "zh" ? text.loadError : body.error || text.loadError);
    setWorkspace(body);
  }

  useEffect(() => { void loadWorkspace().catch(cause => setError(language === "zh" ? text.loadError : cause instanceof Error ? cause.message : text.loadError)); }, [language, text.loadError]);

  async function workspaceRequest(method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>) {
    const response = await fetch("/api/workspace", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const value = await response.json() as { error?: string; defaultConversationId?: string; conversation?: Conversation; project?: Project };
    if (!response.ok) throw new Error(language === "zh" ? text.updateError : value.error || text.updateError);
    return value;
  }

  async function createConversation(projectId: string | null) {
    setBusy(true); setError("");
    try {
      const value = await workspaceRequest("POST", { kind: "conversation", projectId });
      if (value.conversation) window.location.href = `/?conversationId=${encodeURIComponent(value.conversation.id)}`;
    } catch (cause) { setError(language === "zh" ? text.createError : cause instanceof Error ? cause.message : text.createError); setBusy(false); }
  }

  async function submitDialog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialog || busy) return;
    setBusy(true); setError("");
    try {
      if (dialog.kind === "create-project") {
        const value = await workspaceRequest("POST", { kind: "project", name: dialog.value });
        if (value.project) window.location.href = `/projects/${encodeURIComponent(value.project.id)}`;
        return;
      }
      if (dialog.kind === "rename-project") await workspaceRequest("PATCH", { kind: "project", id: dialog.project.id, name: dialog.value });
      if (dialog.kind === "rename-conversation") await workspaceRequest("PATCH", { kind: "conversation", id: dialog.conversation.id, title: dialog.value });
      if (dialog.kind === "move-conversation") await workspaceRequest("PATCH", { kind: "conversation", id: dialog.conversation.id, projectId: dialog.projectId || null });
      setDialog(null);
      await loadWorkspace();
    } catch (cause) { setError(language === "zh" ? text.updateError : cause instanceof Error ? cause.message : text.updateError); }
    finally { setBusy(false); }
  }

  async function archiveConversation(id: string, name: string) {
    if (!window.confirm(text.archiveConfirm(name))) return;
    setBusy(true); setError("");
    try {
      const value = await workspaceRequest("PATCH", { kind: "conversation", id, archived: true });
      if (id === activeConversationId && value.defaultConversationId) window.location.href = `/?conversationId=${encodeURIComponent(value.defaultConversationId)}`;
      else await loadWorkspace();
    } catch (cause) { setError(language === "zh" ? text.archiveError : cause instanceof Error ? cause.message : text.archiveError); }
    finally { setBusy(false); }
  }

  async function deleteConversation(id: string, name: string) {
    if (!window.confirm(text.deleteConfirm(name))) return;
    setBusy(true); setError("");
    try {
      const value = await workspaceRequest("DELETE", { kind: "conversation", id });
      if (id === activeConversationId && value.defaultConversationId) window.location.href = `/?conversationId=${encodeURIComponent(value.defaultConversationId)}`;
      else await loadWorkspace();
    } catch (cause) { setError(language === "zh" ? text.deleteError : cause instanceof Error ? cause.message : text.deleteError); }
    finally { setBusy(false); }
  }

  async function dissolveProject(id: string, name: string) {
    if (!window.confirm(text.dissolveConfirm(name))) return;
    setBusy(true); setError("");
    try {
      const value = await workspaceRequest("DELETE", { kind: "project", id });
      if (id === activeProjectId && value.defaultConversationId) window.location.href = `/?conversationId=${encodeURIComponent(value.defaultConversationId)}`;
      else await loadWorkspace();
    } catch (cause) { setError(language === "zh" ? text.dissolveError : cause instanceof Error ? cause.message : text.dissolveError); }
    finally { setBusy(false); }
  }

  function closeMenus() {
    document.querySelectorAll<HTMLDetailsElement>(".workspace-action-menu[open]").forEach(menu => { menu.open = false; });
  }

  const currentConversation = workspace.conversations.find(item => item.id === activeConversationId);
  const targetProjectId = currentConversation?.projectId ?? (activeProjectId || null);
  const unassignedConversations = workspace.conversations.filter(conversation => !conversation.projectId);

  function conversationRow(conversation: Conversation) {
    return (
      <div className={`workspace-conversation ${activeConversationId === conversation.id ? "active" : ""}`} key={conversation.id}>
        <a href={`/?conversationId=${encodeURIComponent(conversation.id)}`} title={conversation.title} onClick={() => setSidebarOpen(false)}>{conversation.title}</a>
        <details className="workspace-menu-anchor workspace-action-menu conversation-action-menu">
          <summary className="workspace-menu-summary conversation-menu-button" aria-label={`${text.manage} ${conversation.title}`}><MoreHorizontal size={14} /></summary>
          <div className="workspace-menu conversation-menu" role="menu">
            <button type="button" role="menuitem" onClick={() => { closeMenus(); setDialog({ kind: "rename-conversation", conversation, value: conversation.title }); }}><Pencil size={14} />{text.rename}</button>
            {(workspace.projects.length > 0 || conversation.projectId) && <button type="button" role="menuitem" onClick={() => { closeMenus(); setDialog({ kind: "move-conversation", conversation, projectId: conversation.projectId ?? "" }); }}><FolderInput size={14} />{text.move}</button>}
            <button type="button" role="menuitem" onClick={() => { closeMenus(); void archiveConversation(conversation.id, conversation.title); }}><Archive size={14} />{text.archive}</button>
            <button className="danger" type="button" role="menuitem" onClick={() => { closeMenus(); void deleteConversation(conversation.id, conversation.title); }}><Trash2 size={14} />{text.delete}</button>
          </div>
        </details>
      </div>
    );
  }

  return (
    <>
      <button className="workspace-mobile-trigger" type="button" aria-label={text.open} onClick={() => setSidebarOpen(true)}><Menu size={19} /></button>
      {sidebarOpen && <button className="workspace-scrim" type="button" aria-label={text.close} onClick={() => setSidebarOpen(false)} />}
      <aside className={`workspace-sidebar ${sidebarOpen ? "open" : ""}`} aria-label={text.workspace}>
        <div className="workspace-title">
          <span className="workspace-brand"><UnjotMark className="workspace-brand-mark" /><strong>Unjot</strong></span>
          <div className="workspace-title-actions">
            <button type="button" onClick={() => setDialog({ kind: "create-project", value: "" })} title={text.newProject} aria-label={text.newProject}><FolderPlus size={16} /></button>
            <button className="workspace-close" type="button" onClick={() => setSidebarOpen(false)} aria-label={text.close}><X size={17} /></button>
          </div>
        </div>
        <button className="new-conversation-button" type="button" disabled={busy} onClick={() => void createConversation(targetProjectId)}>
          <MessageSquarePlus size={16} /><span>{text.newConversation}</span>
        </button>
        {error && <p className="workspace-error" role="alert">{error}</p>}
        <div className="workspace-projects">
          {workspace.projects.map(project => {
            const projectConversations = workspace.conversations.filter(conversation => conversation.projectId === project.id);
            return (
              <section key={project.id} className={`workspace-project ${activeProjectId === project.id ? "active" : ""}`}>
                <div className="workspace-project-heading">
                  <a className="workspace-project-link" href={`/projects/${encodeURIComponent(project.id)}`} title={project.name} onClick={() => setSidebarOpen(false)}>{project.name}</a>
                  <details className="workspace-menu-anchor workspace-action-menu">
                    <summary className="workspace-menu-summary" aria-label={`${text.manage} ${project.name}`}><MoreHorizontal size={15} /></summary>
                    <div className="workspace-menu" role="menu">
                      <button type="button" role="menuitem" onClick={() => { closeMenus(); void createConversation(project.id); }}><Plus size={14} />{text.newConversation}</button>
                      <button type="button" role="menuitem" onClick={() => { closeMenus(); setDialog({ kind: "rename-project", project, value: project.name }); }}><Pencil size={14} />{text.rename}</button>
                      <button className="danger" type="button" role="menuitem" onClick={() => { closeMenus(); void dissolveProject(project.id, project.name); }}><FolderX size={14} />{text.dissolve}</button>
                    </div>
                  </details>
                </div>
                <div className="workspace-conversations">
                  {projectConversations.map(conversationRow)}
                </div>
              </section>
            );
          })}
          {unassignedConversations.length > 0 && <section className="workspace-project unassigned-conversations"><div className="workspace-project-heading"><span className="workspace-project-link">{text.conversations}</span></div><div className="workspace-conversations">{unassignedConversations.map(conversationRow)}</div></section>}
        </div>
      </aside>
      {dialog && (
        <div className="workspace-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setDialog(null); }}>
          <form className="workspace-dialog" role="dialog" aria-modal="true" aria-labelledby="workspace-dialog-title" onSubmit={event => void submitDialog(event)}>
            <h2 id="workspace-dialog-title">{dialogTitle(dialog.kind, text)}</h2>
            {dialog.kind === "move-conversation" ? (
              <label>{text.project}<select value={dialog.projectId} onChange={event => setDialog({ ...dialog, projectId: event.target.value })}><option value="">{text.noProject}</option>{workspace.projects.map(project => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label>
            ) : (
              <label>{text.name}<input autoFocus maxLength={100} required value={dialog.value} onChange={event => setDialog({ ...dialog, value: event.target.value })} /></label>
            )}
            <div className="workspace-dialog-actions"><button type="button" disabled={busy} onClick={() => setDialog(null)}>{text.cancel}</button><button className="primary" type="submit" disabled={busy || (dialog.kind === "move-conversation" ? dialog.projectId === (dialog.conversation.projectId ?? "") : !dialog.value.trim())}>{busy ? text.saving : dialog.kind === "move-conversation" ? text.move : text.save}</button></div>
          </form>
        </div>
      )}
    </>
  );
}

function dialogTitle(kind: DialogState["kind"], text: { newProject: string; renameProject: string; renameConversation: string; moveConversation: string }) {
  if (kind === "create-project") return text.newProject;
  if (kind === "rename-project") return text.renameProject;
  if (kind === "rename-conversation") return text.renameConversation;
  return text.moveConversation;
}
