import { deriveCorrectedItemState, deriveItemState, validSpan } from "./evidence-policy.ts";
import { StoreError, type LearnerStore } from "./learner-store.ts";
import type { LexicalGraph } from "../packages/lexical-core/src/graph.ts";
import { COMPREHENSION_POLICY_VERSION, RESPONSE_CONTRACT_VERSION, STARTER_SET } from "../packages/protocol/src/comprehension.ts";
import type { AssessComprehensionRequest, ComprehensionAssessment, CorrectedLearnerStateBatchResult, ItemEvidenceRequest, ItemEvidenceResult, LearnerStateBatchRequest, LearnerStateBatchResult, PersonalItemRead, ResponsePreferences, SenseId } from "../packages/protocol/src/comprehension.ts";

export class PersonalReads {
  private readonly store: LearnerStore;
  private readonly graph: LexicalGraph;
  readonly preferences: ResponsePreferences;
  constructor(store: LearnerStore, graph: LexicalGraph, preferences = store.preferences()) { this.store = store; this.graph = graph; this.preferences = preferences; }
  async get_learner_states(request: LearnerStateBatchRequest): Promise<LearnerStateBatchResult> {
    if (!Array.isArray(request.itemIds) || request.itemIds.length > 100 || request.itemIds.some(id => typeof id !== "string" || id.length > 300)) throw new StoreError("Invalid sense batch.");
    const events = this.store.evidence(request.stateRevision);
    const items: PersonalItemRead[] = [];
    for (const id of [...new Set(request.itemIds)]) {
      if (!await this.graph.getItem(id)) throw new StoreError("Unknown lexical sense.");
      const relevant = events.filter(e => e.itemId === id);
      const state = deriveItemState(id, relevant);
      items.push(state ? { itemId: id, status: "observed", state, receptiveEvidenceIds: relevant.filter(e => e.kind === "recognized").map(e => e.id), productionEvidenceIds: relevant.filter(e => e.kind.endsWith("production")).map(e => e.id) } : { itemId: id, status: "unobserved", state: null, receptiveEvidenceIds: [], productionEvidenceIds: [] });
    }
    return { contractVersion: RESPONSE_CONTRACT_VERSION, stateRevision: request.stateRevision, items };
  }
  async get_corrected_learner_states(request: LearnerStateBatchRequest): Promise<CorrectedLearnerStateBatchResult> {
    if (!Array.isArray(request.itemIds) || request.itemIds.length > 100 || request.itemIds.some(id => typeof id !== "string" || id.length > 300)) throw new StoreError("Invalid sense batch.");
    for (const id of new Set(request.itemIds)) if (!await this.graph.getItem(id)) throw new StoreError("Unknown lexical sense.");
    const items = this.store.correctedStates(request.itemIds, request.stateRevision);
    return { contractVersion: "m5r-state-v1", stateRevision: request.stateRevision, items };
  }
  async get_item_evidence(request: ItemEvidenceRequest): Promise<ItemEvidenceResult> {
    if (typeof request.itemId !== "string" || !await this.graph.getItem(request.itemId)) throw new StoreError("Unknown lexical sense.");
    const limit = request.limit ?? 20;
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new StoreError("Invalid evidence page size.");
    let offset = 0;
    if (request.cursor) {
      try { const c = JSON.parse(Buffer.from(request.cursor, "base64url").toString()); if (c.itemId !== request.itemId || c.revision !== request.stateRevision || !Number.isSafeInteger(c.offset) || c.offset < 0) throw new Error(); offset = c.offset; }
      catch { throw new StoreError("Invalid evidence cursor."); }
    }
    const all = this.store.evidence(request.stateRevision, request.itemId);
    const events = all.slice(offset, offset + limit);
    const supportReferences = events.flatMap(event => {
      if (!event.supportTurnId) return [];
      return this.store.evidence(request.stateRevision, event.itemId).filter(e => e.turnId === event.supportTurnId && e.kind === "supplied").map(e => ({ eventId: event.id, turnId: e.turnId, span: e.observedSpan, textSource: e.textSource }));
    });
    return { itemId: request.itemId, stateRevision: request.stateRevision, events, supportReferences, nextCursor: offset + limit < all.length ? Buffer.from(JSON.stringify({ itemId: request.itemId, revision: request.stateRevision, offset: offset + limit })).toString("base64url") : null };
  }
  async assess_comprehension(request: AssessComprehensionRequest): Promise<readonly ComprehensionAssessment[]> {
    if (typeof request.text !== "string" || request.text.length > 8000 || typeof request.context !== "string" || request.context.length > 2000 || !Array.isArray(request.units) || request.units.length > 1000 || request.modality !== "reading" || request.policyVersion !== COMPREHENSION_POLICY_VERSION || request.profileVersion !== this.preferences.profileVersion) throw new StoreError("Invalid comprehension request or profile version.");
    const events = this.store.evidence(request.stateRevision);
    const results: ComprehensionAssessment[] = [];
    let end = 0;
    for (const unit of request.units) {
      if (!unit || typeof unit.text !== "string" || !unit.span || !validSpan(request.text, unit.span, unit.text) || unit.span.start < end || !Array.isArray(unit.candidateIds) || unit.candidateIds.length > 100 || unit.candidateIds.some((id: unknown) => typeof id !== "string" || id.length > 300)) throw new StoreError("Invalid or overlapping text units.");
      end = unit.span.end;
      const base = { span: unit.span, modality: "reading" as const, stateRevision: request.stateRevision, policyVersion: COMPREHENSION_POLICY_VERSION };
      const actual = await this.graph.findSenseIds(unit.text);
      if (!unit.itemId || unit.unresolvedReason || !actual.includes(unit.itemId) || !unit.candidateIds.includes(unit.itemId)) {
        results.push({ ...base, assessment: "unresolved", itemId: null, evidenceIds: [], unresolvedReason: !actual.length ? "missing_coverage" : actual.length > 1 ? "ambiguous_meaning" : "unverified_meaning", reason: "No verified single meaning for this text unit." }); continue;
      }
      const relevant = events.filter(e => e.itemId === unit.itemId);
      const positive = relevant.filter(e => ["recognized", "spontaneous_production", "assisted_production"].includes(e.kind));
      const difficulty = relevant.filter(e => ["help_requested", "failed_opportunity"].includes(e.kind));
      const latest = relevant.filter(e => positive.includes(e) || difficulty.includes(e)).at(-1);
      if (latest && difficulty.includes(latest)) results.push({ ...base, assessment: "needs_support", itemId: unit.itemId, evidenceIds: [latest.id], reason: "The most recent relevant observation records difficulty, despite any earlier success." });
      else if (positive.length) results.push({ ...base, assessment: "supported", itemId: unit.itemId, evidenceIds: [positive.at(-1)!.id], reason: "Validated comprehension or correct use supports this reading estimate; it does not certify all contexts or listening." });
      else if (this.preferences.startingLevel && this.preferences.starterSetVersion === STARTER_SET.version && (STARTER_SET.itemIds as readonly string[]).includes(unit.itemId)) results.push({ ...base, assessment: "provisional", itemId: unit.itemId, evidenceIds: [], reason: "Temporary allowance from the explicitly configured starting level and editorial seed; no mastery evidence.", baseline: { startingLevel: this.preferences.startingLevel, starterSetVersion: STARTER_SET.version, source: STARTER_SET.source } });
      else results.push({ ...base, assessment: "unobserved", itemId: unit.itemId, evidenceIds: [], reason: "Exposure, explanations and uncertainty do not demonstrate understanding." });
    }
    return results;
  }
}
