<!--
Copyright 2026 Google LLC
SPDX-License-Identifier: Apache-2.0
-->

# Vanilla JavaScript & Framework-Agnostic WebMCP Patterns

This guide covers native imperative WebMCP tool authoring, lifecycle management, cross-origin security, and tool discovery using the browser's native `document.modelContext` API. Use these patterns for Vanilla JS, Vue, Svelte, or custom frontend architectures.

---

## 1. Core Tool Registration

The WebMCP imperative API is hosted directly on **`document.modelContext`**.

### TypeScript: use `webmcp-types`

In TypeScript projects, use the [`webmcp-types`](https://www.npmjs.com/package/webmcp-types) package, published from the spec's own `webmachinelearning` organization. It augments the global DOM types, so `document.modelContext` is typed everywhere without imports (TypeScript 5.0+).

```bash
npm install -D webmcp-types
```

Enable it in `tsconfig.json`:

```json
{ "compilerOptions": { "types": ["webmcp-types"] } }
```

- **Gotcha**: a `types` array makes TypeScript include _only_ the listed packages. If the project has no `types` array yet, adding one drops `@types/node` and other automatically included types; add `webmcp-types` to an existing array instead, or use `/// <reference types="webmcp-types" />` in one source file.
- **Replace hand-written declarations**: If the project already declares its own WebMCP types (e.g. `declare global { interface Document { modelContext?: ... } }` with custom `ModelContext` or tool interfaces), recommend deleting them and using `webmcp-types`. Hand-written types drift from the spec and hide parts of the API: a custom `execute(args)` signature without the second argument means the execution `signal` is never available, and missing `annotations` fields mean tools ship without them.

```javascript
// 1. Feature detection
if ("modelContext" in document && typeof document.modelContext.registerTool === "function") {
  const controller = new AbortController();

  await document.modelContext.registerTool(
    {
      name: "search_products", // <= 30 chars
      description:
        "Searches the product catalog. Use when the user wants to find products by keyword, optionally within a category.", // <= 500 chars
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search keywords" }, // <= 150 chars
          category: {
            type: "string",
            enum: ["electronics", "clothing", "books"],
            description: "Optional category filter",
          },
        },
        required: ["query"],
      },
      annotations: {
        readOnlyHint: true, // true = pure query (consequentialHint and untrustedContentHint default to false)
      },
      async execute({ query, category }, { signal }) {
        // Pass signal to fetch to support client-side cancellation
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal });

        if (!response.ok) {
          // Resolve with structured error guidance so the agent receives actionable context to proceed.
          // Note: Unhandled throws/rejections in native WebMCP map to a generic DOMException: UnknownError per the W3C spec.
          return {
            error: `Catalog search service unavailable (${response.status}).`,
            code: "SERVICE_UNAVAILABLE",
            retryable: true,
          };
        }

        const data = await response.json();

        // Always await DOM/state updates before returning payload to agent
        await updateResultsView(data.items);

        // Return concise string or serializable payload under 1.5K character budget
        return `Found ${data.total} items. Top result: ${data.items[0]?.name || "None"}.`;
      },
    },
    {
      signal: controller.signal,
    },
  );

  // Unregister tool on view transition or teardown
  // controller.abort();
}
```

---

## 2. Critical Imperative Lifecycle Rules

1. **Unregister via `AbortSignal` Only**:
   WebMCP does **not** provide an `unregisterTool()` method. Always supply `{ signal: controller.signal }` to `registerTool()`. When the component or view unmounts, call `controller.abort()`.
2. **In-Flight Executions**:
   As of Chrome 153, aborting the registration signal stops future discoveries but does not automatically abort executions already in-flight.
3. **Respect Cancellation inside `execute`**:
   `execute(input, { signal })` receives an execution `AbortSignal` in its second argument. Always forward this `signal` to `fetch()` and long-running promises so agent cancellations terminate background network operations immediately.
4. **Actionable Error Reporting**:
   Under the W3C WebMCP specification (`index.bs`), if a native tool's `execute` promise rejects or throws an unhandled exception, `executeTool()` rejects with a generic `DOMException: UnknownError`, discarding the rejection reason. To allow the agent to understand what failed, self-correct, and proceed, **resolve** with a structured error payload (e.g. `{ error: "No items found", code: "NOT_FOUND", suggestion: "Broaden search query" }`). Reserve unhandled rejections only for fatal operational crashes.

---

## 3. Tool Annotations

All WebMCP annotation hints default to `false`. Annotations are strictly **opt-in**—declare them only when setting them to `true`:

- `readOnlyHint: true` only for pure queries that change neither application state nor the UI viewport (navigation and tab switching mutate UI state, so they omit `readOnlyHint`).
- `consequentialHint: true` only for significant, irreversible real-world actions (payments, bookings, deletions).
- `untrustedContentHint: true` whenever output includes text created or edited by users or third parties, even from your own database.
- **Never specify `: false`**: Routine mutating tools (e.g. `add_to_cart`, `set_filters`) omit the `annotations` property entirely.

The full matrix with examples is in [annotations.md](./annotations.md).

---

## 4. Cross-Origin Sharing & Permissions Policy

By default, WebMCP tools are **same-origin only**. Exposing tools across origins requires strict opt-in:

### 1. Permissions Policy & Iframe Delegation

Both declarative and imperative APIs are gated by the `tools` Permissions Policy (default: `self`). A host page embedding a cross-origin iframe must explicitly delegate permission:

```html
<iframe src="https://partner.example.com" allow="tools"></iframe>
```

### 2. Exposing to Specific Origins (`exposedTo`)

A page can selectively expose tools to approved secure origins:

```javascript
await document.modelContext.registerTool(
  {
    name: "shareable_cart_lookup",
    description:
      "Returns the items in the user's current cart. Use when an embedded partner site needs to show or price the cart.",
    // ...
  },
  {
    exposedTo: ["https://trusted-partner.example.com"],
  },
);
```

### 3. Origin Isolation Requirement

WebMCP requires an **origin-isolated document**. Pages disabling isolation (e.g., setting `Origin-Agent-Cluster: ?0` or modifying `document.domain`) will have WebMCP disabled by the browser runtime.

---

## 5. Consumer & Discovery APIs

When building page-level agents or chat interfaces that consume WebMCP tools directly in the browser:

```javascript
// 1. Discover available tools (alphabetical list)
const tools = await document.modelContext.getTools();
console.log(
  "Available tools:",
  tools.map((t) => t.name),
);

// 2. Discover tools including permitted cross-origin partners
const allTools = await document.modelContext.getTools({
  fromOrigins: ["https://trusted-partner.example.com"],
});

// 3. Execute a tool with an arguments object (JSON-string arguments are deprecated from Chrome 155)
const targetTool = tools.find((t) => t.name === "search_products");
if (targetTool) {
  const executionController = new AbortController();

  const result = await document.modelContext.executeTool(
    targetTool,
    { query: "laptop", category: "electronics" },
    { signal: executionController.signal },
  );

  console.log("Tool execution result:", result);
}

// 4. Listen for tool registration/unregistration changes
document.modelContext.addEventListener("toolchange", async () => {
  const updatedTools = await document.modelContext.getTools();
  console.log("Tool catalog changed. Current count:", updatedTools.length);
});
```

---

## 6. Store Integration Pattern (Vue Pinia, Svelte Stores)

When connecting tools to reactive stores outside of React, wrap registration in a lifecycle hook:

```javascript
// Example: Vue 3 Composable or Svelte onMount
export function useWebMcpCart(cartStore) {
  const controller = new AbortController();

  if ("modelContext" in document) {
    document.modelContext.registerTool(
      {
        name: "add_to_cart",
        description:
          "Adds a product to the user's shopping cart. Use when the user asks to buy or add a product.",
        inputSchema: {
          type: "object",
          properties: {
            itemId: { type: "string", description: "Product ID" },
            quantity: { type: "number", minimum: 1, description: "Number of units" },
          },
          required: ["itemId"],
        },
        async execute({ itemId, quantity = 1 }) {
          try {
            await cartStore.addItem(itemId, quantity);
            return `Added ${quantity} of ${itemId} to cart. Total items: ${cartStore.count}.`;
          } catch (err) {
            // Resolve a structured error: an unhandled throw reaches the agent only as UnknownError
            return {
              error: `Could not add ${itemId} to cart: ${err.message}`,
              code: "ADD_TO_CART_FAILED",
              retryable: false,
            };
          }
        },
      },
      { signal: controller.signal },
    );
  }

  // Teardown
  return () => controller.abort();
}
```
