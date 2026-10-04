"use client";

import { useEffect, useState } from "react";
import { MessageSquarePlus, MessageSquareText } from "lucide-react";
import { useParams } from "next/navigation";
import { WorkspaceSidebar } from "../../workspace-sidebar.tsx";
import { localized, useInterfaceLanguage } from "../../use-interface-language.ts";
import { UnjotMark } from "../../unjot-mark.tsx";

type Project = { id: string; name: string };
type Conversation = { id: string; projectId: string | null; title: string };
type Workspace = { projects: Project[]; conversations: Conversation[] };

export default function ProjectPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const [workspace, setWorkspace] = useState<Workspace>({ projects: [], conversations: [] });
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const language = useInterfaceLanguage();
  const text = localized(language, { en: { brandAria: "Unjot conversation", load: "Could not load project.", create: "Could not create conversation.", loading: "Loading…", missing: "Project not found.", newConversation: "New conversation", knowledge: "Knowledge graph", learning: "My language graph", tools: "Tools", settings: "Settings" }, zh: { brandAria: "Unjot 对话", load: "无法加载项目。", create: "无法创建会话。", loading: "正在加载…", missing: "未找到项目。", newConversation: "新建会话", knowledge: "知识图谱", learning: "我的语言图谱", tools: "工具", settings: "设置" } });

  useEffect(() => {
    let active = true;
    void fetch("/api/workspace")
      .then(async response => {
        const body = await response.json() as Workspace & { error?: string };
        if (!response.ok) throw new Error(body.error || text.load);
        if (active) { setWorkspace(body); setLoaded(true); }
      })
      .catch(cause => { if (active) { setError(cause instanceof Error ? cause.message : text.load); setLoaded(true); } });
    return () => { active = false; };
  }, [text.load]);

  async function createConversation() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/workspace", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "conversation", projectId }) });
      const body = await response.json() as { conversation?: Conversation; error?: string };
      if (!response.ok || !body.conversation) throw new Error(body.error || text.create);
      window.location.href = `/?conversationId=${encodeURIComponent(body.conversation.id)}`;
    } catch (cause) { setError(cause instanceof Error ? cause.message : text.create); setBusy(false); }
  }

  const project = workspace.projects.find(item => item.id === projectId);
  const conversations = workspace.conversations.filter(item => item.projectId === projectId);

  return (
    <main className="app-shell project-shell">
      <WorkspaceSidebar />
      <header className="topbar">
        <a className="brand" href="/" aria-label={text.brandAria}><UnjotMark className="brand-mark" priority /><span>unjot</span></a>
        <div className="topbar-meta"><a href="/knowledge">{text.knowledge}</a><a href="/learning">{text.learning}</a><a href="/tools">{text.tools}</a><a href="/settings">{text.settings}</a></div>
      </header>
      <section className="project-view" aria-labelledby="project-title">
        {!loaded && <p role="status">{text.loading}</p>}
        {error && <p className="project-error" role="alert">{error}</p>}
        {loaded && !project && !error && <p className="project-error" role="alert">{text.missing}</p>}
        {project && (
          <>
            <div className="project-view-heading">
              <h1 id="project-title">{project.name}</h1>
              <button type="button" disabled={busy} onClick={() => void createConversation()}><MessageSquarePlus size={16} />{text.newConversation}</button>
            </div>
            <div className="project-conversation-list">
              {conversations.map(conversation => <a href={`/?conversationId=${encodeURIComponent(conversation.id)}`} key={conversation.id}><MessageSquareText size={16} /><span>{conversation.title}</span></a>)}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
