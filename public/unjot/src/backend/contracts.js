/**
 * Runtime view of the four shared contracts.
 *
 * `packages/protocol/src/*.ts` stays the source of truth for the shapes; this
 * module lists the same field names so the Web app can assert at runtime that
 * the objects it builds still match the backend protocol. A field added to the
 * contracts without being added here fails the conformance test.
 */

export const POLICY_VERSION = "m0-v2";

export const CONTRACT_FIELDS = Object.freeze({
  /** packages/protocol/src/lexical-item.ts */
  lexicalItem: Object.freeze([
    "id", "canonicalForm", "language", "partOfSpeech", "definition",
    "forms", "lexemeId", "conceptId", "source",
  ]),
  /** packages/protocol/src/conversation-turn.ts */
  conversationTurn: Object.freeze([
    "id", "conversationId", "sequence", "role", "contextId", "text",
    "occurredAt", "suppliedItemIds", "correctionMode", "correction",
  ]),
  /** packages/protocol/src/evidence-event.ts */
  evidenceEvent: Object.freeze([
    "id", "deviceId", "itemId", "kind", "conversationId", "turnId", "contextId",
    "occurredAt", "source", "textSource", "observedSpan", "supportTurnId",
    "rationale", "policyVersion",
  ]),
  /** packages/protocol/src/learner-item-state.ts */
  learnerItemState: Object.freeze([
    "itemId", "stage", "evidenceIds", "counts", "independentContextIds",
    "lastEvidenceAt", "lastSpontaneousAt", "policyVersion",
  ]),
});

/** @param {keyof typeof CONTRACT_FIELDS} contract @param {unknown} value */
export function missingContractFields(contract, value) {
  const fields = CONTRACT_FIELDS[contract];
  if (fields === undefined) throw new TypeError(`unknown contract: ${contract}`);
  if (value === null || typeof value !== "object") return [...fields];
  return fields.filter((field) => !(field in value));
}

/** @param {keyof typeof CONTRACT_FIELDS} contract @param {unknown} value */
export function assertContract(contract, value) {
  const missing = missingContractFields(contract, value);
  if (missing.length > 0) {
    throw new TypeError(`${contract} is missing: ${missing.join(", ")}`);
  }
  return value;
}

/** Extra keys are useful to spot: the UI must not invent protocol fields. */
/** @param {keyof typeof CONTRACT_FIELDS} contract @param {unknown} value */
export function extraContractFields(contract, value) {
  const fields = CONTRACT_FIELDS[contract];
  if (value === null || typeof value !== "object") return [];
  return Object.keys(value).filter((key) => !fields.includes(key));
}
