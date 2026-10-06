# AGENTS.md

This repository contains WebMCP developer utilities, an evaluation CLI ([webmcp-evals/](webmcp-evals/)), a browser polyfill ([demos/shared/](demos/shared/)), and interactive demo apps ([demos/](demos/)). See [README.md](README.md) for the full project catalog.

Subproject-specific instructions:
- **Demos (`demos/`)**: See [demos/AGENTS.md](demos/AGENTS.md)
- **Evaluation CLI (`webmcp-evals/`)**: See [webmcp-evals/AGENTS.md](webmcp-evals/AGENTS.md)

## Repo-Wide Rules

- **License Header**: Every source file (`.ts`, `.tsx`, `.js`, `.jsx`, `.css`, `.html`, `.sh`) must begin with the Apache 2.0 header (enforced in CI by `oxlint` + `eslint-plugin-license-header`):
  ```js
  /**
   * Copyright 2026 Google LLC
   * SPDX-License-Identifier: Apache-2.0
   */
  ```
- **Build All Bundled Demos**: `./build-demos.sh`
- **Lint & Test `webmcp-evals`**: `cd webmcp-evals && npm ci && npm run lint && npx oxfmt --check && npm test`

## Adding a New Demo

1. Create `demos/<demo-name>/README.md` with the live URL, tool table, and local setup instructions (follow [demos/AGENTS.md](demos/AGENTS.md)).
2. Add the build step to [build-demos.sh](build-demos.sh) (if bundled) and the `cp -r` step to [.github/workflows/deploy.yml](.github/workflows/deploy.yml).
3. Add eval definitions under `webmcp-evals/examples/<demo-name>/` and register the target in [webmcp-evals/run_smoke.sh](webmcp-evals/run_smoke.sh) and [.github/workflows/smoke-tests.yml](.github/workflows/smoke-tests.yml).
4. List the demo in [README.md](README.md) and [AWESOME_WEBMCP.md](AWESOME_WEBMCP.md).
