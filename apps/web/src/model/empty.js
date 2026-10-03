/**
 * Deliberately empty areas.
 *
 * Explain and lexical entries (词条) stay unmodelled for now: the backend has a
 * LexicalItem contract and a graph adapter, but no product-level relations, no
 * CEFR data, and no OEWN shards shipped with the repository. Until those exist,
 * the UI must show an honest placeholder instead of fabricated content.
 */

export const EMPTY_AREA_REASON = Object.freeze({
  explain: "explain-deferred",
  lexicalEntry: "lexical-entry-deferred",
});

/** @returns {{status: "empty", reason: string, request: null, result: null}} */
export function emptyExplainState() {
  return Object.freeze({
    status: "empty",
    reason: EMPTY_AREA_REASON.explain,
    request: null,
    result: null,
  });
}

/** @param {unknown} _request */
export function requestExplain(_request) {
  return Object.freeze({ status: "unavailable", reason: EMPTY_AREA_REASON.explain });
}

/** @returns {{status: "empty", reason: string, item: null, progress: null, related: readonly unknown[]}} */
export function emptyLexicalEntryState() {
  return Object.freeze({
    status: "empty",
    reason: EMPTY_AREA_REASON.lexicalEntry,
    item: null,
    progress: null,
    related: Object.freeze([]),
  });
}

/** @param {unknown} _id */
export function requestLexicalEntry(_id) {
  return Object.freeze({ status: "unavailable", reason: EMPTY_AREA_REASON.lexicalEntry });
}

/** Empty by construction: no vocabulary list is shown in this milestone. */
export function listTrackedExpressions() {
  return Object.freeze([]);
}
