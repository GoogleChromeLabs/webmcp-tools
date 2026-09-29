<!--
Copyright 2026 Google LLC
SPDX-License-Identifier: Apache-2.0
-->

# Vanilla JavaScript & Framework-Agnostic WebMCP Patterns

This guide covers native imperative WebMCP tool authoring, lifecycle management, cross-origin security, and tool discovery using the browser's native `document.modelContext` API. Use these patterns for Vanilla JS, Vue, Svelte, or custom frontend architectures.

---

## 1. Core Tool Registration

The WebMCP imperative API is hosted directly on **`document.modelContext`**.

```typescript
// Install TypeScript definitions if developing with TypeScript
// npm install -D webmcp-types
```

```javascript
// 1. Feature detection
if ("modelContext" in document && typeof document.modelContext.registerTool === "function") {
  const controller = new AbortController();

  await document.modelContext.registerTool(
    {
      name: "search_products", // <= 30 chars
      description:
        "Searches the product catalog by query and category. Returns top matching items.", // <= 500 chars
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
        readOnlyHint: true, // true = reads only, no state side-effects
        consequentialHint: false, // true = significant/irreversible action requiring user confirmation
        untrustedContentHint: false, // true = output contains user-generated content susceptible to prompt injection
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

## 3. Tool Annotations Matrix

Every imperative tool should explicitly set annotations:

| Annotation                 | Set `true` When                                                                                                                      | Agent / Browser Behavior                                                                                                         |
| :------------------------- | :----------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------- |
| **`readOnlyHint`**         | Tool only reads data (e.g. search, check status) and does not mutate application state or UI viewport.                               | Agents assume tools mutate state unless `readOnlyHint: true` is present. Read-only tools skip confirmation prompts.              |
| **`consequentialHint`**    | Tool executes irreversible/financial/destructive changes (payments, bookings, deletions) OR client-side UI navigation/tab switching. | Informs browser and agent to demand explicit user confirmation before execution to prevent unmounting active views or data loss. |
| **`untrustedContentHint`** | Output includes third-party data, customer reviews, or external markup.                                                              | Tells the agent to spotlight and sanitize the payload to defend against indirect prompt injection.                               |

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
    description: "Looks up cart items for verified partners.",
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

// 3. Execute a tool using a JSON string payload
const targetTool = tools.find((t) => t.name === "search_products");
if (targetTool) {
  const executionController = new AbortController();

  const result = await document.modelContext.executeTool(
    targetTool,
    JSON.stringify({ query: "laptop", category: "electronics" }),
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
        description: "Adds an item to the shopping cart.",
        inputSchema: {
          type: "object",
          properties: {
            itemId: { type: "string", description: "Product ID" },
            quantity: { type: "number", minimum: 1, description: "Number of units" },
          },
          required: ["itemId"],
        },
        annotations: {
          readOnlyHint: false, // Explicitly declare that this tool mutates application state
        },
        async execute({ itemId, quantity = 1 }) {
          await cartStore.addItem(itemId, quantity);
          return `Added ${quantity} of ${itemId} to cart. Total items: ${cartStore.count}.`;
        },
      },
      { signal: controller.signal },
    );
  }

  // Teardown
  return () => controller.abort();
}
```
