/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleAiBackend } from "./backend/googleai.js";
import { OllamaBackend } from "./backend/ollama.js";
import { functionCallOutcome } from "./utils.js";
import { Eval, TestResult, TestResults } from "./types/evals.js";
import { Tool } from "./types/tools.js";
import { Config, WebmcpConfig } from "./types/config.js";

const SYSTEM_PROMPT = `
# INSTRUCTIONS
You are an agent helping a user navigate a page via the tools made available to you. You must
use the tools available to help the user.

# ADDITIONAL CONTEXT
Today's date is: Monday 19th of January, 2026.
`;

export type RunEvent =
  | { type: 'start'; total: number }
  | { type: 'progress'; testNumber: number; result: TestResult }
  | { type: 'completed'; results: TestResults; reportFile?: string }
  | { type: 'error'; message: string };

export async function executeEvals(
  tests: Array<Eval>,
  tools: Array<Tool>,
  config: Config | WebmcpConfig,
  onEvent?: (event: RunEvent) => void
): Promise<TestResults> {
  let backend;
  switch (config.backend) {
    case "ollama":
      backend = new OllamaBackend(
        process.env.OLLAMA_HOST!,
        config.model,
        SYSTEM_PROMPT,
        tools,
      );
      break;
    default:
      backend = new GoogleAiBackend(
        process.env.GOOGLE_AI!,
        config.model,
        SYSTEM_PROMPT,
        tools,
      );
  }

  if (onEvent) {
    onEvent({ type: 'start', total: tests.length });
  }

  let testCount = 0;
  let passCount = 0;
  let failCount = 0;
  let errorCount = 0;
  const testResults: Array<TestResult> = [];

  for (const test of tests) {
    testCount++;
    try {
      const response = await backend.execute(test.messages);
      const outcome = functionCallOutcome(test.expectedCall, response);
      const result: TestResult = { test, response, outcome };
      testResults.push(result);
      outcome === "pass" ? passCount++ : failCount++;

      if (onEvent) {
        onEvent({ type: 'progress', testNumber: testCount, result });
      }
    } catch (e: any) {
      console.warn("Error running test:", e);
      errorCount++;
      const result: TestResult = {
        test,
        response: null as any,
        outcome: "error"
      };
      testResults.push(result);
      if (onEvent) {
        onEvent({ type: 'progress', testNumber: testCount, result });
      }
    }
  }

  return {
    results: testResults,
    testCount,
    passCount,
    failCount,
    errorCount
  };
}
