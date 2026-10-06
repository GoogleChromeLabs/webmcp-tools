<!--
Copyright 2026 Google LLC
SPDX-License-Identifier: Apache-2.0
-->

# WebMCP Use Case: [Scenario Title]

This document defines a focused user journey, turn-by-turn conversation role-play, discovered WebMCP tools, expected site UI reactions, recovery behaviors, and security annotations.

---

## 1. Scenario Definition

- **Product Context**: [Brief store/application description, e.g., "Flight booking portal", "E-commerce fashion store"]
- **Target User Goal**: [The single, specific goal this conversation achieves from the product's goal portfolio]
- **Starting State**:
  - **Application State**: [Starting URL/route, visible UI state, active filters, loaded entities — only include state relevant to the goal]
  - **Agent Context**: [Fresh session vs. existing history, authenticated user profile, saved preferences]
  - **System Constraints**: [Catalog availability, device connection status, permission boundaries, or 'None']

---

## 2. Role-Playing the Conversation

<!--
Simulate the conversation turn-by-turn driving directly toward achieving the defined goal.
For every turn, document all 6 core elements:
-->

### Turn 1: [Phase Name, e.g., Initial Request & Discovery]

- **User**: "[Natural language request or question]"
- **Agent Intent**: [Reasoning, parameter normalization, coreference resolution]
- **Agent Tool Invocations**:
  ```javascript
  tool_name({
    param1: "value",
    page: 1,
    page_size: 12,
  });
  ```
- **Tool Response (to Agent)**:
  ```json
  {
    "total_count": 42,
    "page": 1,
    "page_size": 12,
    "total_pages": 4,
    "results": [{ "id": "item-101", "name": "Item Name", "summary": "Key details" }],
    "available_facets": {
      "categories": ["electronics", "home"],
      "price_range": { "min": 20, "max": 150 }
    }
  }
  ```
  _(Enforce payload budget: ≤ 1,500 characters)_
- **Site Implementation & UI Reaction**:
  - Direct state updates (e.g., store dispatch, route transition, entity selection).
  - Visual UI updates (e.g., render filtered results grid, open preview drawer, highlight selected item).
- **Agent Response**:
  "[Conversational message to user presenting results and guiding next steps]"

---

### Turn 2: [Phase Name, e.g., Refinement & Selection]

- **User**: "[User refinement or shorthand selection, e.g., 'The second one in blue']"
- **Agent Intent**: [Resolve coreference ('the second one' -> 'item-102'), extract parameters]
- **Agent Tool Invocations**:
  ```javascript
  select_item({
    item_id: "item-102",
    options: { color: "blue" },
  });
  ```
- **Tool Response (to Agent)**:
  ```json
  {
    "status": "selected",
    "item_id": "item-102",
    "name": "Item Name",
    "selected_options": { "color": "blue" }
  }
  ```
- **Site Implementation & UI Reaction**:
  - Updates item configuration in application state store.
  - Navigates or focuses the detail pane on `item-102` showing the blue variant.
- **Agent Response**:
  "[Confirmation and final prompt]"

---

## 3. Discovered WebMCP Tool Specifications

Ensure every tool respects Chrome character budgets:

- **Tool Name**: ≤ 30 chars
- **Tool Description**: ≤ 500 chars
- **Parameter Description**: ≤ 150 chars
- **Tool Output**: ≤ 1,500 chars

| Tool Name          | Parameters & JSON Schema                                  | Description & Purpose                                                                        | Annotations          | Expected Site Reaction         |
| :----------------- | :-------------------------------------------------------- | :------------------------------------------------------------------------------------------- | :------------------- | :----------------------------- |
| `search_catalog`   | `query: string`<br>`category?: string`<br>`page?: number` | Finds catalog items with facet summaries. Use when the user browses or searches the catalog. | `readOnlyHint: true` | Updates search results grid    |
| `select_item`      | `item_id: string`<br>`options?: object`                   | Selects a catalog item and its options. Use when the user picks an item from results.        | _(omitted)_          | Focuses item detail pane       |
| `initiate_booking` | `item_id: string`                                         | Opens checkout for the user to confirm. Use when the user is ready to book an item.          | _(omitted)_          | Navigates route to `/checkout` |

---

## 4. Variance, Edge Cases & Graceful Failure

1. **Missing Required Parameters**:
   - _Trigger_: User says "Find me flights next week" without origin or specific dates.
   - _Expected Agent Behavior_: Prompt user for missing parameters before invoking the tool, or tool throws an actionable error listing required parameters.
2. **Prerequisite Failures / Wrong State**:
   - _Trigger_: Agent calls `apply_filters` before `search_catalog` has executed.
   - _Tool Behavior_: Throws `Error("No active search found. Execute search_catalog first before applying filters.")` to signal `isError: true`.
   - _Agent Recovery_: Runs `search_catalog` first or prompts user for search terms.
3. **Over-Constrained Queries / 0 Results**:
   - _Trigger_: Filter combination yields 0 matches.
   - _Tool Response_: Returns helpful suggestion: `"No items found matching the selected filters. Suggest expanding price range or category."`
4. **Conversational Coreference**:
   - _Trigger_: User refers to previous items by shorthand ("the cheap one", "the red one", "the first flight").
   - _Resolution_: Agent maps ordinal or property references back to concrete IDs from preceding turn payloads.

---

## 5. Security & Trust Boundaries

- **Human-in-the-Loop Hand-off**:
  - High-risk or irreversible actions (financial transactions, credential updates, account deletion) must be marked with `consequentialHint: true` or omit `toolautosubmit`.
  - Transition the UI to a confirmation modal or checkout view (`initiate_booking`) rather than executing autonomous checkout.
- **Untrusted Content Demarcation**:
  - If tool output incorporates user reviews or third-party listings, mark with `untrustedContentHint: true` so consuming agents spotlight the payload.
- **Server-Side Verification**:
  - Client-side tools never trust agent-generated prices or discounts; all financial inputs must be verified by backend services.

---

## 6. Automated Evaluation (Evals) Checklist

- [ ] **Tool Selection Sequence**: Verify agent selects tools in correct order across turns.
- [ ] **Parameter Extraction**: Verify exact extraction of required and optional arguments.
- [ ] **Character Budgets**: Confirm all descriptions and output payloads remain within limits.
- [ ] **UI Synchronization**: Verify DOM/application state updates match tool invocations.
- [ ] **Actionable Errors**: Verify errors are thrown with guidance so model can self-correct.
- [ ] **Security Compliance**: Verify agent pauses and directs user to UI for human-in-the-loop actions.
