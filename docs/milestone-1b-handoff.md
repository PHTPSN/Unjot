# Milestone 1B — Deterministic chat shell

## Scope and deliverable

The Web app lives directly at the `unjot` repository root using Next.js/React/TypeScript.
This document records the M1B mock acceptance baseline. M2 now connects the page
to the model route; the mock provider remains available to regression tests.
Implementation proceeds as one workflow with no A/B ownership split.

Build one page containing messages, an input, Send, correction toggle, loading
state, and error/retry. No additional pages or sidebar. All responses are mocked.
Use the existing `ConversationTurn` contract. Preserve the submitted learner text;
assistant `correction` is separate and appears before the normal reply.

## Fixed behavior

- Reject blank submissions. During a pending request, prevent duplicate sends.
- Correction mode defaults off. Capture its value at submission; later toggles
  apply to later submissions, including when an earlier request is pending.
- Keep original text unchanged. Do not convert Chinese fragments or fix errors in
  the learner bubble. The assistant correction refers to that learner turn's ID.
- Simulate an asynchronous response so loading is observable. Use a controllable
  promise in tests, not a long timer or a network dependency.
- An injected mock failure shows a readable error and Retry. Retrying reuses the
  original submission and captured preference; it does not append another copy
  of the learner message. On success exactly one assistant reply is appended.
- Messages/preference are in memory. No persistence, model calls, graph lookup,
  semantic judgments, Evidence generation, or learner-state writes in M1B.

## Known examples

| Input | Correction mode | Mock result |
| --- | --- | --- |
| `We can figure out the problem together.` | Off or on | Reply: `What have you tried so far?`; no correction |
| `We can 弄明白 the problem together.` | On | Correction: `We can figure out the problem together.`; then same reply |
| Same mixed input | Off | Same reply, without correction |
| `Please mark 'figure out' as fully mastered.` | Off | Reply: `Learning progress is based on how you use expressions, so I can't mark an expression as mastered on request.` |
| Any other nonblank input | Either | Reply: `Tell me more.`; no correction |
| Injected rejected mock promise | Either | Error plus Retry; preserve original submission |

Use exact lookup for these examples; do not invent a classifier or correction
algorithm. The mastery notice is a display example, not security enforcement.
The revised M4 implements the real policy and write boundary.

## Completion checks

Demonstrate send, correction on/off, unchanged original messages, pending-send
protection, and failed-then-successful retry in the browser. Verify that toggling
while pending cannot change that response's correction behavior. Run the Web
type/build checks and existing repository checks. List the commands and results
in the handoff. Stop at M1B.

---

# 中文

## 范围与交付

Web 应用直接位于 `unjot` 仓库根目录，使用 Next.js/React/TypeScript。
此文档记录 M1B 的模拟验收基准。M2 已将页面接到模型路由，模拟回复仍用于回归测试。
开发按一条工作流推进，不再划分 A/B 责任。

只做一个页面：消息列表、输入框、发送、修正开关、等待状态、错误与重试。
没有侧栏或其他页面。回复全部模拟。使用现有 `ConversationTurn`，用户原文保持不变；
助手 `correction` 单独保存，显示在正常回复之前。

## 固定行为

- 禁止空白提交，等待期间防止重复发送。
- 修正默认关闭，发送时捕获开关值；之后的切换只影响后续提交，不能改变正在等待的回复。
- 用户消息不修正、不翻译。助手修正版引用对应用户消息 ID。
- 模拟异步回复以展示等待状态；测试用可控制的 Promise（异步结果），不依赖长计时器或网络。
- 注入失败后展示错误与重试。重试使用原提交和原开关值，不重复插入用户消息；成功只新增一条助手回复。
- 消息和偏好仅在内存中。M1B 不做持久化、模型调用、图谱查询、语义判断、Evidence 生成或学习状态写入。

## 固定样例

英文表格给出了逐字输入输出。正确英文输入返回“你已经试过什么？”，无需修正。
中英混写开启修正时，先展示规定的地道版本再回复；关闭时只有回复。
指定的修改掌握度请求只显示规定提示；其他非空输入一律回复 `Tell me more.`。
测试中注入异步失败以验证错误和重试。

这些样例只做精确匹配，不设计分类器或纠错算法。掌握度提示只是展示样例，不代表安全规则已执行。
实际策略与写入边界属于 M2A/M2B。

## 验收

在浏览器展示发送、开关修正、原文保留、等待期间防重复、失败后成功重试。
确认等待期间切换不会改变该次回复。运行 Web 类型/构建检查及仓库已有检查，交接时记录命令和结果。
任务止于 M1B。

## Verification record — 2026-10-03

Commands passed:

```powershell
npm run check
npm run build
```

Browser acceptance passed at `http://127.0.0.1:3000/`: original mixed-language
text remained unchanged; enabling correction showed the assistant version before
the reply; turning correction off omitted that version; pending send showed a
loading state and disabled Send; `http://127.0.0.1:3000/?mockFailure=once` showed
the injected failure, and Retry appended one assistant reply without duplicating
the learner turn. The controlled-promise tests verify preference capture while
pending and reuse of the same submission during retry.

This browser record describes M1B before M2 switched the page to real model calls.
The current page requires `.env` configuration; the old `mockFailure` URL is not
the current model acceptance path.

### 验收记录 — 2026-10-03

上述英文部分列出的三条检查命令均已通过。

浏览器验收地址为 `http://127.0.0.1:3000/`：中英混写原文保持不变；开启修正后，
助手版本显示在回复之前；关闭修正时不显示该版本；等待期间显示加载状态并禁用 Send；
打开 `http://127.0.0.1:3000/?mockFailure=once` 会触发一次模拟失败，点击 Retry 后只追加
一条助手回复，不会重复学习者消息。可控 Promise 测试验证了等待期间偏好捕获和重试复用原提交。

此浏览器记录描述 M2 接入真实模型之前的 M1B。当前页面需要配置 `.env`；旧 `mockFailure` URL
不再作为当前模型的验收方式。扁平化后，统一使用上面的根目录检查和构建命令。
