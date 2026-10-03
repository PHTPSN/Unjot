# Unjot Web — Milestone 2

## What runs here

`index.html` is the full app: seven screens (conversation, new chat, recent, my
language, learning path, library, settings) plus the tools panel, driven by
`src/ui.js`. The early minimal chat page has been retired — its logic is kept
for reference in `src/legacy-shell.js` and nothing references it.

```powershell
node apps/web/server.mjs      # → http://127.0.0.1:5173
```

The UI never builds protocol data itself:

```
index.html → src/ui.js ─┐
                        ├→ src/chat-session.js → src/backend/** → src/model/** → packages/protocol
                        └→ src/backend/settings-service.js
```

What is connected today:

| Surface | Goes through | Result |
| --- | --- | --- |
| Sending a message | `chat-session` → `backend/conversation-service` | `ConversationTurn`s, one in-flight request, retry reuses the original submission |
| Evidence | `conversation-service.observe` | A candidate observation is accepted or rejected (production needs the learner's original text; a reformulation is `supplied`, never production) |
| Progress shown under a reply | `conversation-service.progressFor` | A `LearnerItemState` projection rendered as a sentence — never a percentage |
| Settings → AI provider | `backend/settings-service` → `model/entities.js` | Mainstream provider auto-fills Base URL + default model; `custom` is the only one that brings its own absolute `http(s)` URL; the API key is stored as a *reference*, and the dropdown options are generated from `PROVIDER_PRESETS` |
| Settings → Agent fields | `settings-service.setAgent` → `createAgentProfile` | Enum/tool validation comes from the model layer, so the UI cannot save a value the backend rejects |

Correction mode follows m0-v2: off by default, captured at submission, and the
assistant's natural version never counts as the learner's production.

Still missing on purpose: no HTTP server, no persistence, no model call, no
graph lookup.

Deterministic chat shell implementing the Milestone 2 contract (the handoff itself
lives in the parent Language workspace, outside this Web-only repository). All
replies are mocked; there is no persistence, model call, graph lookup, semantic
judgment, Evidence generation, or learner-state write in M2.

中文：本目录实现 M2 的确定性聊天外壳。交接文档保留在父级 Language 工作区，
不随这个纯 Web 仓库分发；回复全部为模拟数据，不含持久化、模型调用、图谱查询、
语义判断、Evidence 生成或学习状态写入。

## Run

```powershell
node apps/web/server.mjs
```

Then open <http://127.0.0.1:5173>. Set `UNJOT_WEB_PORT` to change the port.

## Tests

```powershell
node --test "apps/web/tests/*.test.mjs"
```

The tests drive the session with a controllable promise, so they never sleep for
the mock delay and never touch the network.

## Model layer

`src/model/` holds the frontend data model, split by shell:

| File | Scope |
| --- | --- |
| `entities.js` | Shared vocabulary: learner profile, preferences, path stages, scenarios, materials, observation kinds, progress sentences, agent profile, provider presets and custom-endpoint config |
| `empty.js` | Deliberately empty areas: the Explain tool and lexical entries (词条) |
| `webui.js` | Browser shell: routes, IndexedDB/OPFS storage, browser key store, multi-tab lock |
| `gui.js` | Desktop shell: navigation stack, SQLite storage, OS keychain, single instance, inline build |
| `index.js` | Re-exports |

Two product decisions are encoded rather than documented:

- **Non-coercive** — no minimum turns, no required context switch, no scheduled
  review, no locked stages, no reminders by default; progress is rendered as an
  evidence sentence, never a percentage.
- **De-gamified** — XP, streaks, badges, goal rings, reward chests and
  celebration are absent; `findForbiddenKeys()` fails a model that reintroduces
  them.

## Backend boundary

`src/backend/` is the only place the UI is allowed to build protocol data:

| File | Responsibility |
| --- | --- |
| `contracts.js` | Runtime field sets for the four contracts in `packages/protocol/src/`, plus `assertContract` / `missingContractFields` / `extraContractFields` |
| `conversation-service.js` | Builds `ConversationTurn`s, accepts `EvidenceEvent`s under the m0-v2 rules, and derives `LearnerItemState` + its display sentence |
| `settings-service.js` | Provider auto-fill (`PROVIDER_PRESETS`), custom endpoints, key *references*, agent profile; persistence is an injected port (memory by default) |

Flow: `app.js / chat-session.js → backend/ → model/ → packages/protocol`.
`chat-session.js` no longer assembles turns itself: it calls the service, so the
UI cannot invent a protocol field. Evidence policy lives in the service:

- production credit requires the learner's original text (`textSource: "text"`),
- `assisted_production` must name the help that was adopted,
- a mastery request, an assistant reformulation, or a failure never becomes the
  learner's production,
- one independent use is one observation; two contexts make it repeated.

Still missing on purpose: no HTTP server, no persistence, no model call, no
graph lookup. Replacing `backend/` with a client for the real service must keep
the same function shapes.

## Verification

```powershell
node --test "apps/web/tests/*.test.mjs"   # 38 tests: chat shell, model, backend
```

`tests/backend.test.mjs` reads `packages/protocol/src/*.ts` and fails if the
runtime contract fields drift from the TypeScript contracts.

## Implementation note

The handoff names the planned Next.js/React stack, which is not in the repository
yet. This shell is written as dependency-free ES modules plus a small static
server so it runs offline today; `src/chat-session.js` is UI-independent and can
be reused as-is by a React shell. Every stored message mirrors the shared
`ConversationTurn` contract in `packages/protocol/src/conversation-turn.ts`.

The root README plans the Next.js application at the repository root, so this
directory is the current staging location rather than the final layout; move it
when the Next.js app is scaffolded.

## Fixed behavior covered here

- Blank and whitespace-only submissions are rejected and append nothing.
- One in-flight request at a time; duplicate sends are rejected.
- Correction mode defaults off and is captured at submission. Toggling while a
  request is pending affects later submissions only.
- Learner text is rendered exactly as submitted, and the assistant correction
  references that learner turn ID and renders before the reply.
- An injected failure shows a readable error with Retry; retry reuses the original
  text and captured preference, adds no second learner message, and on success
  appends exactly one assistant reply.

## Verification record (2026-10-03, Node.js v24.21.0)

| Command | Result |
| --- | --- |
| `node --test apps/web/tests/chat-session.test.mjs` | 11 tests pass |
| `node --test packages/golden-tests/lexical-core.test.mjs packages/golden-tests/milestone-0.test.mjs` | 16 tests pass (M0/M1A fixtures, unchanged) |
| `node apps/web/server.mjs` | serves `http://127.0.0.1:5173` |

Browser walkthrough of the same build:

| Step | Observed |
| --- | --- |
| `We can figure out the problem together.`, mode off | Learner bubble keeps the original text; reply `What have you tried so far?`; turn meta shows `修正模式：关` |
| Mixed input, mode on | Learner bubble keeps `We can 弄明白 the problem together.`; assistant renders `地道版本（助手提供）` before the reply; turn meta shows `修正模式：开` |
| Send while a request is pending | Send button disabled; no second learner turn is appended |
| Injected failure | Readable error plus Retry appears under that learner turn |
| Retry | Original text and captured preference reused; learner turns stay at 3; exactly one assistant reply is added |

`npm run check` (repository typecheck) needs `npm ci` first, which downloads
TypeScript; it is not required to run or verify this shell.
