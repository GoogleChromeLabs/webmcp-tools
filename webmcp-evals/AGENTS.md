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

## Evaluation & Smoke Test Guidelines

- **Deterministic Smoke Tests** (no API key required; runs in CI via [../.github/workflows/smoke-tests.yml](../.github/workflows/smoke-tests.yml)):
  ```bash
  URL=http://localhost:3000 ./run_smoke.sh <doors|bistro|pizza|sport-shop|hotel-chain|smart-home|all> -v
  ```
- **Authoring `evals.json`**: Keep required `expectedCall` entries compatible with `webmcp-evals smoke`, which resolves matcher operators (`$pattern`, `$contains`, `$lte`, etc.) into concrete sample arguments.
- **Authoring `simulations.json`**:
  - DOM `assertions` (`exists`, `count`, `text`, `attribute`) run in a single pass immediately after the conversation ends without polling or retries.
  - Prefer stable, application-owned `id` or `data-*` selectors over visual layout classes.
  - Keep `userScenario` focused on the user's goal, situation, and preferences; do not reference tool names or internal IDs in `userScenario`.
