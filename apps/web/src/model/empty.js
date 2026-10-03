








export const EMPTY_AREA_REASON = Object.freeze({
  explain: "explain-deferred",
  lexicalEntry: "lexical-entry-deferred",
});


export function emptyExplainState() {
  return Object.freeze({
    status: "empty",
    reason: EMPTY_AREA_REASON.explain,
    request: null,
    result: null,
  });
}


export function requestExplain(_request) {
  return Object.freeze({ status: "unavailable", reason: EMPTY_AREA_REASON.explain });
}


export function emptyLexicalEntryState() {
  return Object.freeze({
    status: "empty",
    reason: EMPTY_AREA_REASON.lexicalEntry,
    item: null,
    progress: null,
    related: Object.freeze([]),
  });
}


export function requestLexicalEntry(_id) {
  return Object.freeze({ status: "unavailable", reason: EMPTY_AREA_REASON.lexicalEntry });
}


export function listTrackedExpressions() {
  return Object.freeze([]);
}
