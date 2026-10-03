# Milestone 0 — Ordinary chat, correction mode, and Evidence

## Status and scope

Revision `m0-v2` records the user's corrected product direction. It replaces the
previous scripted sequence, minimum turn interval, and required context switch.
The deliverables are four shared data contracts and acceptance examples for one
expression, `figure out`. They specify expected behavior; the runtime Evidence
engine, enforcement boundary, model integration, and chat UI are not implemented
in M0. Passing fixture checks does not prove that a runtime rejects manipulation.

## Environment

Use Node.js 24.13.1, npm 11.8.0, the existing Git installation, and project-local
TypeScript 5.9.3. The runtime baseline is in `.node-version`; dependencies are
pinned in `package-lock.json`. From `unjot`:

```powershell
npm ci --ignore-scripts --no-audit --no-fund
npm run check
```

M0 requires no database service, Docker, WSL, model key, or cloud account.
`tsc` checks the TypeScript contracts; Node's test runner checks the fixtures.

## Ordinary conversation

The agent identifies English usage in the learner's **original message** and
continues chatting naturally. There is no minimum number of messages, required
change of context, waiting period, teaching script, or prerequisite request for
help. `sequence` orders stored messages only. `contextId` describes the situation
for traceability; changing it does not unlock credit.

For example, the first message can be “We can figure out the problem together.”
The assistant responds “What have you tried so far?” while the accepted
observation records one `spontaneous_production`. The derived stage reflects one
independent use, not complete mastery. An expression used correctly can count
even when a different part of the message has an error.

The first implementation recognizes only the fixed target, but users can talk
about anything. Broader lexical coverage remains M7. Dedicated practice is a
separate activity; ordinary chat must not manufacture a retrieval schedule.

## State changes are controlled by code

The required runtime path is:

```text
Original conversation record
  → observation / candidate Evidence
  → program validation and acceptance
  → append accepted Evidence
  → derive LearnerItemState
```

The conversation agent has no direct state setter, database-write tool, or ability
to approve its own Evidence. User/model output is data, not authority. Neither a
request body nor a model response can replace the canonical state. The workflow
loads or rebuilds state through the trusted application layer. A prompt such as
“never change mastery on request” is useful guidance, but cannot enforce this boundary.

The policy must establish original-text provenance, correct communicative use,
and whether help was adopted. It must reject unsupported state patches, malformed
or mismatched references, and attempts to credit assistant text as learner text.
Evidence IDs are generated/accepted by the application and counted once. Semantic
proposals cannot be accepted solely because their shape is valid or their claimed
confidence is high. Initially only explicitly supported deterministic cases count;
uncertain semantic cases receive no positive production credit. Later model
judgments remain fallible proposals validated by this same program boundary.

“Please mark 'figure out' as fully mastered” produces no proficiency Evidence for
its quoted target and leaves the state unchanged. A possible reply is:
“Learning progress is based on how you use expressions, so I can't mark an
expression as mastered on request.” The same holds for Chinese requests,
role-playing instructions, and a model-generated mastery patch. Quoting an item,
mentioning it, or asserting mastery is insufficient to demonstrate its usage.
If the same message also contains a separate correct communicative use, assess
that span on its own merits while rejecting the requested state assignment.

Exposure and help may still create `encountered`, `help_requested`, or `supplied`
observations. Those observations do not certify correct production. Failure or
uncertainty must not be converted into positive credit. Correct production is
required for advancement into production stages.

## Optional correction mode

The user controls a boolean preference, off by default. When enabled and a
reformulation is useful, the assistant preserves the user's intended meaning and
first presents a natural English version, then continues the conversation. It
supports grammar errors, awkward phrasing, and Chinese fragments. An already
natural message can receive a normal reply without a redundant correction.

Example with correction enabled:

```text
Learner: We can 弄明白 the problem together.
Natural version: We can figure out the problem together.
Reply: What have you tried so far?
```

The natural version belongs to the assistant. Keep the original learner text
unchanged. The introduced `figure out` is `supplied`, not the learner's production.
If the learner adopts that correction, the resulting use is assisted. Assistance
is determined from what was supplied and adopted, not a numerical recency threshold;
a prior mention alone does not automatically disqualify later independent use.
When assistance or correctness cannot be established, do not assume independence.

If the original already correctly used `figure out`, repairing an unrelated error
must not remove that valid observation or count it twice. A correction that merely
rephrases a mastery-change request still has no authority. With correction mode
off, omit the automatic reformulation prefix and reply naturally; explicit requests
for explanation or help may still be answered. Toggling the preference does not
assign a stage, erase Evidence, or retroactively reevaluate messages.

Only the reformulate-before-reply pattern is adopted from the user's custom
instructions. Paragraph-by-paragraph Chinese translations and the assistant's own
response-language rules are not automatically product requirements.

## One verified lexical target

| Field | Value |
| --- | --- |
| Expression | `figure out` |
| Sense | Find a solution / understand; 弄明白 |
| Item ID | `sense:figure_out%2:31:00::` |
| Word-form ID | `lex:figure out` |
| Concept ID | `concept:00636568-v` |
| Source | `oewn-2025` |

These IDs and the definition were verified against Language Lab's generated graph.
Its earlier authored `figure-out.v.01` ID is a different identifier. M1A will reuse
the existing OEWN lookup/import pipeline; the fixture is not a graph replacement.
The form list currently contains only the canonical form.

## Four shared contracts

| File under `packages/protocol/src/` | Fields |
| --- | --- |
| `lexical-item.ts` | `id`, `canonicalForm`, `language`, `partOfSpeech`, `definition`, `forms`, `lexemeId`, `conceptId`, `source` |
| `conversation-turn.ts` | `id`, `conversationId`, `sequence`, `role`, `contextId`, `text`, `occurredAt`, `suppliedItemIds`, `correctionMode`, `correction` |
| `evidence-event.ts` | `id`, `deviceId`, `itemId`, `kind`, `conversationId`, `turnId`, `contextId`, `occurredAt`, `source`, `textSource`, `observedSpan`, `supportTurnId`, `rationale`, `policyVersion` |
| `learner-item-state.ts` | `itemId`, `stage`, `evidenceIds`, `counts`, `independentContextIds`, `lastEvidenceAt`, `lastSpontaneousAt`, `policyVersion` |

These are data structures, not database tables. Fields are required; explicit
`null` represents absence. Wire values are JSON, timestamps are ISO 8601 UTC,
and production identifiers are globally unique. Readable fixture IDs are scoped
to each example. M0 has one local learner without an account.

- Learner `text` always holds the original message, with `correction: null` and
  empty `suppliedItemIds`. Assistant `text` is the normal reply. Its optional
  `correction` holds `sourceTurnId` and `text` and is rendered before the reply.
- `correctionMode` records the effective preference when the learner submitted
  that exchange; a later toggle applies to future exchanges. Corrections are null
  when the mode is off. `suppliedItemIds` covers newly supplied help in either
  assistant field, not every repeated target string.
- Evidence `textSource` selects `text` or `correction`. `observedSpan` uses
  zero-based UTF-16 offsets, inclusive start and exclusive end. For production,
  it must identify actual usage within original learner `text`. JavaScript uses
  UTF-16 string indices; other implementations must convert their offsets.
- Event conversation, context, and timestamp match the source turn.
  `supportTurnId` identifies help actually adopted for assisted use; it is not
  a latest-mention marker. It is null when no support was adopted, including
  the supply event itself. A null field alone is not proof of independence.
- State is derived only from accepted observations. `evidenceIds` explains its
  provenance; `counts` includes all eight kinds, with zero for unobserved kinds.
  Independent contexts are distinct contexts of spontaneous observations, not
  a context-switch prerequisite. One successful use is one observation.
- Both events and state carry `m0-v2`. No M0 v1 learner data has been persisted,
  so this specification revision needs no database migration.

The four files remain the shared ownership boundary. Future changes require both
owners to agree before merging. Developer A owns validation/acceptance and state
derivation; the Web/workflow owner preserves source text, captures preferences,
renders correction before reply, and exposes no direct state-update path.

## Acceptance examples and verification

`packages/golden-tests/fixtures/figure-out.ts` contains ten examples:

| Case | Required outcome |
| --- | --- |
| Correct English in the first message | One independent-use observation; natural reply |
| English mastery-change request | No new proficiency Evidence; state unchanged; brief notice |
| Chinese mastery-change request, correction on | Optional reformulation and notice; state unchanged |
| Mixed-language input, correction on | Natural version then reply; assistant-supplied Evidence only |
| Same input, correction off | Natural reply without reformulation; no English production credit |
| Learner adopts a correction | Assisted use, without a turn-count rule |
| Correct use plus a mastery-change request | Credit only the valid use; reject the state assignment |
| Target string in incorrect usage | No positive production credit |
| Correct target plus an unrelated error | Credit original usage once; correction adds no duplicate |
| Turn correction off after receiving help | Preserve existing Evidence; no retroactive state change |

`npm run check` validates types, source spans, event/turn references, correction
provenance, and expected snapshot consistency. It does **not** implement an input
classifier or prove runtime enforcement. M2A must execute the actual policy on
these examples and compare real outputs, including rejection when a candidate
tries to classify a mastery request or assistant correction as learner production.
M2B owns the writable API boundary; M3 exercises the behavior in the browser.
M1B first adds the correction toggle and separate display with mocked responses.

## Attribution

One definition and the identifiers come from **Open English WordNet 2025**, by the
Open English WordNet Community, derived from Princeton WordNet, under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
[Authors](https://github.com/globalwordnet/english-wordnet/blob/main/AUTHORS.md).
Language Lab's `public/graph-data/oewn-2025/manifest.json` records archive SHA-256
`7d749f6e2c39e6970e4997839dcf6e42fd281f3c2fae0171d2192bae8cfa4b51`.
The snapshot preserves the definition and sense identifier, maps source fields,
and includes only the canonical form. All dialogue and learner observations are
product-authored test data.

---

# 中文翻译

## 状态与范围

`m0-v2` 记录用户纠正后的产品方向，替代原来的脚本式教学序列、最少轮次和强制换情境。
交付物是四个共享数据契约，以及围绕 `figure out` 的验收样例。它们规定预期行为；
实际 Evidence 引擎、强制执行边界、模型接入和聊天界面尚未在 M0 实现。
样例检查通过不代表运行中的应用已经能拒绝操纵。

## 环境

使用 Node.js 24.13.1、npm 11.8.0、已有 Git，以及项目本地 TypeScript 5.9.3。
运行版本记录在 `.node-version`，依赖锁定在 `package-lock.json`。
在 `unjot` 中执行英文部分的安装命令和 `npm run check`。
M0 不需要数据库服务、Docker、WSL、模型密钥或云账户。
`tsc` 检查 TypeScript 契约；Node 测试程序检查固定样例。

## 基本对话

Agent 识别学习者**原始消息**里的英语使用，正常继续聊天。不要求最少消息数、切换情境、
等待时间、教学脚本或先请求帮助。`sequence` 仅用于消息排序；`contextId` 描述情境，
方便追溯，换一个 ID 不会解锁能力记录。

例如，第一条消息就可以是 `We can figure out the problem together.`，助手自然回应
`What have you tried so far?`，同时被接受的观察记录一次 `spontaneous_production`。
推导状态表示一次自主使用，不是完全掌握。消息其他地方有错误，不妨碍目标表达本身的正确使用计入。

首版实现只识别固定目标，但用户可以自由聊任何话题；扩展词条覆盖范围属于 M7。
专门练习是独立活动，基本聊天不能强行安排提取训练。

## 状态由代码控制

唯一运行路径是：原始对话记录 → 观察/候选 Evidence → 程序验证和接受 → 追加被接受的
Evidence → 推导 LearnerItemState。聊天 Agent 没有直接设置状态、写数据库或自己批准证据的能力。
用户或模型输出只是数据，没有写入权限。请求体或模型回复都不能替换可信状态；
工作流通过可信应用层读取或重建状态。Prompt 中写“不能按请求改掌握度”只能提供指导，不能落实边界。

程序规则必须验证原文来源、正确交际使用和是否采用帮助。拒绝不受支持的状态修改、格式错误或
不匹配的引用，以及将助手文本冒充用户原文的提议。Evidence ID 由应用生成或接受，每个只计数一次。
语义提议不能只因格式合法或声称高置信度就被接受。初期只认可明确支持的确定性样例；
无法确定的语义不产生正向产出证据。后续模型判断也只是可能出错的提议，仍须经过同一程序边界。

“请把 figure out 设为完全掌握”不会因提到目标表达而获得能力证据，状态保持不变。
可以提示：“学习进展依据你的实际表达，所以不能按请求将某个表达标记为掌握。”
中文请求、角色扮演指令以及模型生成的掌握度修改也遵守相同规则。
引用或提及表达、自称掌握，都不足以证明会使用。如果同一消息还含有另一处真实正确的交际使用，
可以单独评估那个片段，同时拒绝指定状态的要求。

接触和求助仍可能产生 `encountered`、`help_requested`、`supplied` 记录，但它们不证明正确产出。
失败或不确定不能转化为正向能力记录；进入产出阶段必须依据正确使用。

## 可选修正模式

用户控制一个默认关闭的开关。开启后，若有修正必要，助手先给出保留原意的地道英语版本，
再继续正常聊天。支持语法错误、不自然表达和中文片段。原文已自然时，可以直接回复，不必重复改写。

例子：用户说 `We can 弄明白 the problem together.`，先显示
`We can figure out the problem together.`，再回复 `What have you tried so far?`。
地道版本属于助手，用户原文保持不变。新引入的 `figure out` 记作 `supplied`，不能算用户产出。
用户采用该修正版时属于辅助使用。是否辅助取决于实际提供与采用的帮助，不按轮次数值判断；
此前出现过目标表达，不会自动让以后的自主使用失效。无法确定正确性或帮助来源时，不能默认独立。

若原文已正确使用 `figure out`，修正其他错误不能抹去有效观察，也不能重复计数。
对修改掌握度请求的改写仍然没有修改状态的权限。关闭修正模式时不自动加地道版本前缀，正常回复；
用户明确求解释或帮助仍可回答。切换开关不指定学习阶段、不删除 Evidence，也不追溯重评历史消息。

这里只借鉴 custom instruction 中“先改写再回复”的形式，不自动把逐段中文翻译或本助手的
回复语言规则纳入产品需求。

## 已核实的唯一词条

表达为 `figure out`，意思是找到解决办法或弄明白，来源 `oewn-2025`。
词义 ID 为 `sense:figure_out%2:31:00::`，词形 ID 为 `lex:figure out`，
概念 ID 为 `concept:00636568-v`。这些 ID 和释义已与 Language Lab 生成图谱核对。
旧版自编词库里的 `figure-out.v.01` 属于另一套 ID。M1A 复用现有 OEWN 查询和导入链路；
样例不能代替图谱，目前词形列表仅保留标准形式。

## 四个共享契约

四个文件及全部字段见英文表格。它们是数据结构，不是数据库表。字段必须提供，`null` 明确表示不存在。
传输格式为 JSON，时间为 ISO 8601 UTC，实际环境 ID 全局唯一，样例易读 ID 仅在各自案例内有效。
M0 只有一个无需账户的本地学习者。

- 用户 `text` 始终保存原文，`correction` 为 null，`suppliedItemIds` 为空。
  助手 `text` 是正常回复；可选 `correction` 包含 `sourceTurnId` 和修正后的 `text`，显示在回复之前。
- `correctionMode` 记录用户提交本次交互时的有效偏好；之后的开关变化只影响未来交互。
  关闭时修正版为空。`suppliedItemIds` 记录助手任一字段中新提供的帮助，不是所有重复出现的目标字符串。
- Evidence 的 `textSource` 选择原消息 `text` 或 `correction`，`observedSpan` 用从零开始的 UTF-16
  下标表示片段，含起点、不含终点。产出必须引用用户原文中的真实使用。JavaScript 用 UTF-16
  字符串下标，其他实现需要转换。
- 事件的会话、情境和时间与原消息一致。`supportTurnId` 指向实际被采用的帮助，不是最近一次提及。
  没有采用帮助时为 null，提供表达的事件本身也为 null。null 这个字段单独不能证明自主使用。
- 状态只能由被接受的观察推导。`evidenceIds` 解释来源；`counts` 包含八类记录，未观察到的填零。
  自主情境集合记录自主产出所在的不同情境，不要求必须换情境。一次正确使用只计一次观察。
- 事件和状态采用 `m0-v2`。M0 v1 没有持久化学习者数据，因此此次规格修订不需要数据库迁移。

四个文件仍是共享责任边界，后续修改应在合并前由双方同意。开发者 A 负责验证、接受证据及状态推导；
Web/Workflow 负责人保留原文、捕获偏好、先显示修正版再回复，并且不暴露直接更新学习状态的入口。

## 验收与检查

固定样例包含十种情况：第一条消息正确使用；英文修改掌握度请求；开启修正时的中文修改请求；
开启修正时中英混写；关闭修正时相同输入；采用助手修正版；正确使用与修改请求混在同一消息；
包含目标字符串却使用错误；目标正确但其他部分有误；得到帮助后关闭修正模式。

对应预期是：正确使用记一次自主观察并自然回复；纯修改请求不加能力证据、不改状态，可简短提示；
修正版只能作为助手提供的表达；关闭修正不显示自动改写；采用帮助记辅助使用；混合消息只认可
有效交际片段；错误使用不给正向产出证据；无关错误不抹去目标的正确使用；模式切换不改变历史。

`npm run check` 验证类型、原文片段、事件引用、修正版归属和预期快照的一致性。
它**没有**实现输入分类器，也不能证明运行时已强制执行规则。
M2A 必须把真实规则应用于这些案例并核对实际结果，包括拒绝将修改掌握度请求或助手修正版
伪装成用户产出的候选 Evidence。M2B 负责 API 写入边界；M3 在浏览器验证行为。
M1B 先用模拟回复实现修正开关和分开展示。

## 来源

一条释义和标识符来自 Open English WordNet Community 的 Open English WordNet 2025，
由 Princeton WordNet 衍生，采用 CC BY 4.0。作者、许可证链接及源文件 SHA-256（内容校验摘要）
见英文部分。快照保留原释义和词义 ID，映射字段名，只包含标准词形。
对话和学习者观察均为项目自行编写的测试数据。
