/**
 * The backend boundary the Web app is allowed to use.
 *
 *   UI (app.js / chat-session.js)
 *        ↓
 *   backend/  ← this folder: contracts, conversation + evidence, settings
 *        ↓
 *   model/    ← shared vocabulary (providers, agent, observation kinds, stages)
 *        ↓
 *   packages/protocol + packages/lexical-core (repo contracts and graph)
 *
 * Still in-process and storage-free: no HTTP server, no model call, no
 * persistence. Replacing this folder with a client for the real service must
 * keep the same function shapes.
 */

export * from "./contracts.js";
export * from "./conversation-service.js";
export * from "./settings-service.js";
