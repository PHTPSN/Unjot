/**
 * Web UI model — the browser shell (data-shell="web" in the prototype).
 *
 * The shell owns a real URL, so screens are routes, sessions are tabs, and all
 * state has to survive a reload without a server. Everything stays local: no
 * account, no cloud dependency.
 */

import { NON_COERCIVE, createPreferences, createPathStage } from "./entities.js";
import { EMPTY_AREA_REASON } from "./empty.js";

export const WEBUI_SCREENS = Object.freeze([
  "conversation", "new", "recent", "language", "path", "library", "settings",
]);

export const WEBUI_TOOLS = Object.freeze([
  { id: "rewrite", state: "modelled" },
  { id: "scenario", state: "modelled" },
  { id: "listening", state: "modelled" },
  { id: "review", state: "descriptive-only" },
  { id: "explain", state: "empty", reason: EMPTY_AREA_REASON.explain },
]);

export function createWebUiModel() {
  return Object.freeze({
    shell: "webui",
    screens: WEBUI_SCREENS,
    tools: WEBUI_TOOLS,
    routes: Object.freeze({
      conversation: "/conversation",
      new: "/new",
      recent: "/recent",
      language: "/language",
      path: "/path",
      library: "/library",
      settings: "/settings",
    }),
    storage: Object.freeze({
      conversations: "indexeddb",
      observations: "indexeddb",
      prefs: "localstorage",
      materials: "opfs",
      keys: "browser-secure-store",
      offline: "required",
    }),
    engine: Object.freeze({
      placement: "in-page-worker", // or a loopback service the user runs
      requiresServer: false,
      streaming: "worker-postMessage",
    }),
    session: Object.freeze({
      identity: "anonymous-local",
      multiTabLock: true, // one writer per conversation across tabs
      resumable: true,
    }),
    native: Object.freeze({
      notifications: false, // opt-in only, never a nudge by default
      vibration: false,
      sound: false,
      deepLinks: true,
    }),
    navigation: Object.freeze({
      history: "browser",
      shareableLinks: true,
      backButton: true,
    }),
    a11y: Object.freeze({
      reducedMotion: true,
      reducedTransparency: true,
      contrast: true,
      dynamicType: true,
    }),
    progress: NON_COERCIVE,
    summary: "浏览器壳：URL 即路由，IndexedDB 保存对话与证据，无服务器依赖。",
  });
}

/** Path stages are descriptive for both shells; kept here as the shared default. */
export function createDefaultPathStages() {
  return Object.freeze([
    createPathStage({ id: "start-speaking", title: "敢开口", description: "点单、问路、自我介绍这类日常场景。" }),
    createPathStage({ id: "keep-going", title: "聊得下去", description: "表达观点、描述经历、处理小问题。" }),
    createPathStage({ id: "sound-natural", title: "说得自然", description: "语气、幽默、不同场合的说法。" }),
  ]);
}

export function createWebUiPreferences(overrides = {}) {
  return createPreferences(overrides);
}
