/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config, WebmcpConfig } from "../types/config.js";
import { Eval, TestResult, TestResults } from "../types/evals.js";
import { ToolCall } from "../types/tools.js";
import { countExpectedCalls, evaluateExecutionTrajectory } from "../utils.js";
import { Backend, RunEvent } from "../backends/index.js";

import { Tool } from "../types/tools.js";
import { MockResolver } from "./mockResolver.js";
import { LocalToolRegistry } from "./toolRegistry.js";

export async function executeLocalEvals(
  tests: Array<Eval>,
  backend: Backend,
  tools: Array<Tool>,
  config: Config | WebmcpConfig,
  onEvent?: (event: RunEvent) => void,
): Promise<TestResults> {
  const runs = config.runs || 1;
  const testsBaseTotal = tests.reduce((sum, test) => {
    return sum + (test.expectedCall ? countExpectedCalls(test.expectedCall) : 1);
  }, 0);
  const totalSteps = testsBaseTotal * runs;

  let testCount = 0;
  let passCount = 0;
  let failCount = 0;
  let errorCount = 0;
  const testResults: Array<TestResult> = [];

  if (onEvent) {
    onEvent({
      type: "start",
      total: totalSteps,
      message: `Running evals using ${backend.describe()} (${runs} runs)`,
    });
  }

  for (let r = 0; r < runs; r++) {
    for (const test of tests) {
      testCount++;
      try {
        const resolver = new MockResolver(test.expectedCall);
        const registry = new LocalToolRegistry(tools, resolver);
        const response = await backend.executeLocalEvals(test, registry);
        const executedCalls: ToolCall[] = response.toolCalls;

        const trajectories = test.expectedCall
          ? evaluateExecutionTrajectory(test.expectedCall, executedCalls)
          : evaluateExecutionTrajectory([], executedCalls);

        if (trajectories.length === 0) {
          const result: TestResult = {
            test,
            response: null,
            outcome: "pass",
            runIndex: r + 1,
            stepIndex: 1,
          };
          testResults.push(result);
          passCount++;
          if (onEvent) {
            onEvent({ type: "progress", testNumber: testCount, result });
          }
        } else {
          let stepIndex = 1;
          for (const traj of trajectories) {
            const stepResult: TestResult = {
              test: {
                name: test.name,
                messages: test.messages,
                expectedCall: traj.expected ? [traj.expected] : null,
              },
              response: traj.actual,
              outcome: traj.outcome,
              runIndex: r + 1,
              stepIndex: stepIndex++,
            };
            testResults.push(stepResult);
            if (traj.outcome === "pass") {
              passCount++;
            } else {
              failCount++;
            }

            if (onEvent) {
              onEvent({ type: "progress", testNumber: testCount, result: stepResult });
            }
          }
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (config.debug) {
          console.error(`\n[eval error] ${test.name ?? "(unnamed)"}:`, e);
        } else {
          console.error(`\n[eval error] ${test.name ?? "(unnamed)"}: ${message}`);
        }

        errorCount++;
        const result: TestResult = {
          test,
          response: null as any,
          outcome: "error",
          runIndex: r + 1,
          stepIndex: 1,
        };
        testResults.push(result);
        if (onEvent) {
          onEvent({ type: "progress", testNumber: testCount, result });
        }
      }
    }
  }

  return {
    results: testResults,
    testCount,
    passCount,
    failCount,
    errorCount,
  };
}
