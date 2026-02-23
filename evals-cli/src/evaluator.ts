/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleAiBackend } from "./backend/googleai.js";
import { OllamaBackend } from "./backend/ollama.js";
import { functionCallOutcome } from "./utils.js";
import { Eval, FunctionCall, TestResult, TestResults } from "./types/evals.js";
import { Tool } from "./types/tools.js";
import { Config, WebmcpConfig } from "./types/config.js";
import puppeteer, { Browser, Page } from "puppeteer-core";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";

const CHROME_CANARY_PATHS: string[] = [
  // Windows
  path.join(
    os.homedir(),
    "AppData",
    "Local",
    "Google",
    "Chrome SxS",
    "Application",
    "chrome.exe",
  ),
  // macOS
  "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
  // Linux unstable channel
  "/usr/bin/google-chrome-unstable",
  "/opt/google/chrome-unstable/google-chrome",
  "/usr/bin/google-chrome-canary"
];

function findChromePath(): string {
  for (const candidate of CHROME_CANARY_PATHS) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(
    "Chrome Canary not found. Please install Chrome Canary (version 146+).\n" +
    "Checked paths:\n" +
    CHROME_CANARY_PATHS.map((p) => `  - ${p}`).join("\n"),
  );
}

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
      const outcome = functionCallOutcome(Array.isArray(test.expectedCall) ? test.expectedCall[0] : test.expectedCall, response);
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

export async function executeInBrowserEvals(
  tests: Array<Eval>,
  tools: Array<Tool>,
  config: WebmcpConfig,
  onEvent?: (event: RunEvent) => void
): Promise<TestResults> {
  console.log("Executing actual evals for config:", config);
  const executablePath = findChromePath();
  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: [
        "--enable-features=WebMCPTesting",
        "--no-sandbox",
        "--disable-setuid-sandbox",
      ],
    });

    console.log("Browser initialized for actual evals");
  } catch (error) {
    if (browser) await browser.close();
    throw new Error(`Failed to initialize browser for actual evals: ${error}`);
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
    if (page) {
      await page.close();
    }
    page = await browser!.newPage();
    await page.goto(config.url, {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    testCount++;
    const expectedCalls = Array.isArray(test.expectedCall) ? test.expectedCall : [test.expectedCall];
    const numIterations = expectedCalls.length;
    let currentMessages = [...test.messages];
    let currentTools = [...tools];

    for (let i = 0; i < numIterations; i++) {
      const currentFunctionCall = expectedCalls[i] || null;
      try {
        let backend;
        switch (config.backend) {
          case "ollama":
            backend = new OllamaBackend(
              process.env.OLLAMA_HOST!,
              config.model,
              SYSTEM_PROMPT,
              currentTools,
            );
            break;
          default:
            backend = new GoogleAiBackend(
              process.env.GOOGLE_AI!,
              config.model,
              SYSTEM_PROMPT,
              currentTools,
            );
        }

        const response = await backend.execute(currentMessages);
        const outcome = functionCallOutcome(currentFunctionCall, response);

        // Execute the actual tool in the browser if LLM generated a call
        let browserExecutionResult = null;
        if (response && response.functionName) {
          console.log("Executing tool in browser:", response.functionName);
          browserExecutionResult = await page.evaluate(async (name, args) => {
            try {
              let mct = null;
              if (typeof (navigator as any).modelContext?.executeTool === 'function' && typeof (navigator as any).modelContext?.listTools === 'function') {
                mct = (navigator as any).modelContext;
              } else if (typeof (navigator as any).modelContextTesting?.executeTool === 'function' && typeof (navigator as any).modelContextTesting?.listTools === 'function') {
                mct = (navigator as any).modelContextTesting;
              }

              if (!mct) return { error: "modelContext or modelContextTesting not found with required methods" };

              const result = await mct.executeTool(name, args || {});

              await new Promise(r => setTimeout(r, 3000));

              // After execution finishes, grab the new state of tools
              const newTools = await mct.listTools();

              return { result, newTools };
            } catch (e: any) {
              return { error: e.message || String(e) };
            }
          }, response.functionName, response.args || {});

          currentMessages.push({
            role: "model",
            type: "functioncall",
            name: response.functionName,
            arguments: response.args || {}
          });

          if (browserExecutionResult) {
            currentMessages.push({
              role: "user",
              type: "functionresponse",
              name: response.functionName,
              response: {
                result: (() => {
                  let r = browserExecutionResult.result;
                  if (typeof r === 'string') {
                    try {
                      r = JSON.parse(r);
                    } catch (e) {
                      // ignore parse errors, keep as string
                    }
                  }

                  if (r?.content && Array.isArray(r.content) && r.content[0]?.text) {
                    return r.content[0].text;
                  }
                  return r || browserExecutionResult.error || "Success"
                })()
              }
            });

            if (browserExecutionResult.newTools && Array.isArray(browserExecutionResult.newTools)) {
              currentTools = browserExecutionResult.newTools.map((t: any) => {
                const schema = t.inputSchema;
                const parameters = typeof schema === "string" ? JSON.parse(schema) : (schema ?? {});
                return {
                  description: t.description,
                  functionName: t.name,
                  parameters,
                };
              });
            }
          }
        }

        // FIXME: Should gracefully handle multiple expected calls
        const result: TestResult = { test: { messages: currentMessages, expectedCall: currentFunctionCall }, response, outcome };
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
  }

  if (browser) {
    await browser.close();
  }

  return {
    results: testResults,
    testCount,
    passCount,
    failCount,
    errorCount
  };
}
