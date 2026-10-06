<!--
Copyright 2026 Google LLC
SPDX-License-Identifier: Apache-2.0
-->

# WebMCP Error Handling: Errors Are Guides, Not Dead Ends

Deliver actionable error guidance so the agent can self-correct and proceed. How an error reaches the agent depends on the API used to register the tool.

---

## 1. Error Handling by API

| API                                            | On failure                                                                                                             | Why                                                                                                                                                                   |
| :--------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **React (`useWebMCP` from `use-webmcp-tool`)** | `throw new Error("<actionable remediation>")`. Do **not** return failure objects.                                      | The hook catches the error and resolves `{ content: [{ type: "text", text: err.message }], isError: true }`. A returned plain object is treated as success.           |
| **Native imperative (`registerTool`)**         | **Resolve** a structured payload, e.g. `{ error: "...", code: "...", retryable: true }`.                               | Per the W3C WebMCP spec, an unhandled throw/rejection in `execute()` makes `executeTool()` reject with a generic `DOMException: UnknownError`, discarding the reason. |
| **Declarative forms (`<form toolname>`)**      | Resolve structured field errors (e.g. `[{ field, value, message }]`) via `event.respondWith(Promise.resolve(errors))`. | Calling `Promise.reject()` discards the field details into a generic `DOMException: UnknownError`.                                                                    |

- Reserve unhandled rejections for fatal operational crashes only.
- **Never encode a failure as a plain success string** (e.g., returning `"Saved"` on failure).

---

## 2. Writing Actionable Error Messages

An error message should tell the agent what went wrong and what to do next:

- **Missing prerequisite**: `"No active search found. Execute search_catalog first before applying filters."`
- **Invalid input**: `"Coupon \"SAVE50\" is invalid or expired. Prompt user for an alternate code."`
- **Transient failure**: `{ error: "Catalog search service unavailable (503).", code: "SERVICE_UNAVAILABLE", retryable: true }`
- **No results**: `{ error: "No items found", code: "NOT_FOUND", suggestion: "Broaden search query" }` — or return suggested filter relaxations instead of an empty array.

Distinguish retryable failures from fatal ones (e.g. a `retryable` flag) so the agent knows whether to retry or change course.

---

## 3. Examples

### Native `registerTool`

```javascript
async execute({ query }, { signal }) {
  const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal });
  if (!response.ok) {
    // Resolve (do not throw) so the agent receives the details instead of UnknownError
    return {
      error: `Catalog search service unavailable (${response.status}).`,
      code: "SERVICE_UNAVAILABLE",
      retryable: true,
    };
  }
  return await response.json();
}
```

### React `useWebMCP`

```tsx
async execute({ code }) {
  const result = await applyDiscount(orderId, code);
  if (!result.success) {
    throw new Error(`Coupon "${code}" is invalid or expired. Prompt user for an alternate code.`);
  }
  return `Coupon "${code}" applied. New total: $${result.newTotal}.`;
}
```

### Declarative `<form>`

```javascript
if (validationErrors.length > 0 && event.agentInvoked) {
  // Resolve structured field errors so the agent can correct specific fields
  event.respondWith(Promise.resolve(validationErrors));
}
```

See the framework guides for complete, runnable versions: [react-patterns.md](./react-patterns.md), [vanilla-patterns.md](./vanilla-patterns.md), [declarative-patterns.md](./declarative-patterns.md).
