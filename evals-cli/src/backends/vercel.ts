/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { generateText, stepCountIs, ToolLoopAgent } from "ai";
import { Browser, Page } from "puppeteer-core";
import { Config, WebmcpConfig } from "../types/config.js";
import { Eval, TestResult, TestResults } from "../types/evals.js";
import { Tool, ToolCall } from "../types/tools.js";
import { countExpectedCalls, evaluateExecutionTrajectory, findChromePath } from "../utils.js";

import { Backend, LocalEvalResult, RunEvent } from "../backends/index.js";
import {
  createBrowserTool,
  getToolsFromBrowserPage,
  launchBrowser,
  PUPPETEER_FLAGS,
} from "../evaluator/browser.js";
import {
  mapJsonSchemaToVercelTools,
  mapMessages,
  mapRawBrowserToolsToConfig,
} from "../evaluator/mappers.js";
import { getModel } from "../evaluator/models.js";
import { MockResolver } from "../evaluator/mockResolver.js";
import { SYSTEM_PROMPT } from "../evaluator/prompts.js";

// Default upper bound on the local agent loop's step count. Large enough for
// any reasonable trajectory in evals.json; small enough that a stuck model
// terminates without burning tokens. Overridable via `--max-steps=N`.
const DEFAULT_MAX_STEPS = 6;

export class VercelBackend implements Backend {
  private aiModel: any;
  private modelName: string;
  private debug: boolean;
  private maxSteps: number;

  constructor(
    config: Config | WebmcpConfig,
    private tools: Array<Tool>,
  ) {
    this.modelName = config.model || "gemini-3-flash-preview";
    this.aiModel = getModel(config);
    this.debug = !!config.debug;
    this.maxSteps = config.maxSteps ?? DEFAULT_MAX_STEPS;
  }

  async executeLocalEvals(test: Eval): Promise<LocalEvalResult> {
    const aiMessages = mapMessages(test.messages);

    // Fresh resolver per test — cursor state must not leak across cases.
    const resolver = new MockResolver(test.expectedCall);
    const executableTools = mapJsonSchemaToVercelTools(this.tools, (fnName, args) =>
      resolver.resolve(fnName, args),
    );

    const aiResult = await generateText({
      model: this.aiModel,
      system: SYSTEM_PROMPT,
      messages: aiMessages,
      tools: executableTools,
      // Enables multi-step trajectories. Tools have execute functions now,
      // so without a stopWhen the loop would run until the model itself
      // stops calling tools — which can be never. Cap it explicitly.
      stopWhen: stepCountIs(this.maxSteps),
      experimental_onToolCallStart: this.debug
        ? (event) => {
            console.log(`\n[DEBUG] Tool "${event.toolCall.toolName}" starting...`);
            console.dir((event.toolCall as any).args || (event.toolCall as any).input, {
              depth: null,
              colors: true,
            });
          }
        : undefined,
      experimental_onToolCallFinish: this.debug
        ? (event) => {
            if (event.success) {
              console.log(
                `[DEBUG] Tool "${event.toolCall.toolName}" completed in ${event.durationMs}ms`,
              );
              if (event.output) console.dir(event.output, { depth: null, colors: true });
            } else {
              console.error(`[DEBUG] Tool "${event.toolCall.toolName}" failed:`, event.error);
            }
          }
        : undefined,
      onStepFinish: this.debug
        ? (event) => {
            console.log(
              `[DEBUG] Step ${event.stepNumber} finished (${event.finishReason}). Total Tokens: ${event.usage.totalTokens}`,
            );
          }
        : undefined,
    });

    // Gather every tool call from every step in trajectory order. Previously
    // only aiResult.toolCalls[0] was surfaced, which both dropped subsequent
    // steps and dropped parallel calls within a single step.
    const validToolNames = new Set(this.tools.map((t) => t.functionName));
    const toolCalls: ToolCall[] = [];
    for (const step of aiResult.steps ?? []) {
      for (const call of (step.toolCalls ?? []) as any[]) {
        if (validToolNames.has(call.toolName)) {
          toolCalls.push({
            functionName: call.toolName,
            args: call.input || call.args || call.arguments || {},
          });
        }
      }
    }

    return { toolCalls, text: aiResult.text };
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
      browser = await launchBrowser();

      console.log("Browser initialized for actual evals");
    } catch (error) {
      if (browser) await browser.close();
      throw new Error(
        `Failed to initialize browser for actual evals (Flags="${PUPPETEER_FLAGS.join(" ")}"): ${error}`,
      );
    }

    const runs = config.runs || 1;
    const testsBaseTotal = tests.reduce((sum, test) => {
      return sum + (test.expectedCall ? countExpectedCalls(test.expectedCall) : 1);
    }, 0);
    const totalSteps = testsBaseTotal * runs;

    if (onEvent) {
      onEvent({
        type: "start",
        total: totalSteps,
        message: `Running evals using ${this.describe()} (${runs} runs)`,
      });
    }

    let testCount = 0;
    let passCount = 0;
    let failCount = 0;
    let errorCount = 0;
    const testResults: Array<TestResult> = [];

    for (let r = 0; r < runs; r++) {
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
        let rawBrowserTools = await getToolsFromBrowserPage(page);
        let initialFallbackTools = tools.length > 0 ? tools : this.tools;
        let currentTools = mapRawBrowserToolsToConfig(rawBrowserTools, initialFallbackTools);

        if (currentTools.length === 0) {
          throw new Error(
            `WebMCP Tools are not available on ${config.url} (0 tools registered on page). Debug info: [URL="${config.url}", Executable="${executablePath}", Flags="${PUPPETEER_FLAGS.join(" ")}"]`,
          );
        }

        const availableToolsPerStep: Array<Array<Tool>> = [];
        const stepsHistory: any[] = [];

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
            experimental_onToolCallStart: config.debug
              ? (event) => {
                  console.log(`\n[DEBUG] Tool "${event.toolCall.toolName}" starting...`);
                  console.dir((event.toolCall as any).args || (event.toolCall as any).input, {
                    depth: null,
                    colors: true,
                  });
                }
              : undefined,
            experimental_onToolCallFinish: config.debug
              ? (event) => {
                  if (event.success) {
                    console.log(
                      `[DEBUG] Tool "${event.toolCall.toolName}" completed in ${event.durationMs}ms`,
                    );
                    if (event.output) console.dir(event.output, { depth: null, colors: true });
                  } else {
                    console.error(`[DEBUG] Tool "${event.toolCall.toolName}" failed:`, event.error);
                  }
                }
              : undefined,
            onStepFinish: (event) => {
              if (config.debug) {
                console.log(
                  `[DEBUG] Step ${event.stepNumber || ""} finished (${event.finishReason}). Total Tokens: ${event.usage.totalTokens}`,
                );
              }
              stepsHistory.push({
                text: event.text,
                reasoningText: event.reasoningText,
                toolCalls: event.toolCalls,
                toolResults: event.toolResults,
              });
            },
            prepareStep: async (_opts: any): Promise<any> => {
              let rawTools = await getToolsFromBrowserPage(page!);
              if (rawTools.length > 0) {
                currentTools = mapRawBrowserToolsToConfig(rawTools, currentTools);
              }

              availableToolsPerStep.push([...currentTools]);

              // Clear the object
              for (const key in aiToolsWithExecution) {
                delete aiToolsWithExecution[key];
              }

              // Re-populate it
              for (const t of currentTools) {
                aiToolsWithExecution[t.functionName] = createBrowserTool(t, page!);
              }

              return _opts;
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
                    args:
                      (call as any).input || (call as any).args || (call as any).arguments || {},
                  });
                }
              }
            }
          }

          const rawSteps =
            resultPayload.steps && resultPayload.steps.length > 0
              ? resultPayload.steps
              : stepsHistory;

          const trajectory = rawSteps.map((step, idx) => ({
            text: step.text,
            reasoningText: step.reasoningText,
            toolCalls: step.toolCalls,
            toolResults: step.toolResults,
            availableTools: availableToolsPerStep[idx] || [],
          }));

          const trajectories = test.expectedCall
            ? evaluateExecutionTrajectory(test.expectedCall, executedCalls as ToolCall[])
            : evaluateExecutionTrajectory([], executedCalls as ToolCall[]);

          if (trajectories.length === 0) {
            const response: any = { text: resultPayload.text };
            const stepResult: TestResult = {
              test,
              response,
              outcome: "pass",
              trajectory,
              runIndex: r + 1,
              stepIndex: 1,
            };
            testResults.push(stepResult);
            passCount++;
            if (onEvent) {
              onEvent({ type: "progress", testNumber: testCount, result: stepResult });
            }
          } else {
            let stepIndex = 1;
            for (const traj of trajectories) {
              let response: any = traj.actual;
              if (!response && executedCalls.length === 0 && resultPayload.text) {
                response = { text: resultPayload.text };
              } else if (!response) {
                response = { missing: "Did not execute this step" };
              }

              const stepResult: TestResult = {
                test: {
                  name: test.name,
                  messages: currentMessages,
                  expectedCall: traj.expected ? [traj.expected] : null,
                },
                response,
                outcome: traj.outcome,
                trajectory,
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
        } catch (e: any) {
          console.warn("Error running test:", e);
          errorCount++;
          const trajectory = stepsHistory.map((step, idx) => ({
            text: step.text,
            reasoningText: step.reasoningText,
            toolCalls: step.toolCalls,
            toolResults: step.toolResults,
            availableTools: availableToolsPerStep[idx] || [],
          }));
          const result: TestResult = {
            test,
            response: null as any,
            outcome: "error",
            runIndex: r + 1,
            stepIndex: 1,
            trajectory,
          };
          testResults.push(result);
          if (onEvent) {
            onEvent({ type: "progress", testNumber: testCount, result });
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
      errorCount,
    };
  }

  describe(): string {
    return `Vercel Backend using model: ${this.modelName}`;
  }
}
