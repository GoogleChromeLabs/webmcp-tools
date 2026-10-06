<!--
Copyright 2026 Google LLC
SPDX-License-Identifier: Apache-2.0
-->

# WebMCP Tool Design: Naming, Budgets, Descriptions & Consolidation

Rules for shaping individual tools and the overall toolset. Apply them when writing `schema.json` (Stage 5), implementing tools (Stage 6), or auditing existing tools.

---

## 1. Character & Token Budgets

| Element               | Limit                            |
| :-------------------- | :------------------------------- |
| Tool name             | ≤ 30 characters                  |
| Parameter name        | ≤ 30 characters                  |
| Tool description      | ≤ 500 characters                 |
| Parameter description | ≤ 150 characters                 |
| Tool output payload   | ≤ 1,500 characters (~400 tokens) |

- Paginate collections (`page`, `page_size: 12`, `total_count`, `total_pages`) and include facet summaries instead of dumping full result sets.
- **Long single items** (a document, a large file): don't silently cut them at the budget.
  - **Page with a continuation signal**: accept `offset`/`limit` or a line range, and return the total length plus `truncated: true` and where to continue.
  - **Provide a way to locate content first**: an outline tool (headings with line numbers) or search that returns line numbers, so the agent reads only the part it needs instead of paging blindly. This is a separate capability, not a size variant of the read tool.
  - **Return exact text** (never summarized or paraphrased) when another tool must match it, e.g. an `edit(originalText, newText)` tool.

---

## 2. Naming & Initiation vs. Execution

- Use concise, action-oriented verbs.
- **Distinguish execution from initiation & navigation**:
  - Use `create_event` or `book_flight` when the tool executes immediately.
  - Use `start_event_creation_process` or `initiate_booking` when the tool navigates to a form or wizard for user interaction.
  - Tools that navigate or switch views change client state, so they must not declare `readOnlyHint: true` (omit it; annotations default to `false`); they do not need `consequentialHint: true` unless they commit an irreversible action (see [annotations.md](./annotations.md)).
- **One capability per tool, no overlap**: Each tool covers one user capability (e.g. "list project items", "move items"), and no two tools can answer the same request. A single tool may span several entity types when they share a lifecycle (see §6). Fewer, well-scoped tools improve agent selection accuracy. Don't split one capability into size or range variants (`read`, `read_range`, `read_full`); use parameters. A tool that answers a _different_ request, such as an outline for navigating a long document, is not bloat.

---

## 3. Descriptions: The "What + When" Formula

- **What**: Concise high-level summary of what the tool accomplishes.
- **When**: Explicit triggering conditions explaining when the model should select this tool over alternatives (e.g., _"Use when searching by meaning or topic rather than exact keywords"_).
- Use positive phrasing.

### Never Repeat `inputSchema` in Descriptions

- Parameter names, data types, enum options, and structural constraints are already declared in `inputSchema.properties` and sent to the LLM.
- Repeating them in the description wastes prompt tokens, exhausts the 500-char budget, and causes tool selection ambiguity instead of clarifying triggering intent.
- ❌ _Don't_: `"Searches items with query string, category_id string, brand_id string, tags array, and price_range object."`
- ✅ _Do_: `"Searches the product catalog by keyword, category, or brand attributes. Use when locating products, comparing options, or filtering inventory."`

### Strictly Omit Developer Implementation Jargon

Descriptions must describe **what** capability the tool provides to the agent and user, never internal implementation details:

- **Forbidden Categories**: State stores (Redux, Pinia, React Query, Signals), backends/transports (Express, Postgres, REST, GraphQL, gRPC), internal patterns ("mutation handler", "REST controller", "cache invalidation").
- **Why**: LLMs have no need for internal plumbing. Jargon wastes character budget, confuses models, and induces hallucinated arguments.
- ❌ _Don't_: `"Redux-backed mutation handler that dispatches to the internal Express REST controller to update ticket state and invalidate React Query cache."`
- ✅ _Do_: `"Updates the status of an existing support ticket in the helpdesk. Use when marking tickets as open, in-progress, or resolved."`

### Description Audit (Stage 5 and Audits)

For every tool and parameter description:

1. It states _what_ the tool does and _when_ to select it over alternatives.
2. It omits parameter names, data types, and constraints already declared in `inputSchema.properties`.
3. It contains no internal implementation jargon (Redux, Pinia, Express, Postgres, REST, GraphQL, gRPC, "mutation handler", "controller").
4. It fits the budgets in §1.

---

## 4. Parameter Schemas

- Use specific types and `enum` arrays (with descriptions) for closed value sets.
- Keep property descriptions ≤ 150 characters.
- Mark required fields in `required`.

---

## 5. Accept Raw User Input

Never make the model **compute** a value; letting it **look up** a standard value is fine.

- **Computation (avoid)**: resolving relative dates ("next Friday" → `2026-10-09`), timezone or unit conversion, epoch timestamps, or arithmetic. The model may not know today's date or the user's timezone and gets these wrong silently.
  - For dates, accept an ISO date **or** the user's phrasing (e.g. `"next Friday"`), and resolve relative dates in the app (e.g. with a date-parsing library). Say so in the parameter description.
- **Lookup (fine)**: mapping a name to a standard code or enum value (e.g. "San Francisco" → `SFO`, "economy" → `"economy"`). Structured codes give the app clean, validated input.
  - When the lookup is ambiguous (e.g. "London" has several airports), also accept the name as the user said it so the app can resolve it or ask.
- **Names over opaque IDs**: use natural-language values over internal database IDs (e.g. `shipping="Express"`, not `shipping_id=1`). IDs the agent received from a previous tool response (e.g. `flight_id` from search results) are fine.

---

## 6. Polymorphic Tool Consolidation Over Granular Tool Bloat

> **Project recommendation**: This is this skill's design guidance for keeping tool catalogs small, not a WebMCP spec or Chrome requirement. Apply it when it fits the app, within the limits below.

- **Reject entity-specific tool proliferation**: Avoid separate CRUD tools per entity (e.g. `list_issues`, `list_bugs`, `get_issue`, `move_issue`). Granular tool bloat causes prompt token explosion, selection paralysis, and multi-turn roundtrips.
- **Merge overlapping tools** into cohesive, parameterized tools (e.g., a single `search_catalog` tool with category filters rather than distinct tools per category).
- **When not to consolidate**: keep entities in separate tools when they differ in parameters, permissions, or annotations. For example, customer-submitted support tickets need `untrustedContentHint: true` while admin-managed canned reply templates do not; merging them into one `list_items` would either mislabel trusted content as untrusted or drop the untrusted-content signal for user text. Consolidate only entities that share a lifecycle, parameters, permissions, and annotations.
- Where domain entities share common operational lifecycles (e.g. issues, bug reports, epics, pull requests):
  - **Consolidated Listing**: Expose `list_items` accepting an array of `types` (e.g. `types: ['issue', 'bug']`), keyword `query`, and pagination parameters rather than individual `list_issues`, `list_bugs`, `list_epics`.
  - **Consolidated Detail Retrieval**: Expose `get_item` accepting `item_type` and `id` rather than per-entity getter tools.
  - **Batch Mutation Operations**: Expose `move_items` (or `delete_items`, `tag_items`) accepting an array of items `items: [{ type: string, id: string }]` and target destination, enabling the agent to relocate multiple entities across categories in a single turn without sequential roundtrips.
  - **Shared Type Values**: Use one set of `type` values across all consolidated tools (e.g. singular `issue`, `bug`), so the items `list_items` returns can be passed straight to `get_item` and `move_items`. Map them to API paths inside the handler.
  - **Concurrent Execution**: Query or mutate across entity types concurrently using `Promise.all` inside the tool handler, keeping turn latency low and returning consolidated LLM-readable payloads.

---

## 7. UI Synchronization

- In asynchronous tools, always await DOM/state updates _before_ returning the result to the agent so the agent inspects a consistent page state.
