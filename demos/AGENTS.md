# AGENTS.md — WebMCP Demos

Instructions for building and modifying WebMCP demo applications in `demos/`.

## Setup & Running Demos

- **Build all bundled demos** (React/Vite & Angular): `../build-demos.sh` (from repo root: `./build-demos.sh`).
- **Static demos** (`coffee-shop`, `doors`, `explainer`, `french-bistro`, `order-tracking`, `page-agent`, `pizza-maker`, `real-estate-map`, `ticket-booking`): No build step; serve from the repository root so `../shared/webmcp-polyfill.js` resolves (e.g., `npx serve .`).
- **Bundled demos** (`analytics-dashboard`, `hotel-chain`, `leather-bag`, `pixel-art-studio`, `react-flightsearch`, `smart-home`, `sport-shop-angular`, `webmcp-maze`): Run `npm ci && npm run dev` (or `npm start` for Angular demos) inside `demos/<demo-name>`.

## Web & WebMCP Guidance (`modern-web-guidance`)

Before building or modifying demos, UI components, HTML/CSS, or WebMCP tools, query [`GoogleChrome/modern-web-guidance`](https://github.com/GoogleChrome/modern-web-guidance) so you do not rely on legacy web patterns or outdated WebMCP drafts:

- **Retrieve WebMCP & agentic tool guides**:
  ```bash
  npx -y modern-web-guidance@latest retrieve webmcp,agentic-forms,agentic-javascript-tools
  ```
- **Search & retrieve modern web platform patterns** (`<dialog>`, Popover API, Anchor Positioning, View Transitions, `@starting-style`, container queries, `:has()`, `:user-valid`, `oklch()`):
  ```bash
  npx -y modern-web-guidance@latest search "<action-oriented query>"
  npx -y modern-web-guidance@latest retrieve "<guide-id>"
  ```

## WebMCP Tool Design & Audits (`webmcp-skills`)

When designing, implementing, or auditing WebMCP tools in a demo, follow the [`build-webmcp-tools`](../webmcp-skills/skills/build-webmcp-tools/SKILL.md) skill from [`webmcp-skills/`](../webmcp-skills/):

- Load only the reference guides relevant to the task (e.g., [tool-design.md](../webmcp-skills/skills/build-webmcp-tools/references/tool-design.md), [annotations.md](../webmcp-skills/skills/build-webmcp-tools/references/annotations.md), [error-handling.md](../webmcp-skills/skills/build-webmcp-tools/references/error-handling.md), and the matching [React](../webmcp-skills/skills/build-webmcp-tools/references/react-patterns.md) / [Angular](../webmcp-skills/skills/build-webmcp-tools/references/angular-patterns.md) / [Vanilla JS](../webmcp-skills/skills/build-webmcp-tools/references/vanilla-patterns.md) / [Declarative HTML](../webmcp-skills/skills/build-webmcp-tools/references/declarative-patterns.md) pattern guide).
- Verify new or changed tools against the [audit checklist](../webmcp-skills/skills/build-webmcp-tools/references/audit-checklist.md) (character/token budgets, annotations, actionable errors, prompt-injection defenses).
- Write `schema.json` / `evals.json` per [evals-format.md](../webmcp-skills/skills/build-webmcp-tools/references/evals-format.md) when adding evals under [`webmcp-evals/examples/<demo-name>/`](../webmcp-evals/examples/).

## Demo Conventions & Gotchas

- **License Header**: Every source file (`.ts`, `.tsx`, `.js`, `.jsx`, `.css`, `.html`, `.sh`) must start with the Google Apache 2.0 header.
- **React Demos**:
  - Use `useWebMCP` from [`use-webmcp-tool`](https://github.com/GoogleChromeLabs/use-webmcp-tool) for automatic tool registration and `AbortController` cleanup (see [smart-home/src/context/useWebMCPTools.js](smart-home/src/context/useWebMCPTools.js)).
- **Angular Demos**:
  - Use `declareExperimentalWebMcpTool` from `@angular/core` for imperative tools (see [sport-shop-angular/src/app/services/webmcp.service.ts](sport-shop-angular/src/app/services/webmcp.service.ts)) or `experimentalWebMcpTool` in Angular Signal Forms (`@angular/forms/signals`, see [leather-bag/src/app/pages/product/product.ts](leather-bag/src/app/pages/product/product.ts)).
- **Shared Polyfill & Types**:
  - Include `<script src="../shared/webmcp-polyfill.js"></script>` in static demos and pair `:tool-form-active` / `:tool-submit-active` CSS selectors with `.tool-form-active` / `.tool-submit-active` fallback classes.
  - Reference [shared/types/webmcp-declarative.d.ts](shared/types/webmcp-declarative.d.ts) in TypeScript projects for `toolname`, `tooldescription`, `toolparamdescription`, and `toolautosubmit` attribute types.
- **GitHub Pages Base Paths & Routing**:
  - Include the WebMCP Origin Trial `<meta http-equiv="origin-trial" ...>` tag in `index.html`.
  - Set `base: ''` or `base: './'` in `vite.config.ts` / `vite.config.js`, and build Angular apps with `--base-href /webmcp-tools/demos/<demo-name>/` in [../build-demos.sh](../build-demos.sh).
  - Use relative paths or hash routing (`HashRouter` / `withHashLocation()`) so deep links work on GitHub Pages.
