/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from "node:test";
import * as assert from "node:assert";
import { evaluateExecutionTrajectory, sortObjectKeys, countExpectedCalls } from "../utils.js";
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
