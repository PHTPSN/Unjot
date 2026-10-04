import { learnerStore, StoreError } from "../../../lib/learner-store.ts";
export const runtime = "nodejs";
export async function GET() { const store = learnerStore(); return Response.json({ projects: store.projects(), conversations: store.conversations(), archivedConversations: store.archivedConversations(), defaultConversationId: store.defaultConversationId() }); }
export async function POST(request: Request) {
  try { const body = await request.json() as { kind?: string; projectId?: string | null; name?: string; title?: string }; const store = learnerStore();
    if (body.kind === "project") return Response.json({ project: store.createProject(body.name) });
    if (body.kind === "conversation") return Response.json({ conversation: store.createConversation(body.projectId ?? null, body.title) });
    throw new StoreError("Invalid workspace resource.");
  } catch (e) { return Response.json({ error: e instanceof Error ? e.message : "Invalid request." }, { status: e instanceof StoreError ? e.status : 400 }); }
}
export async function PATCH(request: Request) {
  try { const body = await request.json() as { kind?: string; id?: string; name?: string; title?: string; projectId?: string | null; archived?: boolean }; if (!body.id) throw new StoreError("Resource id is required."); const store = learnerStore();
    if (body.kind === "conversation" && body.archived === true) {
      store.archiveConversation(body.id);
      return Response.json({ ok: true, defaultConversationId: store.defaultConversationId() });
    }
    if (body.kind === "conversation" && body.archived === false) return Response.json({ conversation: store.restoreConversation(body.id) });
    if (body.kind === "project") return Response.json({ project: store.renameProject(body.id, body.name ?? "") });
    if (body.kind === "conversation" && Object.prototype.hasOwnProperty.call(body, "projectId")) return Response.json({ conversation: store.moveConversation(body.id, body.projectId ?? null) });
    if (body.kind === "conversation") return Response.json({ conversation: store.renameConversation(body.id, body.title ?? "") });
    throw new StoreError("Invalid workspace resource.");
  } catch (e) { return Response.json({ error: e instanceof Error ? e.message : "Invalid request." }, { status: e instanceof StoreError ? e.status : 400 }); }
}
export async function DELETE(request: Request) {
  try {
    const body = await request.json() as { kind?: string; id?: string };
    if (!body.id) throw new StoreError("Resource id is required.");
    const store = learnerStore();
    if (body.kind === "project") { store.dissolveProject(body.id); return Response.json({ ok: true, defaultConversationId: store.defaultConversationId() }); }
    if (body.kind === "conversation") return Response.json({ ok: true, ...store.deleteConversation(body.id), defaultConversationId: store.defaultConversationId() });
    throw new StoreError("Invalid workspace resource.");
  } catch (e) { return Response.json({ error: e instanceof Error ? e.message : "Invalid request." }, { status: e instanceof StoreError ? e.status : 400 }); }
}
