import { generateText, ToolLoopAgent } from "ai";
import puppeteer, { Browser, Page } from "puppeteer-core";
import { Eval, TestResult, TestResults } from "../types/evals.js";
import { Tool } from "../types/tools.js";
import { Config, WebmcpConfig } from "../types/config.js";
import { functionCallOutcome, findChromePath } from "../utils.js";

import { getModel } from "./models.js";
import { SYSTEM_PROMPT } from "./prompts.js";
import { mapMessages, mapJsonSchemaToVercelTools, mapRawBrowserToolsToConfig } from "./mappers.js";
import { createBrowserTool, listToolsFromPage } from "./browser.js";

export { listToolsFromPage };

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
  const model = getModel(config);

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
      const aiMessages = mapMessages(test.messages);
      const aiResult = await generateText({
        model,
        system: SYSTEM_PROMPT,
        messages: aiMessages,
        tools: mapJsonSchemaToVercelTools(tools)
      });

      let response: any = null;
      if (aiResult.toolCalls && aiResult.toolCalls.length > 0) {
        const call: any = aiResult.toolCalls[0];
        response = {
          functionName: call.toolName,
          args: call.input || call.args || call.arguments || {}
        };
      } else {
        response = { text: aiResult.text };
      }
      const outcome = functionCallOutcome(Array.isArray(test.expectedCall) ? test.expectedCall[0] : test.expectedCall, response);
      const result: TestResult = { test, response, outcome };
      testResults.push(result);
      outcome === "pass" ? passCount++ : failCount++;

      if (onEvent) {
        onEvent({ type: 'progress', testNumber: testCount, result });
      }
    } catch (e: any) {
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
  console.log("Executing in-browser evals for config:", config);
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
    let currentMessages = [...test.messages];
    let currentTools = [...tools];

    try {
      const model = getModel(config);

      const aiToolsWithExecution: Record<string, any> = {};
      for (const t of currentTools) {
        aiToolsWithExecution[t.functionName] = createBrowserTool(t, page!);
      }

      const agentWithExec = new ToolLoopAgent({
        model,
        tools: aiToolsWithExecution,
        instructions: SYSTEM_PROMPT,
        prepareCall: async (_opts: any): Promise<any> => {
          // Dynamically fetch tools from the browser extension integration framework
          const rawTools = await page!.evaluate(async () => {
            let mct = null;
            if (typeof (navigator as any).modelContext?.listTools === 'function') {
              mct = (navigator as any).modelContext;
            } else if (typeof (navigator as any).modelContextTesting?.listTools === 'function') {
              mct = (navigator as any).modelContextTesting;
            }
            if (!mct) return null;
            return await mct.listTools();
          });

          currentTools = mapRawBrowserToolsToConfig(rawTools, currentTools);

          // We need to re-bind the execute methods to the newly loaded tools
          const updatedAiTools: Record<string, any> = {};
          for (const t of currentTools) {
            updatedAiTools[t.functionName] = createBrowserTool(t, page!);
          }

          return { ..._opts, tools: updatedAiTools };
        }
      });

      // Let the agent loop run
      const promptMsg: any = test.messages[0];
      const promptString = promptMsg?.content || "No prompt provided";
      const resultPayload = await agentWithExec.generate({ prompt: promptString });

      // Gather executed tool calls across all steps
      const executedCalls: any[] = [];
      if (resultPayload.steps && resultPayload.steps.length > 0) {
        for (const step of resultPayload.steps) {
          if (step.toolCalls && step.toolCalls.length > 0) {
            for (const call of step.toolCalls) {
              executedCalls.push({
                functionName: call.toolName,
                args: (call as any).input || (call as any).args || (call as any).arguments || {}
              });
            }
          }
        }
      }

      // If no tool was called at all, record a failure against the first expected call
      if (executedCalls.length === 0) {
        const response: any = { text: resultPayload.text };
        const stepResult: TestResult = { test, response, outcome: "fail" };
        testResults.push(stepResult);
        failCount++;
        if (onEvent) {
          onEvent({ type: 'progress', testNumber: testCount, result: stepResult });
        }
      } else {
        // Evaluate each expected call sequentially against what was executed
        for (let i = 0; i < expectedCalls.length; i++) {
          const currentFunctionCall = expectedCalls[i] || null;
          const currentExecutionCall = executedCalls.length > i ? executedCalls[i] : null;
          let response = currentExecutionCall;

          if (!response) {
            // Did not execute enough tools
            response = { missing: "Did not execute this step" };
          }

          const outcome = functionCallOutcome(currentFunctionCall, response);
          const stepResult: TestResult = { test: { messages: currentMessages, expectedCall: currentFunctionCall ? [currentFunctionCall] : null }, response, outcome };
          testResults.push(stepResult);
          outcome === "pass" ? passCount++ : failCount++;

          if (onEvent) {
            onEvent({ type: 'progress', testNumber: testCount, result: stepResult });
          }
        }
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
