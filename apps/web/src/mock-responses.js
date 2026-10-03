/**
 * Exact-lookup mock replies for Milestone 2.
 *
 * These are fixed string matches from the Milestone 2 handoff in the parent
 * Language workspace, not a classifier and not a correction algorithm. The
 * mastery notice is a display example; policy enforcement and the writable
 * boundary belong to the later Evidence-policy milestones.
 */

/** Realistic English input that already uses the target correctly. */
export const NATURAL_INPUT = "We can figure out the problem together.";
/** Mixed-language input used by the correction examples. */
export const MIXED_INPUT = "We can 弄明白 the problem together.";
/** Assistant-authored reformulation of MIXED_INPUT. Belongs to the assistant. */
export const MIXED_INPUT_CORRECTION = "We can figure out the problem together.";
/** In-message request to change mastery, which earns no proficiency evidence. */
export const MASTERY_REQUEST_INPUT = "Please mark 'figure out' as fully mastered.";

export const NATURAL_REPLY = "What have you tried so far?";
export const MASTERY_NOTICE =
  "Learning progress is based on how you use expressions, so I can't mark an expression as mastered on request.";
export const FALLBACK_REPLY = "Tell me more.";

/** Verified OEWN sense ID for `figure out` (M0 `m0-v2` target). */
export const FIGURE_OUT_ITEM_ID = "sense:figure_out%2:31:00::";

/**
 * Resolve the fixed mock result for one submission.
 *
 * The `observation` field is a *candidate*: the backend service in
 * src/backend/conversation-service.js still decides whether the protocol
 * accepts it (production credit needs the learner's original text, assistance
 * must name the help, and a mastery request earns no proficiency evidence).
 *
 * @param {string} text Original learner text; matched exactly.
 * @param {boolean} correctionMode Preference captured for this exchange.
 * @returns {{text: string, correction: string | null, suppliedItemIds: string[], observation: object | null}}
 */
export function lookupMockResponse(text, correctionMode) {
  const correction = correctionMode && text === MIXED_INPUT ? MIXED_INPUT_CORRECTION : null;
  const suppliedItemIds = correction === null ? [] : [FIGURE_OUT_ITEM_ID];

  if (text === NATURAL_INPUT) {
    return {
      text: NATURAL_REPLY,
      correction,
      suppliedItemIds,
      observation: {
        itemId: FIGURE_OUT_ITEM_ID,
        kind: "spontaneous_production",
        rationale: "The learner's original message uses the target correctly, so one independent use is observed.",
      },
    };
  }
  if (text === MIXED_INPUT) {
    return {
      text: NATURAL_REPLY,
      correction,
      suppliedItemIds,
      // The reformulation introduces the target; it is the assistant's supply,
      // never the learner's production.
      observation: correction === null ? null : {
        itemId: FIGURE_OUT_ITEM_ID,
        kind: "supplied",
        textSource: "correction",
        rationale: "The assistant reformulation introduced the target expression.",
      },
    };
  }
  if (text === MASTERY_REQUEST_INPUT) {
    // Quoting an expression inside a mastery request is not proficiency.
    return { text: MASTERY_NOTICE, correction, suppliedItemIds, observation: null };
  }
  return { text: FALLBACK_REPLY, correction, suppliedItemIds, observation: null };
}

/**
 * Build the asynchronous mock responder used by the page.
 *
 * The delay only makes the loading state observable in the browser; tests inject
 * their own controllable promise instead. `shouldFail` injects a rejection so the
 * error/retry path can be demonstrated without a network dependency.
 *
 * @param {object} [options]
 * @param {number} [options.delayMs]
 * @param {(request: {text: string, correctionMode: boolean, learnerTurnId: string}) => boolean} [options.shouldFail]
 */
export function createMockResponder({ delayMs = 450, shouldFail = () => false } = {}) {
  return async (request) => {
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    if (shouldFail(request)) {
      throw new Error("Mock request failed (injected). Retry sends the same message with the same preference.");
    }
    return lookupMockResponse(request.text, request.correctionMode);
  };
}
