# AGENTS.md — `webmcp-evals`

Instructions for working on the `webmcp-evals` TypeScript CLI and evaluation suites. See [README.md](README.md) for full CLI options and schema reference.

## Build, Lint, Format & Test

Always build before running local CLI commands (`node dist/bin/webmcp-evals.js ...`):

```bash
npm ci

# Format with oxfmt and compile TypeScript to dist/
npm run build

# Run unit tests (builds first, then runs node --test dist/test/*.test.js)
npm test

# Lint and check formatting (enforced in CI via ../.github/workflows/lint.yml)
npm run lint
npx oxfmt --check
```

## Code Style & Conventions

- **License Header**: Every source file must begin with the Google Apache 2.0 header (enforced by `oxlint` via [.oxlintrc.json](.oxlintrc.json)):
  ```ts
  /**
   * Copyright 2026 Google LLC
   * SPDX-License-Identifier: Apache-2.0
   */
  ```
- **ESM Imports**: This package uses `"type": "module"` (`NodeNext`); always include `.js` extensions on relative TypeScript imports.
- **`document.modelContext` Only**: Always write `document.modelContext` for imperative WebMCP tools, never `navigator.modelContext`.
- **Framing**: `webmcp-evals` evaluates **a website's WebMCP tools** (`document.modelContext` and declarative `<form toolname>`). The tools are evaluated _against_ an agent: the built-in LLM loop, or a Chrome extension with `--extension`. Keep CLI text, reports, and docs framed this way, not as an agent benchmark.

## Evaluating Against Browser Extensions (`src/extension/`)

With `--extension`, `browser` and `simulate` send each prompt to an agent that runs as a Chrome extension instead of the built-in LLM loop. [docs/extension-contract.md](docs/extension-contract.md) describes the behavior and the `window.__AGENT_AUTOMATION__` bridge.

- **Code map**:
  - [`controller.ts`](src/extension/controller.ts): `connectExtensionController` launches or attaches to Chrome and opens the extension's side panel. It keeps the web app tab in front, because side-panel extensions work with the active tab.
  - [`discovery.ts`](src/extension/discovery.ts): finds the extension by ID, manifest name, or unpacked directory, and resolves its side-panel path.
  - [`adapters.ts`](src/extension/adapters.ts): reads and drives the panel UI: the DOM of [`GoogleChromeLabs/webmcp-extension`](https://github.com/GoogleChromeLabs/webmcp-extension), or the `window.__AGENT_AUTOMATION__` bridge (`WindowAgentAutomationBridge`) of other extensions.
  - [`turn.ts`](src/extension/turn.ts): waits for a turn to finish and answers tool permission prompts (`--confirm-policy`).
  - [`pageTelemetry.ts`](src/extension/pageTelemetry.ts): `PageToolCallRecorder` records tool calls on the web page from Puppeteer's `page.webmcp` events, with the same result rules as [`BrowserToolRegistry`](src/evaluator/browser.ts).
  - [`contract.ts`](src/extension/contract.ts): shared types and pure helpers (panel snapshot, readiness, and status).
  - Evaluators: [`extensionBrowserEvaluator.ts`](src/evaluator/extensionBrowserEvaluator.ts) for `browser --extension`, and [`simulationEvaluator.ts`](src/evaluator/simulationEvaluator.ts) for `simulate --extension`.
- **Rules**:
  - `clearWebOriginData` (`Storage.clearDataForOrigin`) is the only direct CDP call. With `--browser-url`, never clear site data or close Chrome: it is the user's own browser.
  - Do not add ad-hoc `data-*` conventions for extension panels. Other extensions integrate through `window.__AGENT_AUTOMATION__`.
  - When you change extension behavior, extension CLI options, or the bridge types in `contract.ts`, update [docs/extension-contract.md](docs/extension-contract.md) and the [`evaluate-webmcp-tools-with-extension`](../webmcp-skills/skills/evaluate-webmcp-tools-with-extension/) skill (its reference file copies the bridge contract) in the same change.

## Evaluation & Smoke Test Guidelines

- **Deterministic Smoke Tests** (no API key required; runs in CI via [../.github/workflows/smoke-tests.yml](../.github/workflows/smoke-tests.yml)):
  ```bash
  URL=http://localhost:3000 ./run_smoke.sh <doors|bistro|pizza|sport-shop|hotel-chain|smart-home|pixel-art-studio|proxx-lite|all> -v
  ```
- **Authoring `evals.json`**: Keep required `expectedCall` entries compatible with `webmcp-evals smoke`, which resolves matcher operators (`$pattern`, `$contains`, `$lte`, etc.) into concrete sample arguments.
- **Authoring `simulations.json`**:
  - DOM `assertions` (`exists`, `count`, `text`, `attribute`) run in a single pass immediately after the conversation ends without polling or retries.
  - Prefer stable, application-owned `id` or `data-*` selectors over visual layout classes.
  - Keep `userScenario` focused on the user's goal, situation, and preferences; do not reference tool names or internal IDs in `userScenario`.
