/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from "node:assert";
import { describe, it } from "node:test";
import { getProgressBar, generateConsoleSummaryTable } from "../commands/index.js";

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
