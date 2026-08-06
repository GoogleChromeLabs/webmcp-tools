/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Browser, Page } from "puppeteer-core";
import { WebmcpConfig } from "../types/config.js";
import { BrowserConsoleError, Eval, TestResult, TestResults } from "../types/evals.js";
import { ToolCall } from "../types/tools.js";
import { countExpectedCalls, evaluateExecutionTrajectory } from "../utils.js";

import { Backend, RunEvent } from "../backends/index.js";
import { launchBrowser } from "./browser.js";
import { logger } from "../utils/logger.js";

export async function executeInBrowserEvals(
  tests: Array<Eval>,
  backend: Backend,
  config: WebmcpConfig,
  onEvent?: (event: RunEvent) => void,
): Promise<TestResults> {
  const runs = config.runs || 1;
  const totalSteps = calculateTotalSteps(tests, runs);

  if (onEvent) {
    onEvent({
      type: "start",
      total: totalSteps,
      message: `Running evals using ${backend.describe()} (${runs} runs)`,
    });
  }

  let testCount = 0;
  let passCount = 0;
  let failCount = 0;
  let errorCount = 0;
  const testResults: Array<TestResult> = [];

  const browser = await launchBrowser(config.chromeChannel);
  try {
    for (let r = 0; r < runs; r++) {
      for (const test of tests) {
        testCount++;
        const results = await runSingleBrowserTest(test, browser, backend, config, r + 1);

        for (const result of results) {
          testResults.push(result);
          if (result.outcome === "pass") {
            passCount++;
          } else if (result.outcome === "fail") {
            failCount++;
          } else {
            errorCount++;
          }
          if (onEvent) {
            onEvent({ type: "progress", testNumber: testCount, result });
          }
        }
      }
    }
  } finally {
    await browser.close();
  }

  return {
    results: testResults,
    testCount,
    passCount,
    failCount,
    errorCount,
  };
}

function calculateTotalSteps(tests: Array<Eval>, runs: number): number {
  const testsBaseTotal = tests.reduce((sum, test) => {
    return sum + (test.expectedCall ? countExpectedCalls(test.expectedCall) : 1);
  }, 0);
  return testsBaseTotal * runs;
}

async function runSingleBrowserTest(
  test: Eval,
  browser: Browser,
  backend: Backend,
  config: WebmcpConfig,
  runIndex: number,
): Promise<TestResult[]> {
  let page: Page | null = null;
  let browserConsoleErrors: BrowserConsoleError[] = [];
  try {
    page = await browser.newPage();
    browserConsoleErrors = collectBrowserConsoleErrors(page);
    await setupBrowserPage(page, config.url);
    const evalResult = await backend.executeInBrowserEval(test, page, config);

    if (evalResult.error) {
      throw evalResult.error;
    }

    return buildTestResults(
      test,
      evalResult.toolCalls,
      { text: evalResult.text },
      evalResult.steps || [],
      runIndex,
      browserConsoleErrors,
    );
  } catch (e: any) {
    logger.warn("Error running browser test:", e);
    return [
      {
        test,
        response: null as any,
        outcome: "error",
        runIndex,
        stepIndex: 1,
        ...(browserConsoleErrors.length > 0 ? { browserConsoleErrors } : {}),
      },
    ];
  } finally {
    if (page) {
      await page.close();
    }
  }
}

async function setupBrowserPage(page: Page, url: string): Promise<void> {
  await page.goto(url, {
    waitUntil: "networkidle2",
    timeout: 30000,
  });
}

export function collectBrowserConsoleErrors(page: Page): BrowserConsoleError[] {
  const errors: BrowserConsoleError[] = [];

  page.on("console", (entry) => {
    if (entry.type() !== "error") return;

    const location = entry.location();
    const error: BrowserConsoleError = {
      kind: "console",
      message: entry.text(),
    };
    if (location.url) error.url = location.url;
    if (location.lineNumber !== undefined) error.lineNumber = location.lineNumber;
    if (location.columnNumber !== undefined) error.columnNumber = location.columnNumber;
    errors.push(error);
  });

  page.on("pageerror", (error) => {
    errors.push({
      kind: "pageerror",
      message: error instanceof Error ? error.message : String(error),
    });
  });

  return errors;
}

function buildTestResults(
  test: Eval,
  executedCalls: ToolCall[],
  resultPayload: { text?: string },
  trajectory: any[],
  runIndex: number,
  browserConsoleErrors: BrowserConsoleError[],
): TestResult[] {
  const testResults: TestResult[] = [];
  const trajectories = test.expectedCall
    ? evaluateExecutionTrajectory(test.expectedCall, executedCalls)
    : evaluateExecutionTrajectory([], executedCalls);

  if (trajectories.length === 0) {
    const response: any = { text: resultPayload.text };
    testResults.push({
      test,
      response,
      outcome: "pass",
      trajectory,
      ...(browserConsoleErrors.length > 0 ? { browserConsoleErrors } : {}),
      runIndex,
      stepIndex: 1,
    });
  } else {
    let stepIndex = 1;
    for (const traj of trajectories) {
      const currentStepIndex = stepIndex++;
      let response: any = traj.actual;
      if (!response && executedCalls.length === 0 && resultPayload.text) {
        response = { text: resultPayload.text };
      } else if (!response) {
        response = { missing: "Did not execute this step" };
      }

      testResults.push({
        test: {
          name: test.name,
          messages: test.messages,
          expectedCall: traj.expected ? [traj.expected] : null,
        },
        response,
        outcome: traj.outcome,
        trajectory,
        ...(currentStepIndex === 1 && browserConsoleErrors.length > 0
          ? { browserConsoleErrors }
          : {}),
        runIndex,
        stepIndex: currentStepIndex,
      });
    }
  }
  return testResults;
}
