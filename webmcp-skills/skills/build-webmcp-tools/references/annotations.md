<!--
Copyright 2026 Google LLC
SPDX-License-Identifier: Apache-2.0
-->

# WebMCP Tool Annotations

In WebMCP and the underlying Model Context Protocol specification, tool annotations (`readOnlyHint`, `consequentialHint`, `untrustedContentHint`) are optional boolean hints whose **default value is `false`**:

- **Omission of `readOnlyHint`** → tool may mutate state (default: mutating). Pure query tools must opt in by setting `readOnlyHint: true`.
- **Omission of `consequentialHint`** → tool does not commit irreversible/consequential actions requiring explicit confirmation (default: safe / non-consequential).
- **Omission of `untrustedContentHint`** → tool output is trusted application data (default: trusted). Tools returning user-generated or third-party content must set `untrustedContentHint: true`.

### Core Rule: Annotations Are Strictly Opt-In

**Specify annotations only when setting them to `true`. Never declare `: false`.**

- Routine mutating tools that do not return untrusted content (e.g. `add_to_cart`, `set_filters`, `update_quantity`) do **not** need an `annotations` property at all.
- Do not add `annotations: { readOnlyHint: false, consequentialHint: false }` boilerplate. Omitting hints is the standard, canonical representation.
- In libraries like `use-webmcp-tool` v0.2.0, `consequentialHint` is omitted from the `ToolAnnotations` type, so specifying redundant `: false` properties also triggers unnecessary TypeScript typing friction.

---

## 1. Annotations Matrix

| Annotation                 | Set `true` When                                                                                                                                  | Agent / Browser Behavior (Default: `false`)                                                                                                                            |
| :------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`readOnlyHint`**         | Tool only reads data (e.g. search, check status) and changes neither application state nor the UI (no navigation, tab switch, or modal).         | Agents assume tools mutate state unless `readOnlyHint: true` is present. Read-only tools can run autonomously in the background. (Default: mutating)                   |
| **`consequentialHint`**    | Executing the tool performs a significant, real-world, or non-reversible action, e.g. booking a flight, transferring money, deleting an account. | Signals the client or agent to require explicit user confirmation before execution. (Default: safe / non-consequential)                                                |
| **`untrustedContentHint`** | Output includes any text created or edited by users or third parties, including content from your own database (see §3).                         | Signals the host agent to isolate, spotlight, or delimiter-sandbox (`<untrusted_content>`) the payload to defend against indirect prompt injection. (Default: trusted) |

Chrome 156+ also supports **`debugging: true`** for tools built for inspection and developer tooling (testing frameworks, Chrome DevTools AI assistance) rather than end users, so end-user agents can filter them out.

The two behavioral hints form the following combinations:

| Declared Annotations                              | Meaning                                                                                | Effective Values                            | Examples                                                                                                             |
| :------------------------------------------------ | :------------------------------------------------------------------------------------- | :------------------------------------------ | :------------------------------------------------------------------------------------------------------------------- |
| `readOnlyHint: true`                              | Safe query; no state or UI change.                                                     | `readOnly: true`<br>`consequential: false`  | `search_flights`, `get_invoice_summary`, `get_app_config`                                                            |
| _(None / omitted)_                                | Routine mutation or UI navigation; safe and non-consequential.                         | `readOnly: false`<br>`consequential: false` | `set_filters`, `switch_tab`, `navigate_to_invoices`, `open_modal`, `initiate_booking`, `update_draft`, `add_to_cart` |
| `consequentialHint: true`                         | Significant, irreversible, or financial real-world action requiring user confirmation. | `readOnly: false`<br>`consequential: true`  | `book_flight`, `transfer_money`, `delete_account`, `send_email`                                                      |
| `readOnlyHint: true`<br>`consequentialHint: true` | Contradictory; do not use.                                                             | —                                           | —                                                                                                                    |

---

## 2. `readOnlyHint` and `consequentialHint`

- **`readOnlyHint: true` (Query Tools Only)**: Set on queries that read data without modifying application state or the UI (e.g. `get_invoice_summary`, `get_active_tab`).
- **`consequentialHint: true` (Significant Actions Only)**: The WebMCP spec reserves it for actions that are significant, real-world, or non-reversible (payments, bookings, deletions, sending messages), so the browser or agent can require user confirmation.
- **Don't over-flag**: Marking routine UI changes as consequential makes the agent ask for confirmation on every step. Users learn to approve without reading, and the prompt stops protecting the actions that matter.

### UI View Navigation, Tab Switching & Modals

- Tools that shift the active view, route, tab, or modal (`switch_tab`, `navigate_to`, `open_modal`) change client state, so they **must not declare `readOnlyHint: true`** (they simply omit it; never declare `readOnlyHint: false`).
- They should **not** declare `consequentialHint: true` unless the step itself commits a significant, irreversible action.
- ❌ _Anti-pattern_: `switch_tab` with `readOnlyHint: true` (the agent treats it as a background query).
- ❌ _Anti-pattern_: `navigate_to_invoices` with `consequentialHint: true` (a confirmation prompt for a view change).
- ❌ _Anti-pattern_: Redundant boilerplate like `annotations: { readOnlyHint: false, consequentialHint: false }`.
- ✅ _Best Practice_: `get_invoices` sets `readOnlyHint: true`; `navigate_to_invoices` omits annotations (defaults to mutating, non-consequential); `pay_invoice` sets `consequentialHint: true`.

### Protecting Unsaved Work

Navigation can unmount a view that holds uncommitted state, such as a half-filled form. Protect it in the tool, not with `consequentialHint`: before navigating, check for unsaved changes and either preserve the draft or return an actionable error so the agent asks the user.

```javascript
async execute({ tab }) {
  if (invoiceForm.hasUnsavedChanges()) {
    return {
      error: "The invoice form has unsaved changes.",
      code: "UNSAVED_CHANGES",
      suggestion: "Ask the user whether to save or discard the draft, then call switch_tab again.",
    };
  }
  await router.navigate(`/${tab}`);
  return `Switched to the ${tab} tab.`;
}
```

### Human-in-the-Loop Hand-off Tools

An `initiate_*` tool that opens a confirmation screen (e.g. `initiate_booking` navigating to checkout, where the user presses Confirm) is navigation: it **must not declare `readOnlyHint: true`** and does not declare `consequentialHint: true` (omit annotations). The hand-off itself is the confirmation boundary. If you also expose a tool that commits the action directly (e.g. `confirm_booking` charging the card), that tool declares `consequentialHint: true`.

---

## 3. Mandatory `untrustedContentHint: true` for UGC & Third-Party Content

- Any tool querying, searching, or returning content created or edited by users or third parties (support tickets, issue descriptions, comments, reviews, profile bios, uploaded files, external web content) **must** declare `untrustedContentHint: true`, even when stored in your own application database (the "First-Party Database" Fallacy; see [agent-security.md](./agent-security.md)).
- **Why**: User-authored text is the primary vector for indirect prompt injection. Declaring `untrustedContentHint: true` signals the consuming browser agent that the payload is untrusted, so it can isolate, spotlight, or delimiter-sandbox (`<untrusted_content>`) it rather than follow embedded adversarial instructions. The spec defines the signal; how a host acts on it varies (see [agent-security.md](./agent-security.md)).
- **UGC vs Application Configuration**:
  - ❌ _Requires `untrustedContentHint: true`_: `get_ticket`, `search_issues`, `list_comments`, `read_document`, `get_customer_reviews` (contains user-generated text).
  - ✅ _Omit `untrustedContentHint`_: `get_user_preferences`, `get_app_config`, `get_project_config`, `list_system_locales` (trusted system settings and flags without user-authored text).
- `untrustedContentHint` is independent of `readOnlyHint`: a UGC query tool usually declares both.

---

## 4. Declarative Forms

Declarative `<form>` tools express the human-in-the-loop boundary through `toolautosubmit` instead: omit it for sensitive, financial, or destructive actions so the user confirms the submission (see [declarative-patterns.md](./declarative-patterns.md)).
