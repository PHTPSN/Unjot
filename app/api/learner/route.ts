import { lexicalGraph } from "../../../lib/lexicon.ts";
import { learnerStore, StoreError } from "../../../lib/learner-store.ts";
import { PersonalReads } from "../../../lib/personal-reads.ts";
import type { AssessComprehensionRequest, ItemEvidenceRequest, LearnerStateBatchRequest } from "../../../packages/protocol/src/comprehension.ts";

export const runtime = "nodejs";
const reads = () => new PersonalReads(learnerStore(), lexicalGraph);
export async function GET(request: Request) {
  const url = new URL(request.url); const store = learnerStore();
  try {
    if (url.searchParams.get("inspect") === "1") {
      const inspection = store.inspect();
      const personal = reads();
      const items = await Promise.all(inspection.items.map(async item => {
        const lexical = item.state ? await lexicalGraph.getItem(item.state.itemId) : null;
        const assessment = lexical ? (await personal.assess_comprehension({ text: lexical.canonicalForm, context: lexical.definition,
          units: [{ text: lexical.canonicalForm, span: { start: 0, end: lexical.canonicalForm.length }, candidateIds: [lexical.id], itemId: lexical.id, unresolvedReason: null }],
          modality: "reading", stateRevision: inspection.stateRevision, profileVersion: personal.preferences.profileVersion, policyVersion: "reading-v1" }))[0] : null;
        return { ...item, lexical, assessment };
      }));
      return Response.json({ ...inspection, items }, { headers: { "cache-control": "no-store" } });
    }
    if (url.searchParams.get("evidence")) return Response.json(await reads().get_item_evidence({ itemId: url.searchParams.get("evidence")! as `sense:${string}`, stateRevision: url.searchParams.get("revision") ?? store.revision(), limit: Number(url.searchParams.get("limit") ?? 20) }));
    return Response.json({ stateRevision: store.revision(), states: store.states() });
  } catch (error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  let body: unknown; try { body = await request.json(); } catch { return Response.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  try {
    if (typeof body !== "object" || body === null) throw new StoreError("Invalid learner read.");
    const value = body as Record<string, unknown>;
    if (value.operation === "get_learner_states") return Response.json(await reads().get_learner_states(value as unknown as LearnerStateBatchRequest));
    if (value.operation === "get_corrected_learner_states") return Response.json(await reads().get_corrected_learner_states(value as unknown as LearnerStateBatchRequest));
    if (value.operation === "get_item_evidence") return Response.json(await reads().get_item_evidence(value as unknown as ItemEvidenceRequest));
    if (value.operation === "assess_comprehension") return Response.json(await reads().assess_comprehension(value as unknown as AssessComprehensionRequest));
    throw new StoreError("Unknown learner operation.");
  } catch (error) { return errorResponse(error); }
}
function errorResponse(error: unknown) { return Response.json({ error: error instanceof Error ? error.message : "Learner read failed." }, { status: error instanceof StoreError ? error.status : 400 }); }
