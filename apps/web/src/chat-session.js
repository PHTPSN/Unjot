










import { createConversationService } from "./backend/index.js";


export const REJECTED = Object.freeze({
  
  blank: "blank",
  
  pending: "pending",
  
  noError: "no-error",
});


function defaultMakeId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (typeof uuid === "string") return `turn:${uuid}`;
  return `turn:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

















function readableMessage(cause) {
  if (cause instanceof Error && cause.message.trim() !== "") return cause.message;
  if (typeof cause === "string" && cause.trim() !== "") return cause;
  return "Mock request failed. Retry, or try again after checking the injected failure.";
}


function normalizeResult(result) {
  if (typeof result !== "object" || result === null) {
    throw new TypeError("respond must resolve to a ChatTurnResult object");
  }
  const { text, correction, suppliedItemIds, observation } =  (result);
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








function normalizeObservation(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object") throw new TypeError("observation must be an object");
  const { itemId, kind, rationale, textSource, observedSpan, supportTurnId } =  (value);
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

  
  const listeners = new Set();
  const service = createConversationService({
    conversationId,
    contextId,
    clock: now,
    
    makeId: () => makeId(),
  });
  let correctionMode = false;
  let requestCounter = 0;
  
  let pending = null;
  
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

  



  function send(text) {
    if (typeof text !== "string") throw new TypeError("send requires a string");
    if (pending !== null) return Object.freeze({ status: "rejected", reason: REJECTED.pending });
    if (text.trim() === "") return Object.freeze({ status: "rejected", reason: REJECTED.blank });

    const learnerTurn = service.addLearnerTurn({ text, correctionMode });
    startRequest(learnerTurn);
    return Object.freeze({ status: "accepted", learnerTurnId: learnerTurn.id });
  }

  




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

  




  function setCorrectionMode(value) {
    const next = Boolean(value);
    if (next === correctionMode) return;
    correctionMode = next;
    notify();
  }

  
  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  
  function canSend(text) {
    return pending === null && typeof text === "string" && text.trim() !== "";
  }

  



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
