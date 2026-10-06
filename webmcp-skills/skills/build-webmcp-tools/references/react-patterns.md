<!--
Copyright 2026 Google LLC
SPDX-License-Identifier: Apache-2.0
-->

# React WebMCP Patterns with `use-webmcp-tool`

This guide explains how to expose WebMCP tools in React applications using the official Google Chrome Labs package [`use-webmcp-tool`](https://www.npmjs.com/package/use-webmcp-tool).

> **Core Rule**: In React applications, **every imperative WebMCP tool must be registered via `useWebMCP` from `use-webmcp-tool`**. Components should never call `document.modelContext.registerTool` directly or hand-roll `useEffect` + `AbortController` registration lifecycles.

---

## 1. Installation & Environment

```bash
npm install use-webmcp-tool
npm install -D webmcp-types  # Optional: for direct TypeScript typings
```

- **Requirements**: React 18+ peer dependency, ESM-only, bundled TypeScript types, zero runtime dependencies.
- **Direct `document.modelContext` access** (e.g. tests, consumer code): use `webmcp-types` rather than hand-written declarations; see [vanilla-patterns.md](./vanilla-patterns.md) for setup.
- **Next.js & Server Components**: The hook uses React state and lifecycle effects, so components declaring tools must include the `"use client"` directive. During SSR, the hook gracefully feature-detects and returns `{ supported: false, registered: false, error: null }` without throwing.

---

## 2. Core Hook API

```typescript
import { useWebMCP } from 'use-webmcp-tool';

const { supported, registered, error } = useWebMCP<Args, Result>({
  name: 'tool_name',            // string (required, <= 30 chars)
  description: '...',           // string (required, <= 500 chars)
  inputSchema: { ... },         // JSON Schema object (optional)
  annotations: { ... },         // { readOnlyHint?, untrustedContentHint? } (optional)
  execute: async (args) => { }, // (args: Args) => Result | Promise<Result> (required)
  enabled: true,                // boolean: register only while true (default: true)
  formatOutput: (result, args) => { }, // (result: Result, args: Args) => unknown
  onError: (error) => { },      // (error: unknown) => void (telemetry hook)
});
```

### Return Values

| Return Field | Description                                                                                                          |
| :----------- | :------------------------------------------------------------------------------------------------------------------- |
| `supported`  | `true` if `document.modelContext` exists in the browser. `false` during SSR and on unsupported browsers.             |
| `registered` | `true` if the tool is actively registered with the browser. `false` if unregistered, unmounted, or `enabled: false`. |
| `error`      | `Error \| null`. Contains registration errors (such as `NotAllowedError` if Permissions Policy denies `tools`).      |

---

## 3. Re-Registration Triggers & Stability Rules

`useWebMCP` tracks registration dependencies via:
`[name, description, JSON.stringify(inputSchema), JSON.stringify(annotations), enabled]`

1. **Stable Literals for Schemas**:
   Because `inputSchema` and `annotations` are compared via `JSON.stringify()`, the comparison is **key-order sensitive** (`{ a, b } !== { b, a }`). Keep schema objects hoisted to module scope or declare object properties with consistent key order to prevent registration churn.
2. **Callbacks Handled via Refs**:
   `execute`, `formatOutput`, and `onError` are stored in React refs. Creating new inline arrow functions on every render will **not** trigger re-registration. You can safely close over component state and props.
3. **Never Derive `name` or `description` from Fast-Changing State**:
   Modifying `name` or `description` forces the browser to abort the previous registration and register a new tool, which resets agent tool discovery.

---

## 4. Result Normalization & Error Handling

`useWebMCP` automatically normalizes return values and errors into the WebMCP protocol structure:

| What `execute` Returns / Throws      | What the Agent Receives                                             |
| :----------------------------------- | :------------------------------------------------------------------ |
| `string`                             | `{ content: [{ type: "text", text }] }`                             |
| `undefined` / `null`                 | `{ content: [] }` (empty success)                                   |
| Object or Array                      | `{ content: [{ type: "text", text: JSON.stringify(val) }] }`        |
| Already `{ content: [...] }`         | Passed through directly without modification                        |
| `throw new Error("actionable text")` | `{ content: [{ type: "text", text: err.message }], isError: true }` |
| Returns an `Error` instance          | Treated identically to throwing (`isError: true`)                   |

> **Critical Rule**: **Throw actionable errors; do NOT return failure objects.**
> Never return `{ status: "error", message: "..." }`. In `useWebMCP`, returning a plain object is interpreted as a successful execution. Throwing an `Error` triggers `onError` telemetry and resolves `{ content: [{ type: "text", text: err.message }], isError: true }`.
>
> _Under the hood_: `useWebMCP` catches the thrown `Error` and **resolves** the tool promise with `isError: true`. This prevents the browser from discarding the error message into a generic `DOMException: UnknownError` (as native WebMCP does on unhandled rejections), ensuring the agent receives both the full remediation text and the error flag to self-correct.

---

## 5. Implementation Patterns

### Pattern A: Co-locating Tools with State Owners

Place the hook in the component that owns or receives the state the tool modifies. When the component unmounts, the tool unregisters automatically:

```tsx
import React, { useState } from "react";
import { useWebMCP } from "use-webmcp-tool";

export function FlightSearch() {
  const [flights, setFlights] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const { supported, registered, error } = useWebMCP({
    name: "search_flights",
    description:
      "Finds available flights to a destination. Use when the user wants to see flight options for a trip before choosing one.",
    inputSchema: {
      type: "object",
      properties: {
        destination: {
          type: "string",
          description: "Airport code (e.g. JFK) or city name as the user said it",
        },
        date: {
          type: "string",
          description:
            "Departure date as ISO YYYY-MM-DD or as the user phrased it (e.g. 'next Friday')",
        },
      },
      required: ["destination", "date"],
    },
    annotations: {
      readOnlyHint: true,
    },
    async execute({ destination, date }) {
      setIsLoading(true);
      try {
        // The API resolves city names and relative dates ("next Friday") so the model never computes them
        const response = await fetch(
          `/api/flights?dest=${encodeURIComponent(destination)}&date=${encodeURIComponent(date)}`,
        );
        if (!response.ok) {
          throw new Error(`Flight search failed (${response.status}). Check airport code or date.`);
        }
        const data = await response.json();

        // Update local state before returning result to the agent
        // (Use flushSync(() => setFlights(data.results)) from 'react-dom' if synchronous DOM mutation is strictly required)
        setFlights(data.results);

        return `Found ${data.results.length} flights to ${destination} on ${date}.`;
      } finally {
        setIsLoading(false);
      }
    },
  });

  return (
    <section>
      {supported && (
        <span aria-live="polite">{registered ? "AI Tools Active" : "Connecting..."}</span>
      )}
      {/* UI Elements */}
    </section>
  );
}
```

### Pattern B: State-Gated Tools with `enabled`

When a component remains mounted across multiple steps (e.g. a multi-step checkout wizard), use `enabled` to expose tools only during valid states:

```tsx
import { useWebMCP } from "use-webmcp-tool";

export function CheckoutWizard({ currentStep, orderId }) {
  // Tool only available during the 'payment' step
  useWebMCP({
    name: "apply_coupon",
    description:
      "Applies a promotional coupon to the current order. Use when the user provides a discount or promo code during payment.",
    enabled: currentStep === "payment",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string", description: "Coupon code" },
      },
      required: ["code"],
    },
    async execute({ code }) {
      const result = await applyDiscount(orderId, code);
      if (!result.success) {
        throw new Error(
          `Coupon "${code}" is invalid or expired. Prompt user for an alternate code.`,
        );
      }
      return `Coupon "${code}" applied. New total: $${result.newTotal}.`;
    },
    onError: (err) => console.warn("Coupon application failed:", err),
  });

  return <div>{/* Checkout Step UI */}</div>;
}
```

### Pattern C: Output Shaping with `formatOutput`

Enforce character budgets (≤ 1.5K characters) and structure output for LLM consumption:

```tsx
useWebMCP({
  name: "search_catalog",
  description:
    "Searches the product catalog and returns top matches with prices and stock. Use when the user looks for products by name, type, or feature.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search keywords or product terms" },
    },
    required: ["query"],
  },
  annotations: { readOnlyHint: true, untrustedContentHint: true },
  async execute({ query }) {
    return await searchCatalogApi(query); // returns raw database array
  },
  formatOutput: (results) => {
    if (!results || results.length === 0) {
      return "No products found. Suggest broadening search filters.";
    }
    // Limit to top 5 and format as concise lines under 1.5K chars
    return results
      .slice(0, 5)
      .map(
        (p) => `- [${p.id}] ${p.name} ($${p.price}) - ${p.inStock ? "In Stock" : "Out of Stock"}`,
      )
      .join("\n");
  },
});
```

### Pattern D: Polymorphic Tool Consolidation & Concurrent Fetching

When an application manages multiple entity types (e.g. issues, bug reports, epics), do not register granular tools per entity type (`list_issues`, `list_bugs`, `move_issue`, `move_bug`). Instead, register consolidated polymorphic tools that query or mutate across entity types in a single turn using `Promise.all`.

Both tools share one hoisted `ITEM_TYPES` list, so every `type` value that `list_items` returns is valid input for `move_items`. Map those values to API paths inside `execute` rather than exposing path names (e.g. plural `issues`) in one schema and entity names (`issue`) in the other.

```tsx
import React, { useState } from "react";
import { useWebMCP } from "use-webmcp-tool";

// Shared by both schemas: list_items output feeds straight into move_items input
const ITEM_TYPES = ["issue", "bug", "epic"];
const API_PATHS: Record<string, string> = { issue: "issues", bug: "bugs", epic: "epics" };

export function ProjectBoardView() {
  const [items, setItems] = useState<any[]>([]);

  // 1. Consolidated polymorphic query tool
  useWebMCP({
    name: "list_items",
    description:
      "Finds issues, bug reports, and epics in the project tracker. Use when the user wants to locate, review, or pick items before acting on them.",
    inputSchema: {
      type: "object",
      properties: {
        types: {
          type: "array",
          items: { type: "string", enum: ITEM_TYPES },
          description: "Entity types to query. Defaults to all types if omitted.",
        },
        query: {
          type: "string",
          description: "Natural language keyword query to search across titles and descriptions.",
        },
        page: {
          type: "integer",
          description: "Page number for pagination (starts at 1).",
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      untrustedContentHint: true,
    },
    async execute({ types = ITEM_TYPES, query = "", page = 1 }) {
      // Execute sub-queries concurrently with Promise.all to avoid multi-turn roundtrips
      const fetchers = types.map(async (type) => {
        const params = new URLSearchParams({ q: query, page: String(page), limit: "10" });
        const res = await fetch(`/api/${API_PATHS[type]}?${params}`);
        if (!res.ok) throw new Error(`Failed to fetch ${type} items (${res.status})`);
        const data = await res.json();
        return data.items.map((item: any) => ({ ...item, type }));
      });

      const resultsPerType = await Promise.all(fetchers);
      const combined = resultsPerType.flat();

      // Synchronize React state
      setItems(combined);

      // Output formatted within the 1,500 char budget
      return {
        total_found: combined.length,
        items: combined.slice(0, 10).map((i) => ({
          id: i.id,
          type: i.type,
          title: i.title,
        })),
      };
    },
  });

  // 2. Consolidated polymorphic batch mutation tool
  useWebMCP({
    name: "move_items",
    description:
      "Moves one or more issues, bug reports, or epics to another sprint or milestone in a single call. Use when the user asks to triage or reassign items.",
    inputSchema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string", enum: ITEM_TYPES },
              id: { type: "string", description: "Item identifier" },
            },
            required: ["type", "id"],
          },
          description: "Array of items to move.",
        },
        target_sprint_id: {
          type: "string",
          description: "Target destination sprint or milestone ID.",
        },
      },
      required: ["items", "target_sprint_id"],
    },
    annotations: {
      consequentialHint: true,
    } as any,
    async execute({ items, target_sprint_id }) {
      const response = await fetch("/api/batch-move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, targetSprintId: target_sprint_id }),
      });

      if (!response.ok) {
        throw new Error(
          `Batch move failed: ${response.statusText}. Verify item IDs and target sprint.`,
        );
      }

      return `Successfully moved ${items.length} items to sprint "${target_sprint_id}".`;
    },
  });

  return <div>{/* Project Board UI */}</div>;
}
```

---

## 6. `use-webmcp-tool` v0.2.0 Gotchas

1. **`execute` Receives Only Arguments**:
   The hook wrapper does not forward the second `{ signal }` parameter from the underlying browser `registerTool` call. Keep execution logic concise, or manage your own `AbortController` in the component if aborting background fetches on unmount is required.
2. **`consequentialHint` TypeScript Typing**:
   In `use-webmcp-tool` v0.2.0, the `ToolAnnotations` type includes `readOnlyHint` and `untrustedContentHint`, but omits `consequentialHint`. The browser receives the property at runtime, so cast in TypeScript when needed:
   ```typescript
   annotations: {
     consequentialHint: true,
   } as any,
   ```
3. **`title` and `exposedTo`**:
   The hook currently does not expose `title` or cross-origin `exposedTo` options. For tools requiring cross-origin exposure, register them directly with `document.modelContext.registerTool` inside a custom `useEffect`.

---

## 7. Deterministic Unit Testing (Vitest + React Testing Library)

Test tool logic, argument validation, and state updates deterministically without invoking an LLM:

```tsx
import { render, screen } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { FlightSearch } from "./FlightSearch";

describe("FlightSearch WebMCP Integration", () => {
  beforeEach(() => {
    // Mock document.modelContext
    document.modelContext = {
      registerTool: vi.fn().mockResolvedValue(undefined),
    } as any;
  });

  afterEach(() => {
    delete (document as any).modelContext;
  });

  it("registers tool on mount and executes successfully", async () => {
    // Mock successful API fetch response
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [{ id: "1", airline: "SkyAir", price: 299 }] }),
    } as any);

    render(<FlightSearch />);

    expect(document.modelContext.registerTool).toHaveBeenCalledTimes(1);
    const [tool, options] = (document.modelContext.registerTool as any).mock.calls[0];

    expect(tool.name).toBe("search_flights");
    expect(options.signal).toBeInstanceOf(AbortSignal);

    // Test tool execution directly
    const result = await tool.execute({ destination: "JFK", date: "2026-10-15" });
    expect(result).toHaveProperty("content");
    expect(result.isError).toBeFalsy();
  });

  it("reports actionable errors when execution fails", async () => {
    // Simulate failing fetch
    vi.spyOn(global, "fetch").mockResolvedValueOnce({ ok: false, status: 404 } as any);

    render(<FlightSearch />);
    const [tool] = (document.modelContext.registerTool as any).mock.calls[0];

    const result = await tool.execute({ destination: "INVALID", date: "2026-10-15" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Flight search failed");
  });
});
```
