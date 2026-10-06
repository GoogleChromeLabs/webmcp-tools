<!--
Copyright 2026 Google LLC
SPDX-License-Identifier: Apache-2.0
-->

# WebMCP Official Sources and Documentation

Comprehensive index of official Chrome documentation, specifications, blog posts, and Google Chrome Labs repositories for WebMCP as of September 2026.

> **Version claims verified 2026-09-30** against the pages below: origin trial from Chrome 149 and `chrome://flags/#enable-webmcp-testing` (WebMCP overview); in-flight executions survive unregistering from Chrome 153, JSON-string `executeTool` arguments deprecated from Chrome 155, `debugging` annotation from Chrome 156 (Imperative API); `toolactivated`/`toolcancel` on `document.modelContext`, not `window`, from Chrome 156 (Declarative API); Lighthouse "Agentic browsing" requires Chrome 150+; `chrome-devtools-mcp --categoryExperimentalWebmcp` requires Chrome 150+ with `--enable-features=WebMCP` (its configuration guide; the DevTools WebMCP page calls the flag `--categoryWebMCP`); `webmcp-evals` uses `GOOGLE_AI` for Gemini keys and defaults to `gemini-3.5-flash` (npm README). Re-check when citing a Chrome version.

---

## 1. Official WebMCP Documentation (`developer.chrome.com/docs/ai/webmcp`)

| Document                          | Description                                                                      | URL                                                                            |
| :-------------------------------- | :------------------------------------------------------------------------------- | :----------------------------------------------------------------------------- |
| **WebMCP Overview**               | Core concepts, browser architecture, and progressive enhancement                 | [Overview](https://developer.chrome.com/docs/ai/webmcp)                        |
| **Imperative API**                | `document.modelContext.registerTool`, lifecycle, signal cleanup, annotations     | [Imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api)   |
| **Declarative API**               | Form attributes (`toolname`, `tooldescription`, `toolautosubmit`), submit events | [Declarative API](https://developer.chrome.com/docs/ai/webmcp/declarative-api) |
| **When to use WebMCP and MCP**    | In-browser frontend tools vs. headless backend MCP servers                       | [WebMCP vs MCP](https://developer.chrome.com/docs/ai/webmcp/compare-mcp)       |
| **WebMCP in User Journeys**       | Identifying candidate workflows, wizard flows, and high-value journeys           | [Use Cases](https://developer.chrome.com/docs/ai/webmcp/use-cases)             |
| **Build Agentic Workflows**       | 5-step strategy: Goals, starting state, turn-by-turn roleplay, variance, evals   | [Build Workflows](https://developer.chrome.com/docs/ai/webmcp/build-tools)     |
| **WebMCP Tool Security**          | Tool author security, cross-origin rules, annotations, iframe delegation         | [Tool Security](https://developer.chrome.com/docs/ai/webmcp/secure-tools)      |
| **Agent Security Considerations** | Threat models, indirect prompt injection, spotlighting, classifiers              | [Agent Security](https://developer.chrome.com/docs/agents/security)            |
| **WebMCP Best Practices**         | Naming, character budgets, cognitive computing rules, UI synchronization         | [Best Practices](https://developer.chrome.com/docs/ai/webmcp/best-practices)   |
| **Test WebMCP with Evals**        | Evaluation-driven development, deterministic vs. probabilistic tests             | [Evals Guide](https://developer.chrome.com/docs/ai/webmcp/evals)               |

---

## 2. DevTools and Lighthouse Tooling

| Tool / Guide                               | Description                                                        | URL                                                                                                                   |
| :----------------------------------------- | :----------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------- |
| **Debug WebMCP Tools**                     | Chrome DevTools Application > WebMCP pane setup and inspection     | [DevTools Guide](https://developer.chrome.com/docs/devtools/application/webmcp)                                       |
| **Lighthouse: Agentic Browsing Scoring**   | Fractional scoring system for agent-ready websites                 | [Lighthouse Scoring](https://developer.chrome.com/docs/lighthouse/agentic-browsing/scoring)                           |
| **Lighthouse: Registered WebMCP Tools**    | Audit of active declarative and imperative tools                   | [Registered Tools Audit](https://developer.chrome.com/docs/lighthouse/agentic-browsing/registered-webmcp-tools)       |
| **Lighthouse: Missing Declarative WebMCP** | Detects standard forms lacking `toolname`/`tooldescription`        | [Missing Forms Audit](https://developer.chrome.com/docs/lighthouse/agentic-browsing/forms-missing-declarative-webmcp) |
| **Lighthouse: Schema Validity**            | Validates field names, description pairing, and schema constraints | [Schema Validity Audit](https://developer.chrome.com/docs/lighthouse/agentic-browsing/webmcp-schema-validity)         |
| **Lighthouse: Accessibility for Agents**   | Validates accessibility tree completeness and programmatic names   | [Agent Accessibility](https://developer.chrome.com/docs/lighthouse/agentic-browsing/accessibility-for-agents)         |
| **Lighthouse: Layout Stability**           | Cumulative Layout Shift (CLS) thresholds for agent actuation       | [Layout Stability](https://developer.chrome.com/docs/lighthouse/agentic-browsing/layout-stability)                    |
| **Lighthouse: `llms.txt`**                 | Validates presence and format of `/llms.txt` site summary          | [llms.txt Audit](https://developer.chrome.com/docs/lighthouse/agentic-browsing/llms-txt)                              |

---

## 3. Specifications, Repositories & Packages

- **WebMCP Specification Explainer**: [webmachinelearning/webmcp](https://github.com/webmachinelearning/webmcp) | [Draft Spec](https://webmachinelearning.github.io/webmcp/)
- **Chrome Status Feature Tracker**: [WebMCP Feature #5117755740913664](https://chromestatus.com/feature/5117755740913664)
- **Chrome Origin Trial**: [Chrome 149+ Origin Trial Registration](https://developer.chrome.com/origintrials/#/register_trial/4163014905550602241)
- **React Hook**: [`use-webmcp-tool`](https://www.npmjs.com/package/use-webmcp-tool) ([GitHub: GoogleChromeLabs/use-webmcp-tool](https://github.com/GoogleChromeLabs/use-webmcp-tool))
- **TypeScript Types**: [`webmcp-types`](https://www.npmjs.com/package/webmcp-types)
- **Reference Demos & Evals**: [GoogleChromeLabs/webmcp-tools](https://github.com/GoogleChromeLabs/webmcp-tools)
- **Chrome DevTools for Agents**: [`chrome-devtools-mcp`](https://github.com/ChromeDevTools/chrome-devtools-mcp) ([configuration guide](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/configuration.md))
- **Evals CLI**: [`webmcp-evals`](https://www.npmjs.com/package/webmcp-evals)
- **Model Context Tool Inspector Extension**: [Chrome Web Store](https://chromewebstore.google.com/detail/model-context-tool-inspec/gbpdfapgefenggkahomfgkhfehlcenpd)
- **Angular WebMCP Support**: [angular.dev/ai/webmcp](https://angular.dev/ai/webmcp)
- **LLMs.txt Standard**: [llmstxt.org](https://llmstxt.org/)
