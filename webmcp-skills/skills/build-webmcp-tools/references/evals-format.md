<!--
Copyright 2026 Google LLC
SPDX-License-Identifier: Apache-2.0
-->

# WebMCP Evaluations, Debugging & Auditing Specification

This guide specifies how to test, evaluate, debug, and audit WebMCP tools across deterministic unit testing, probabilistic model evaluations (`evals.json`), Chrome DevTools inspection, and Lighthouse audits.

---

## 1. Multi-Layer Testing Strategy

Agents are probabilistic; identical prompts can produce different paths. Before deploying tools to production, test across five distinct layers:

1. **Deterministic Unit Tests**: Mock `document.modelContext.registerTool`, invoke the captured `execute` callback directly, and assert state store updates, argument validation, and return payloads without invoking an LLM.
2. **Tools in Isolation**: Verify schemas and descriptions in isolation. Trigger tools directly using `document.modelContext.executeTool(tool, jsonString)` to verify parser behavior before introducing model randomness.
3. **Probabilistic Model Evals**: Run conversational prompt suites to confirm the model selects the right tool and extracts the correct parameters under both direct queries ("Book flight AA-100") and ambiguous queries ("Find me a morning flight next Friday").
4. **End-to-End User Journeys**: Verify complete multi-turn flows (e.g. `search_flights` $\rightarrow$ `select_flight` $\rightarrow$ `initiate_booking`), specifying ordering constraints where sequence matters.
5. **Mid-Chain Failures**: Advance the application state directly to an intermediate step and simulate failures (e.g. discount coupon expired) to ensure the agent recovers gracefully rather than blindly completing the journey.

---

## 2. Tool Schema Specification (`schema.json`)

The consolidated `schema.json` file contains a root object with a `tools` array. Each tool definition includes its `name` (≤ 30 chars), `description` (≤ 500 chars), standard JSON Schema `inputSchema`, optional `outputSchema`, and `annotations`:

> [!IMPORTANT]
> **Clean Descriptions (No Implementation Jargon)**: Tool descriptions must describe user/agent capabilities in positive phrasing. Strictly omit developer implementation jargon (e.g. Zustand, Redux, Axum, SQLite, REST, GraphQL, IPC, internal mutation handlers). LLMs reason about what the tool accomplishes, not internal architecture or libraries.

```json
{
  "tools": [
    {
      "name": "search_flights",
      "description": "Searches available flights between origin and destination airports for specified dates.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "origin": {
            "type": "string",
            "description": "3-letter IATA departure airport code (e.g. SFO)"
          },
          "destination": {
            "type": "string",
            "description": "3-letter IATA arrival airport code (e.g. JFK)"
          },
          "departure_date": {
            "type": "string",
            "description": "Departure date in YYYY-MM-DD format"
          },
          "cabin_class": {
            "type": "string",
            "enum": ["economy", "premium_economy", "business", "first"],
            "description": "Preferred cabin class (optional)"
          }
        },
        "required": ["origin", "destination", "departure_date"]
      },
      "annotations": {
        "readOnlyHint": true
      }
    },
    {
      "name": "initiate_booking",
      "description": "Pre-selects the flight and navigates user to checkout confirmation screen.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "flight_id": {
            "type": "string",
            "description": "Unique identifier of the flight to book"
          }
        },
        "required": ["flight_id"]
      },
      "annotations": {
        "consequentialHint": true
      }
    }
  ]
}
```

---

## 3. Evaluation File Format (`evals.json`)

Evaluation suites provide test cases matching conversational messages against expected tool calls.

### Single Tool / Direct Query

```json
[
  {
    "name": "Direct flight search",
    "messages": [
      {
        "role": "user",
        "type": "message",
        "content": "I need a flight from SFO to JFK on 2026-10-15 in economy class."
      }
    ],
    "expectedCall": [
      {
        "functionName": "search_flights",
        "arguments": {
          "origin": "SFO",
          "destination": "JFK",
          "departure_date": "2026-10-15",
          "cabin_class": "economy"
        }
      }
    ]
  }
]
```

### Multi-Step Journey with Ordered & Unordered Constraints

When some steps must occur sequentially while others can execute in any order (such as looking up details for multiple items), use nested `ordered` and `unordered` blocks:

```json
[
  {
    "name": "Multi-item lookup journey",
    "messages": [
      {
        "role": "user",
        "type": "message",
        "content": "Find black running shoes and red water bottles, and show details for both."
      }
    ],
    "expectedCall": [
      { "functionName": "navigate_to_catalog", "arguments": { "category": "sports" } },
      {
        "unordered": [
          {
            "ordered": [
              {
                "functionName": "search_products",
                "arguments": { "query": "black running shoes" }
              },
              { "functionName": "get_product_details", "arguments": { "productId": "SHOE-101" } }
            ]
          },
          {
            "ordered": [
              { "functionName": "search_products", "arguments": { "query": "red water bottle" } },
              { "functionName": "get_product_details", "arguments": { "productId": "BOTTLE-202" } }
            ]
          }
        ]
      }
    ]
  }
]
```

### Argument Matching Rules & Constraint Operators

In `expectedCall`, parameter values are matched using strict equality or constraint objects evaluated by `matcher.js`:

- **Exact Primitive Matching**: Matches primitive values directly via strict equality (`"SFO"`, `true`, `42`). String literals are matched with `actual === expected`.
- **Regex Pattern Matching (`$pattern`)**: To validate string values using regular expressions, use the `$pattern` constraint object:
  ```json
  "arguments": {
    "departure_date": { "$pattern": "^202[0-9]-[0-1][0-9]-[0-3][0-9]$" },
    "filter": { "$pattern": "^(all|active)$" }
  }
  ```
  _(Do NOT use slash literals like `"/^...$/"`, as string literals are tested with strict equality)._
- **Supported Constraint Operators**:
  - `{ "$pattern": "<regex>" }`: Matches string values against a regular expression.
  - `{ "$contains": "<substring-or-element>" }`: Checks string substring presence or array inclusion.
  - `{ "$gt": <number> }`, `{ "$gte": <number> }`, `{ "$lt": <number> }`, `{ "$lte": <number> }`: Numerical threshold boundaries.
  - `{ "$type": "string" | "number" | "boolean" | "array" | "object" }`: Asserts value data type.
  - `{ "$any": true }`: Matches any non-undefined value for the parameter.
- **Realistic Tool Sets**: When evaluating tool selection, always supply the **complete tool catalog for that page state** so the agent must choose between competing tools.

### Chained Multi-Step Trajectories with `mockOutput`

In static local evaluation mode (`webmcp-evals local`), `MockResolver.js` defaults to returning an empty object `{}` for resolved tool invocations.

When a downstream tool call depends on entity IDs or state returned by a preceding step (for example, `list_playlists` returning playlist IDs needed by `add_track_to_playlist`), receiving `{}` causes the model to get stuck repeating the initial step. Supply a `mockOutput` field on `expectedCall` steps:

```json
[
  {
    "name": "Add track to user playlist after listing",
    "messages": [
      {
        "role": "user",
        "type": "message",
        "content": "Add this song to my Chill Vibes playlist."
      }
    ],
    "expectedCall": [
      {
        "functionName": "list_playlists",
        "arguments": { "filter": "user_created" },
        "mockOutput": {
          "playlists": [{ "id": "pl-42", "name": "Chill Vibes", "track_count": 18 }]
        }
      },
      {
        "functionName": "add_track_to_playlist",
        "arguments": {
          "playlist_id": "pl-42",
          "track_id": "trk-99"
        }
      }
    ]
  }
]
```

`MockResolver.js` feeds this `mockOutput` back to the model as the tool response for subsequent steps, allowing multi-step reasoning to proceed deterministically.

### Mid-Chain Failure Testing & Graceful Recovery

Automated evaluations must verify that when intermediate tool calls fail (e.g., invalid coupon, seat already reserved, or item out of stock), the agent recovers gracefully rather than aborting the session or hallucinating success.

In `evals.json`, author multi-turn test cases that simulate the prior dialogue—including the failing tool response with actionable error guidance—and assert that the agent selects an alternative tool, requests user clarification, or executes a fallback path:

```json
[
  {
    "name": "Mid-chain coupon expiration recovery",
    "messages": [
      {
        "role": "user",
        "type": "message",
        "content": "Apply promo code SAVE50 and checkout."
      },
      {
        "role": "model",
        "type": "functioncall",
        "name": "apply_coupon",
        "arguments": { "code": "SAVE50" }
      },
      {
        "role": "user",
        "type": "functionresponse",
        "name": "apply_coupon",
        "response": {
          "result": {
            "error": "Promo code SAVE50 has expired. Please enter an active discount code or proceed without coupon.",
            "code": "COUPON_EXPIRED",
            "retryable": true
          }
        }
      }
    ],
    "expectedCall": [
      {
        "functionName": "request_user_input",
        "arguments": {
          "prompt": { "$pattern": "expired.*alternative|different" }
        }
      }
    ]
  }
]
```

Key authoring rules for mid-chain failure tests:

1. **Pre-seed Failed State in `messages` with Proper Message Types (`mappers.js`)**:
   - Use lowercase `"type": "functioncall"` with `"role": "model"` (or `"assistant"`), `"name"`, and `"arguments"`.
   - Use lowercase `"type": "functionresponse"` with `"role": "user"`, `"name"`, and payload inside `"response": { "result": { ... } }` (or `"response": { ... }`).
   - _Do NOT use `function_call` / `function_response` or `content`, as `mappers.js` will treat them as plain chat messages and trigger AI SDK validation errors._
2. **Actionable Error Responses**: Emulate Core Principle 8 ("Errors Are Guides") by providing structured, actionable feedback (e.g. `{ error: "...", code: "...", retryable: true }`) in the tool response.
3. **Verify Graceful Recovery**: Assert in `expectedCall` that the agent invokes a fallback tool (e.g. `list_available_coupons`, `proceed_without_discount`) or asks the user for clarification, rather than crashing or repeating the invalid call.

---

## 4. Failure-Mode Troubleshooting Matrix

When an evaluation fails or an agent misbehaves, consult this diagnostic guide:

| Failure Mode                          | Typical Symptom                                             | Diagnostic Checks                                                                                                                                                                |
| :------------------------------------ | :---------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Wrong Tool Selected / Skipped**     | Agent calls `checkout` without calling `add_to_cart`.       | • Description clear, positive, and complete?<br>• Name intuitive (action-verb ≤ 30 chars)?<br>• Tool exposed in current page state?<br>• Description overlaps with another tool? |
| **Incorrect Step Ordering**           | Calls `select_seat` before `search_flights`.                | • Does preceding tool output supply required context?<br>• Are tools dynamically exposed/gated by application state?<br>• Test the isolated sub-chain by pre-seeding state.      |
| **Invalid or Hallucinated Arguments** | Agent sends raw text instead of enum, or wrong date format. | • `inputSchema` has explicit `enum` arrays and property descriptions?<br>• Required fields declared?<br>• Description explains how to map user input to structured values?       |
| **Stale or Missing Output**           | Agent reports wrong total or claims action failed.          | • Tool logic bug?<br>• UI state update awaited before returning payload?<br>• Payload concise and formatted for LLM consumption (≤ 1.5K chars)?                                  |
| **Runtime Exceptions / Crash**        | Agent stops abruptly; tool crashes.                         | • Runtime exceptions caught and re-thrown with actionable messages?<br>• Network failures handled?<br>• Is error distinguishable between retryable vs fatal?                     |

---

## 5. Debugging with Chrome DevTools (Chrome 149+)

Enable Chrome flags:

- `chrome://flags/#enable-webmcp-testing`
- `chrome://flags/#devtools-webmcp-support`

Open **Chrome DevTools $\rightarrow$ Application $\rightarrow$ WebMCP**:

1. **Available Tools Pane**:
   - Displays all active declarative and imperative tools as the browser agent sees them.
   - Features an **invocation counter** per tool. A count of zero across sessions indicates the agent never deemed the tool relevant.
2. **Invoked Tools Log**:
   - Chronological log showing Status (`Completed`, `Canceled`, `In Progress`, `Error`), input arguments received, and returned payload.
3. **Manual Tool Execution**:
   - Click any tool or click the Play icon on a log entry to execute tools manually with custom parameters, bypassing the LLM to verify application state reactions.
4. **Schema Violation Warnings**:
   - Inspect validation warnings when parameters passed by the model do not match the declared JSON Schema.

---

## 6. Chrome DevTools for Agents (`chrome-devtools-mcp`)

Use the Chrome DevTools MCP server to let coding agents interact with running WebMCP web pages:

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "-y",
        "chrome-devtools-mcp@latest",
        "--autoConnect",
        "--categoryExperimentalWebmcp",
        "--channel=canary"
      ]
    }
  }
}
```

- Enables coding agents to query available WebMCP tools, execute tools inside the browser, and inspect accessibility trees and visual renders.

---

## 7. Lighthouse "Agentic Browsing" Audits (Chrome 150+)

Lighthouse evaluates site readiness for AI agents using fractional pass ratios and specific audits:

- **Registered WebMCP Tools**: Audits discovered declarative and imperative tools for action-oriented names and descriptive text.
- **Forms Missing Declarative WebMCP**: Detects standard `<form>` elements lacking `toolname` and `tooldescription`.
- **WebMCP Schema Validity**: Fails if a form has only one of `toolname`/`tooldescription`, or if an input lacks a `name`. Warns if fields lack `toolparamdescription` or `<label>`.
- **Accessibility for Agents**: Verifies that every interactive element has a programmatic accessible name and valid roles.
- **Layout Stability (CLS)**: Asserts Cumulative Layout Shift thresholds so visual position shifts do not cause agent misclicks.
- **`llms.txt`**: Checks for `/llms.txt` per the [llmstxt.org](https://llmstxt.org/) standard summarizing site capabilities and entry points.
