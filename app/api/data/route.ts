import { learnerStore, StoreError } from "../../../lib/learner-store.ts";

export const runtime = "nodejs";

export async function DELETE(request: Request) {
  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  if (!isClearConfirmation(body)) return Response.json({ error: "Explicit confirmation is required." }, { status: 400 });

  try {
    learnerStore().clearUserData();
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not clear user data." }, { status: error instanceof StoreError ? error.status : 500 });
  }
}

function isClearConfirmation(value: unknown): value is { confirmation: "CLEAR_USER_DATA" } {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && (value as { confirmation?: unknown }).confirmation === "CLEAR_USER_DATA");
}
