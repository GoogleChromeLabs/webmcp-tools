/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from "node:test";
import * as assert from "node:assert";
import { MockResolver } from "../evaluator/mockResolver.js";
import { ExpectedCallNode } from "../types/evals.js";

describe("MockResolver", () => {
  it("returns {} when there are no expected calls", () => {
    const resolver = new MockResolver(null);
    assert.deepStrictEqual(resolver.resolve("anything", {}), {});
    assert.deepStrictEqual(resolver.resolve("anything", { x: 1 }), {});
  });

  it("returns {} for an empty expected array", () => {
    const resolver = new MockResolver([]);
    assert.deepStrictEqual(resolver.resolve("foo", {}), {});
  });

  it("returns a matching step's mockOutput on first invocation", () => {
    const expected: ExpectedCallNode[] = [
      {
        functionName: "search_catalog",
        mockOutput: { products: [{ id: "p1" }] },
      },
    ];
    const resolver = new MockResolver(expected);
    assert.deepStrictEqual(resolver.resolve("search_catalog", {}), {
      products: [{ id: "p1" }],
    });
  });

  it("returns {} when a matching step has no mockOutput", () => {
    const expected: ExpectedCallNode[] = [{ functionName: "get_cart" }];
    const resolver = new MockResolver(expected);
    assert.deepStrictEqual(resolver.resolve("get_cart", {}), {});
  });

  it("returns {} for off-trajectory tool calls", () => {
    const expected: ExpectedCallNode[] = [
      { functionName: "search_catalog", mockOutput: { products: [] } },
    ];
    const resolver = new MockResolver(expected);
    assert.deepStrictEqual(resolver.resolve("update_cart", {}), {});
  });

  it("advances through a trajectory in order, one match per node", () => {
    const expected: ExpectedCallNode[] = [
      { functionName: "search_catalog", mockOutput: { step: 1 } },
      { functionName: "get_product", mockOutput: { step: 2 } },
      { functionName: "update_cart", mockOutput: { step: 3 } },
    ];
    const resolver = new MockResolver(expected);
    assert.deepStrictEqual(resolver.resolve("search_catalog", {}), { step: 1 });
    assert.deepStrictEqual(resolver.resolve("get_product", {}), { step: 2 });
    assert.deepStrictEqual(resolver.resolve("update_cart", {}), { step: 3 });
  });

  it("does not resolve the same step twice", () => {
    const expected: ExpectedCallNode[] = [
      { functionName: "get_cart", mockOutput: { first: true } },
    ];
    const resolver = new MockResolver(expected);
    assert.deepStrictEqual(resolver.resolve("get_cart", {}), { first: true });
    // Second call to same function falls through to `{}` — the expected node
    // was already consumed.
    assert.deepStrictEqual(resolver.resolve("get_cart", {}), {});
  });

  it("flattens ordered groups into a linear sequence", () => {
    const expected: ExpectedCallNode[] = [
      {
        ordered: [
          { functionName: "search_catalog", mockOutput: { search: true } },
          { functionName: "get_product", mockOutput: { product: true } },
        ],
      },
    ];
    const resolver = new MockResolver(expected);
    assert.deepStrictEqual(resolver.resolve("search_catalog", {}), { search: true });
    assert.deepStrictEqual(resolver.resolve("get_product", {}), { product: true });
  });

  it("flattens unordered groups and matches by function name regardless of authored order", () => {
    // Authored order inside `unordered:` is get_product first, update_cart
    // second, but the model may call them in either order. The resolver
    // matches on function name and consumes each node once.
    const expected: ExpectedCallNode[] = [
      {
        unordered: [
          { functionName: "get_product", mockOutput: { got: "product" } },
          { functionName: "update_cart", mockOutput: { got: "cart" } },
        ],
      },
    ];
    const resolver = new MockResolver(expected);
    assert.deepStrictEqual(resolver.resolve("update_cart", {}), { got: "cart" });
    assert.deepStrictEqual(resolver.resolve("get_product", {}), { got: "product" });
  });

  it("flattens nested ordered + unordered groups", () => {
    const expected: ExpectedCallNode[] = [
      {
        ordered: [
          { functionName: "search_catalog", mockOutput: { s: 1 } },
          {
            unordered: [
              { functionName: "get_product", mockOutput: { s: 2 } },
              { functionName: "update_cart", mockOutput: { s: 3 } },
            ],
          },
        ],
      },
    ];
    const resolver = new MockResolver(expected);
    assert.deepStrictEqual(resolver.resolve("search_catalog", {}), { s: 1 });
    assert.deepStrictEqual(resolver.resolve("get_product", {}), { s: 2 });
    assert.deepStrictEqual(resolver.resolve("update_cart", {}), { s: 3 });
  });

  it("matches on function name only — args are not consulted", () => {
    // The matcher (evaluateExecutionTrajectory) is what scores arguments.
    // The resolver's job is just to hand the model a plausible response so
    // it can decide what to do next, even if the model got the args wrong.
    const expected: ExpectedCallNode[] = [
      {
        functionName: "search_catalog",
        arguments: { catalog: { query: "shoe" } },
        mockOutput: { products: [{ id: "wanted" }] },
      },
    ];
    const resolver = new MockResolver(expected);
    // Model called with "pizza" instead of "shoe" — resolver still returns
    // the mockOutput; the matcher will flag the arguments mismatch.
    assert.deepStrictEqual(resolver.resolve("search_catalog", { catalog: { query: "pizza" } }), {
      products: [{ id: "wanted" }],
    });
  });

  it("keeps state per resolver instance (fresh cursor each test case)", () => {
    const expected: ExpectedCallNode[] = [
      { functionName: "get_cart", mockOutput: { fresh: true } },
    ];
    const a = new MockResolver(expected);
    const b = new MockResolver(expected);
    assert.deepStrictEqual(a.resolve("get_cart", {}), { fresh: true });
    // Second instance still has its own unconsumed node.
    assert.deepStrictEqual(b.resolve("get_cart", {}), { fresh: true });
  });

  it("allows mockOutput to be an arbitrary JSON value, not just an object", () => {
    // The API surfaces `unknown` — arrays, strings, numbers, null are all valid.
    const expected: ExpectedCallNode[] = [
      { functionName: "list_ids", mockOutput: ["a", "b", "c"] },
      { functionName: "count_items", mockOutput: 42 },
      { functionName: "was_found", mockOutput: false },
      { functionName: "get_note", mockOutput: null },
    ];
    const resolver = new MockResolver(expected);
    assert.deepStrictEqual(resolver.resolve("list_ids", {}), ["a", "b", "c"]);
    assert.strictEqual(resolver.resolve("count_items", {}), 42);
    assert.strictEqual(resolver.resolve("was_found", {}), false);
    assert.strictEqual(resolver.resolve("get_note", {}), null);
  });
});
