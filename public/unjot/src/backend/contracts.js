








export const POLICY_VERSION = "m0-v2";

export const CONTRACT_FIELDS = Object.freeze({
  
  lexicalItem: Object.freeze([
    "id", "canonicalForm", "language", "partOfSpeech", "definition",
    "forms", "lexemeId", "conceptId", "source",
  ]),
  
  conversationTurn: Object.freeze([
    "id", "conversationId", "sequence", "role", "contextId", "text",
    "occurredAt", "suppliedItemIds", "correctionMode", "correction",
  ]),
  
  evidenceEvent: Object.freeze([
    "id", "deviceId", "itemId", "kind", "conversationId", "turnId", "contextId",
    "occurredAt", "source", "textSource", "observedSpan", "supportTurnId",
    "rationale", "policyVersion",
  ]),
  
  learnerItemState: Object.freeze([
    "itemId", "stage", "evidenceIds", "counts", "independentContextIds",
    "lastEvidenceAt", "lastSpontaneousAt", "policyVersion",
  ]),
});


export function missingContractFields(contract, value) {
  const fields = CONTRACT_FIELDS[contract];
  if (fields === undefined) throw new TypeError(`unknown contract: ${contract}`);
  if (value === null || typeof value !== "object") return [...fields];
  return fields.filter((field) => !(field in value));
}


export function assertContract(contract, value) {
  const missing = missingContractFields(contract, value);
  if (missing.length > 0) {
    throw new TypeError(`${contract} is missing: ${missing.join(", ")}`);
  }
  return value;
}



export function extraContractFields(contract, value) {
  const fields = CONTRACT_FIELDS[contract];
  if (value === null || typeof value !== "object") return [];
  return Object.keys(value).filter((key) => !fields.includes(key));
}
