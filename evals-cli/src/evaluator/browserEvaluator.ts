/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Browser, Page } from "puppeteer-core";
import { WebmcpConfig } from "../types/config.js";
import { Eval, TestResult, TestResults } from "../types/evals.js";
import { Tool, ToolCall } from "../types/tools.js";
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

  const browser = await launchBrowser();
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
  try {
    page = await setupBrowserPage(browser, config.url);
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
      },
    ];
  } finally {
    if (page) {
      await page.close();
    }
  }
}

async function setupBrowserPage(browser: Browser, url: string): Promise<Page> {
  const page = await browser.newPage();
  await page.goto(url, {
    waitUntil: "networkidle2",
    timeout: 30000,
  });
  return page;
}

function buildTestResults(
  test: Eval,
  executedCalls: ToolCall[],
  resultPayload: { text?: string },
  trajectory: any[],
  runIndex: number,
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
      runIndex,
      stepIndex: 1,
    });
  } else {
    let stepIndex = 1;
    for (const traj of trajectories) {
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
        runIndex,
        stepIndex: stepIndex++,
      });
    }
  }
  return testResults;
}
