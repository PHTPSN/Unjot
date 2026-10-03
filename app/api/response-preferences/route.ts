import { learnerStore, StoreError } from "../../../lib/learner-store.ts";
export const runtime = "nodejs";
export async function GET() { return Response.json(learnerStore().preferences()); }
export async function PATCH(request: Request) {
  let body: unknown; try { body = await request.json(); } catch { return Response.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  try { if (!body || typeof body !== "object" || Array.isArray(body)) throw new StoreError("Preferences must be an object."); return Response.json(learnerStore().savePreferences(body as Record<string, unknown>)); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Invalid preferences." }, { status: error instanceof StoreError ? error.status : 400 }); }
}
