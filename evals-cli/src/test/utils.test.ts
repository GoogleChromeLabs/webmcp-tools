import { describe, it } from "node:test";
import * as assert from "node:assert";
import { evaluateExecutionTrajectory } from "../utils.js";
import { ExpectedCallNode } from "../types/evals.js";
import { ToolCall } from "../types/tools.js";

describe("evaluateExecutionTrajectory", () => {
  it("matches simple ordered calls", () => {
    const expected: ExpectedCallNode[] = [
      { functionName: "login", arguments: {} },
      { functionName: "logout", arguments: {} }
    ];
    const actual: ToolCall[] = [
      { functionName: "login", args: {} },
      { functionName: "logout", args: {} }
    ];
    
    const result = evaluateExecutionTrajectory(expected, actual);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].outcome, "pass");
    assert.strictEqual(result[1].outcome, "pass");
  });

  it("handles empty executions against expected", () => {
    const expected: ExpectedCallNode[] = [
      { functionName: "login", arguments: {} }
    ];
    const actual: ToolCall[] = [];
    
    const result = evaluateExecutionTrajectory(expected, actual);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].outcome, "fail");
    assert.strictEqual(result[0].actual, null);
  });

  it("matches unordered groups with sets efficiently", () => {
    const expected: ExpectedCallNode[] = [
      {
        unordered: [
          { functionName: "step_a", arguments: {} },
          { functionName: "step_b", arguments: {} }
        ]
      }
    ];
    const actual: ToolCall[] = [
      { functionName: "step_b", args: {} },
      { functionName: "step_a", args: {} }
    ];
    
    const result = evaluateExecutionTrajectory(expected, actual);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result.every(r => r.outcome === "pass"), true);
  });

  it("assigns remaining unmatched items 1-to-1 in flat unordered failures", () => {
    const expected: ExpectedCallNode[] = [
      {
        unordered: [
          { functionName: "step_a", arguments: {} },
          { functionName: "step_b", arguments: {} }
        ]
      }
    ];
    // LLM retries A twice, never calls B
    const actual: ToolCall[] = [
      { functionName: "step_a", args: {} },
      { functionName: "step_a", args: {} }
    ];
    
    const result = evaluateExecutionTrajectory(expected, actual);
    assert.strictEqual(result.length, 2);
    // One should pass (the first A), one should fail (B vs the second A)
    const passes = result.filter(r => r.outcome === "pass");
    const fails = result.filter(r => r.outcome === "fail");
    assert.strictEqual(passes.length, 1);
    assert.strictEqual(fails.length, 1);
    assert.strictEqual(fails[0].expected?.functionName, "step_b");
  });

  it("matches nested sequential groups inside unordered correctly", () => {
    const expected: ExpectedCallNode[] = [
      {
        unordered: [
          { functionName: "a", arguments: {} },
          {
            ordered: [
              { functionName: "b1", arguments: {} },
              { functionName: "b2", arguments: {} }
            ]
          }
        ]
      }
    ];
    
    // Valid trajectory: B1 -> B2 -> A
    const actual1: ToolCall[] = [
      { functionName: "b1", args: {} },
      { functionName: "b2", args: {} },
      { functionName: "a", args: {} }
    ];
    const res1 = evaluateExecutionTrajectory(expected, actual1);
    assert.strictEqual(res1.length, 3);
    assert.strictEqual(res1.every(r => r.outcome === "pass"), true);

    // Valid trajectory: A -> B1 -> B2
    const actual2: ToolCall[] = [
      { functionName: "a", args: {} },
      { functionName: "b1", args: {} },
      { functionName: "b2", args: {} }
    ];
    const res2 = evaluateExecutionTrajectory(expected, actual2);
    assert.strictEqual(res2.length, 3);
    assert.strictEqual(res2.every(r => r.outcome === "pass"), true);

    // Invalid trajectory: B1 -> A -> B2 (violates ordering of b1 then b2)
    const actual3: ToolCall[] = [
      { functionName: "b1", args: {} },
      { functionName: "a", args: {} },
      { functionName: "b2", args: {} }
    ];
    const res3 = evaluateExecutionTrajectory(expected, actual3);
    assert.strictEqual(res3.some(r => r.outcome === "fail"), true);
  });
});
