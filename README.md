# Unjot

Unjot is a language-learning system built around a simple idea:

**Learn without taking notes.**

Instead of asking learners to manually maintain vocabulary lists and study notes, Unjot observes what they encounter, understand, need help expressing, and eventually produce independently.

The system models learning through:

**Lexicon → Evidence → Learner State → Capability / Learning Path**

This repository contains the open-source Unjot Web application and its public product protocol. Android and commercial services live in separate repositories. The Next.js application will live directly at the repository root. Whole-project planning documents live in the parent Language workspace, outside this repository.

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

Milestone 0 revision `m0-v2` defines ordinary chat without turn-count gates,
optional correction mode, and program-controlled Evidence/state updates. The four
shared TypeScript contracts and ten acceptance examples use one target, `figure out`.
Milestone 1A resolves OEWN forms to lexical senses and immediate graph neighbors.
See [Milestone 0: environment, contracts, and acceptance](docs/milestone-0.md)
and the [development log](docs/DEVELOPMENT_LOG.md).

Run `npm ci --ignore-scripts --no-audit --no-fund`, then `npm run check` with Node.js
24.13.1 or newer. The checks cover the specification, graph adapter, and fixtures;
the learning engine, chat UI, and model integration are not implemented in this checkpoint.

中文：Milestone 0 的 `m0-v2` 版本规定无轮次门槛的基本聊天、可选修正模式和程序控制的 Evidence/状态更新。
四个共享 TypeScript 契约和十个验收样例只使用一个目标表达 `figure out`。M1A 支持通过 OEWN 词形查询词义及直接图谱邻居。
使用 Node.js 24.13.1 或更高版本执行上述命令。检查覆盖规格、图谱适配器和固定样例；此检查点没有学习引擎、聊天界面或模型接入。
