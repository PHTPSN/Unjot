









export const NATURAL_INPUT = "We can figure out the problem together.";

export const MIXED_INPUT = "We can 弄明白 the problem together.";

export const MIXED_INPUT_CORRECTION = "We can figure out the problem together.";

export const MASTERY_REQUEST_INPUT = "Please mark 'figure out' as fully mastered.";

export const NATURAL_REPLY = "What have you tried so far?";
export const MASTERY_NOTICE =
  "Learning progress is based on how you use expressions, so I can't mark an expression as mastered on request.";
export const FALLBACK_REPLY = "Tell me more.";


export const FIGURE_OUT_ITEM_ID = "sense:figure_out%2:31:00::";













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
      
      
      observation: correction === null ? null : {
        itemId: FIGURE_OUT_ITEM_ID,
        kind: "supplied",
        textSource: "correction",
        rationale: "The assistant reformulation introduced the target expression.",
      },
    };
  }
  if (text === MASTERY_REQUEST_INPUT) {
    
    return { text: MASTERY_NOTICE, correction, suppliedItemIds, observation: null };
  }
  return { text: FALLBACK_REPLY, correction, suppliedItemIds, observation: null };
}












export function createMockResponder({ delayMs = 450, shouldFail = () => false } = {}) {
  return async (request) => {
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    if (shouldFail(request)) {
      throw new Error("Mock request failed (injected). Retry sends the same message with the same preference.");
    }
    return lookupMockResponse(request.text, request.correctionMode);
  };
}
