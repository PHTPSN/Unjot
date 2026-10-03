/**
 * Conversation + Evidence service: the boundary the Web UI talks to.
 *
 * It owns the objects the backend protocol defines — ConversationTurn,
 * EvidenceEvent and the derived LearnerItemState — so the UI never assembles
 * protocol data by hand. Today the service runs in-process and stores nothing;
 * swapping it for an HTTP client later must not change its public shape.
 *
 * Policy notes (m0-v2): production credit needs the learner's original text,
 * help and failure never advance a stage, and one use is one observation.
 */

import { OBSERVATION_KINDS, STAGES, describeProgress } from "../model/entities.js";
import { POLICY_VERSION, assertContract } from "./contracts.js";

/** Ladder used to project accepted observations onto a stage. */
export const STAGE_RULES = Object.freeze([
  { stage: "repeated_independent_use", test: (c, contexts) => c.spontaneous_production > 0 && contexts.length > 1 },
  { stage: "spontaneous_production", test: (c) => c.spontaneous_production > 0 },
  { stage: "assisted_production", test: (c) => c.assisted_production > 0 },
  { stage: "understood", test: (c) => c.recognized > 0 },
  { stage: "encountered", test: (c) => c.encountered + c.help_requested + c.supplied + c.failed_opportunity + c.uncertain > 0 },
]);

/** @param {object} counts @param {string[]} contexts */
export function stageFromCounts(counts, contexts) {
  for (const rule of STAGE_RULES) {
    if (rule.test(counts, contexts)) return rule.stage;
  }
  return null;
}

function defaultMakeId(prefix) {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ? `${prefix}:${uuid}` : `${prefix}:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * @param {object} [options]
 * @param {string} [options.conversationId]
 * @param {string} [options.contextId]
 * @param {string} [options.deviceId]
 * @param {() => Date} [options.clock]
 * @param {(prefix: string) => string} [options.makeId]
 */
export function createConversationService({
  conversationId = "conv:local-1",
  contextId = "ctx:local-1",
  deviceId = "device:local-1",
  clock = () => new Date(),
  makeId = defaultMakeId,
} = {}) {
  /** @type {object[]} */
  const turns = [];
  /** @type {object[]} */
  const observations = [];
  let sequence = 0;

  /** @param {object} turn */
  function pushTurn(turn) {
    const frozen = Object.freeze(assertContract("conversationTurn", turn));
    turns.push(frozen);
    return frozen;
  }

  /** @param {{ text: string, correctionMode?: boolean }} input */
  function addLearnerTurn({ text, correctionMode = false }) {
    if (typeof text !== "string" || text.trim() === "") {
      throw new TypeError("a learner turn needs non-blank text");
    }
    return pushTurn({
      id: makeId("turn"),
      conversationId,
      sequence: ++sequence,
      role: "learner",
      contextId,
      text, // original text is never rewritten
      occurredAt: clock().toISOString(),
      suppliedItemIds: [],
      correctionMode,
      correction: null,
    });
  }

  /**
   * @param {object} input
   * @param {string} input.text
   * @param {string | null} [input.correction]
   * @param {string | null} [input.sourceTurnId] Learner turn the correction refers to.
   * @param {readonly string[]} [input.suppliedItemIds]
   * @param {boolean} [input.correctionMode]
   */
  function addAssistantTurn({ text, correction = null, sourceTurnId = null, suppliedItemIds = [], correctionMode = false }) {
    if (typeof text !== "string") throw new TypeError("an assistant turn needs text");
    if (correction !== null && sourceTurnId === null) {
      throw new TypeError("a correction must reference the learner turn it rewrites");
    }
    return pushTurn({
      id: makeId("turn"),
      conversationId,
      sequence: ++sequence,
      role: "assistant",
      contextId,
      text,
      occurredAt: clock().toISOString(),
      suppliedItemIds: [...suppliedItemIds],
      correctionMode,
      correction: correction === null ? null : { sourceTurnId, text: correction },
    });
  }

  /**
   * Record an accepted observation. `textSource: "text"` is required for
   * production kinds: the learner's own text is the only thing that can show it.
   *
   * @param {object} input
   * @param {string} input.itemId
   * @param {string} input.kind
   * @param {string} input.turnId
   * @param {string} [input.textSource]
   * @param {{start: number, end: number} | null} [input.observedSpan]
   * @param {string | null} [input.supportTurnId]
   * @param {string} input.rationale
   * @param {string} [input.contextId]
   */
  function observe({
    itemId,
    kind,
    turnId,
    textSource = "text",
    observedSpan = null,
    supportTurnId = null,
    rationale,
    contextId: observationContext = contextId,
  }) {
    if (!OBSERVATION_KINDS.includes(kind)) throw new TypeError(`unknown evidence kind: ${kind}`);
    if (typeof rationale !== "string" || rationale.trim() === "") {
      throw new TypeError("an observation needs a rationale");
    }
    const turn = turns.find((candidate) => candidate.id === turnId);
    if (turn === undefined) throw new TypeError(`observation references an unknown turn: ${turnId}`);
    const isProduction = kind === "spontaneous_production" || kind === "assisted_production";
    if (isProduction && textSource !== "text") {
      throw new TypeError("production credit requires the learner's original text");
    }
    if (kind === "assisted_production" && supportTurnId === null) {
      throw new TypeError("assisted production must name the help that was adopted");
    }

    const event = Object.freeze(assertContract("evidenceEvent", {
      id: makeId("ev"),
      deviceId,
      itemId,
      kind,
      conversationId,
      turnId,
      contextId: observationContext,
      occurredAt: turn.occurredAt,
      source: "conversation",
      textSource,
      observedSpan,
      supportTurnId,
      rationale,
      policyVersion: POLICY_VERSION,
    }));
    observations.push(event);
    return event;
  }

  /** @param {string} itemId @param {{ label?: string }} [options] */
  function progressFor(itemId, { label = itemId } = {}) {
    const accepted = observations.filter((event) => event.itemId === itemId);
    if (accepted.length === 0) return null;

    const counts = Object.fromEntries(OBSERVATION_KINDS.map((kind) => [kind, 0]));
    for (const event of accepted) counts[event.kind] += 1;

    const independentContextIds = [...new Set(
      accepted.filter((event) => event.kind === "spontaneous_production").map((event) => event.contextId),
    )];
    const spontaneous = accepted.filter((event) => event.kind === "spontaneous_production");
    const stage = stageFromCounts(counts, independentContextIds);

    const state = Object.freeze(assertContract("learnerItemState", {
      itemId,
      stage: stage ?? "encountered",
      evidenceIds: accepted.map((event) => event.id),
      counts: Object.freeze(counts),
      independentContextIds: Object.freeze(independentContextIds),
      lastEvidenceAt: accepted.at(-1).occurredAt,
      lastSpontaneousAt: spontaneous.length > 0 ? spontaneous.at(-1).occurredAt : null,
      policyVersion: POLICY_VERSION,
    }));

    return Object.freeze({
      state,
      sentence: describeProgress({
        stage: state.stage,
        independentUses: counts.spontaneous_production,
        independentContexts: independentContextIds.length,
        lastIndependentAt: state.lastSpontaneousAt,
        itemLabel: label,
      }),
    });
  }

  return Object.freeze({
    conversationId,
    contextId,
    policyVersion: POLICY_VERSION,
    stages: STAGES,
    addLearnerTurn,
    addAssistantTurn,
    observe,
    progressFor,
    getTurns: () => Object.freeze([...turns]),
    getObservations: () => Object.freeze([...observations]),
    snapshot: () => Object.freeze({ conversationId, contextId, turns: [...turns], observations: [...observations] }),
  });
}
