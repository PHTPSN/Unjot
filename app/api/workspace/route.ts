import { learnerStore, StoreError } from "../../../lib/learner-store.ts";
export const runtime = "nodejs";
export async function GET() { const store = learnerStore(); return Response.json({ projects: store.projects(), conversations: store.conversations() }); }
export async function POST(request: Request) {
  try { const body = await request.json() as { kind?: string; projectId?: string; name?: string; title?: string }; const store = learnerStore();
    if (body.kind === "project") return Response.json({ project: store.createProject(body.name) });
    if (body.kind === "conversation" && body.projectId) return Response.json({ conversation: store.createConversation(body.projectId, body.title) });
    throw new StoreError("Invalid workspace resource.");
  } catch (e) { return Response.json({ error: e instanceof Error ? e.message : "Invalid request." }, { status: e instanceof StoreError ? e.status : 400 }); }
}
export async function PATCH(request: Request) {
  try { const body = await request.json() as { kind?: string; id?: string; name?: string; title?: string; archived?: boolean }; if (!body.id) throw new StoreError("Resource id is required."); const store = learnerStore();
    if (body.archived) { if (body.kind === "project") store.archiveProject(body.id); else store.archiveConversation(body.id); return Response.json({ ok: true }); }
    if (body.kind === "project") return Response.json({ project: store.renameProject(body.id, body.name ?? "") });
    return Response.json({ conversation: store.renameConversation(body.id, body.title ?? "") });
  } catch (e) { return Response.json({ error: e instanceof Error ? e.message : "Invalid request." }, { status: e instanceof StoreError ? e.status : 400 }); }
}
