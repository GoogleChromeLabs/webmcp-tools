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

  it("labels extra executions as unexpected tool calls", () => {
    const results: TestResult[] = [
      {
        test: {
          name: "Hallucinated tool",
          messages: [{ role: "user", type: "message", content: "Summarize the page" }],
          expectedCall: null,
        },
        response: { functionName: "get_page_content", args: {} },
        outcome: "fail",
      },
      {
        test: {
          name: "Missing tool",
          messages: [{ role: "user", type: "message", content: "Search the catalog" }],
          expectedCall: [{ functionName: "search", arguments: {} }],
        },
        response: null,
        outcome: "fail",
      },
    ];

    const html = renderReport(mockConfig, {
      results,
      testCount: 2,
      passCount: 0,
      failCount: 2,
      errorCount: 0,
    });

    assert.match(html, /Unexpected tool call/);
    assert.match(html, /No call expected/);
    assert.match(html, /get_page_content/);
    assert.strictEqual(html.match(/Unexpected tool call/g)?.length, 1);
  });

  it("renders chrome channel in HTML configuration section", () => {
    const testResults: TestResults = {
      results: [],
      testCount: 0,
      passCount: 0,
      failCount: 0,
      errorCount: 0,
    };
    const htmlWithChannel = renderReport(
      { ...mockConfig, chromeChannel: "chrome-dev" },
      testResults,
    );
    assert.match(htmlWithChannel, /Chrome channel/);
    assert.match(htmlWithChannel, /chrome-dev/);

    const htmlDefault = renderReport(mockConfig, testResults);
    assert.match(htmlDefault, /chrome-canary/);
  });

  it("renders browser console errors once per run and escapes page content", () => {
    const browserConsoleErrors = [
      {
        kind: "console" as const,
        message: "Failed to render <script>",
        url: "https://example.test/app.js?next=<unsafe>",
        lineNumber: 12,
        columnNumber: 4,
        toolCalls: [
          {
            functionName: "render_<unsafe>",
            args: { query: "<script>alert(1)</script>" },
          },
        ],
      },
      {
        kind: "pageerror" as const,
        message: "Unhandled state",
        toolCalls: [
          {
            functionName: "submit_order",
            args: { orderId: 123 },
          },
        ],
      },
    ];
    const results: TestResult[] = [
      {
        test: {
          name: "Browser diagnostics",
          messages: [{ role: "user", type: "message", content: "Complete the flow" }],
          expectedCall: [{ functionName: "first", arguments: {} }],
        },
        response: { functionName: "first", args: {} },
        outcome: "pass",
        runIndex: 1,
        stepIndex: 1,
        browserConsoleErrors,
      },
      {
        test: {
          name: "Browser diagnostics",
          messages: [{ role: "user", type: "message", content: "Complete the flow" }],
          expectedCall: [{ functionName: "second", arguments: {} }],
        },
        response: { functionName: "second", args: {} },
        outcome: "pass",
        runIndex: 1,
        stepIndex: 2,
        browserConsoleErrors,
      },
    ];

    const html = renderReport(mockConfig, {
      results,
      testCount: 1,
      passCount: 2,
      failCount: 0,
      errorCount: 0,
    });

    assert.match(html, /2 browser errors/);
    assert.match(html, /Browser console errors \(2\)/);
    assert.match(html, /Failed to render &lt;script&gt;/);
    assert.match(html, /https:\/\/example\.test\/app\.js\?next=&lt;unsafe&gt;:12:4/);
    assert.match(html, /During tool <span[^>]*>render_&lt;unsafe&gt;<\/span>/);
    assert.match(html, /&quot;query&quot;: &quot;&lt;script&gt;alert\(1\)&lt;\/script&gt;&quot;/);
    assert.match(html, /Uncaught exception/);
    assert.strictEqual(html.match(/Failed to render/g)?.length, 1);
  });
});
