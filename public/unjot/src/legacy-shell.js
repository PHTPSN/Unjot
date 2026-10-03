import { createChatSession, REJECTED } from "./chat-session.js";
import { createMockResponder } from "./mock-responses.js";

const elements = {
  log: document.querySelector("#message-log"),
  form: document.querySelector("#composer"),
  input: document.querySelector("#message-input"),
  send: document.querySelector("#send-button"),
  correctionToggle: document.querySelector("#correction-toggle"),
  failNext: document.querySelector("#fail-next"),
  status: document.querySelector("#status"),
  empty: document.querySelector("#empty-state"),
};

/** Injected failure switch for demonstrating the error/retry path. */
let failNextRequest = false;

const session = createChatSession({
  respond: createMockResponder({
    shouldFail: () => {
      if (!failNextRequest) return false;
      failNextRequest = false;
      elements.failNext.checked = false;
      return true;
    },
  }),
});

const ROLE_LABEL = { learner: "你", assistant: "Unjot" };

/** `sense:figure_out%2:31:00::` reads badly in the UI; show `figure out`. */
/** @param {string} itemId */
function itemLabel(itemId) {
  return itemId.replace(/^sense:/, "").replace(/%2.*$/, "").replace(/_/g, " ");
}

/** @param {string} tag @param {string} className @param {string} [text] */
function make(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** @param {object} turn @param {object} state @param {string | null} [evidenceFor] */
function renderTurn(turn, state, evidenceFor = null) {
  const article = make("article", `turn turn--${turn.role}`);
  const meta = make("p", "turn__meta");
  meta.append(
    make("span", "turn__role", ROLE_LABEL[turn.role]),
    make("span", "turn__preference", turn.correctionMode ? "修正模式：开" : "修正模式：关"),
  );
  article.append(meta);

  if (turn.role === "learner") {
    // Original text is rendered verbatim. Nothing is translated or repaired here.
    article.append(make("p", "bubble bubble--learner", turn.text));
    if (state.error && state.error.learnerTurnId === turn.id) {
      const failure = make("div", "failure");
      failure.append(
        make("p", "failure__text", state.error.message),
        make("button", "button button--retry", "重试"),
      );
      failure.querySelector("button").addEventListener("click", () => session.retry());
      article.append(failure);
    }
    return article;
  }

  if (turn.correction) {
    const correction = make("div", "correction");
    correction.append(
      make("p", "correction__label", "地道版本（助手提供）"),
      make("p", "correction__text", turn.correction.text),
    );
    article.append(correction);
  }
  article.append(make("p", "bubble bubble--assistant", turn.text));

  // Evidence shown here comes from the backend service: the UI only prints the
  // sentence the service derived from accepted observations.
  if (evidenceFor !== null) {
    const progress = session.getProgress(evidenceFor, { label: itemLabel(evidenceFor) });
    if (progress !== null) {
      article.append(make("p", "evidence", progress.sentence));
    }
  }
  return article;
}

/** @param {ReturnType<typeof session.getState>} state */
function render(state) {
  elements.log.replaceChildren(...state.turns.map((turn, index) => {
    if (turn.role !== "assistant") return renderTurn(turn, state);
    // An observation is recorded against the learner turn the reply answers.
    const learnerTurn = state.turns[index - 1];
    const observation = state.observations.find((event) => event.turnId === learnerTurn?.id);
    return renderTurn(turn, state, observation === undefined ? null : observation.itemId);
  }));
  elements.empty.hidden = state.turns.length > 0;

  if (state.busy) {
    const loading = make("p", "loading", "正在回复…");
    loading.setAttribute("role", "status");
    elements.log.append(loading);
  }
  elements.log.scrollTop = elements.log.scrollHeight;

  const draft = elements.input.value;
  elements.send.disabled = !session.canSend(draft);
  elements.status.textContent = state.busy
    ? `等待中（本次提交的修正模式：${state.pending.correctionMode ? "开" : "关"}）`
    : session.canSend(draft)
      ? "就绪"
      : "输入内容后发送";
}

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const result = session.send(elements.input.value);
  if (result.status === "accepted" || result.reason === REJECTED.blank) {
    elements.input.value = "";
  }
  if (result.reason === REJECTED.blank) elements.input.focus();
  render(session.getState());
});

elements.input.addEventListener("input", () => render(session.getState()));

elements.input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    elements.form.requestSubmit();
  }
});

// The preference stays editable while a request is pending: the in-flight
// response keeps the value captured at submission, later ones use the new value.
elements.correctionToggle.addEventListener("change", () => {
  session.setCorrectionMode(elements.correctionToggle.checked);
});

elements.failNext.addEventListener("change", () => {
  failNextRequest = elements.failNext.checked;
});

session.subscribe(render);
session.subscribe((state) => {
  // Keep the control in sync only when the stored preference itself changed.
  if (elements.correctionToggle.checked !== state.correctionMode) {
    elements.correctionToggle.checked = state.correctionMode;
  }
});
render(session.getState());
elements.input.focus();
/**
 * 已退役：早期的最小聊天外壳（只有一个对话页 + 修正开关）。
 *
 * 现在的应用入口是 index.html + src/ui.js（完整原型：7 屏、设置、Agent 字段、
 * 供应商选择），它同样通过 src/chat-session.js 与 src/backend/** 说话。
 * 这个文件保留下来只作对照，页面里已经没有任何地方引用它。
 */

