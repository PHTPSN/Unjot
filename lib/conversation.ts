import type { ConversationTurn } from "../packages/protocol/src/conversation-turn.ts";
import type { AssistantReply } from "./chat-types.ts";

export type TurnSubmission = {
  readonly submissionId: string;
  readonly turn: ConversationTurn;
  readonly correctionMode: boolean;
  readonly history: readonly ConversationTurn[];
};

export type Reply = {
  readonly text: string;
  readonly correction: string | null;
  readonly lookupResults?: AssistantReply["lookupResults"];
  readonly assistantTurn?: ConversationTurn;
  readonly learnerTurn?: ConversationTurn;
};

export type SavedConversation = {
  conversationId?: string;
  turns: readonly ConversationTurn[];
  correctionMode: boolean;
  lookupResultsByTurnId: ConversationState["lookupResultsByTurnId"];
  processing?: { id: string; turn: ConversationTurn } | null;
  unfinished: { id: string; turn: ConversationTurn } | null;
};

export type MockReply = Reply;

export type ConversationState = {
  readonly turns: readonly ConversationTurn[];
  readonly correctionMode: boolean;
  readonly pending: boolean;
  readonly error: string | null;
  readonly lookupResultsByTurnId: Readonly<Record<string, AssistantReply["lookupResults"]>>;
};

export type ReplyProvider = (submission: TurnSubmission) => Promise<MockReply>;

const INITIAL_STATE: ConversationState = {
  turns: [],
  correctionMode: false,
  pending: false,
  error: null,
  lookupResultsByTurnId: {},
};

export class ConversationController {
  private conversationId = "local-conversation";
  private state: ConversationState = INITIAL_STATE;
  private retrySubmission: TurnSubmission | null = null;
  private readonly replyProvider: ReplyProvider;
  private readonly listeners = new Set<() => void>();
  private readonly createId: () => string;
  private readonly now: () => string;

  constructor(
    replyProvider: ReplyProvider = createMockReplyProvider(),
    createId: () => string = () => crypto.randomUUID(),
    now: () => string = () => new Date().toISOString(),
  ) {
    this.replyProvider = replyProvider;
    this.createId = createId;
    this.now = now;
  }

  readonly getSnapshot = (): ConversationState => this.state;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  setCorrectionMode(correctionMode: boolean): void {
    this.update({ correctionMode });
  }

  restore(saved: SavedConversation): void {
    this.conversationId = saved.conversationId ?? this.conversationId;
    this.retrySubmission = saved.unfinished ? {
      submissionId: saved.unfinished.id, turn: saved.unfinished.turn,
      correctionMode: saved.unfinished.turn.correctionMode,
      history: saved.turns.filter(t => t.sequence < saved.unfinished!.turn.sequence),
    } : null;
    this.update({ turns: saved.turns, correctionMode: saved.correctionMode,
      lookupResultsByTurnId: saved.lookupResultsByTurnId,
      pending: Boolean(saved.processing),
      error: saved.unfinished ? "Your saved message needs a reply. Retry when ready." : null });
  }

  async send(text: string): Promise<boolean> {
    if (this.state.pending || this.retrySubmission || !text.trim()) return false;

    const learnerTurn: ConversationTurn = {
      id: this.createId(),
      conversationId: this.conversationId,
      sequence: (this.state.turns.at(-1)?.sequence ?? 0) + 1,
      role: "learner",
      contextId: "free-chat",
      text,
      occurredAt: this.now(),
      suppliedItemIds: [],
      correctionMode: this.state.correctionMode,
      correction: null,
    };
    const submission = {
      submissionId: learnerTurn.id,
      turn: learnerTurn,
      correctionMode: this.state.correctionMode,
      history: this.state.turns,
    };
    this.retrySubmission = submission;
    this.update({ turns: [...this.state.turns, learnerTurn], pending: true, error: null });
    return this.complete(submission);
  }

  async retry(): Promise<boolean> {
    if (this.state.pending || !this.retrySubmission) return false;
    this.update({ pending: true, error: null });
    return this.complete(this.retrySubmission);
  }

  private async complete(submission: TurnSubmission): Promise<boolean> {
    let reply: MockReply;
    try {
      reply = await this.replyProvider(submission);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Your message could not be sent.";
      this.update({ pending: false, error: `${reason} Retry when ready.` });
      return false;
    }

    const assistantTurn: ConversationTurn = reply.assistantTurn ?? {
      id: this.createId(),
      conversationId: submission.turn.conversationId,
      sequence: this.state.turns.length + 1,
      role: "assistant",
      contextId: submission.turn.contextId,
      text: reply.text,
      occurredAt: this.now(),
      suppliedItemIds: [],
      correctionMode: submission.correctionMode,
      correction: reply.correction
        ? { sourceTurnId: submission.turn.id, text: reply.correction }
        : null,
    };
    this.retrySubmission = null;
    this.update({
      turns: [...this.state.turns.map(t => t.id === reply.learnerTurn?.id ? reply.learnerTurn : t), assistantTurn],
      pending: false,
      error: null,
      lookupResultsByTurnId: {
        ...this.state.lookupResultsByTurnId,
        [assistantTurn.id]: reply.lookupResults ?? [],
      },
    });
    return true;
  }

  private update(changes: Partial<ConversationState>): void {
    this.state = { ...this.state, ...changes };
    for (const listener of this.listeners) listener();
  }
}

export function replyFor(submission: TurnSubmission): MockReply {
  const text = submission.turn.text;
  if (text === "We can figure out the problem together.") {
    return { text: "What have you tried so far?", correction: null };
  }
  if (text === "We can 弄明白 the problem together.") {
    return {
      text: "What have you tried so far?",
      correction: submission.correctionMode ? "We can figure out the problem together." : null,
    };
  }
  if (
    text === "Please mark 'figure out' as fully mastered." ||
    text === 'Please mark "figure out" as fully mastered.'
  ) {
    return {
      text: "Learning progress is based on how you use expressions, so I can't mark an expression as mastered on request.",
      correction: null,
    };
  }
  return { text: "Tell me more.", correction: null };
}

export function createMockReplyProvider(delayMs = 360, failFirst = false): ReplyProvider {
  let shouldFail = failFirst;
  return async submission => {
    await new Promise<void>(resolve => globalThis.setTimeout(resolve, delayMs));
    if (shouldFail) {
      shouldFail = false;
      throw new Error("Injected mock failure");
    }
    return replyFor(submission);
  };
}

export function createApiReplyProvider(fetcher: typeof fetch = fetch): ReplyProvider {
  return async submission => {
    const response = await fetcher("/api/conversation/turn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: submission.turn.text,
        submissionId: submission.submissionId,
        correctionMode: submission.correctionMode,
        conversationId: submission.turn.conversationId,
      }),
    });
    const payload = await response.json() as {
      assistantMessage?: Reply;
      error?: string;
    };
    if (!response.ok) throw new Error(payload.error ?? `The model request failed (HTTP ${response.status}).`);
    if (!payload.assistantMessage || typeof payload.assistantMessage.text !== "string") {
      throw new Error("The model endpoint returned an invalid response.");
    }
    return {
      text: payload.assistantMessage.text,
      correction: payload.assistantMessage.correction ?? null,
      lookupResults: payload.assistantMessage.lookupResults ?? [],
      assistantTurn: payload.assistantMessage.assistantTurn,
      learnerTurn: payload.assistantMessage.learnerTurn,
    };
  };
}
