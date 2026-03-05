/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { generateText, ToolLoopAgent } from "ai";
import puppeteer, { Browser, Page } from "puppeteer-core";
import { Config, WebmcpConfig } from "../types/config.js";
import { Eval, TestResult, TestResults } from "../types/evals.js";
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

export class VercelBackend implements Backend {
  private aiModel: any;
  private modelName: string;

  constructor(
    config: Config | WebmcpConfig,
    private tools: Array<Tool>,
  ) {
    this.modelName = config.model || "gemini-2.5-flash";
    this.aiModel = getModel(config);
  }

  async executeLocalEvals(test: Eval): Promise<any> {
    const aiMessages = mapMessages(test.messages);
    let aiResult;

    aiResult = await generateText({
      model: this.aiModel,
      system: SYSTEM_PROMPT,
      messages: aiMessages,
      tools: mapJsonSchemaToVercelTools(this.tools),
    });

    if (aiResult.toolCalls && aiResult.toolCalls.length > 0) {
      const call: any = aiResult.toolCalls[0];
      return {
        functionName: call.toolName,
        args: call.input || call.args || call.arguments || {},
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
          prepareStep: async (_opts: any): Promise<any> => {
            let rawTools: any = null;

            try {
              rawTools = await page!.evaluate(async () => {
                const nav = navigator as any;
                let mct = null;
                if (typeof nav.modelContext?.listTools === "function") {
                  mct = nav.modelContext;
                } else if (typeof nav.modelContextTesting?.listTools === "function") {
                  mct = nav.modelContextTesting;
                }
                if (mct) {
                  return await mct.listTools();
                }
                return [];
              });
            } catch (err: any) {
              console.error("[vercel.ts] Failed to fetch tools via evaluate:", err.message);
            }

            currentTools = mapRawBrowserToolsToConfig(rawTools || [], currentTools);

            // Clear the object
            for (const key in aiToolsWithExecution) {
              delete aiToolsWithExecution[key];
            }

            // Re-populate it
            for (const t of currentTools) {
              aiToolsWithExecution[t.functionName] = createBrowserTool(t, page!);
            }

            return {
              ..._opts,
            };
          },
        });

        // Let the agent loop run
        const aiMessages = mapMessages(test.messages);

        const resultPayload = await agentWithExec.generate({ messages: aiMessages });

        // Gather executed tool calls across all steps
        const executedCalls: any[] = [];
        if (resultPayload.steps && resultPayload.steps.length > 0) {
          for (const step of resultPayload.steps) {
            if (step.toolCalls && step.toolCalls.length > 0) {
              for (const call of step.toolCalls) {
                executedCalls.push({
                  functionName: call.toolName,
                  args: (call as any).input || (call as any).args || (call as any).arguments || {},
                });
              }
            }
          }
        }

        const trajectory = resultPayload.steps || [];

        const trajectories = test.expectedCall
          ? evaluateExecutionTrajectory(test.expectedCall, executedCalls as ToolCall[])
          : evaluateExecutionTrajectory([], executedCalls as ToolCall[]);

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
