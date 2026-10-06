---
name: build-webmcp-tools
description: >-
  Designs, evaluates, audits, and implements WebMCP tools: client-side tools a
  web page exposes to in-browser AI agents on document.modelContext, via
  registerTool, declarative form attributes (toolname, tooldescription), React
  useWebMCP, or Angular provideExperimentalWebMcpTools. Use when a developer
  wants to make a website or web app agent-ready, analyze a site or URL for
  WebMCP user journeys, add or review tools for in-browser agents, write tool
  schemas, descriptions, annotations, or evals.json, audit existing WebMCP
  tools, or fix Lighthouse "Agentic browsing" and DevTools WebMCP findings. Not
  for backend MCP servers over stdio or SSE, or for standalone scraping scripts.
---

<!--
Copyright 2026 Google LLC
SPDX-License-Identifier: Apache-2.0
-->

# WebMCP Tool Development Workflow (`build-webmcp-tools`)

WebMCP lets a web page expose client-side capabilities as structured tools to in-browser AI agents on `document.modelContext`, instead of agents scraping or clicking the DOM. This skill routes a developer to the right stage of the tool lifecycle and points to the reference file that holds the detailed rules and code for that stage.

**Key tenet**: WebMCP runs **client-side in the browser tab on `document.modelContext`**, inside the user's authenticated session. It supports **Tools only** (no Resources or Prompts). It is **not** a backend MCP server over `stdio`/SSE, and tools execute application logic (state stores, APIs, client routers) directly rather than simulating typing or clicks.

## How to Use This Skill

1. Match the developer's request to a row in the **Router** and go to that stage.
2. **Read the files in the "Read first" column before responding.** Paths are relative to this skill's directory. This file only summarizes them; the detailed rules, examples, and code patterns live in the references, so do not answer from this summary alone.
3. If the request refers to an artifact you were not given (transcripts, `schema.json`, source files), read it if it is available in the workspace; otherwise ask for it, and outline how you will apply the stage's key rules from its reference file (for audits, include the verification steps). Never invent the missing artifact.
4. Apply the **Non-Negotiables** to everything you produce.
5. Before finishing an audit, `schema.json`, or implementation, check your output against [`references/audit-checklist.md`](./references/audit-checklist.md).

---

## Non-Negotiables

- **Budgets**: tool and parameter names ≤ 30 chars; tool descriptions ≤ 500 chars; parameter descriptions ≤ 150 chars; output ≤ 1,500 chars (~400 tokens), paginated. → [tool-design.md](./references/tool-design.md)
- **Descriptions**: "What + When" (what the tool does, when to choose it); never repeat `inputSchema` parameters; no implementation jargon (Redux, Pinia, Express, REST, GraphQL, gRPC). → [tool-design.md](./references/tool-design.md)
- **Naming & shape**: action verbs; `initiate_*` for tools that open a form or wizard vs. `book_*`/`create_*` for immediate execution; never make the model compute values (relative dates, conversions): accept the user's phrasing and resolve it in the app, though unambiguous lookups to standard codes are fine; prefer names over opaque IDs; recommended: consolidate entities that share a lifecycle and annotations into polymorphic, batched tools, keeping trusted and user-authored content in separate tools. → [tool-design.md](./references/tool-design.md)
- **Annotations**: all hints default to false and are strictly opt-in (specify only when true; never declare : false); `readOnlyHint: true` only on pure queries; `consequentialHint: true` only on significant, irreversible real-world actions (payments, bookings, deletions); view navigation, tab switching, and `initiate_*` hand-offs must not declare `readOnlyHint: true` (omit it) and do not need `consequentialHint`, protecting unsaved work inside the tool; routine mutating tools omit annotations; `untrustedContentHint: true` on any output containing user- or third-party-authored text, even from your own database. → [annotations.md](./references/annotations.md)
- **Errors reach the agent**: React `useWebMCP` throws `Error` (→ `isError: true`); native `registerTool` **resolves** `{ error, code, retryable }` because rejections become a generic `DOMException: UnknownError`; declarative forms resolve structured field errors via `event.respondWith`. → [error-handling.md](./references/error-handling.md)
- **UI sync**: await state and DOM updates before a tool returns.
- **Cross-origin**: tools are same-origin by default (Permissions Policy `tools`, default `self`); delegate only with `<iframe allow="tools">` plus `registerTool(tool, { exposedTo: ['https://trusted.origin'] })`; origin isolation is required (`Origin-Agent-Cluster: ?0` disables WebMCP). → [vanilla-patterns.md](./references/vanilla-patterns.md)
- **Design before code**: one goal per iteration, each ending with the user critique (agent tone, clarifying questions, autonomous boundaries); never write schemas, evals, or code for goals that were not role-played and approved; implementation simplicity is not conversational simplicity. The only exception is the explicit fast path below, when the developer asks to skip design for one tool. → [conversational-design.md](./references/conversational-design.md)

---

## Router

| The developer has / asks for                                                                                                                       | Go to                                                                                                                         | Read first                                                                                                                                                     | Don't yet                                                                                                                        |
| :------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------- |
| "Add WebMCP to this project" (**local code in the workspace**, no URL)                                                                             | Stage 1                                                                                                                       | The project's `package.json`, routes, and main components; `conversational-design.md`                                                                          | Ask what the app does; write code or schemas                                                                                     |
| One specific tool idea ("a tool to search flights")                                                                                                | Stage 2 or 3 for that goal                                                                                                    | `conversational-design.md`, `use-case-template.md`                                                                                                             | Ideate an unrelated portfolio; write code                                                                                        |
| Goals already defined                                                                                                                              | Stage 2                                                                                                                       | `conversational-design.md`                                                                                                                                     | Re-ideate goals                                                                                                                  |
| Goal + starting state                                                                                                                              | Stage 3                                                                                                                       | `use-case-template.md`, `conversational-design.md`                                                                                                             | Skip the critique loop                                                                                                           |
| A happy-path transcript to harden                                                                                                                  | Stage 4                                                                                                                       | `conversational-design.md`                                                                                                                                     | —                                                                                                                                |
| Approved role-plays → schemas & evals                                                                                                              | Stage 5                                                                                                                       | `tool-design.md`, `annotations.md`, `evals-format.md`                                                                                                          | Invent tools for un-modeled goals                                                                                                |
| Existing `schema.json` → `evals.json`                                                                                                              | Stage 5 (evals)                                                                                                               | `evals-format.md`                                                                                                                                              | Force Stages 1–4                                                                                                                 |
| Just finished `schema.json`/`evals.json` ("what next?")                                                                                            | Stage 5 eval gate                                                                                                             | `evals-format.md`                                                                                                                                              | Start Stage 6 without asking                                                                                                     |
| Existing schema, tool spec, or named tools to implement in framework code (e.g. "write React `useWebMCP` tools for `list_items` and `move_items`") | Stage 6                                                                                                                       | The framework file (below), `error-handling.md`                                                                                                                | Reopen conversational design                                                                                                     |
| A **URL or domain** (e.g. `example.com`, `https://...`) to **add** tools to or analyze for journeys                                                | Stage 1, after exploring the site with `chrome-devtools` MCP                                                                  | `live-site-discovery.md` (not `conversational-design.md` first)                                                                                                | Ask the user to describe the site; use `read_url_content` or guess instead of calling `chrome-devtools` MCP; write frontend code |
| **Feedback on, review, or audit of existing tools** (live site or local code)                                                                      | Audit                                                                                                                         | `audit-checklist.md`, `agent-security.md`, `error-handling.md`                                                                                                 | Restart Stage 1 ideation                                                                                                         |
| Testing, DevTools, `chrome-devtools-mcp` live discovery, Lighthouse, page readiness                                                                | —                                                                                                                             | `testing-and-debugging.md`                                                                                                                                     | Scrape minified JS bundles                                                                                                       |
| Concept questions                                                                                                                                  | —                                                                                                                             | Budgets/naming/descriptions: `tool-design.md`; annotations: `annotations.md`; prompt injection, spotlighting: `agent-security.md`; errors: `error-handling.md` | —                                                                                                                                |
| Wants to skip design for one tool ("can we skip role-play and just code it?", "skip the design, give me the code")                                 | Explicit fast path (below) — **must open with 1 sentence noting the skipped design risks**, then deliver schema + eval + code | `tool-design.md`, `annotations.md`, the framework file                                                                                                         | Refuse to write code                                                                                                             |
| Backend MCP (`stdio`/SSE server, Node/Python)                                                                                                      | Out of scope                                                                                                                  | —                                                                                                                                                              | Use `document.modelContext` on a server                                                                                          |

**Framework files**: React → `react-patterns.md`; Angular → `angular-patterns.md`; Vanilla JS, Vue, Svelte → `vanilla-patterns.md`; declarative HTML forms → `declarative-patterns.md`. All files are in `references/`.

**Unclear entry point**: ask which applies — 1) discover user goals, 2) model starting states, 3) role-play conversations, 4) harden with variations, 5) generate `schema.json`/`evals.json`, 6) implement in frontend code, or audit existing tools.

---

## Explicit Fast Path

Only when the developer asks to skip design (asking "can we skip it?" counts) for a **single tool**. It never applies to greenfield requests or to a new tool idea that doesn't mention skipping design.

1. **Start the response** with one or two sentences naming what is being skipped, e.g. "Skipping role-play means ambiguous requests, clarifying questions, and confirmation boundaries stay untested." Do this every time, even if the developer says they understand the risks.
2. If their reason is that the code is simple, also correct that: easy code is not an easy conversation (e.g. "a one-line state update is simple, but 'save the one I just opened' or a duplicate URL is where agents fail").
3. Deliver the tool schema, at least one `evals.json` case, and the framework code.
4. Still apply every Non-Negotiable (budgets, What + When, annotations, error handling). Don't argue for design again.

## Stage 1: User Goals Portfolio

- Inspect the app yourself, then propose 3 prioritized candidate journeys **derived from what the app actually does**. For **each** journey, state its ideal outcome, required context, and **autonomous boundary** (what the agent must not do without user confirmation).
- **Live site**: explain that tools must be registered by code running in the page (first-party code or an extension/content script) on `document.modelContext`, not by headless scraping. **If `chrome-devtools` MCP (or another browser tool) is available in your environment, call it immediately** (`navigate_page`, `take_snapshot`, check `/llms.txt`, and check `list_webmcp_tools` / `document.modelContext.getTools()`) to inspect the rendered pages before proposing journeys—never rely on static HTTP fetchers (`read_url_content`, `curl`) or training-data assumptions. Only if no browser tool is available in your environment, recommend browsing or inspecting the site's pages and checking `/llms.txt` before proposing journeys.
- Invite the user to pick **ONE** goal to take through Stages 2–4, ending with the user critique on agent tone, clarifying questions, and autonomous boundaries.
- **Single tool idea** (e.g. "a tool to search flights"): skip the portfolio. Frame that one request as a user goal (ideal outcome, required context, autonomous boundaries) and continue straight into Stage 2 or Stage 3 for it.

## Stage 2: Starting States Matrix

- Model functional state for the goal: active route, loaded entities, cart/selection, session and auth, constraints.
- Prune irrelevant diagnostics (`device_battery`, `gpu_temp`, `screen_dpi`).

## Stage 3: Turn-by-Turn Role-Play

- Document every turn with 6 elements: **User utterance**, **Agent intent**, **Agent tool invocations**, **Tool response** (structured JSON with pagination fields `page_size` and `total_count`, ≤ 1,500 chars), **Site implementation & UI reaction**, **Agent response**. Format with `use-case-template.md`.
- For payments, bookings, or high-stakes actions, model a **human-in-the-loop UI hand-off** (e.g. `initiate_booking` returning `status: "requires_user_action"` and navigating to a dedicated confirmation UI where the user clicks Confirm, rather than autonomously charging the user).
- End with the **User Critique Loop**: ask the user to evaluate agent demeanor and tone, clarifying questions, and autonomous confirmation boundaries.

## Stage 4: Variations & Graceful Failure

Stress-test the baseline: missing required parameters (ask, never guess), prerequisite violations (actionable errors), over-constrained queries (suggest relaxations), coreference ("the second one"), and human-in-the-loop hand-off for sensitive actions (return `status: "requires_user_action"` and open a dedicated confirmation UI the user completes; `consequentialHint: true` only on a tool that commits the action itself).

## Stage 5: Tool Consolidation & Evals

- Consolidate only tools from approved goals (Iterative Incremental or Portfolio-First pathway); apply `tool-design.md` and `annotations.md` to every tool.
- Write `schema.json` and `evals.json` per `evals-format.md`.
- Then **ask the user** whether to run `npx webmcp-evals local -t schema.json -e evals.json` now or proceed to Stage 6. If they run it, check that the provider key is set in `.env` (`GOOGLE_AI` for Gemini, or `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`) and suggest a fast model.

## Stage 6: Application Implementation

- Read the framework file first. React: `useWebMCP` from `use-webmcp-tool` (never raw `registerTool` in components), schema literals hoisted or stable, and **always include** a Vitest + React Testing Library test that mocks `document.modelContext.registerTool` and calls the captured `execute`. Angular: `provideExperimentalWebMcpTools`. Vanilla: `document.modelContext.registerTool` with an `AbortController` signal. Declarative: `<form toolname tooldescription>`.
- Verify with `testing-and-debugging.md` (DevTools Application > WebMCP pane, Lighthouse "Agentic browsing") and self-check against `audit-checklist.md`.

## Audits

1. **First** read `references/audit-checklist.md`, `references/agent-security.md`, and `references/error-handling.md` (you can request them together), and only then open the code under review. The checklist, not the Non-Negotiables summary, is the audit standard; an audit based only on this file is incomplete.
2. Collect the tools:
   - **Local codebase**: read the registration code (`useWebMCP`, `registerTool`, `provideExperimentalWebMcpTools`, `<form toolname>`).
   - **Live site**: discover tools at runtime across routes, tabs, and UI states using `list_webmcp_tools` (`chrome-devtools-mcp` with `--categoryExperimentalWebmcp`), `await document.modelContext.getTools()`, or the DevTools Application > WebMCP pane (see `references/testing-and-debugging.md`). If `document.modelContext` is `undefined`, WebMCP is not enabled in the browser (`--enable-features=WebMCP` or `chrome://flags/#enable-webmcp-testing`)—report that prerequisite instead of assuming no tools exist. **Never** fetch or scrape minified production JS bundles on a live site; only inspect live-site source when unminified or sourcemapped.
3. Report findings per checklist item, each with the affected tool and a concrete fix.
4. End with verification steps: inspect and manually execute the tools in the Chrome DevTools **Application > WebMCP** pane (Play icon), and run the Lighthouse **"Agentic browsing"** audit.
5. **No tools available yet** (e.g. a live site you cannot open): do not stop at asking for code. Tell the user how to collect the tools (`await document.modelContext.getTools()` across routes in the console, `list_webmcp_tools` via `chrome-devtools-mcp`, or the DevTools Application > WebMCP pane), list the checklist areas you will audit (budgets and jargon, annotations including navigation and UGC, error handling, security), and end your reply with the verification steps from step 4 (DevTools manual execution, Lighthouse "Agentic browsing").
