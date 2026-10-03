/**
 * GUI model — the desktop shell (data-shell="app" in the prototype; also the
 * single-file desktop-inline build).
 *
 * The shell owns a native window, so there is no address bar: screens are an
 * in-app stack, state lives in local files, and secrets belong in the OS
 * keychain. It must also work as one self-contained file, so the engine has to
 * be inlinable rather than depending on a bundled server.
 */

import { NON_COERCIVE } from "./entities.js";
import { EMPTY_AREA_REASON } from "./empty.js";
import { WEBUI_SCREENS } from "./webui.js";

export const GUI_TOOLS = Object.freeze([
  { id: "rewrite", state: "modelled" },
  { id: "scenario", state: "modelled" },
  { id: "listening", state: "modelled" },
  { id: "review", state: "descriptive-only" },
  { id: "explain", state: "empty", reason: EMPTY_AREA_REASON.explain },
]);

export function createGuiModel() {
  return Object.freeze({
    shell: "gui",
    screens: WEBUI_SCREENS, // same seven screens, different navigation plumbing
    tools: GUI_TOOLS,
    navigation: Object.freeze({
      history: "in-app-stack",
      shareableLinks: false,
      deepLinks: "unjot://",
      backButton: true,
    }),
    window: Object.freeze({
      singleInstance: true,
      rememberBounds: true,
      inlineBuild: true, // desktop-inline.html must stay self-contained
    }),
    storage: Object.freeze({
      conversations: "sqlite",
      observations: "sqlite",
      prefs: "sqlite",
      materials: "app-data-dir",
      keys: "os-keychain",
      offline: "required",
    }),
    engine: Object.freeze({
      placement: "in-process", // or a bundled sidecar the app supervises
      requiresServer: false,
      streaming: "ipc-events",
    }),
    session: Object.freeze({
      identity: "anonymous-local",
      multiTabLock: false, // single instance replaces per-tab locking
      resumable: true,
    }),
    native: Object.freeze({
      notifications: false, // opt-in only
      vibration: true,
      sound: true,
      tray: false,
      fileDrop: true,
      autoUpdate: true,
    }),
    a11y: Object.freeze({
      reducedMotion: true,
      reducedTransparency: true,
      contrast: true,
      dynamicType: true,
    }),
    progress: NON_COERCIVE,
    summary: "应用窗口：应用内导航栈，SQLite 落盘，密钥进系统钥匙串，支持单文件内联构建。",
  });
}
