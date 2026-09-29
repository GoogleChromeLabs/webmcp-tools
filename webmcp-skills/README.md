<!--
Copyright 2026 Google LLC
SPDX-License-Identifier: Apache-2.0
-->

# WebMCP Agent Skills

A collection of agent skills designed to help developers design, build, evaluate, audit, and integrate [WebMCP (Web Model Context Protocol)](https://github.com/webmachinelearning/webmcp) tools into their web applications following official Chrome recommendations.

---

## Skills Catalog

| Skill Name                         | Description                                                                                                                                                                                                                                                                                                                                                                                                                 | Link                                              |
| :--------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------ |
| **`build-webmcp-tools`**           | Comprehensive guide and workflow for the complete WebMCP lifecycle: user goals portfolio, starting states matrix, turn-by-turn roleplay, edge-case variations, schema & evals generation, and framework integration (React, Angular, Vanilla JS, Declarative HTML). Enforces official Chrome character budgets, annotations, agent security guardrails, DevTools/Lighthouse inspection, and an exhaustive review checklist. | [SKILL.md](skills/build-webmcp-tools/SKILL.md)    |
| **`skill-creator`** _(meta-skill)_ | Meta-skill for authoring, evaluating, benchmarking, and optimizing Agent Skills following the [agentskills.io](https://agentskills.io/skill-creation/evaluating-skills) standard using TypeScript and Vite. Includes schema validation, packaging, and trigger evaluation.                                                                                                                                                  | [SKILL.md](.agents/skills/skill-creator/SKILL.md) |

### Technical References in `build-webmcp-tools`

- **[Conversational Design Guide (Stages 1–4)](skills/build-webmcp-tools/references/conversational-design.md)**: Methodology for user journeys, starting state matrices, turn-by-turn role-play, and edge-case variations.
- **[Use Case Markdown Template](skills/build-webmcp-tools/references/use-case-template.md)**: Standardized template for cataloging user journeys, turn-by-turn roleplay, and discovered tools.
- **[Evaluations, Debugging & Auditing Specification](skills/build-webmcp-tools/references/evals-format.md)**: Evals schema (`evals.json`), troubleshooting matrix, DevTools WebMCP pane, and Lighthouse audits.
- **[React Integration Guide (`use-webmcp-tool`)](skills/build-webmcp-tools/references/react-patterns.md)**: Component-scoped tools, state-gated tools with `enabled`, v0.2.0 gotchas, and Vitest testing.
- **[Angular Integration Guide](skills/build-webmcp-tools/references/angular-patterns.md)**: `provideExperimentalWebMcpTools`, auto-cleanup injectors, and Signal Forms integration.
- **[Declarative HTML Forms Guide](skills/build-webmcp-tools/references/declarative-patterns.md)**: Form markup, pairing rules, Lighthouse audit criteria, window events, and CSS pseudo-classes.
- **[Vanilla JS & Native Imperative Guide](skills/build-webmcp-tools/references/vanilla-patterns.md)**: `document.modelContext.registerTool`, discovery APIs (`getTools`), and cross-origin security (`exposedTo`, `iframe allow="tools"`).
- **[Agent Security & Prompt Injection Defense](skills/build-webmcp-tools/references/agent-security.md)**: Threat models, spotlighting (tags vs Base64), classifiers, and user-alignment critics.
- **[Official Chrome Sources & Spec Index](skills/build-webmcp-tools/references/sources.md)**: Complete index of official Chrome docs, blog posts, and Google Chrome Labs repositories.

---

## Installing Skills in Your Agent

You can install skills from this repository into your AI coding assistant (e.g., Antigravity, Gemini CLI, Cursor, Claude Code):

### Using Skills CLI

```bash
npx skills add GoogleChromeLabs/webmcp-tools --path webmcp-skills
```

### Manual Installation

Copy the skill folder into your project's workspace agent directory:

```bash
# Antigravity / Gemini CLI convention
cp -r skills/build-webmcp-tools <your-project>/.agents/skills/

# Cursor convention
cp -r skills/build-webmcp-tools <your-project>/.cursor/skills/
```

---

## Skill Authoring, Validation & Packaging

This repository includes built-in TypeScript utilities for validating and packaging Agent Skills according to the open standard:

```bash
# Validate skill frontmatter and directory structure
npm run skill:validate

# Package skill into a distributable .skill zip archive
npm run skill:package
```

---

## Running Skill Evaluations

This repository uses a modular **TypeScript & Vite evaluation engine** conforming to the [Agent Skills Evaluation Standard](https://agentskills.io/skill-creation/evaluating-skills) to benchmark skill adherence, baseline value-add (`delta`), and code generation compliance.

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Set your Google AI API key:

```bash
export GEMINI_API_KEY="your-gemini-api-key"
```

### 3. Run Evaluations & Tests

```bash
# Run unit tests for the runner, loader, and assertion grader
npm run test:unit

# Run modular evaluations for all skills (always runs with_skill vs without_skill baseline delta)
npm test

# Run full comparative benchmark across all skills
npm run eval:full

# Filter by eval ID or topic (always runs with & without)
npm run eval -- --filter "react"

# Offline dry-run / schema validation (runs without API key, runs with & without)
npm run eval:dry-run

# Re-bundle modular suites into evals/evals.json
npm run eval:bundle

# Open interactive Vite evaluation viewer to review runs & enter feedback
npm run eval:view
```

For comprehensive empirical results across 500 benchmark runs, see the **[Benchmark Report (5-Run Comparative Evaluation)](BENCHMARK.md)**.

For guidelines on repository conventions and eval-driven skill development, see the [Agent Guide (AGENTS.md)](AGENTS.md).

---

## Attribution & Acknowledgments

The `skill-creator` meta-skill under `.agents/skills/skill-creator` is derived from Anthropic's [`skill-creator`](https://github.com/anthropics/skills), licensed under the Apache License, Version 2.0 (Copyright (c) Anthropic, PBC), and has been modified by Google LLC. See [`NOTICE`](NOTICE) for details.

---

## License

Apache 2.0. See [LICENSE](LICENSE) for details.
