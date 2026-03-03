/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { generateText, ToolLoopAgent } from "ai";
import puppeteer, { Browser, Page } from "puppeteer-core";
import { Config, WebmcpConfig } from "../types/config.js";
import { Eval, FunctionCall, TestResult, TestResults } from "../types/evals.js";
import { Tool, ToolCall } from "../types/tools.js";
import { countExpectedCalls, evaluateExecutionTrajectory, findChromePath } from "../utils.js";

import { Backend, RunEvent } from "../backends/index.js";
import { createBrowserTool } from "../evaluator/browser.js";
import {
  mapJsonSchemaToVercelTools,
  mapMessages,
  mapRawBrowserToolsToConfig,
} from "../evaluator/mappers.js";
import { getModel } from "../evaluator/models.js";
import { SYSTEM_PROMPT } from "../evaluator/prompts.js";

function isFunctionCallExpectation(value: unknown): value is FunctionCall {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const call = value as Partial<FunctionCall>;
  return (
    typeof call.functionName === "string" &&
    typeof call.arguments === "object" &&
    call.arguments !== null &&
    !Array.isArray(call.arguments)
  );
}

export class VercelBackend implements Backend {
  private aiModel: ReturnType<typeof getModel>;
  private modelName: string;
  private systemPrompt: string;

  constructor(
    config: Config | WebmcpConfig,
    private tools: Array<Tool>,
    systemPrompt?: string,
  ) {
    this.modelName = config.model || "gemini-2.5-flash";
    this.aiModel = getModel(config);
    this.systemPrompt = systemPrompt || SYSTEM_PROMPT;
  }

  async executeLocalEvals(test: Eval): Promise<any> {
    const aiMessages = mapMessages(test.messages);

    const aiResult = await generateText({
      model: this.aiModel,
      system: this.systemPrompt,
      messages: aiMessages,
      tools: mapJsonSchemaToVercelTools(this.tools),
    });

    if (aiResult.toolCalls && aiResult.toolCalls.length > 0) {
      const call = aiResult.toolCalls[0] as {
        toolName?: string;
        input?: unknown;
        args?: unknown;
        arguments?: unknown;
      };
      const rawArgs = call.input ?? call.args ?? call.arguments;
      const args: Record<string, unknown> =
        typeof rawArgs === "object" && rawArgs !== null && !Array.isArray(rawArgs)
          ? (rawArgs as Record<string, unknown>)
          : {};

      if (typeof call.toolName !== "string") {
        return { text: aiResult.text };
      }

      return {
        functionName: call.toolName,
        args,
      };
    } else {
      return { text: aiResult.text };
    }
  }

  async executeInBrowserEvals(
    tests: Array<Eval>,
    tools: Array<Tool>,
    config: WebmcpConfig,
    onEvent?: (event: RunEvent) => void,
  ): Promise<TestResults> {
    console.log("Executing in-browser evals for config:", config);
    const executablePath = await findChromePath();
    let browser: Browser | null = null;
    let page: Page | null = null;

    try {
      browser = await puppeteer.launch({
        executablePath,
        headless: true,
        args: ["--enable-features=WebMCPTesting", "--no-sandbox", "--disable-setuid-sandbox"],
      });

      console.log("Browser initialized for actual evals");
    } catch (error) {
      if (browser) await browser.close();
      throw new Error(`Failed to initialize browser for actual evals: ${error}`);
    }

    const totalSteps = tests.reduce((sum, test) => {
      return sum + (test.expectedCall ? countExpectedCalls(test.expectedCall) : 1);
    }, 0);

    if (onEvent) {
      onEvent({
        type: "start",
        total: totalSteps,
        message: `Running evals using ${this.describe()}`,
      });
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
      const currentMessages = [...test.messages];
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
          instructions: this.systemPrompt,
          prepareCall: async (_opts: any): Promise<any> => {
            // Dynamically fetch tools from the browser extension integration framework
            const rawTools = await page!.evaluate(async () => {
              let modelContext = null;
              if (typeof (navigator as any).modelContext?.listTools === "function") {
                modelContext = (navigator as any).modelContext;
              } else if (typeof (navigator as any).modelContextTesting?.listTools === "function") {
                modelContext = (navigator as any).modelContextTesting;
              }
              if (!modelContext) return null;
              return await modelContext.listTools();
            });

            currentTools = mapRawBrowserToolsToConfig(rawTools, currentTools);

            // We need to re-bind the execute methods to the newly loaded tools
            const updatedAiTools: Record<string, any> = {};
            for (const t of currentTools) {
              updatedAiTools[t.functionName] = createBrowserTool(t, page!);
            }

            return { ..._opts, tools: updatedAiTools };
          },
        });

        // Let the agent loop run
        const aiMessages = mapMessages(test.messages);

        const resultPayload = await agentWithExec.generate({ messages: aiMessages });

        // Gather executed tool calls across all steps
        const executedCalls: ToolCall[] = [];
        if (resultPayload.steps && resultPayload.steps.length > 0) {
          for (const step of resultPayload.steps) {
            if (step.toolCalls && step.toolCalls.length > 0) {
              for (const call of step.toolCalls) {
                const rawArgs =
                  (call as { input?: unknown; args?: unknown; arguments?: unknown }).input ??
                  (call as { input?: unknown; args?: unknown; arguments?: unknown }).args ??
                  (call as { input?: unknown; args?: unknown; arguments?: unknown }).arguments;
                const args: Record<string, unknown> =
                  typeof rawArgs === "object" &&
                  rawArgs !== null &&
                  !Array.isArray(rawArgs)
                    ? (rawArgs as Record<string, unknown>)
                    : {};
                executedCalls.push({
                  functionName: call.toolName,
                  args,
                });
              }
            }
          }
        }

        const trajectory = resultPayload.steps || [];

        const trajectories = test.expectedCall
          ? evaluateExecutionTrajectory(test.expectedCall, executedCalls)
          : evaluateExecutionTrajectory([], executedCalls);

        if (trajectories.length === 0) {
          const response: any = { text: resultPayload.text };
          const stepResult: TestResult = { test, response, outcome: "pass", trajectory };
          testResults.push(stepResult);
          passCount++;
          if (onEvent) {
            onEvent({ type: "progress", testNumber: testCount, result: stepResult });
          }
        } else {
          for (const traj of trajectories) {
            let response: any = traj.actual;
            if (!response && executedCalls.length === 0 && resultPayload.text) {
              response = { text: resultPayload.text };
            } else if (!response) {
              response = { missing: "Did not execute this step" };
            }

            const stepResult: TestResult = {
              test: {
                messages: currentMessages,
                expectedCall: traj.expected ? [traj.expected] : null,
              },
              response,
              outcome: traj.outcome,
              trajectory,
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
      } catch (e: any) {
        console.warn("Error running test:", e);
        errorCount++;
        const result: TestResult = {
          test,
          response: null as any,
          outcome: "error",
        };
        testResults.push(result);
        if (onEvent) {
          onEvent({ type: "progress", testNumber: testCount, result });
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
      errorCount,
    };
  }

  describe(): string {
    return `Vercel Backend using model: ${this.modelName}`;
  }
}
