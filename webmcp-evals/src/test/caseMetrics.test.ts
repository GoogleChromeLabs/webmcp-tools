/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from "node:assert";
import { describe, it } from "node:test";
import {
  buildCaseRunMetrics,
  buildTestResults,
  summarizeCaseMetrics,
} from "../evaluator/browserEvaluator.js";
import { renderReport } from "../report/report.js";
import type { AttemptedToolCallMetric, Eval, TestResult } from "../types/evals.js";
import type { Config } from "../types/config.js";

const mockConfig: Config = {
  toolSchemaFile: "tools.json",
  evalsFile: "evals.json",
  backend: "vercel",
  model: "test",
  chromeChannel: "chrome-canary",
};

function attempt(
  overrides: Partial<AttemptedToolCallMetric> & Pick<AttemptedToolCallMetric, "invocationId">,
): AttemptedToolCallMetric {
  return {
    functionName: "search",
    arguments: {},
    outcome: "completed",
    durationMs: 10,
    ...overrides,
  };
}

describe("case metrics", () => {
  it("counts completed and errors without treating missing duration as zero success", () => {
    const metrics = buildCaseRunMetrics(
      [
        attempt({ invocationId: "inv-1", durationMs: 12 }),
        attempt({ invocationId: "inv-2", outcome: "error", error: "nope", durationMs: undefined }),
      ],
      100,
    );
    assert.strictEqual(metrics.attempted, 2);
    assert.strictEqual(metrics.completed, 1);
    assert.strictEqual(metrics.errors, 1);
    assert.strictEqual(metrics.durationMs, 100);
    assert.strictEqual(metrics.toolAttempts[1]!.durationMs, undefined);
  });

  it("summarizes once per case/run even when two step rows share metrics", () => {
    const metrics = buildCaseRunMetrics(
      [attempt({ invocationId: "inv-1" }), attempt({ invocationId: "inv-2" })],
      50,
    );
    const evalCase: Eval = {
      name: "two-step",
      messages: [{ role: "user", type: "message", content: "go" }],
      expectedCall: [
        { functionName: "search", arguments: { q: "a" } },
        { functionName: "search", arguments: { q: "b" } },
      ],
    };
    const rows = buildTestResults(
      evalCase,
      [
        { functionName: "search", args: { q: "a" }, result: {} },
        { functionName: "search", args: { q: "b" }, result: {} },
      ],
      {},
      [],
      1,
      [],
      metrics,
    );
    // One case, two matching calls → two step rows, same metrics object.
    assert.strictEqual(rows.length, 2);
    assert.strictEqual(rows[0]!.metrics?.attempted, 2);
    assert.strictEqual(rows[1]!.metrics?.attempted, 2);

    const summary = summarizeCaseMetrics(rows);
    assert.ok(summary);
    assert.strictEqual(summary!.caseCount, 1);
    assert.strictEqual(summary!.attempted, 2);
    assert.strictEqual(summary!.totalDurationMs, 50);

    // Existing trap: step passCount can be 2 while case count is 1.
    const html = renderReport(mockConfig, {
      results: rows as TestResult[],
      testCount: 1,
      passCount: 2,
      failCount: 0,
      errorCount: 0,
      caseMetricsSummary: summary,
    });
    assert.match(html, /Case \/ tool metrics/);
    assert.match(html, /cases with metrics: 1/);
    assert.match(html, /tool attempts: 2/);
    assert.doesNotMatch(html, /tool attempts: 4/);
  });

  it("reports null totalDurationMs when no case durations are known", () => {
    const metrics = buildCaseRunMetrics([attempt({ invocationId: "inv-1" })]);
    assert.strictEqual(metrics.durationMs, undefined);
    const summary = summarizeCaseMetrics([
      {
        test: {
          name: "a",
          messages: [{ role: "user", type: "message", content: "x" }],
          expectedCall: null,
        },
        response: null,
        outcome: "pass",
        runIndex: 1,
        stepIndex: 1,
        metrics,
      },
    ]);
    assert.strictEqual(summary!.totalDurationMs, null);
    assert.strictEqual(summary!.casesWithDuration, 0);
  });
});
