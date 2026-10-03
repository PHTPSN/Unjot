# Unjot

Unjot is a language-learning system built around a simple idea:

**Learn without taking notes.**

Instead of asking learners to manually maintain vocabulary lists and study notes, Unjot observes what they encounter, understand, need help expressing, and eventually produce independently.

The system models learning through:

**Lexicon → Evidence → Learner State → Capability / Learning Path**

This repository contains the open-source Unjot Web application. Android and commercial services live in separate repositories. Whole-project planning documents live in the parent `Language` workspace, outside this repository.

## Repository layout

```text
unjot/
├── app/                       # Conversation page and server routes
├── lib/                       # Conversation controller and model integration
├── tests/                     # Web interaction and model-tool tests
├── packages/
│   ├── protocol/              # Public Evidence, state and workflow specifications
│   ├── golden-tests/          # Cross-implementation conformance fixtures
│   └── lexical-core/          # Lexical identifiers and relation definitions
│
└── docs/                      # Web development and acceptance records
```

## Open-source edition

The open-source Web edition is designed to run locally without an Unjot account.

Its long-term responsibilities include:

- Local learner state
- Local Evidence history
- Local conversation history
- Local goals and learning paths
- Local lexical/graph data
- BYOK model access
- Public Unjot protocol implementation
- Reproducible learning-state behavior

The Web edition and commercial Android edition are intended to implement the same Unjot product semantics rather than evolve as separate products.

## Public protocol

The public repository will define the language-independent product contract for:

- Lexical identifiers
- Evidence events
- Learner-state semantics
- Workflow definitions
- Goal and Capability models
- State-transition rules
- Golden/conformance tests

The Android and cloud implementations will conform to the same protocol.

## Status

Progress: [development log](docs/DEVELOPMENT_LOG.md).

中文：此仓库只包含 Web 应用，应用直接位于仓库根目录。Android 与商业服务位于其他仓库；三份全项目说明只保留在父目录 `Language`。Web 开发记录见以上链接。

Milestone 0 revision `m0-v2` defines ordinary chat without turn-count gates,
optional correction mode, and program-controlled Evidence/state updates. The four
shared TypeScript contracts and ten acceptance examples use one target, `figure out`.
Milestone 1A now resolves OEWN forms to lexical senses and immediate graph neighbors.
See [Milestone 0: environment, contracts, and acceptance](docs/milestone-0.md).

Use Node.js 24.13.1 or newer. One root check covers the shared contracts, graph adapter,
acceptance fixtures, and Web interactions. M2 adds a server-side OpenAI-compatible
model route with read-only lexical tools. Live API access, `figure out` tool
lookup, and browser error/retry behavior passed with the configured provider.
Its graph contains only the verified `figure out` sample;
the full OEWN corpus and Evidence engine are later milestones.

To run the chat shell locally:

```powershell
npm ci --ignore-scripts --no-audit --no-fund
```

Copy `.env.example` to `.env` at this repository root and set the model provider, model,
API key, and OpenAI-compatible base URL. Then run:

```powershell
npm run check
npm run build
npm run dev -- --port 3000
```

The key is read by the local server and is never sent to browser code. The model
endpoint must support Chat Completions function calling.

中文：Milestone 0 的 `m0-v2` 版本规定无轮次门槛的基本聊天、可选修正模式，以及程序控制的
Evidence/状态更新。四个共享 TypeScript 契约和十个验收样例只使用一个目标表达 `figure out`。
Milestone 1A 已支持通过 OEWN 词形查询词义及其直接图谱邻居。环境、字段和验收说明见上面的文档。
使用 Node.js 24.13.1 或更高版本，在仓库根目录执行上述命令。统一检查覆盖契约、图谱适配器、固定样例和 Web 交互。
M2 已实现服务端模型路由与只读词汇工具，真实 API 访问、`figure out` 工具查询以及浏览器错误/重试行为已通过。学习者状态推导和 Evidence 引擎尚未实现，
查询图谱目前仅包含已验证的 `figure out` 小型样例。按英文部分在此仓库根目录创建 `.env`，填写 provider、model、API key 和 base URL；密钥只由本地服务端读取。
