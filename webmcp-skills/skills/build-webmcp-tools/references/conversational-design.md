<!--
Copyright 2026 Google LLC
SPDX-License-Identifier: Apache-2.0
-->

# Conversational Design & Boundary Stress-Testing Guide (Stages 1–4)

This guide details the methodology for designing, role-playing, and stress-testing in-browser conversational journeys before defining tool schemas or writing code.

---

## Stage 1: User Goals Portfolio (Step a)

### 1. Identify Candidate Journeys

Inspect the web application's routes, menus, forms, and API endpoints yourself before responding. In a local codebase, read `package.json`, route definitions, and the main UI components; for a live site, see [live-site-discovery.md](./live-site-discovery.md). Do not ask the developer questionnaire-style questions about what the app does — find out, then immediately propose concrete, prioritized candidate journeys **derived from what the app actually does** (e.g. for a store: search the catalog, manage the cart, check out; for a recipe app: find recipes by ingredient, organize recipes into collections or a meal plan, share a recipe). Include at least one journey involving a consequential action if the app has one.

Prioritize flows where natural language interaction delivers the highest user value over manual clicking:

- **Multi-Step Wizards**: Booking, customized onboarding, complex checkout flows.
- **Large Catalog Filtering**: Faceted search with multiple intersecting constraints.
- **Troubleshooting & Diagnostics**: Interactive support flows, account troubleshooting.
- **Bulk Operations**: Managing, categorizing, or updating multiple items.

### 2. Define Each Goal

For each candidate journey, document:

- **Ideal Outcome**: Concrete definition of success (e.g., "Round-trip flights from LHR to JFK booked").
- **Required Context**: State, permissions, and session data needed (e.g., passenger details, loyalty tier, seat preferences).
- **Boundaries & Guardrails**: What the agent must _never_ do autonomously (e.g., charging credit cards without user confirmation).

### 3. Goal Isolation & "One Goal Per Iteration"

- Each role-play simulation in Stage 3 isolates **one specific goal** at a time. Avoid compounding unrelated user goals into a single scenario.
- **One Goal Per Iteration**: Complete the entire design cycle (Starting States $\rightarrow$ Role-Play $\rightarrow$ Variations $\rightarrow$ User Critique on agent tone, clarifying questions, and autonomous boundaries) for **one single goal at a time** before advancing to the next goal in the portfolio.
- **Forbid Bulk Generation**: Never generate turn-by-turn role-plays or use cases for multiple goals in a single turn. Bulk generation prevents meaningful user collaboration, induces model hallucination, and bypasses critical edge-case discovery.
- After proposing candidate goals, invite the user to select ONE goal to begin Stage 2.

---

## Stage 2: Starting States Matrix per Goal (Step b)

### 1. Core State Dimensions

For each goal, specify realistic starting contexts:

- **Application View / Route**: Active URL and component state (`/`, `/search`, `/orders/123`).
- **Loaded Entities & Selections**: Items in cart, active filter tokens, pre-populated form values.
- **Agent Context & User Profile**: Fresh session vs. ongoing multi-turn thread, authenticated account tier, stored preferences.
- **System Constraints**: Inventory availability, feature flags, permissions.

### 2. Aggressive Diagnostic Pruning

Applications frequently hold internal diagnostic state that is completely irrelevant to the user's intent. Prune these out to avoid context bloat and model distraction:

- ❌ **Prune**: Hardware telemetry (`device_battery`, `gpu_temp`, `cpu_usage`, `screen_dpi`, `network_rtt`).
- ✅ **Retain**: Functional application state (active route, cart items, user preferences, authentication status).

---

## Stage 3: Turn-by-Turn Role-Playing (`Goal × State`) (Step c)

Simulate the conversation turn-by-turn driving directly toward goal completion. For **every turn**, document all **6 core elements**:

1. **User Utterance**: Natural language user prompt driving toward the goal.
2. **Agent Intent**: Explicit reasoning, argument extraction, entity resolution, and coreference resolution.
3. **Agent Tool Invocations**: Tool call with schema arguments respecting character limits (tool names ≤ 30 chars).
4. **Tool Response (to Agent)**: Structured JSON payload returned to the model:
   - Enforce the ≤ 1,500 character (~400 token) output budget.
   - Return paginated structures (`page`, `page_size`, `total_count`, `total_pages`) with facet summaries.
5. **Site Implementation & UI Reaction**: Frontend application behavior:
   - State store mutations (Redux, Pinia, Signals).
   - Visual UI transitions (route navigation, drawer opening, item highlighting).
6. **Agent Response (to User)**: Conversational response presenting findings and guiding next steps.

Use the standardized [Use Case Template](./use-case-template.md) for markdown formatting.

### Active User Critique Checklist

After simulating a conversation, actively prompt the user for feedback across three dimensions before finalizing schemas or moving to the next goal:

1. **Agent Demeanor & Tone**: Is the conversational tone appropriate? Is the response concise and clearly presenting findings?
2. **Clarifying Questions**: Does the agent ask the right questions when parameters are missing or ambiguous, without making unwarranted assumptions?
3. **Autonomous Boundaries**: Does the agent act autonomously only within acceptable limits? Are high-risk, irreversible actions handed off to the user or flagged for confirmation (`consequentialHint: true`), without over-flagging routine navigation?

---

## Stage 4: Conversation Variations & Graceful Failure (Step d)

Stress-test each baseline conversation against ambiguity, unexpected inputs, and system limits:

### 1. Missing Required Parameters

- **Scenario**: User provides underspecified input (e.g., _"Find flights next week"_ without origin or dates).
- **Behavior**: Agent asks clarifying questions or tool returns an actionable error specifying missing fields.

### 2. Prerequisite Violations

- **Scenario**: Agent invokes a downstream tool before completing required setup (e.g., `apply_coupon` before creating an order).
- **Behavior**: Tool throws an actionable error guiding the agent to start the preliminary step first.

### 3. Over-Constrained Queries & Zero Results

- **Scenario**: Combined search filters yield 0 matches.
- **Behavior**: Tool returns relaxation hints (e.g., suggested filter removals or adjacent dates) rather than a dead-end empty array.

### 4. Conversational Coreference

- **Scenario**: User uses contextual shorthand (e.g., _"the second flight"_, _"the cheaper one"_).
- **Behavior**: Agent resolves shorthand against previous turn responses to identify the target ID.

### 5. Human-in-the-Loop Hand-off for High-Risk Actions

- **Scenario**: Irreversible, sensitive, or financial actions (e.g., completing a $500 booking, deleting an account).
- **Behavior**:
  - Tool or agent transitions the UI to a confirmation modal or checkout view (`initiate_booking`) requiring explicit user approval on a dedicated UI (`requires_user_action` status).
  - A hand-off tool that only opens the confirmation UI (`initiate_booking`) must not declare `readOnlyHint: true` (omit annotations; hints default to `false`) and does not declare `consequentialHint: true`; the user's confirmation in the UI is the boundary. Any tool that commits the action itself (e.g. `confirm_booking`) declares `consequentialHint: true`.

---

## Design vs. Code Completion

- **Implementation simplicity is not conversational simplicity**: Simple frontend state updates (e.g. appending to an array via `setBookmarks([...bookmarks, newBookmark])` or toggling a boolean in React) are trivial to write, but natural language interaction is non-deterministic and ambiguous. Never treat conversational design as negligible overhead to rush through.
- **Conversational Complexity**: Natural language interactions introduce coreference ("the second one"), underspecified parameters, recovery paths, autonomous confirmation boundaries, and indirect prompt injection vectors that do not exist in button clicks.
- **The Rule**: Always prioritize conversational co-design and boundary exploration with the user. Code implementation must never be treated as the shortcut or primary deliverable—thorough conversational alignment across Stages 1–4 is required.
- **Explicit fast path**: If the developer asks to skip design for a single tool, state the risk once (and, if their reason is that the code is simple, correct that misconception), then deliver the schema, a minimal eval, and code while still applying all tool design rules. Don't re-argue for design.

---

## Tools and Evals Are Strictly Goal-Driven

- **Never Invent Tools or Evals for Un-Modeled Goals**: WebMCP tools are **discovered interfaces**, not preconceived CRUD wrappers. Stage 5 must **only** consolidate and deduplicate tools that have been **formally discovered and approved through Stages 1–4**.
- **Two Valid Execution Pathways**:
  - **Iterative Incremental Pathway**: When developing incrementally goal-by-goal, author `schema.json` and `evals.json` containing _only_ the tools discovered in approved goals so far (e.g. `save_bookmark` for Goal 1). Subsequent goals append and consolidate their tools into the schema and evals suite only after their conversations are role-played and approved. A preconceived single tool request (e.g. _"I want to add a tool to search flights"_) enters here: frame it as a user goal, define its ideal outcome, required context, and autonomous boundaries, and continue to Stage 2 or 3 without ideating an unrelated portfolio.
  - **Portfolio-First Pathway**: When designing the full tool suite upfront, guide the user through Stages 2–4 for _every_ planned goal in the portfolio before entering Stage 5 consolidation.
- ❌ _Anti-Pattern_: Authoring schemas, evals, or frontend code for tools whose user goals have not yet been role-played and approved.
