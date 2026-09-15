/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from "node:assert";
import { describe, it } from "node:test";
import {
  getProgressBar,
  generateConsoleSummaryTable,
  generateSimulationSummaryTable,
} from "../commands/index.js";
import type { SimulationResult, SimulationResults } from "../evaluator/simulationEvaluator.js";

// Helper to remove chalk ansi codes so we can match plain strings
function cleanAnsi(str: any): string {
  return String(str).replace(/\u001b\[\d+m/g, "");
}

describe("getProgressBar", () => {
  it("draws empty bar for 0 ratio", () => {
    const bar = getProgressBar(0, 10);
    assert.strictEqual(cleanAnsi(bar), "──────────");
  });

  it("draws half-filled bar for 0.5 ratio", () => {
    const bar = getProgressBar(0.5, 10);
    assert.strictEqual(cleanAnsi(bar), "━━━━━─────");
  });

  it("draws full bar for 1 ratio", () => {
    const bar = getProgressBar(1, 10);
    assert.strictEqual(cleanAnsi(bar), "━━━━━━━━━━");
  });

  it("clamps ratio values greater than 1", () => {
    const bar = getProgressBar(1.5, 10);
    assert.strictEqual(cleanAnsi(bar), "━━━━━━━━━━");
  });

  it("clamps negative ratio values to 0", () => {
    const bar = getProgressBar(-0.5, 10);
    assert.strictEqual(cleanAnsi(bar), "──────────");
  });

  it("handles NaN ratio gracefully by displaying empty bar", () => {
    const bar = getProgressBar(NaN, 10);
    assert.strictEqual(cleanAnsi(bar), "──────────");
  });

  it("respects custom bar size", () => {
    const bar = getProgressBar(0.5, 6);
    assert.strictEqual(cleanAnsi(bar), "━━━───");
  });
});

describe("generateConsoleSummaryTable", () => {
  it("properly groups and structures results by test case and run index", () => {
    const fakeResults = {
      results: [
        {
          runIndex: 1,
          stepIndex: 1,
          test: { name: "Test A", expectedCall: [{ functionName: "func1" }] },
          response: { functionName: "func1" },
          outcome: "pass",
        },
        {
          runIndex: 1,
          stepIndex: 2,
          test: { name: "Test A", expectedCall: [{ functionName: "func2" }] },
          response: { functionName: "func2" },
          outcome: "pass",
        },
        {
          runIndex: 2,
          stepIndex: 1,
          test: { name: "Test A", expectedCall: [{ functionName: "func1" }] },
          response: { functionName: "func1" },
          outcome: "pass",
        },
        {
          runIndex: 1,
          stepIndex: 1,
          test: { name: "Test B", expectedCall: [{ functionName: "func3" }] },
          response: { functionName: "func4" }, // Mismatch
          outcome: "fail",
        },
      ],
      passCount: 3,
    };

    const table = generateConsoleSummaryTable(fakeResults);

    // Let's assert on the row headers and structure
    // Grouping structure inserts:
    // - Overarching Test Case headers: "Test Case: Test A", "Test Case: Test B"
    // - Run grouping headers: " • [Run 1]", " • [Run 2]"
    // - Individual step entries
    const rows = Array.from(table as any).map((row: any) => {
      if (Array.isArray(row)) {
        return row.map((cell) => {
          if (cell && typeof cell === "object" && "content" in cell) {
            return cleanAnsi(cell.content);
          }
          return cleanAnsi(cell);
        });
      }
      return cleanAnsi(row);
    });

    const flatStrings = rows.flat();

    // Check we have grouped headers and the rows in correct order
    assert.ok(flatStrings.includes("Test Case: Test A"));
    assert.ok(flatStrings.includes(" • [Run 1]"));
    assert.ok(flatStrings.includes(" • [Run 2]"));
    assert.ok(flatStrings.includes("Test Case: Test B"));

    // Check content inside rows (excluding the headers)
    const stepRows = rows.filter((r) => r.length > 1) as string[][];
    assert.strictEqual(stepRows.length, 4);

    // Row 1: Step 1 of Test A, Run 1
    assert.strictEqual(stepRows[0][0], "1"); // stepIndex
    assert.strictEqual(stepRows[0][1], "PASS");
    assert.strictEqual(stepRows[0][2], "func1");
    assert.strictEqual(stepRows[0][3], "func1");

    // Row 4: Step 1 of Test B, Run 1 (failed)
    assert.strictEqual(stepRows[3][0], "1"); // stepIndex
    assert.strictEqual(stepRows[3][1], "FAIL");
    assert.strictEqual(stepRows[3][2], "func3");
    assert.strictEqual(stepRows[3][3], "func4");
    assert.match(stepRows[3][4], /Function mismatch/);
  });
});

describe("generateSimulationSummaryTable", () => {
  const simulationResult = (overrides: Partial<SimulationResult> = {}): SimulationResult =>
    ({
      simulation: {
        name: "Removes the cap",
        userScenario: "You want the hat gone.",
        maxTurns: 4,
        successCriteria: "The cap is out of the cart.",
      },
      runIndex: 1,
      outcome: "pass",
      verdict: {
        passed: true,
        reasoning: "removeFromCart came back without the cap.",
        evidence: ["removeFromCart -> ok"],
        turnsUsed: 2,
        durationMs: 500,
        endedBy: "user",
      },
      ...overrides,
    }) as SimulationResult;

  const rowsOf = (results: SimulationResults): string[][] =>
    Array.from(generateSimulationSummaryTable(results) as any).map((row: any) =>
      (row as any[]).map((cell) =>
        cell && typeof cell === "object" && "content" in cell
          ? cleanAnsi(cell.content)
          : cleanAnsi(cell),
      ),
    );

  it("groups runs of one simulation under it with an aggregate pass rate", () => {
    const rows = rowsOf({
      results: [
        simulationResult({ runIndex: 1 }),
        simulationResult({
          runIndex: 2,
          outcome: "fail",
          verdict: {
            passed: false,
            reasoning: "The cart still contained the cap.",
            evidence: ["getCart -> cap present"],
            turnsUsed: 4,
            durationMs: 900,
            endedBy: "maxTurns",
          },
        }),
      ],
      simulationCount: 1,
      passCount: 1,
      failCount: 1,
      errorCount: 0,
    });

    assert.strictEqual(rows[0][0], "Simulation: Removes the cap (1/2 passed)");
    const runRows = rows.filter((row) => row.length > 1);
    assert.strictEqual(runRows.length, 2);
    assert.deepStrictEqual(runRows[0], [
      "1",
      "PASS",
      "2",
      "user",
      "removeFromCart came back without the cap.",
    ]);
    assert.deepStrictEqual(runRows[1], [
      "2",
      "FAIL",
      "4",
      "maxTurns",
      "The cart still contained the cap.",
    ]);
  });

  it("states a reason on every row, so a failure is legible without the report", () => {
    const runRows = rowsOf({
      results: [
        simulationResult({
          outcome: "error",
          verdict: undefined,
          error: "setup call 1 (addToCart) failed: out of stock",
        }),
      ],
      simulationCount: 1,
      passCount: 0,
      failCount: 0,
      errorCount: 1,
    }).filter((row) => row.length > 1);

    assert.strictEqual(runRows[0][1], "ERROR");
    assert.match(runRows[0][4], /setup call 1 \(addToCart\) failed/);
  });

  it("truncates reasoning to its first line", () => {
    const runRows = rowsOf({
      results: [
        simulationResult({
          verdict: {
            passed: true,
            reasoning: `Short first line.\nA second paragraph the console has no room for.`,
            evidence: ["x"],
            turnsUsed: 1,
            durationMs: 1,
            endedBy: "user",
          },
        }),
      ],
      simulationCount: 1,
      passCount: 1,
      failCount: 0,
      errorCount: 0,
    }).filter((row) => row.length > 1);

    assert.strictEqual(runRows[0][4], "Short first line.");
  });

  it("falls back to the conversation when there is no verdict to read turns from", () => {
    const runRows = rowsOf({
      results: [
        simulationResult({
          outcome: "error",
          verdict: undefined,
          error: "the conversation broke off: the model hung up",
          conversation: {
            turns: [],
            turnsUsed: 3,
            durationMs: 10,
            endedBy: "error",
          },
        }),
      ],
      simulationCount: 1,
      passCount: 0,
      failCount: 0,
      errorCount: 1,
    }).filter((row) => row.length > 1);

    assert.strictEqual(runRows[0][2], "3");
    assert.strictEqual(runRows[0][3], "error");
  });
});
