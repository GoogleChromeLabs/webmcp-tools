<!--
Copyright 2026 Google LLC
SPDX-License-Identifier: Apache-2.0
-->

# WebMCP Agent Skills

A collection of AI agent skills designed to help developers design, role-play, evaluate, audit, and implement [WebMCP (Web Model Context Protocol)](https://github.com/webmachinelearning/webmcp) tools into their web applications following official Chrome recommendations.

---

## Installing the Skill

You can install the `build-webmcp-tools` skill into your AI coding assistant (e.g., Antigravity, Gemini CLI, Claude Code, Cursor, VS Code):

### Using the Skills CLI

```bash
npx skills add GoogleChromeLabs/webmcp-tools --path webmcp-skills
```

### Manual Installation

From the `webmcp-skills/` directory, copy [`skills/build-webmcp-tools`](skills/build-webmcp-tools) into your project's workspace skill folder:

```bash
# Antigravity / Gemini CLI / Agent Skills standard (.agents/skills/)
mkdir -p <your-project>/.agents/skills
cp -r skills/build-webmcp-tools <your-project>/.agents/skills/

# Claude Code (.claude/skills/)
mkdir -p <your-project>/.claude/skills
cp -r skills/build-webmcp-tools <your-project>/.claude/skills/

# Cursor (.cursor/skills/)
mkdir -p <your-project>/.cursor/skills
cp -r skills/build-webmcp-tools <your-project>/.cursor/skills/
```

---

## Using the Skill

Once installed, your coding agent automatically activates **`build-webmcp-tools`** when your prompt mentions WebMCP, `document.modelContext`, making a web app agent-ready, or auditing WebMCP tools. You can also invoke it explicitly in agents that support skill commands (e.g., `/build-webmcp-tools` or `@build-webmcp-tools`).

The skill includes a built-in **Stage Router** that inspects your request and jumps directly to the appropriate workflow stage, loading only the reference guides needed for that task:

### Example Prompts by Workflow

| What you want to do                                | Example prompt                                                                                | What the skill does                                                                                                                                                                                                                                                                                         |
| :------------------------------------------------- | :-------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Add WebMCP to a local web app (end-to-end)**     | _"Add WebMCP tools to this project"_                                                          | Inspects your codebase (`package.json`, routes, components) and guides you through the 6-stage lifecycle: **1) User Goals Portfolio**, **2) Starting States Matrix**, **3) Turn-by-Turn Role-Play**, **4) Edge-Case Variations**, **5) `schema.json` & `evals.json`**, and **6) Framework Implementation**. |
| **Analyze a live website or URL**                  | _"Analyze `https://example.com` for WebMCP user journeys"_                                    | Opens the live URL with `chrome-devtools` MCP (when available), checks `/llms.txt` and `document.modelContext.getTools()`, and proposes prioritized user journeys with autonomous boundaries.                                                                                                               |
| **Design a single tool**                           | _"Design a WebMCP tool to search flights"_                                                    | Frames that goal (ideal outcome, context, confirmation boundaries) and jumps straight to state modeling and turn-by-turn role-play without ideating unrelated tools.                                                                                                                                        |
| **Implement a single tool right away (Fast Path)** | _"Skip role-play and give me the React `useWebMCP` code for a theme toggle tool"_             | Notes the trade-off of skipping conversational design and immediately delivers the tool schema, an `evals.json` test case, and production-ready framework code adhering to all Chrome budgets and annotations.                                                                                              |
| **Generate schemas & evaluations**                 | _"Generate `evals.json` for my `schema.json`"_                                                | Creates positive, negative, multi-turn, and ambiguity test cases ready to run with `npx webmcp-evals local -t schema.json -e evals.json`.                                                                                                                                                                   |
| **Implement tools from an existing design**        | _"Implement the approved tools from `schema.json` in our React / Angular / Vanilla JS app"_   | Writes framework-idiomatic tool registrations (`useWebMCP`, `provideExperimentalWebMcpTools`, `document.modelContext.registerTool` with `AbortController`, or `<form toolname tooldescription>`) plus unit tests.                                                                                           |
| **Audit or debug existing WebMCP tools**           | _"Audit the WebMCP tools in this repo"_ or _"Fix our Lighthouse 'Agentic browsing' warnings"_ | Audits tools against the 16-point review checklist (character/token budgets, opt-in annotations, actionable errors, UGC prompt-injection defenses) and provides concrete fixes plus Chrome DevTools (`Application > WebMCP`) verification steps.                                                            |

---

## Skills Catalog

| Skill Name               | Description                                                                                                                                                                                                                                                                                                                                                                                                                 | Link                                           |
| :----------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------- |
| **`build-webmcp-tools`** | Comprehensive guide and workflow for the complete WebMCP lifecycle: user goals portfolio, starting states matrix, turn-by-turn roleplay, edge-case variations, schema & evals generation, and framework integration (React, Angular, Vanilla JS, Declarative HTML). Enforces official Chrome character budgets, annotations, agent security guardrails, DevTools/Lighthouse inspection, and an exhaustive review checklist. | [SKILL.md](skills/build-webmcp-tools/SKILL.md) |

### Technical References in `build-webmcp-tools`

- **[Conversational Design Guide (Stages 1–4)](skills/build-webmcp-tools/references/conversational-design.md)**: Methodology for user journeys, starting state matrices, turn-by-turn role-play, critique loops, and edge-case variations.
- **[Use Case Markdown Template](skills/build-webmcp-tools/references/use-case-template.md)**: Standardized template for cataloging user journeys, turn-by-turn roleplay, and discovered tools.
- **[Live Site Discovery Guide](skills/build-webmcp-tools/references/live-site-discovery.md)**: Exploring live URLs with `chrome-devtools` MCP, checking `/llms.txt`, and discovering runtime tools across routes before defining goals.
- **[Tool Design Rules](skills/build-webmcp-tools/references/tool-design.md)**: Chrome character and token budgets, initiation vs. execution naming, the "What + When" description formula, raw user input handling, and polymorphic tool consolidation.
- **[Tool Annotations Guide](skills/build-webmcp-tools/references/annotations.md)**: Opt-in default-`false` annotation semantics (`readOnlyHint`, `consequentialHint`, `untrustedContentHint`, `debugging`), UI navigation rules, and the First-Party Database Fallacy.
- **[Error Handling Guide](skills/build-webmcp-tools/references/error-handling.md)**: API-specific error delivery (`useWebMCP` thrown `Error` vs. native `registerTool` resolved `{ error, code, retryable }` vs. declarative `event.respondWith`) to avoid generic `DOMException: UnknownError`.
- **[Tool Schemas & Evaluations Specification](skills/build-webmcp-tools/references/evals-format.md)**: `schema.json` and `evals.json` formats, trajectory grading (`tool_order`, `allow_extra_tools`), and running `npx webmcp-evals`.
- **[React Integration Guide (`use-webmcp-tool`)](skills/build-webmcp-tools/references/react-patterns.md)**: Component-scoped tools, state-gated tools with `enabled`, `webmcp-types`, cancellation `signal` forwarding, polymorphic batch tools, and Vitest testing.
- **[Angular Integration Guide](skills/build-webmcp-tools/references/angular-patterns.md)**: `provideExperimentalWebMcpTools`, auto-cleanup injectors, and Signal Forms integration.
- **[Declarative HTML Forms Guide](skills/build-webmcp-tools/references/declarative-patterns.md)**: `<form toolname tooldescription>` markup, pairing rules, Lighthouse audit criteria, window events (`toolactivated`, `toolcancel`), and CSS pseudo-classes.
- **[Vanilla JS & Native Imperative Guide](skills/build-webmcp-tools/references/vanilla-patterns.md)**: `document.modelContext.registerTool`, `AbortController` cleanup, `webmcp-types`, discovery APIs (`getTools`, `executeTool`, `toolchange`), and cross-origin security (`exposedTo`, `<iframe allow="tools">`).
- **[Testing, Debugging & Page Readiness](skills/build-webmcp-tools/references/testing-and-debugging.md)**: 5-layer testing strategy, Chrome DevTools `Application > WebMCP` pane, `chrome-devtools-mcp` multi-route discovery, and Lighthouse "Agentic browsing" audits.
- **[Audit Procedure & Review Checklist](skills/build-webmcp-tools/references/audit-checklist.md)**: Step-by-step audit workflow for local codebases and live sites, plus the 16-point tool verification checklist.
- **[Agent Security & Prompt Injection Defense](skills/build-webmcp-tools/references/agent-security.md)**: Threat models, the Lethal Trifecta, spotlighting (tags vs. Base64), classifiers, and user-alignment critics.
- **[Official Chrome Sources & Spec Index](skills/build-webmcp-tools/references/sources.md)**: Complete index of official Chrome docs, W3C WebMCP specification, blog posts, and Google Chrome Labs repositories.

---

## Skill Authoring, Validation & Packaging

This package includes built-in TypeScript utilities for validating and packaging Agent Skills according to the open standard:

```bash
cd webmcp-skills

# Validate skill frontmatter and directory structure
npm run skill:validate

# Package skill into a distributable .skill zip archive
npm run skill:package
```

---

## Running Skill Evaluations

This package uses a modular **TypeScript & Vite evaluation engine** conforming to the [Agent Skills Evaluation Standard](https://agentskills.io/skill-creation/evaluating-skills) to benchmark skill adherence, progressive disclosure (`read_file` tool-calling loop), baseline value-add (`delta`), and code generation compliance.

### 1. Install Dependencies

```bash
cd webmcp-skills
npm install
```

### 2. Configure Environment

Set your Google AI API key (or add `GEMINI_API_KEY=your-gemini-api-key` to `.env`):

```bash
export GEMINI_API_KEY="your-gemini-api-key"
```

### 3. Run Evaluations & Tests

```bash
# Run unit tests for the runner, loader, and assertion grader
npm run test:unit

# Run modular evaluations for all skills (always runs with_skill vs without_skill baseline delta)
npm test

# Run full comparative benchmark across all skills (defaults to 3 runs per configuration)
npm run eval:full

# Filter by eval ID or topic (always runs with & without)
npm run eval -- --filter "react"

# Custom number of runs per configuration (e.g. 5 runs for variance analysis)
npm run eval -- --runs 5

# Offline dry-run / schema validation (runs without API key, runs with & without)
npm run eval:dry-run

# Re-bundle modular suites into evals/evals.json
npm run eval:bundle

# Open interactive Vite evaluation viewer to review runs & enter feedback
npm run eval:view
```

For comprehensive empirical results across 74 test cases (444 benchmark runs, **99.53% pass rate** vs. 42.37% baseline), see the **[Benchmark Report](BENCHMARK.md)**.

For guidelines on repository conventions and eval-driven skill development, see the [Agent Guide (AGENTS.md)](AGENTS.md).

---

## Attribution & Acknowledgments

Special thanks to [Sarah Drasner](https://github.com/sdras) for her contributions to this project and her work on WebMCP agent skills that helped improve `build-webmcp-tools`.

The `skill-creator` meta-skill under `.agents/skills/skill-creator` is derived from Anthropic's [`skill-creator`](https://github.com/anthropics/skills), licensed under the Apache License, Version 2.0 (Copyright (c) Anthropic, PBC), and has been modified by Google LLC. See [`NOTICE`](NOTICE) for details.

---

## License

Apache 2.0. See [LICENSE](LICENSE) for details.
