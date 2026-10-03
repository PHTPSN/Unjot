









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
    screens: WEBUI_SCREENS, 
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
      inlineBuild: true, 
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
      placement: "in-process", 
      requiresServer: false,
      streaming: "ipc-events",
    }),
    session: Object.freeze({
      identity: "anonymous-local",
      multiTabLock: false, 
      resumable: true,
    }),
    native: Object.freeze({
      notifications: false, 
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
