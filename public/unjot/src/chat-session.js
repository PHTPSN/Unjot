/**
 * Framework-free Milestone 2 chat session.
 *
 * Turn and evidence objects are built by src/backend/conversation-service.js, so
 * the UI never assembles protocol data itself. This module owns the fixed M2
 * behavior only: blank rejection, one in-flight request at a time, the correction
 * preference captured at submission, and failure/retry that reuses the original
 * submission. Messages and preference live in memory: no persistence, model call,
 * graph lookup, or learner-state write.
 */

import { createConversationService } from "./backend/index.js";

/** Reasons a submission or retry can be rejected. */
export const REJECTED = Object.freeze({
  /** Empty or whitespace-only input. */
  blank: "blank",
  /** A request is already in flight; M2 allows one at a time. */
  pending: "pending",
  /** Retry was requested but the last request did not fail. */
  noError: "no-error",
});

/** @returns {string} A turn ID. Prefers the platform UUID. */
function defaultMakeId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (typeof uuid === "string") return `turn:${uuid}`;
  return `turn:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * @typedef {object} ChatTurnRequest
 * @property {string} text Original learner text, unmodified.
 * @property {boolean} correctionMode Preference captured when this request started.
 * @property {string} learnerTurnId ID of the learner turn being answered.
 *
 * @typedef {object} ChatTurnResult
 * @property {string} text Assistant conversational reply.
 * @property {string | null} [correction] Assistant reformulation, rendered before text.
 * @property {readonly string[]} [suppliedItemIds] Item IDs this turn deliberately supplies.
 * @property {object} [observation] Candidate evidence the backend service may accept.
 *
 * @typedef {(request: ChatTurnRequest) => ChatTurnResult | Promise<ChatTurnResult>} Respond
 */

/** @param {unknown} cause */
function readableMessage(cause) {
  if (cause instanceof Error && cause.message.trim() !== "") return cause.message;
  if (typeof cause === "string" && cause.trim() !== "") return cause;
  return "Mock request failed. Retry, or try again after checking the injected failure.";
}

/** @param {unknown} result */
function normalizeResult(result) {
  if (typeof result !== "object" || result === null) {
    throw new TypeError("respond must resolve to a ChatTurnResult object");
  }
  const { text, correction, suppliedItemIds, observation } = /** @type {Record<string, unknown>} */ (result);
  if (typeof text !== "string") throw new TypeError("respond result needs a text string");
  if (correction !== undefined && correction !== null && typeof correction !== "string") {
    throw new TypeError("respond result correction must be a string or null");
  }
  if (suppliedItemIds !== undefined && !Array.isArray(suppliedItemIds)) {
    throw new TypeError("respond result suppliedItemIds must be an array");
  }
  const correctionText = typeof correction === "string" && correction !== "" ? correction : null;
  return {
    text,
    correction: correctionText,
    suppliedItemIds: correctionText === null ? [] : [...(suppliedItemIds ?? [])].filter((id) => typeof id === "string"),
    observation: normalizeObservation(observation),
  };
}

/**
 * A responder may propose evidence; the backend service still decides whether
 * the protocol accepts it. Anything obviously malformed is rejected here so the
 * failure surfaces as a readable error instead of a half-written observation.
 *
 * @param {unknown} value
 */
function normalizeObservation(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object") throw new TypeError("observation must be an object");
  const { itemId, kind, rationale, textSource, observedSpan, supportTurnId } = /** @type {Record<string, unknown>} */ (value);
  if (typeof itemId !== "string" || typeof kind !== "string") {
    throw new TypeError("observation needs itemId and kind");
  }
  return {
    itemId,
    kind,
    rationale: typeof rationale === "string" && rationale.trim() !== ""
      ? rationale
      : "Mock responder proposed this observation.",
    textSource: textSource === "correction" ? "correction" : "text",
    observedSpan: observedSpan ?? null,
    supportTurnId: typeof supportTurnId === "string" ? supportTurnId : null,
  };
}

/**
 * Create one in-memory conversation.
 *
 * @param {object} options
 * @param {Respond} options.respond Injected responder. Tests pass a controllable promise.
 * @param {string} [options.conversationId]
 * @param {string} [options.contextId] Situation label for traceability, not a message counter.
 * @param {() => Date} [options.now] Clock injection for deterministic timestamps.
 * @param {() => string} [options.makeId] Turn ID factory.
 */
export function createChatSession({
  respond,
  conversationId = "conv:local-1",
  contextId = "ctx:local-1",
  now = () => new Date(),
  makeId = defaultMakeId,
} = {}) {
  if (typeof respond !== "function") {
    throw new TypeError("createChatSession requires a respond function");
  }

  /** @type {Set<(state: ReturnType<typeof getState>) => void>} */
  const listeners = new Set();
  const service = createConversationService({
    conversationId,
    contextId,
    clock: now,
    // The service asks with a prefix; this session keeps its own id factory.
    makeId: () => makeId(),
  });
  let correctionMode = false;
  let requestCounter = 0;
  /** @type {{learnerTurnId: string, text: string, correctionMode: boolean, requestId: number} | null} */
  let pending = null;
  /** @type {{learnerTurnId: string, message: string} | null} */
  let error = null;

  function getState() {
    return Object.freeze({
      conversationId,
      contextId,
      correctionMode,
      busy: pending !== null,
      pending: pending === null
        ? null
        : { learnerTurnId: pending.learnerTurnId, text: pending.text, correctionMode: pending.correctionMode },
      error: error === null ? null : { ...error },
      turns: service.getTurns(),
      observations: service.getObservations(),
    });
  }

  function notify() {
    const state = getState();
    for (const listener of [...listeners]) listener(state);
  }

  /**
   * @param {object} learnerTurn The learner turn this request answers.
   */
  function startRequest(learnerTurn) {
    const requestId = ++requestCounter;
    pending = {
      learnerTurnId: learnerTurn.id,
      text: learnerTurn.text,
      correctionMode: learnerTurn.correctionMode,
      requestId,
    };
    error = null;
    notify();

    const isCurrent = () => pending !== null && pending.requestId === requestId;
    const request = {
      text: learnerTurn.text,
      correctionMode: learnerTurn.correctionMode,
      learnerTurnId: learnerTurn.id,
    };

    /** @type {ChatTurnResult | Promise<ChatTurnResult>} */
    let outcome;
    try {
      outcome = respond(request);
    } catch (cause) {
      pending = null;
      error = { learnerTurnId: learnerTurn.id, message: readableMessage(cause) };
      notify();
      return;
    }

    Promise.resolve(outcome)
      .then(normalizeResult)
      .then((result) => {
        if (!isCurrent()) return;
        service.addAssistantTurn({
          text: result.text,
          correction: result.correction,
          sourceTurnId: result.correction === null ? null : learnerTurn.id,
          suppliedItemIds: result.suppliedItemIds,
          correctionMode: learnerTurn.correctionMode,
        });
        // The responder may propose evidence; the backend service decides what
        // the protocol accepts and only then records it.
        if (result.observation !== null) {
          service.observe({
            itemId: result.observation.itemId,
            kind: result.observation.kind,
            turnId: learnerTurn.id,
            textSource: result.observation.textSource,
            observedSpan: result.observation.observedSpan,
            supportTurnId: result.observation.supportTurnId,
            rationale: result.observation.rationale,
          });
        }
        pending = null;
        notify();
      })
      .catch((cause) => {
        if (!isCurrent()) return;
        pending = null;
        error = { learnerTurnId: learnerTurn.id, message: readableMessage(cause) };
        notify();
      });
  }

  /**
   * Submit learner text. The original string is preserved exactly as received.
   * @param {string} text
   */
  function send(text) {
    if (typeof text !== "string") throw new TypeError("send requires a string");
    if (pending !== null) return Object.freeze({ status: "rejected", reason: REJECTED.pending });
    if (text.trim() === "") return Object.freeze({ status: "rejected", reason: REJECTED.blank });

    const learnerTurn = service.addLearnerTurn({ text, correctionMode });
    startRequest(learnerTurn);
    return Object.freeze({ status: "accepted", learnerTurnId: learnerTurn.id });
  }

  /**
   * Retry the failed submission. Reuses that turn's original text and the
   * preference captured when it was submitted, and never appends another copy
   * of the learner message.
   */
  function retry() {
    if (pending !== null) return Object.freeze({ status: "rejected", reason: REJECTED.pending });
    if (error === null) return Object.freeze({ status: "rejected", reason: REJECTED.noError });

    const { learnerTurnId } = error;
    const learnerTurn = service.getTurns().find((turn) => turn.id === learnerTurnId);
    if (learnerTurn === undefined) {
      error = null;
      notify();
      return Object.freeze({ status: "rejected", reason: REJECTED.noError });
    }
    startRequest(learnerTurn);
    return Object.freeze({ status: "accepted", learnerTurnId });
  }

  /**
   * Toggle the preference. It applies to submissions made after this call; a
   * request already in flight keeps the value captured when it started.
   * @param {boolean} value
   */
  function setCorrectionMode(value) {
    const next = Boolean(value);
    if (next === correctionMode) return;
    correctionMode = next;
    notify();
  }

  /** @param {(state: ReturnType<typeof getState>) => void} listener */
  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  /** @param {string} text */
  function canSend(text) {
    return pending === null && typeof text === "string" && text.trim() !== "";
  }

  /**
   * @param {string} itemId Accepted-evidence view for one lexical item, or null.
   * @param {{ label?: string }} [options] Display label for the item.
   */
  function getProgress(itemId, options) {
    return service.progressFor(itemId, options);
  }

  return Object.freeze({
    getState, send, retry, setCorrectionMode, subscribe, canSend,
    getProgress,
    getObservations: service.getObservations,
    policyVersion: service.policyVersion,
  });
}
