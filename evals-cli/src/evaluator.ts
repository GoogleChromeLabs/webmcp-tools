/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { functionCallOutcome, findChromePath } from "./utils.js";
import { Eval, TestResult, TestResults } from "./types/evals.js";
import { Tool } from "./types/tools.js";
import { Config, WebmcpConfig } from "./types/config.js";
import puppeteer, { Browser, Page } from "puppeteer-core";
import { ToolLoopAgent, generateText, tool as defineTool, jsonSchema } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";

function getModel(config: Config | WebmcpConfig) {
  if (config.backend === "openai") {
    return createOpenAI({ apiKey: process.env.OPENAI_API_KEY })(config.model);
  } else if (config.backend === "anthropic") {
    return createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })(config.model);
  } else {
    return createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_AI || process.env.GEMINI_API_KEY })(config.model);
  }
}

function convertToAITools(rawTools: Tool[]): Record<string, any> {
  const aiTools: Record<string, any> = {};
  for (const t of rawTools) {
    aiTools[t.functionName] = defineTool({
      description: t.description,
      parameters: jsonSchema(t.parameters || {}) as any,
    } as any);
  }
  return aiTools;
}

function mapMessages(messages: any[]): any[] {
  return messages.map(m => {
    if (m.type === 'functioncall') {
      return {
        role: 'assistant',
        content: [{ type: 'tool-call', toolName: m.name, toolCallId: 'call-' + m.name, args: m.arguments }]
      };
    } else if (m.type === 'functionresponse') {
      return {
        role: 'tool',
        content: [{ type: 'tool-result', toolName: m.name, toolCallId: 'call-' + m.name, result: m.response?.result ?? m.response }]
      };
    } else {
      return { role: (m.role === 'model' ? 'assistant' : m.role) as any, content: m.content || '' };
    }
  });
}

function createBrowserTool(t: any, page: Page): any {
  return defineTool({
    description: t.description,
    parameters: jsonSchema(t.parameters || {}) as any,
    execute: async (args: any) => {
      console.log("Executing tool in browser:", t.functionName);
      const executionResult: any = await page.evaluate(async (name, args) => {
        try {
          let mct = null;
          if (typeof (navigator as any).modelContext?.executeTool === 'function') {
            mct = (navigator as any).modelContext;
          } else if (typeof (navigator as any).modelContextTesting?.executeTool === 'function') {
            mct = (navigator as any).modelContextTesting;
          }
          if (!mct) return { error: "modelContext not found" };
          const result = await mct.executeTool(name, args || {});
          await new Promise(r => setTimeout(r, 3000));
          return { result };
        } catch (e: any) {
          return { error: e.message || String(e) };
        }
      }, t.functionName, args);

      let r = executionResult.result;
      if (typeof r === 'string') {
        try { r = JSON.parse(r); } catch (e) { }
      }
      if (r?.content && Array.isArray(r.content) && r.content[0]?.text) {
        return r.content[0].text;
      }
      return r || executionResult.error || "Success";
    }
  } as any);
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
      const aiTools = convertToAITools(tools);
      const aiResult = await generateText({
        model,
        system: SYSTEM_PROMPT,
        messages: aiMessages,
        tools: aiTools,
      });

      let response: any = null;
      if (aiResult.toolCalls && aiResult.toolCalls.length > 0) {
        const call: any = aiResult.toolCalls[0];
        response = {
          functionName: call.toolName,
          args: call.args || call.arguments || {}
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
            // Reload tools
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

            if (rawTools && Array.isArray(rawTools)) {
              currentTools = rawTools.map((t: any) => {
                const schema = t.inputSchema;
                const parameters = typeof schema === "string" ? JSON.parse(schema) : (schema ?? {});
                return {
                  description: t.description,
                  functionName: t.name,
                  parameters,
                };
              });
            }

            // We need to re-bind the execute methods to the newly loaded tools
            const updatedAiTools: Record<string, any> = {};
            for (const t of currentTools) {
              updatedAiTools[t.functionName] = createBrowserTool(t, page!);
            }

            return { tools: updatedAiTools };
          }
        });

        // Let the agent loop run
        const promptMsg: any = test.messages[0];
        const promptString = promptMsg?.content || "No prompt provided";
        const resultPayload = await agentWithExec.generate({ prompt: promptString });

        let response: any = null;
        let lastToolCall = null;

        // Try to reconstruct the expected response format for validate logic
        if (resultPayload.steps && resultPayload.steps.length > 0) {
          for (const step of resultPayload.steps) {
            if (step.toolCalls && step.toolCalls.length > 0) {
              lastToolCall = step.toolCalls[step.toolCalls.length - 1];
            }
          }
        }

        if (lastToolCall) {
          const call: any = lastToolCall;
          response = {
            functionName: call.toolName,
            args: call.args || call.arguments || {}
          };
        } else {
          response = { text: resultPayload.text };
        }

        const outcome = functionCallOutcome(currentFunctionCall, response);

        // Convert currentMessages back to Eval messages if needed...
        // For TestResult, we used to pass object, let's build a dummy result object that matches runner output.
        const mockResult: TestResult = { test: { messages: currentMessages, expectedCall: currentFunctionCall ? [currentFunctionCall] : null }, response, outcome };

        testResults.push(mockResult);
        outcome === "pass" ? passCount++ : failCount++;

        if (onEvent) {
          onEvent({ type: 'progress', testNumber: testCount, result: mockResult });
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
