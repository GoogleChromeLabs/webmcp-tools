<!--
Copyright 2026 Google LLC
SPDX-License-Identifier: Apache-2.0
-->

# Live Site Discovery

Use this guide when the developer names a live site or URL (e.g. _"I want to add WebMCP tools to example.com"_ or _"Analyze https://... for WebMCP user journeys"_) instead of a local codebase.

---

## 1. Clarify What WebMCP Is

- WebMCP runs **client-side in the browser tab on `document.modelContext`**. Tools are registered by code running in the page: the site's own first-party code, or an extension/content script injected into it.
- It is **not** external headless scraping or automation (Puppeteer, Playwright, simulated DOM clicking). Tools call application logic (state stores, APIs, client routers) directly.
- It is not a backend MCP server over `stdio`/SSE.

---

## 2. Explore the Site Before Defining Goals

Always inspect the live site's workflows before proposing goals:

- **Actively open the site with `chrome-devtools` MCP (when available)**: Check your available MCP servers (including lazy-loaded MCP tools invoked via `call_mcp_tool`) for `chrome-devtools`. If present, **call it immediately before replying** (`list_pages` / `navigate_page` + `take_snapshot`) to open the URL and inspect the rendered page, navigation menus, forms, and key routes. **Do not** use static HTTP fetch tools (`read_url_content`, `curl`, `WebFetch`) or guess from training data when `chrome-devtools` MCP is available—modern SPAs and `document.modelContext` require a live browser runtime.
- **If no browser tool is available in your environment**: Recommend browsing or inspecting the live pages (e.g. with a browser or [`chrome-devtools-mcp`](https://github.com/ChromeDevTools/chrome-devtools-mcp)) to walk key pages, menus, forms, and multi-step flows.
- **Check `/llms.txt`** for a documented, machine-readable summary of site capabilities and entry points ([llmstxt.org](https://llmstxt.org/)); also check sitemaps.
- **Check for existing tools across routes and states** with `list_webmcp_tools` (`chrome-devtools-mcp`), `await document.modelContext.getTools()` in the console, or the Chrome DevTools **Application > WebMCP** pane as you navigate key views (tools are often route-scoped or state-gated; see [testing-and-debugging.md § 3](./testing-and-debugging.md#3-chrome-devtools-for-agents-chrome-devtools-mcp)). If `document.modelContext` is `undefined`, WebMCP is not enabled in the browser (`--enable-features=WebMCP` or `chrome://flags/#enable-webmcp-testing`). Never fetch or scrape minified production JS bundles to find tools; only inspect live-site source if unminified or sourcemapped. If tools already exist, switch to an audit ([audit-checklist.md](./audit-checklist.md)).

---

## 3. Route to Stage 1 (User Goals Portfolio)

- Based on what you observed in the live site (or, if no browser tool is available, offering to inspect the site and outlining candidate workflows), propose 3 prioritized candidate user journeys that fit what the site actually does. For a store, for example: search the catalog, manage the cart, check out.
- For each journey, state the ideal outcome, required context, and autonomous boundary (what the agent must not do without user confirmation).
- Invite the user to choose ONE journey to take through Stages 2–4.
- Do not output frontend code before goals are defined and role-played.
