# Development log

## 2026-10-04 — M7 Explain and Scenario workflows

Started the first M7 slice with explicit Explain and Scenario workflows. Explain
resolves verified graph facts, reads the corrected learner projection, validates
contextual generated language with the M6 budget, and records an explicit target
exception without creating Evidence. Scenario generates a structured situation,
learner/partner roles and an opening prompt, assigns a real workflow context, and
does not credit unobserved success. Both workflows have local API routes and a
browser tools page; Rewrite, Reading, Listening and Review remain subsequent M7
slices.

### 中文

开始 M7 的第一阶段，实现明确的 Explain 和 Scenario 工作流。Explain 解析已核实的图谱事实，
读取修正后的学习者投影，使用 M6 预算校验语境生成语言，并记录明确的目标例外但不创建 Evidence。
Scenario 生成结构化情境、学习者/伙伴角色和开场提示，分配真实的工作流上下文，不给未观察到的成功记能力。
两个工作流都有本地 API 路由和浏览器工具页；Rewrite、Reading、Listening 和 Review 属于后续 M7 阶段。

## 2026-10-04 — M6 learner-aware checked replies

Started M6 on `feat/m3-knowledge-graph-contracts`. New submissions use the
versioned `m3-response-v2` contract, capture an orchestration mode, pin the
learner state revision, and run response generation against that snapshot while
the Evidence lane may complete independently. Synthesis and stepwise drafts are
validated outside the model with UTF-16 English-unit segmentation, comprehension
reads, unfamiliar-language budgets, unresolved-span retention, and complexity
checks. One bounded simplification and one Chinese-support attempt are permitted;
legacy `finish_response` submissions remain readable during migration.

### 中文

在 `feat/m3-knowledge-graph-contracts` 上开始 M6。新提交使用带版本的
`m3-response-v2` 契约，记录编排模式并固定学习者状态版本；回复分支使用该快照，
Evidence 分支可以独立完成。Synthesis 和 stepwise 草稿在模型外经过 UTF-16 英文单元
切分、理解读取、陌生语言预算、未定位片段保留及复杂度检查。最多允许一次简化和一次中文
辅助；迁移期间仍可读取旧的 `finish_response` 提交。

## 2026-10-03 — M3 full graph and contracts

Created branch `feat/m3-knowledge-graph-contracts`. The Web repository now carries the pinned OEWN 2025 generated assets (420,050 nodes, 185,129 senses, 244,727 source relations, 4,353 shards) with the source archive hash, license and attribution in the manifest. The importer preserves the existing `figure out` identity and stable source IDs; `npm run graph:verify` checks shard placement, counts, forms and dangling targets.

The read-only knowledge API exposes `resolve_expression_candidates`, `get_knowledge_node` and `get_knowledge_neighborhood`. Reads are bounded, cursor-paginated and retain ambiguity, missing coverage, typed directed edges, navigation-vs-semantic provenance, and loader failures. `/knowledge` provides browser inspection for `bank`, inflections, multiword expressions, stored relations and the versioned source manifest.

Protocol `m3-response-v1` freezes response preferences, English-unit segmentation, the conservative starter set, complexity limits, personal batch-read shapes, comprehension assessments, response plans and delivered reply analysis. Fixtures deliberately distinguish a known sense from a known word, receptive support from production, provisional estimates from accepted Evidence, and `unobserved` personal state from missing graph coverage. M4 will implement trusted personal Evidence reads and assessment; M6 will implement final-text budget arithmetic and checked replies.

Validation: `npm run check` passes 35 tests and TypeScript checking; `npm run graph:verify` reports zero dangling targets; `npm run build` passes; local HTTP smoke checks return real `bank` ambiguity and directed neighborhood data. Browser inspection confirmed the 420,050-node manifest, 18 `bank` candidates, and stored relations. No commit or push was made.

## 2026-10-03 — M2 browser error and retry acceptance passed

An isolated browser tab used a temporary local proxy to inject one application
HTTP 502 response representing a provider HTTP 429 error. The normal application
error banner and Retry button appeared, with exactly one original learner
message and no assistant message. Clicking Retry cleared the error, showed
`Contacting model`, and disabled Send while the request was pending.

The proxy confirmed that Retry sent a byte-for-byte identical request body.
It forwarded this second request to the running application and real configured
provider, which returned HTTP 200 with a local `figure out` lookup and answer.
The final browser state contained one learner message, one assistant reply,
and no error banner, pending indicator, or Retry button. No product code or
`.env` changes were required. Other browser acceptance checks were already
confirmed by the user, completing M2 acceptance. Evidence and learner-state
updates remain later work.

### 中文

使用隔离浏览器标签页及临时本地代理，注入一次应用 HTTP 502 响应，模拟提供方 HTTP 429 错误。
正常显示错误提示和 Retry 按钮，保留且仅保留一条原始学习者消息，没有助手消息。点击 Retry 后，
错误提示消失，显示 `Contacting model`，等待期间 Send 被禁用。

代理确认 Retry 发送的请求体与第一次提交逐字节相同。第二次请求转发到正在运行的应用及真实提供方，
返回 HTTP 200，包含本地 `figure out` 查询及回答。最终只有一条学习者消息和一条助手回复，
没有错误提示、等待指示或 Retry 按钮。产品代码及 `.env` 无需修改。用户已确认其他浏览器验收，
至此 M2 验收完成。Evidence 和学习状态更新仍属于后续工作。

## 2026-10-03 — Live model API and lexical lookup verified

Tested the user-configured `openai-next` provider with `gpt-5.6-terra` using
the ignored root `.env`. The real provider returned HTTP 200, called
`find_by_form("figure out")`, received the local OEWN sense
`sense:figure_out%2:31:00::` and its definition, then called `finish_response`
with an answer grounded in that result. The direct two-request cycle took
about 24.6 seconds.

The running application's `POST /api/conversation/turn` also returned HTTP 200
with the same verified lexical result in about 15.8 seconds. Correction mode
was off and the correction field was null. The initial sandboxed process could
not connect to the provider (`EACCES`); restarting the local development server
with network access resolved that failure. Credentials were not printed or
included in this record. This verifies API access and live lexical tool use;
the remaining live correction and failure cases are still outstanding.

### 中文

使用根目录中已忽略的 `.env`，测试用户配置的 `openai-next` 提供方及 `gpt-5.6-terra`。
真实提供方返回 HTTP 200，模型调用 `find_by_form("figure out")`，收到本地 OEWN 词义
`sense:figure_out%2:31:00::` 及其释义，再调用 `finish_response` 根据查询结果回答。
直接测试的两次请求合计约 24.6 秒。

运行中的应用接口 `POST /api/conversation/turn` 同样返回 HTTP 200，包含上述已核实的
本地查询结果，耗时约 15.8 秒。修正模式关闭，修正字段为 null。最初的沙箱进程因网络权限
限制（`EACCES`）无法连接提供方；重启允许网络访问的开发服务后恢复正常。未打印凭据，
记录中也不包含凭据。本次确认 API 可用及真实模型工具查询，修正模式和故障场景的真实验收尚待完成。

## 2026-10-03 — Web repository layout correction

Moved the Next.js application from `apps/web` to the `unjot` repository root,
reinstalled its dependencies, and corrected imports, build configuration, and
the unified test command. The three whole-project planning documents now live
only in the parent `Language` workspace. This supersedes the earlier copied
documents and A/B handoff arrangement recorded below.

Reinitialized local Git on `main` with `https://github.com/PHTPSN/Unjot.git` as
the remote. There are no commits or pushes in the fresh repository. M2 live
model lookup acceptance still requires credentials in `unjot/.env`.

中文：将 Next.js 应用从 `apps/web` 移到 `unjot` 仓库根目录，重新安装依赖，并修正导入、构建配置
及统一测试命令。三份全项目规划文档仅保留在父目录 `Language`，取代下方旧记录中的文档副本和 A/B 分工。
本地 Git 已在 `main` 重新初始化，远程地址为 `https://github.com/PHTPSN/Unjot.git`，新仓库没有提交或推送。
M2 的真实模型查询验收仍需在 `unjot/.env` 配置凭据。

## 2026-10-03 — Milestone 2 LLM lexical tool-call integration

Replaced the M1B mock as the application default with a server-side
OpenAI-compatible Chat Completions integration. `apps/web/.env.example` defines
provider, model, key, and base URL settings. The server exposes only lexical
read tools (`find_by_form`, `get_item`, `get_neighbors`) and a structured final
response tool. It executes lookups using the M1A `LexicalGraph`, returns actual
OEWN acceptance-fixture data to the model, and shows those results in the UI.
The browser never receives the API key. No Evidence or learner-state writes are
available to the model.

The live lookup test is not yet complete because this environment has no model
credentials or endpoint configuration. The implementation is tested with a
mocked provider transport that verifies a complete tool-call/result/final-answer
cycle, correction separation, and refusal of unsupported state-write tools.
The first runtime graph remains the small verified `figure out` acceptance
fixture, not the full OEWN corpus.

Verification passed: root `npm run check` (16 tests), Web `npm run check` (8
tests), and Web `npm run build`. The running app reports missing model settings
without exposing credentials; its turn endpoint returns a clear 503 until
`LLM_MODEL` and `LLM_API_KEY` are configured.

### 中文

将 M1B 模拟回复从应用默认路径替换为服务端 OpenAI 兼容 Chat Completions 接入。
`apps/web/.env.example` 记录 provider、model、key 和 base URL 配置。服务端只开放
词汇只读工具（`find_by_form`、`get_item`、`get_neighbors`）及结构化最终回复工具。
服务端使用 M1A 的 `LexicalGraph` 执行查询，把真实的 OEWN 验收样例结果传给模型，并在界面展示。
浏览器不会取得 API key；模型没有 Evidence 或学习状态写入能力。

由于当前环境没有模型凭据或接口配置，真实模型查询尚未完成。当前测试通过模拟提供方传输验证完整的
工具调用/结果/最终回复闭环、修正字段分离，以及拒绝未授权状态写入工具。仓库根目录 `npm run check`
（16 项）、Web `npm run check`（8 项）和 Web `npm run build` 均通过。应用会在未泄露凭据的情况下
报告缺少模型设置；配置 `LLM_MODEL` 与 `LLM_API_KEY` 前，对话接口返回清晰的 503 提示。
首轮运行时图谱仍是已验证的 `figure out` 小型样例，并非完整 OEWN 语料。

## 2026-10-03 — Milestone 1B deterministic chat shell

Added a single-page Next.js chat shell under `apps/web` using the existing
`ConversationTurn` contract. It preserves original input and stores assistant
corrections separately. The correction preference is captured per submission;
mock send is asynchronous, pending duplicate sends are blocked, and retry uses
the failed turn without appending another learner message.

The mock handles the fixed M1B examples only. A `?mockFailure=once` query injects
one rejected mock response for browser retry acceptance. No model, graph lookup,
semantic classifier, Evidence engine, state writes, or persistence is included.

Verification passed: `npm run check` at the repository root,
`npm run check --prefix apps/web` (TypeScript plus four controlled-promise tests),
and `npm run build --prefix apps/web`. Browser acceptance on port 3000 confirmed
mixed-language correction ordering, normal mock reply, loading/disabled send,
and failed-then-successful retry with one learner and one assistant turn.

### 中文

在 `apps/web` 下新增单页 Next.js 聊天界面，使用现有 `ConversationTurn` 契约。
用户原文保持不变，助手修正版单独保存。每次提交都会捕获当时的修正偏好；
模拟发送为异步操作，等待期间阻止重复提交，重试复用失败提交且不重复添加学习者消息。

模拟回复只覆盖 M1B 固定样例。`?mockFailure=once` 可注入一次失败，用于浏览器重试验收。
本阶段不包含模型、图谱查询、语义分类器、Evidence 引擎、状态写入或持久化。

验证通过：仓库根目录 `npm run check`、`npm run check --prefix apps/web`
（TypeScript 与四项可控 Promise 测试），以及 `npm run build --prefix apps/web`。
在 3000 端口进行的浏览器验收确认了中英混写修正顺序、普通模拟回复、等待/禁用发送，
以及失败后成功重试且只保留一条学习者消息和一条助手回复。

## 2026-10-03 — Milestone 1A graph lookup

Added a small OEWN graph adapter with `findByForm`, `getItem`, and
`getNeighbors`. It uses the same normalized form keys and 256/4096-way shard
indices as Language Lab's importer and catalog. The `figure out` acceptance
lookup resolves through `lex:figure out` to
`sense:figure_out%2:31:00::`; the adapter returns all senses for a form so
ordinary lexical ambiguity remains visible.

Focused graph fixtures preserve the source item, definition, sense ID, and
immediate concept/form/frame/related-sense links. They are test inputs, not a
replacement for the imported OEWN corpus. `npm run check` passes type checking,
the M0 specification fixtures, and M1A lookup/neighbor tests.

### 中文

新增轻量 OEWN 图谱适配器，提供 `findByForm`、`getItem` 和 `getNeighbors`。
它沿用 Language Lab 导入器与目录使用的标准化词形键，以及 256/4096 分片索引。
`figure out` 验收查询会通过 `lex:figure out` 定位到
`sense:figure_out%2:31:00::`；接口返回该词形下的全部词义，保留通常的词义歧义。

精简图谱 Fixture 保留源词条、释义、词义 ID，以及直接关联的概念、词形、句型和相关词义。
这些只是测试输入，不会取代导入的 OEWN 全量语料。`npm run check` 已通过类型检查、
M0 规格样例和 M1A 查询/邻居测试。

## 2026-10-03 — Milestone 0 revision 2

Prepared the Node.js 24.13.1 / npm 11.8.0 development environment with pinned
TypeScript 5.9.3. Added four shared contracts and ten acceptance examples for
`figure out`, using the verified OEWN sense `sense:figure_out%2:31:00::`.

The accepted product direction is ordinary conversation without a turn-count
requirement or forced context change. Correction mode is optional and preserves
original learner text. Program policy, not user instructions or model-written
state patches, owns accepted Evidence and derived learner state. A correction
cannot be credited as learner production.

`npm run check` passes type checking and 13 fixture checks. These validate the
specification, not runtime classification or enforcement. The learning engine,
Web UI, and real model calls are not implemented in this checkpoint.

This checkpoint originally copied the three planning documents into the code
repository. The layout correction above removes that duplication; the parent
workspace now holds the sole whole-project copies.

Ownership: the user is Developer A (graph, lexical resolution, Evidence policy,
state derivation). Developer B owns the Web shell and later workflow integration.
B's M1 work is fixed mock behavior and rendering, specified in
[the handoff](milestone-1b-handoff.md). Next work in this chat: M1A only.

## 中文

### 2026-10-03 — Milestone 0 第二版

准备 Node.js 24.13.1 / npm 11.8.0 环境，锁定 TypeScript 5.9.3。
新增四个共享契约和围绕 `figure out` 的十个验收样例，复用已核实的
OEWN 词义 `sense:figure_out%2:31:00::`。

产品方向为无轮次要求、不强制切换情境的普通聊天。修正模式可选，保留用户原文。
程序规则负责接受 Evidence 和推导学习状态，用户指令或模型输出不能直接赋值。
助手修正版不能当作用户产出。

`npm run check` 的类型检查和 13 项样例检查通过。这些只验证规格，不表示运行时
分类与强制执行已实现。本次检查点尚无学习引擎、Web 界面或真实模型调用。

此检查点原先将三份规划文档复制进代码仓库。上方目录修正已消除重复；父工作区保留唯一的全项目版本。

用户是开发者 A，负责图谱、词汇解析、Evidence 规则与状态推导。B 负责 Web 界面和后续工作流。
B 的 M1 任务限定为固定模拟行为与展示，详见上面的交接文档。本对话接下来只做 M1A。
