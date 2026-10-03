/**
 * Frontend model entry point.
 *
 * Two shells, one vocabulary: `entities.js` defines what the screens talk about,
 * `webui.js` and `gui.js` define how each shell stores, navigates and integrates.
 * `empty.js` holds the deliberately unmodelled areas (Explain, 词条).
 */

export * from "./entities.js";
export * from "./empty.js";
export * from "./webui.js";
export * from "./gui.js";
