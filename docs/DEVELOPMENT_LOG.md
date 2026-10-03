# Development log

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

The three whole-project planning documents live only in the parent Language
workspace. This Web-only repository contains the contracts, acceptance
specification, and development log; Android and commercial services are separate.

### 中文

准备 Node.js 24.13.1 / npm 11.8.0 环境，锁定 TypeScript 5.9.3。
新增四个共享契约和围绕 `figure out` 的十个验收样例，复用已核实的
OEWN 词义 `sense:figure_out%2:31:00::`。

产品方向为无轮次要求、不强制切换情境的普通聊天。修正模式可选，保留用户原文。
程序规则负责接受 Evidence 和推导学习状态，用户指令或模型输出不能直接赋值。
助手修正版不能当作用户产出。

`npm run check` 的类型检查和 13 项样例检查通过。这些只验证规格，不表示运行时
分类与强制执行已实现。本次检查点没有学习引擎、Web 界面或真实模型调用。

三份全项目规划文档只保留在父目录 Language。此仓库只包含 Web 的契约、
验收说明和开发记录；Android 与商业服务使用独立仓库。
