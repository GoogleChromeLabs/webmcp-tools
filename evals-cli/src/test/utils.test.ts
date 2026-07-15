/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from "node:test";
import * as assert from "node:assert";
import {
  evaluateExecutionTrajectory,
  functionCallOutcome,
  sortObjectKeys,
  countExpectedCalls,
} from "../utils.js";
import { ExpectedCallNode } from "../types/evals.js";
import { ToolCall } from "../types/tools.js";

describe("evaluateExecutionTrajectory", () => {
  it("matches simple ordered calls", () => {
    const expected: ExpectedCallNode[] = [
      { functionName: "login", arguments: {} },
      { functionName: "logout", arguments: {} },
    ];
    const actual: ToolCall[] = [
      { functionName: "login", args: {} },
      { functionName: "logout", args: {} },
    ];

    const result = evaluateExecutionTrajectory(expected, actual);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].outcome, "pass");
    assert.strictEqual(result[1].outcome, "pass");
  });

  it("handles empty executions against expected", () => {
    const expected: ExpectedCallNode[] = [{ functionName: "login", arguments: {} }];
    const actual: ToolCall[] = [];

    const result = evaluateExecutionTrajectory(expected, actual);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].outcome, "fail");
    assert.strictEqual(result[0].actual, null);
  });

  it("handles null expectedCalls with empty executions (pass)", () => {
    const expected: ExpectedCallNode[] | null = null;
    const actual: ToolCall[] = [];

    const result = evaluateExecutionTrajectory(expected, actual);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].outcome, "pass");
    assert.strictEqual(result[0].expected, null);
    assert.strictEqual(result[0].actual, null);
  });

  it("handles null expectedCalls with actual executions (fail)", () => {
    const expected: ExpectedCallNode[] | null = null;
    const actual: ToolCall[] = [{ functionName: "login", args: {} }];

    const result = evaluateExecutionTrajectory(expected, actual);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].outcome, "fail");
    assert.strictEqual(result[0].expected, null);
    assert.strictEqual(result[0].actual?.functionName, "login");
  });

  it("matches unordered groups with sets efficiently", () => {
    const expected: ExpectedCallNode[] = [
      {
        unordered: [
          { functionName: "step_a", arguments: {} },
          { functionName: "step_b", arguments: {} },
        ],
      },
    ];
    const actual: ToolCall[] = [
      { functionName: "step_b", args: {} },
      { functionName: "step_a", args: {} },
    ];

    const result = evaluateExecutionTrajectory(expected, actual);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(
      result.every((r) => r.outcome === "pass"),
      true,
    );
  });

  it("assigns remaining unmatched items 1-to-1 in flat unordered failures", () => {
    const expected: ExpectedCallNode[] = [
      {
        unordered: [
          { functionName: "step_a", arguments: {} },
          { functionName: "step_b", arguments: {} },
        ],
      },
    ];
    // LLM retries A twice, never calls B
    const actual: ToolCall[] = [
      { functionName: "step_a", args: {} },
      { functionName: "step_a", args: {} },
    ];

    const result = evaluateExecutionTrajectory(expected, actual);
    assert.strictEqual(result.length, 2);
    // One should pass (the first A), one should fail (B vs the second A)
    const passes = result.filter((r) => r.outcome === "pass");
    const fails = result.filter((r) => r.outcome === "fail");
    assert.strictEqual(passes.length, 1);
    assert.strictEqual(fails.length, 1);
    assert.strictEqual(fails[0].expected?.functionName, "step_b");
  });

  it("matches identical function names with different arguments in unordered groups", () => {
    const expected: ExpectedCallNode[] = [
      {
        unordered: [
          { functionName: "update", arguments: { id: 1 } },
          { functionName: "update", arguments: { id: 2 } },
        ],
      },
    ];
    const actual: ToolCall[] = [
      { functionName: "update", args: { id: 2 } },
      { functionName: "update", args: { id: 1 } },
    ];

    const result = evaluateExecutionTrajectory(expected, actual);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(
      result.every((r) => r.outcome === "pass"),
      true,
    );
  });

  it("handles extra actual executions after an unordered group", () => {
    const expected: ExpectedCallNode[] = [
      {
        unordered: [{ functionName: "step_a", arguments: {} }],
      },
    ];
    const actual: ToolCall[] = [
      { functionName: "step_a", args: {} },
      { functionName: "step_extra", args: {} },
    ];

    const result = evaluateExecutionTrajectory(expected, actual);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].outcome, "pass");
    assert.strictEqual(result[1].outcome, "fail");
    assert.strictEqual(result[1].expected, null);
    assert.strictEqual(result[1].actual?.functionName, "step_extra");
  });

  it("matches nested sequential groups inside unordered correctly", () => {
    const expected: ExpectedCallNode[] = [
      {
        unordered: [
          { functionName: "a", arguments: {} },
          {
            ordered: [
              { functionName: "b1", arguments: {} },
              { functionName: "b2", arguments: {} },
            ],
          },
        ],
      },
    ];

    // Valid trajectory: B1 -> B2 -> A
    const actual1: ToolCall[] = [
      { functionName: "b1", args: {} },
      { functionName: "b2", args: {} },
      { functionName: "a", args: {} },
    ];
    const res1 = evaluateExecutionTrajectory(expected, actual1);
    assert.strictEqual(res1.length, 3);
    assert.strictEqual(
      res1.every((r) => r.outcome === "pass"),
      true,
    );

    // Valid trajectory: A -> B1 -> B2
    const actual2: ToolCall[] = [
      { functionName: "a", args: {} },
      { functionName: "b1", args: {} },
      { functionName: "b2", args: {} },
    ];
    const res2 = evaluateExecutionTrajectory(expected, actual2);
    assert.strictEqual(res2.length, 3);
    assert.strictEqual(
      res2.every((r) => r.outcome === "pass"),
      true,
    );

    // Invalid trajectory: B1 -> A -> B2 (violates ordering of b1 then b2)
    const actual3: ToolCall[] = [
      { functionName: "b1", args: {} },
      { functionName: "a", args: {} },
      { functionName: "b2", args: {} },
    ];
    const res3 = evaluateExecutionTrajectory(expected, actual3);
    assert.strictEqual(
      res3.some((r) => r.outcome === "fail"),
      true,
    );
  });

  it("handles mismatched nested actuals in unordered group without crashing", () => {
    const expected: ExpectedCallNode[] = [
      {
        unordered: [
          { functionName: "step_c", arguments: {} },
          {
            ordered: [
              { functionName: "step_a", arguments: {} },
              { functionName: "step_b", arguments: {} },
            ],
          },
        ],
      },
    ];
    const actual: ToolCall[] = [
      { functionName: "step_a", args: {} },
      { functionName: "step_c", args: {} },
      { functionName: "step_b", args: {} },
    ];

    // Order mismatch (A->C->B should fail the ordered A->B requirement or fail the pool)
    const result = evaluateExecutionTrajectory(expected, actual);
    assert.strictEqual(result.length, 3);
    assert.strictEqual(
      result.some((r) => r.outcome === "fail"),
      true,
    );
  });

  it("handles when fewer executions are provided to simple unordered group", () => {
    const expected: ExpectedCallNode[] = [
      {
        unordered: [
          { functionName: "step_a", arguments: {} },
          { functionName: "step_b", arguments: {} },
        ],
      },
    ];
    const actual: ToolCall[] = [{ functionName: "step_a", args: {} }];

    const result = evaluateExecutionTrajectory(expected, actual);
    assert.strictEqual(result.length, 2);
    const passes = result.filter((r) => r.outcome === "pass");
    const fails = result.filter((r) => r.outcome === "fail");
    assert.strictEqual(passes.length, 1);
    assert.strictEqual(fails.length, 1);
    assert.strictEqual(fails[0].expected?.functionName, "step_b");
    assert.strictEqual(fails[0].actual, null);
  });

  it("throws error for unordered groups larger than 15 when nested", () => {
    const expected: ExpectedCallNode[] = [
      {
        unordered: Array.from({ length: 16 }).map((_, i) => ({
          functionName: `step_${i}`,
          arguments: {},
        })),
      },
    ];
    // Inject nested call to trigger matchNestedUnorderedGroup
    (expected[0] as any).unordered[0] = { ordered: [{ functionName: "nested", arguments: {} }] };

    assert.throws(() => {
      evaluateExecutionTrajectory(expected, []);
    }, /Unordered group too large/);
  });

  it("handles two independent ordered branches inside an unordered group", () => {
    // Unordered containing [Branch A: a1 -> a2] and [Branch B: b1 -> b2]
    const expected: ExpectedCallNode[] = [
      {
        unordered: [
          {
            ordered: [
              { functionName: "a1", arguments: {} },
              { functionName: "a2", arguments: {} },
            ],
          },
          {
            ordered: [
              { functionName: "b1", arguments: {} },
              { functionName: "b2", arguments: {} },
            ],
          },
        ],
      },
    ];

    // Case 1: Executing Branch B then Branch A (PASS)
    const actualBranchBThenA: ToolCall[] = [
      { functionName: "b1", args: {} },
      { functionName: "b2", args: {} },
      { functionName: "a1", args: {} },
      { functionName: "a2", args: {} },
    ];
    const res1 = evaluateExecutionTrajectory(expected, actualBranchBThenA);
    assert.strictEqual(res1.length, 4);
    assert.ok(res1.every((r) => r.outcome === "pass"));

    // Case 2: Executing Branch A then Branch B (PASS)
    const actualBranchAThenB: ToolCall[] = [
      { functionName: "a1", args: {} },
      { functionName: "a2", args: {} },
      { functionName: "b1", args: {} },
      { functionName: "b2", args: {} },
    ];
    const res2 = evaluateExecutionTrajectory(expected, actualBranchAThenB);
    assert.strictEqual(res2.length, 4);
    assert.ok(res2.every((r) => r.outcome === "pass"));
  });

  it("enforces sequence boundaries between back-to-back unordered groups", () => {
    // Group 1: unordered[step_a, step_b], Group 2: unordered[step_c, step_d]
    const expected: ExpectedCallNode[] = [
      {
        unordered: [
          { functionName: "step_a", arguments: {} },
          { functionName: "step_b", arguments: {} },
        ],
      },
      {
        unordered: [
          { functionName: "step_c", arguments: {} },
          { functionName: "step_d", arguments: {} },
        ],
      },
    ];

    // Valid: [b, a, d, c] (PASS)
    const validActual: ToolCall[] = [
      { functionName: "step_b", args: {} },
      { functionName: "step_a", args: {} },
      { functionName: "step_d", args: {} },
      { functionName: "step_c", args: {} },
    ];
    const resValid = evaluateExecutionTrajectory(expected, validActual);
    assert.strictEqual(resValid.length, 4);
    assert.ok(resValid.every((r) => r.outcome === "pass"));

    // Invalid: Interleaving across the group boundary [b, c, a, d] (FAIL)
    const invalidActual: ToolCall[] = [
      { functionName: "step_b", args: {} },
      { functionName: "step_c", args: {} },
      { functionName: "step_a", args: {} },
      { functionName: "step_d", args: {} },
    ];
    const resInvalid = evaluateExecutionTrajectory(expected, invalidActual);
    assert.ok(resInvalid.some((r) => r.outcome === "fail"));
  });

  it("solves bipartite matching for duplicate function names with different argument constraints", () => {
    // Unordered group with same tool name but distinct size constraints
    const expected: ExpectedCallNode[] = [
      {
        unordered: [
          { functionName: "set_size", arguments: { size: "large" } },
          { functionName: "set_size", arguments: { size: "small" } },
        ],
      },
    ];

    // Executed in reverse order (small then large) (PASS)
    const actual: ToolCall[] = [
      { functionName: "set_size", args: { size: "small" } },
      { functionName: "set_size", args: { size: "large" } },
    ];

    const result = evaluateExecutionTrajectory(expected, actual);
    assert.strictEqual(result.length, 2);
    assert.ok(result.every((r) => r.outcome === "pass"));
  });
});

describe("optional tool calls", () => {
  it("skips an unmatched optional in an ordered sequence", () => {
    // Expected: [search, get_summary?, get_product].
    // Actual: [search, get_product] — the summary step was skipped.
    // Trajectory should PASS with just the two required rows.
    const expected: ExpectedCallNode[] = [
      {
        ordered: [
          { functionName: "search" },
          { functionName: "get_summary", optional: true },
          { functionName: "get_product" },
        ],
      },
    ];
    const actual: ToolCall[] = [
      { functionName: "search", args: {} },
      { functionName: "get_product", args: {} },
    ];
    const results = evaluateExecutionTrajectory(expected, actual);
    assert.deepStrictEqual(
      results.map((r) => ({ fn: (r.expected as any)?.functionName ?? null, outcome: r.outcome })),
      [
        { fn: "search", outcome: "pass" },
        { fn: "get_product", outcome: "pass" },
      ],
    );
  });

  it("matches an optional in an ordered sequence when the model does emit it", () => {
    // Same expected trajectory as above, but the model DID make the
    // optional call. All three rows should PASS.
    const expected: ExpectedCallNode[] = [
      {
        ordered: [
          { functionName: "search" },
          { functionName: "get_summary", optional: true },
          { functionName: "get_product" },
        ],
      },
    ];
    const actual: ToolCall[] = [
      { functionName: "search", args: {} },
      { functionName: "get_summary", args: {} },
      { functionName: "get_product", args: {} },
    ];
    const results = evaluateExecutionTrajectory(expected, actual);
    assert.strictEqual(results.length, 3);
    for (const r of results) assert.strictEqual(r.outcome, "pass");
  });

  it("leaves required nodes as FAIL when actual is truncated but skips trailing optional", () => {
    // Expected: [search, get_product, get_summary?].
    // Actual: [search] — required get_product missing, optional summary skipped.
    const expected: ExpectedCallNode[] = [
      {
        ordered: [
          { functionName: "search" },
          { functionName: "get_product" },
          { functionName: "get_summary", optional: true },
        ],
      },
    ];
    const actual: ToolCall[] = [{ functionName: "search", args: {} }];
    const results = evaluateExecutionTrajectory(expected, actual);
    assert.deepStrictEqual(
      results.map((r) => ({ fn: (r.expected as any)?.functionName ?? null, outcome: r.outcome })),
      [
        { fn: "search", outcome: "pass" },
        { fn: "get_product", outcome: "fail" },
      ],
    );
  });

  it("skips an unmatched optional inside a simple unordered group", () => {
    // Unordered {add_topping, get_summary?}. Actual only has add_topping.
    const expected: ExpectedCallNode[] = [
      {
        unordered: [
          { functionName: "add_topping" },
          { functionName: "get_summary", optional: true },
        ],
      },
    ];
    const actual: ToolCall[] = [{ functionName: "add_topping", args: { topping: "onion" } }];
    const results = evaluateExecutionTrajectory(expected, actual);
    // Only the required node produces a row.
    assert.strictEqual(results.length, 1);
    assert.strictEqual((results[0].expected as any).functionName, "add_topping");
    assert.strictEqual(results[0].outcome, "pass");
  });

  it("matches an optional inside a simple unordered group when the model emits it", () => {
    // Same expected, actual now includes the optional.
    const expected: ExpectedCallNode[] = [
      {
        unordered: [
          { functionName: "add_topping" },
          { functionName: "get_summary", optional: true },
        ],
      },
    ];
    const actual: ToolCall[] = [
      { functionName: "get_summary", args: {} },
      { functionName: "add_topping", args: { topping: "onion" } },
    ];
    const results = evaluateExecutionTrajectory(expected, actual);
    assert.strictEqual(results.length, 2);
    for (const r of results) assert.strictEqual(r.outcome, "pass");
  });

  it("skips an unmatched optional inside a nested unordered group", () => {
    // Trigger the matchNestedUnorderedGroup path with a group as a
    // sibling. Actual only has search + update_cart; the optional
    // get_summary is skipped.
    const expected: ExpectedCallNode[] = [
      {
        unordered: [
          {
            ordered: [{ functionName: "search" }, { functionName: "update_cart" }],
          },
          { functionName: "get_summary", optional: true },
        ],
      },
    ];
    const actual: ToolCall[] = [
      { functionName: "search", args: {} },
      { functionName: "update_cart", args: {} },
    ];
    const results = evaluateExecutionTrajectory(expected, actual);
    // Just the two required rows, both pass.
    assert.strictEqual(results.length, 2);
    assert.deepStrictEqual(
      results.map((r) => (r.expected as any).functionName),
      ["search", "update_cart"],
    );
    for (const r of results) assert.strictEqual(r.outcome, "pass");
  });

  it("still FAILs when the actual has extra calls beyond expected + optional", () => {
    // Extras that don't match anything (required or optional) still fail
    // — optional isn't a wildcard, it's a specific-call permission.
    const expected: ExpectedCallNode[] = [
      { functionName: "search" },
      { functionName: "get_summary", optional: true },
    ];
    const actual: ToolCall[] = [
      { functionName: "search", args: {} },
      { functionName: "something_else", args: {} },
    ];
    const results = evaluateExecutionTrajectory(expected, actual);
    // search passes; the extra call is a trailing unexpected actual and
    // should be reported as a fail.
    const outcomes = results.map((r) => r.outcome);
    assert.ok(outcomes.includes("fail"), `expected at least one fail, got ${outcomes.join(",")}`);
  });
});

describe("functionCallOutcome", () => {
  it("passes when both expected and actual are null", () => {
    assert.strictEqual(functionCallOutcome(null, null), "pass");
  });

  it("fails when only one side is null", () => {
    assert.strictEqual(functionCallOutcome(null, { functionName: "foo", args: {} }), "fail");
    assert.strictEqual(functionCallOutcome({ functionName: "foo", arguments: {} }, null), "fail");
  });

  it("fails when the function name differs", () => {
    assert.strictEqual(
      functionCallOutcome(
        { functionName: "foo", arguments: {} },
        { functionName: "bar", args: {} },
      ),
      "fail",
    );
  });

  it("passes matching args", () => {
    assert.strictEqual(
      functionCallOutcome(
        { functionName: "foo", arguments: { a: 1 } },
        { functionName: "foo", args: { a: 1 } },
      ),
      "pass",
    );
  });

  it("fails on mismatched args", () => {
    assert.strictEqual(
      functionCallOutcome(
        { functionName: "foo", arguments: { a: 1 } },
        { functionName: "foo", args: { a: 2 } },
      ),
      "fail",
    );
  });

  it("treats a missing `arguments` field as an unconstrained match", () => {
    // Common case: the eval author omits `arguments` from evals.json for a
    // no-arg tool like `get_cart`. The model's SDK still surfaces the call
    // with an empty args object, which should not be scored as a mismatch.
    assert.strictEqual(
      functionCallOutcome({ functionName: "get_cart" }, { functionName: "get_cart", args: {} }),
      "pass",
    );
    // Even non-empty actual args pass when the eval doesn't constrain them.
    assert.strictEqual(
      functionCallOutcome(
        { functionName: "get_cart" },
        { functionName: "get_cart", args: { verbose: true } },
      ),
      "pass",
    );
  });

  it("treats an explicit `arguments: null` as an unconstrained match", () => {
    assert.strictEqual(
      functionCallOutcome(
        { functionName: "get_cart", arguments: null },
        { functionName: "get_cart", args: {} },
      ),
      "pass",
    );
  });

  it("treats explicit `arguments: {}` as an unconstrained match under subset semantics", () => {
    // With object matching now subset-based (see matcher.ts:matchesRecursive),
    // an empty expected object imposes no constraints on any of actual's
    // keys — the loop "for every key in expected" doesn't iterate. Any actual
    // shape matches.
    assert.strictEqual(
      functionCallOutcome(
        { functionName: "foo", arguments: {} },
        { functionName: "foo", args: {} },
      ),
      "pass",
    );
    // Extra keys in actual are permitted — same as any other subset match.
    assert.strictEqual(
      functionCallOutcome(
        { functionName: "foo", arguments: {} },
        { functionName: "foo", args: { x: 1 } },
      ),
      "pass",
    );
  });
});

describe("countExpectedCalls with optional", () => {
  it("excludes optional nodes from the required-step count", () => {
    const nodes: ExpectedCallNode[] = [
      { functionName: "search" },
      { functionName: "get_summary", optional: true },
      { functionName: "get_product" },
    ];
    // 3 total nodes, 2 required.
    assert.strictEqual(countExpectedCalls(nodes), 2);
  });

  it("excludes optional nodes from ordered/unordered subtrees", () => {
    const nodes: ExpectedCallNode[] = [
      {
        ordered: [
          { functionName: "a" },
          { functionName: "b_optional", optional: true },
          {
            unordered: [{ functionName: "c" }, { functionName: "d_optional", optional: true }],
          },
        ],
      },
    ];
    // Required leaves: a, c → 2.
    assert.strictEqual(countExpectedCalls(nodes), 2);
  });
});

describe("countExpectedCalls", () => {
  it("counts empty array as 0", () => {
    assert.strictEqual(countExpectedCalls([]), 0);
  });

  it("counts simple expected calls", () => {
    const expected: ExpectedCallNode[] = [
      { functionName: "a", arguments: {} },
      { functionName: "b", arguments: {} },
    ];
    assert.strictEqual(countExpectedCalls(expected), 2);
  });

  it("counts nested expected calls accurately", () => {
    const expected: ExpectedCallNode[] = [
      { functionName: "a", arguments: {} },
      {
        ordered: [
          { functionName: "b", arguments: {} },
          {
            unordered: [
              { functionName: "c", arguments: {} },
              { functionName: "d", arguments: {} },
            ],
          },
        ],
      },
    ];
    assert.strictEqual(countExpectedCalls(expected), 4);
  });
});

describe("sortObjectKeys", () => {
  it("sorts object keys alphabetically including nested objects", () => {
    const obj = { c: 3, a: 1, b: { z: 26, x: 24, y: 25 } };
    const sorted = sortObjectKeys(obj);
    assert.deepStrictEqual(Object.keys(sorted as any), ["a", "b", "c"]);
    assert.deepStrictEqual(Object.keys((sorted as any).b), ["x", "y", "z"]);
  });

  it("handles circular references gracefully", () => {
    const obj: any = { a: 1 };
    obj.self = obj;
    const sorted = sortObjectKeys(obj);
    assert.strictEqual((sorted as any).self, sorted);
  });

  it("preserves non-plain objects", () => {
    const date = new Date();
    const obj = { b: 2, a: date };
    const sorted = sortObjectKeys(obj);
    assert.strictEqual((sorted as any).a, date);
  });

  it("sorts object keys alphabetically within arrays", () => {
    const obj = [
      { b: 2, a: 1 },
      { d: 4, c: 3 },
    ];
    const sorted = sortObjectKeys(obj) as any[];
    assert.deepStrictEqual(Object.keys(sorted[0]), ["a", "b"]);
    assert.deepStrictEqual(Object.keys(sorted[1]), ["c", "d"]);
  });
});
