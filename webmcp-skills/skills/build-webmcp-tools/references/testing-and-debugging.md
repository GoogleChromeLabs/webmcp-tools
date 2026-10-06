<!--
Copyright 2026 Google LLC
SPDX-License-Identifier: Apache-2.0
-->

# Testing, Debugging & Page Readiness

How to verify WebMCP tools beyond `evals.json`: testing layers, Chrome DevTools inspection, coding-agent access via `chrome-devtools-mcp`, Lighthouse "Agentic browsing" audits, and page-level agent readiness. For the `schema.json` / `evals.json` formats, see [evals-format.md](./evals-format.md).

---

## 1. Multi-Layer Testing Strategy

Agents are probabilistic; identical prompts can produce different paths. Before deploying tools to production, test across five distinct layers:

1. **Deterministic Unit Tests**: Mock `document.modelContext.registerTool`, invoke the captured `execute` callback directly, and assert state store updates, argument validation, and return payloads without invoking an LLM.
2. **Tools in Isolation**: Verify schemas and descriptions in isolation. Trigger tools directly using `document.modelContext.executeTool(tool, { ...args })` (pass an object; JSON-string arguments are deprecated from Chrome 155) to verify parser behavior before introducing model randomness.
3. **Probabilistic Model Evals**: Run conversational prompt suites to confirm the model selects the right tool and extracts the correct parameters under both direct queries ("Book flight AA-100") and ambiguous queries ("Find me a morning flight next Friday").
4. **End-to-End User Journeys**: Verify complete multi-turn flows (e.g. `search_flights` $\rightarrow$ `select_flight` $\rightarrow$ `initiate_booking`), specifying ordering constraints where sequence matters.
5. **Mid-Chain Failures**: Advance the application state directly to an intermediate step and simulate failures (e.g. discount coupon expired) to ensure the agent recovers gracefully rather than blindly completing the journey.

---

## 2. Debugging with Chrome DevTools

WebMCP must be enabled for the page: locally via `chrome://flags/#enable-webmcp-testing`, or for real users through the WebMCP origin trial (from Chrome 149). The WebMCP pane then appears on any page that registers tools.

Open **Chrome DevTools $\rightarrow$ Application $\rightarrow$ WebMCP** (a section inside the `Application` panel, not a top-level tab):

1. **Available Tools Pane**:
   - Displays all active declarative and imperative tools as the browser agent sees them.
   - Features an **invocation counter** per tool. A count of zero across sessions indicates the agent never deemed the tool relevant.
2. **Invoked Tools Log**:
   - Chronological log showing Status (`Completed`, `Canceled`, `In Progress`, `Error`), input arguments received, and returned payload.
3. **Manual Tool Execution**:
   - Click any tool or click the Play icon on a log entry to execute tools manually with custom parameters, bypassing the LLM to verify application state reactions.
4. **Schema Violation Warnings**:
   - Inspect validation warnings when parameters passed by the model do not match the declared JSON Schema.

You can also list registered tools from the console with `await document.modelContext.getTools()`.

---

## 3. Chrome DevTools for Agents (`chrome-devtools-mcp`)

Use the Chrome DevTools MCP server to let coding agents inspect and test running WebMCP pages:

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "-y",
        "chrome-devtools-mcp@latest",
        "--categoryExperimentalWebmcp",
        "--chromeArg=--enable-features=WebMCP",
        "--channel=canary"
      ]
    }
  }
}
```

`--categoryExperimentalWebmcp` exposes the WebMCP tools in the MCP server, while `--chromeArg=--enable-features=WebMCP` enables WebMCP in the Chrome instance launched by the server (requires Chrome 150+). If using `--autoConnect` to attach to an already-running browser, `--chromeArg` does not apply and that browser must have `chrome://flags/#enable-webmcp-testing` or `--enable-features=WebMCP` enabled.

### WebMCP Discovery Rules on Live Pages

1. **Runtime Tool Discovery (`list_webmcp_tools` / `getTools()`)**:
   - When `--categoryExperimentalWebmcp` is active, call `list_webmcp_tools` (registered tools are also surfaced automatically by `navigate_page` and `select_page`) and `execute_webmcp_tool`.
   - Otherwise, run `await document.modelContext.getTools()` via `evaluate_script` (and check the DOM snapshot for declarative `<form toolname tooldescription>` elements).
   - **If `document.modelContext` is `undefined`**: WebMCP is not enabled in the browser. Real-world apps guard registration with `if (!document.modelContext) return;` or `useWebMCP`, so imperative registrations are skipped when the flag is off. Stop and instruct the user to enable WebMCP (`--chromeArg=--enable-features=WebMCP` when launched by `chrome-devtools-mcp`, or `chrome://flags/#enable-webmcp-testing` when using `--autoConnect`) rather than concluding the page has no tools.
2. **Multi-Route & State-Gated Discovery**:
   - WebMCP tools are often scoped to specific routes or gated by UI state (`useWebMCP(..., { enabled })`, Angular route `providers`, or `AbortController` cleanup). Checking only the initial landing URL misses tools mounted on other views.
   - Walk the application's routes, tabs, modals, and authenticated states, re-running `list_webmcp_tools` or `await document.modelContext.getTools()` at each state to build a **Route/State $\rightarrow$ Tools** inventory.
3. **Never Scrape Minified Production Bundles**:
   - **Never** fetch `<script src="...">` bundles or regex-search minified production JS to discover or audit WebMCP tools.
   - Only inspect source files on a live site when readable source is available—either because the site ships unminified code or exposes source maps (`sourceMappingURL` / `.map`).

---

## 4. Lighthouse "Agentic Browsing" Audits (Chrome 150+)

Lighthouse evaluates site readiness for AI agents using fractional pass ratios and specific audits:

- **Registered WebMCP Tools**: Audits discovered declarative and imperative tools for action-oriented names and descriptive text.
- **Forms Missing Declarative WebMCP**: Detects standard `<form>` elements lacking `toolname` and `tooldescription`.
- **WebMCP Schema Validity**: Fails if a form has only one of `toolname`/`tooldescription`, or if an input lacks a `name`. Warns if fields lack a parameter description; the fallback chain is `toolparamdescription` $\rightarrow$ `<label>` $\rightarrow$ `aria-description`.
- **Accessibility for Agents**: Verifies that every interactive element has a programmatic accessible name and valid roles.
- **Layout Stability (CLS)**: Asserts Cumulative Layout Shift thresholds so visual position shifts do not cause agent misclicks.
- **`llms.txt`**: Checks for `/llms.txt` per the [llmstxt.org](https://llmstxt.org/) standard summarizing site capabilities and entry points.

---

## 5. Page-Level Agent Readiness

1. **Accessibility Tree**: Interactive elements must have programmatic names and valid roles; nothing interactive hidden from the accessibility tree.
2. **Layout Stability (CLS)**: Avoid layout shifts that cause agent coordinate misclicks.
3. **`llms.txt`**: Provide a concise Markdown summary at `/llms.txt` per [llmstxt.org](https://llmstxt.org/).
4. **DevTools Inspection**: Verify tools in the Application > WebMCP pane (§2).
5. **Lighthouse Audit**: Run the "Agentic browsing" category (§4).
