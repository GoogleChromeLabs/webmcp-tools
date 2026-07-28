/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from "node:test";
import * as assert from "node:assert";
import { renderReport } from "../report/report.js";
import { TestResults, TestResult } from "../types/evals.js";
import { Config } from "../types/config.js";

describe("Report Grouping & Rendering", () => {
  const mockConfig: Config = {
    toolSchemaFile: "tools.json",
    evalsFile: "evals.json",
    backend: "vercel",
    model: "gemini-2.5-pro",
  };

  it("groups test results by case name and calculates aggregated pass rates", () => {
    const results: TestResult[] = [
      {
        test: {
          name: "Search Soccer Ball",
          messages: [{ role: "user", type: "message", content: "Find soccer ball" }],
          expectedCall: [{ functionName: "search", arguments: {} }],
        },
        response: { functionName: "search", args: {} },
        outcome: "pass",
      },
      {
        test: {
          name: "Search Soccer Ball",
          messages: [{ role: "user", type: "message", content: "Find soccer ball" }],
          expectedCall: [{ functionName: "search", arguments: {} }],
        },
        response: null,
        outcome: "fail",
      },
      {
        test: {
          name: "Checkout Cart",
          messages: [{ role: "user", type: "message", content: "Pay" }],
          expectedCall: [{ functionName: "checkout", arguments: {} }],
        },
        response: { functionName: "checkout", args: {} },
        outcome: "pass",
      },
    ];

    const testResults: TestResults = {
      results,
      testCount: 3,
      passCount: 2,
      failCount: 1,
      errorCount: 0,
    };

    const html = renderReport(mockConfig, testResults);

    // Should render the Case Names
    assert.match(html, /Search Soccer Ball/);
    assert.match(html, /Checkout Cart/);

    // Should display aggregated pass rates
    assert.match(html, /1\/2 Passed/); // Search Soccer Ball has 1 pass out of 2
    assert.match(html, /1\/1 Passed/); // Checkout Cart has 1 pass out of 1

    // Failing case should render with rose/error styles and should be open by default
    assert.match(html, /border border-rose-200/);
    assert.match(html, /<details class="group\/case" open>/);

    // Passing case should render with emerald styles
    assert.match(html, /border border-emerald-200/);
  });

  it("falls back to the first content message when case name is omitted", () => {
    const results: TestResult[] = [
      {
        test: {
          messages: [{ role: "user", type: "message", content: "Fallback Prompt Text" }],
          expectedCall: [{ functionName: "help", arguments: {} }],
        },
        response: { functionName: "help", args: {} },
        outcome: "pass",
      },
    ];

    const testResults: TestResults = {
      results,
      testCount: 1,
      passCount: 1,
      failCount: 0,
      errorCount: 0,
    };

    const html = renderReport(mockConfig, testResults);
    assert.match(html, /Fallback Prompt Text/);
  });
});
