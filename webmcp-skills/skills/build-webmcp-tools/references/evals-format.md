<!--
Copyright 2026 Google LLC
SPDX-License-Identifier: Apache-2.0
-->

# WebMCP Tool Specs & Evals (Stage 5)

This guide covers the Stage 5 deliverables: the consolidated `schema.json`, the automated `evals.json` suite, and the local evaluation gate. For design rules on names, descriptions, and consolidation see [tool-design.md](./tool-design.md); for annotations see [annotations.md](./annotations.md); for unit tests, DevTools, and Lighthouse see [testing-and-debugging.md](./testing-and-debugging.md).

---

## 1. Stage 5 Procedure

1. **Consolidate only approved tools**: Include only tools discovered in goals that were role-played and approved in Stages 1–4 (see [conversational-design.md](./conversational-design.md#tools-and-evals-are-strictly-goal-driven)). Merge overlapping tools and apply polymorphic consolidation per [tool-design.md](./tool-design.md).
2. **Audit every tool**: budgets, "What + When" descriptions without schema repetition or jargon, and annotations (`readOnlyHint`, `consequentialHint`, `untrustedContentHint`).
3. **Write `schema.json`** (§2).
4. **Write `evals.json`** (§3): compile baseline and variation trajectories using exact match, `$pattern` regex constraints, `mockOutput` for chained steps, nested `ordered`/`unordered` blocks, and mid-chain failure tests.
5. **Offer the local evaluation gate** (§4) before moving to Stage 6.

---

## 2. Tool Schema Specification (`schema.json`)

The consolidated `schema.json` file contains a root object with a `tools` array. Each tool definition includes its `name` (≤ 30 chars), `description` (≤ 500 chars), standard JSON Schema `inputSchema`, optional `outputSchema`, and `annotations`:

> [!IMPORTANT]
> Descriptions follow the "What + When" formula and contain no implementation jargon (Redux, Pinia, Express, Postgres, REST, GraphQL, gRPC). See [tool-design.md](./tool-design.md#3-descriptions-the-what--when-formula).

```json
{
  "tools": [
    {
      "name": "search_flights",
      "description": "Finds available flights for a trip. Use when the user wants to compare flight options, times, or prices before choosing one.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "origin": {
            "type": "string",
            "description": "Departure airport code (e.g. SFO) or city name as the user said it"
          },
          "destination": {
            "type": "string",
            "description": "Arrival airport code (e.g. JFK) or city name as the user said it"
          },
          "departure_date": {
            "type": "string",
            "description": "Departure date as ISO YYYY-MM-DD or as the user phrased it (e.g. 'next Friday'); the app resolves relative dates"
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
      "description": "Opens the checkout confirmation screen for a chosen flight so the user can review and confirm. Use when the user has picked a flight and wants to book it.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "flight_id": {
            "type": "string",
            "description": "Unique identifier of the flight to book"
          }
        },
        "required": ["flight_id"]
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

## 4. Local Evaluation Gate (Proactive User Choice)

- Immediately after authoring `schema.json` and `evals.json`, proactively ask the user:
  > _"Would you like to run the local schema evaluations (`npx webmcp-evals local -t schema.json -e evals.json`) now to verify tool selection and argument parsing, or proceed directly to Stage 6 (Application Implementation)?"_
- **NEVER** silently skip evaluations or drop them as an unmentioned afterthought.
- **If the user chooses to run evaluations**:
  - Check that the provider key is configured in the project `.env`: `GOOGLE_AI` for Gemini, `OPENAI_API_KEY` for OpenAI, or `ANTHROPIC_API_KEY` for Anthropic (`OLLAMA_HOST` for local Ollama). If missing, prompt the user to add it so evaluations can execute.
  - Propose running:
    ```bash
    npx webmcp-evals local -b gemini -m gemini-3.5-flash-lite -t schema.json -e evals.json
    ```
    _(`-b` selects the backend: `vercel` (default), `gemini`, or `ollama`. `-m` picks the model; the default is `gemini-3.5-flash`, and a smaller model such as `gemini-3.5-flash-lite` runs faster and cheaper.)_
  - If tool selection or ordering fails, use the Failure-Mode Troubleshooting Matrix (§5) to diagnose and resolve schema or description issues before moving to code.
- **If the user chooses implementation**: Proceed directly to Stage 6 without blocking.

---

## 5. Failure-Mode Troubleshooting Matrix

When an evaluation fails or an agent misbehaves, consult this diagnostic guide:

| Failure Mode                          | Typical Symptom                                             | Diagnostic Checks                                                                                                                                                                |
| :------------------------------------ | :---------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Wrong Tool Selected / Skipped**     | Agent calls `checkout` without calling `add_to_cart`.       | • Description clear, positive, and complete?<br>• Name intuitive (action-verb ≤ 30 chars)?<br>• Tool exposed in current page state?<br>• Description overlaps with another tool? |
| **Incorrect Step Ordering**           | Calls `select_seat` before `search_flights`.                | • Does preceding tool output supply required context?<br>• Are tools dynamically exposed/gated by application state?<br>• Test the isolated sub-chain by pre-seeding state.      |
| **Invalid or Hallucinated Arguments** | Agent sends raw text instead of enum, or wrong date format. | • `inputSchema` has explicit `enum` arrays and property descriptions?<br>• Required fields declared?<br>• Description explains how to map user input to structured values?       |
| **Stale or Missing Output**           | Agent reports wrong total or claims action failed.          | • Tool logic bug?<br>• UI state update awaited before returning payload?<br>• Payload concise and formatted for LLM consumption (≤ 1.5K chars)?                                  |
| **Runtime Exceptions / Crash**        | Agent stops abruptly; tool crashes.                         | • Runtime exceptions caught and re-thrown with actionable messages?<br>• Network failures handled?<br>• Is error distinguishable between retryable vs fatal?                     |

---
