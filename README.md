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

Early development.

中文：目前处于早期开发阶段。此仓库只包含 Web，全项目说明保留在父目录。
