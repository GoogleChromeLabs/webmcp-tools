/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { generateText, stepCountIs, ToolLoopAgent } from "ai";
import { Config, WebmcpConfig } from "../types/config.js";
import { Eval, TrajectoryStep } from "../types/evals.js";
import { Tool, ToolCall } from "../types/tools.js";
import { findChromePath } from "../utils.js";

import { Backend, BrowserEvalResult, BrowserPage, LocalEvalResult } from "../backends/index.js";
import { BrowserToolRegistry, PUPPETEER_FLAGS } from "../evaluator/browser.js";
import { mapJsonSchemaToVercelTools, mapMessages } from "../evaluator/mappers.js";
import { getModel } from "../evaluator/models.js";
import { SYSTEM_PROMPT } from "../evaluator/prompts.js";
import { ConsoleLogger } from "../utils/logger.js";
import { ToolRegistry } from "../evaluator/toolRegistry.js";

// Default upper bound on the local agent loop's step count. Large enough for
// any reasonable trajectory in evals.json; small enough that a stuck model
// terminates without burning tokens. Overridable via `--max-steps=N`.
const DEFAULT_MAX_STEPS = 6;

export class VercelBackend implements Backend {
  private aiModel: any;
  private modelName: string;
  private debug: boolean;
  private maxSteps: number;

  private logger: ConsoleLogger;

  constructor(config: Config | WebmcpConfig) {
    this.modelName = config.model || "gemini-3-flash-preview";
    this.aiModel = getModel(config);
    this.debug = !!config.debug;
    this.maxSteps = config.maxSteps ?? DEFAULT_MAX_STEPS;
    this.logger = new ConsoleLogger();
    this.logger.setDebugEnabled(this.debug);
  }

  async executeLocalEvals(test: Eval, registry: ToolRegistry): Promise<LocalEvalResult> {
    const aiMessages = mapMessages(test.messages);

    const executableTools = mapJsonSchemaToVercelTools(registry.getCurrentTools(), (fnName, args) =>
      registry.executeTool(fnName, args),
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
      experimental_onToolCallStart: (event) => {
        this.logger.debug(`\n[DEBUG] Tool "${event.toolCall.toolName}" starting...`);
        this.logger.dir((event.toolCall as any).args || (event.toolCall as any).input, {
          depth: null,
          colors: true,
        });
      },
      experimental_onToolCallFinish: (event) => {
        if (event.success) {
          this.logger.debug(
            `[DEBUG] Tool "${event.toolCall.toolName}" completed in ${event.durationMs}ms`,
          );
          if (event.output) this.logger.dir(event.output, { depth: null, colors: true });
        } else {
          this.logger.error(`[DEBUG] Tool "${event.toolCall.toolName}" failed:`, event.error);
        }
      },
      onStepFinish: (event) => {
        this.logger.debug(
          `[DEBUG] Step ${event.stepNumber} finished (${event.finishReason}). Total Tokens: ${event.usage.totalTokens}`,
        );
      },
    });

    // Gather every tool call from every step in trajectory order. Previously
    // only aiResult.toolCalls[0] was surfaced, which both dropped subsequent
    // steps and dropped parallel calls within a single step.
    const validToolNames = new Set(registry.getCurrentTools().map((t) => t.functionName));
    const toolCalls: ToolCall[] = [];
    for (const step of aiResult.steps ?? []) {
      for (const call of (step.toolCalls ?? []) as any[]) {
        if (validToolNames.has(call.toolName)) {
          const matchingResult: any = (step.toolResults ?? []).find(
            (r: any) => r.toolCallId === call.toolCallId || r.toolName === call.toolName,
          );
          const result = matchingResult
            ? (matchingResult.result ?? matchingResult.output)
            : undefined;
          toolCalls.push({
            functionName: call.toolName,
            args: call.input || call.args || call.arguments || {},
            result,
          });
        }
      }
    }

    return { toolCalls, text: aiResult.text };
  }

  async executeInBrowserEval(
    test: Eval,
    page: BrowserPage,
    config: WebmcpConfig,
  ): Promise<BrowserEvalResult> {
    const availableToolsPerStep: Array<Array<Tool>> = [];
    const stepsHistory: TrajectoryStep[] = [];

    const buildErrorTrajectory = () => {
      return stepsHistory.map((step, idx) => ({
        text: step.text,
        reasoningText: step.reasoningText,
        toolCalls: step.toolCalls,
        toolResults: step.toolResults,
        availableTools: availableToolsPerStep[idx] || [],
      }));
    };

    try {
      const registry = new BrowserToolRegistry(page);
      let currentTools = await registry.syncTools();

      if (currentTools.length === 0) {
        const executablePath = await findChromePath();
        throw new Error(
          `WebMCP Tools are not available on ${config.url} (0 tools registered on page). Debug info: [URL="${config.url}", Executable="${executablePath}", Flags="${PUPPETEER_FLAGS.join(" ")}"]`,
        );
      }

      const aiToolsWithExecution: Record<string, any> = {};
      const rebuildTools = (toolsList: Tool[]) => {
        for (const key in aiToolsWithExecution) {
          delete aiToolsWithExecution[key];
        }
        const mapped = mapJsonSchemaToVercelTools(toolsList, (fnName, args) =>
          registry.executeTool(fnName, args),
        );
        Object.assign(aiToolsWithExecution, mapped);
      };

      rebuildTools(currentTools);

      const agentWithExec = new ToolLoopAgent({
        model: this.aiModel,
        tools: aiToolsWithExecution,
        instructions: SYSTEM_PROMPT,
        experimental_onToolCallStart: (event) => {
          this.logger.debug(`\n[DEBUG] Tool "${event.toolCall.toolName}" starting...`);
          this.logger.dir((event.toolCall as any).args || (event.toolCall as any).input, {
            depth: null,
            colors: true,
          });
        },
        experimental_onToolCallFinish: (event) => {
          if (event.success) {
            this.logger.debug(
              `[DEBUG] Tool "${event.toolCall.toolName}" completed in ${event.durationMs}ms`,
            );
            if (event.output) this.logger.dir(event.output, { depth: null, colors: true });
          } else {
            this.logger.error(`[DEBUG] Tool "${event.toolCall.toolName}" failed:`, event.error);
          }
        },
        onStepFinish: (event) => {
          this.logger.debug(
            `[DEBUG] Step ${event.stepNumber || ""} finished (${event.finishReason}). Total Tokens: ${event.usage.totalTokens}`,
          );
          stepsHistory.push({
            text: event.text,
            reasoningText: event.reasoningText,
            toolCalls: event.toolCalls,
            toolResults: event.toolResults,
          });
        },
        prepareStep: async (_opts: any): Promise<any> => {
          currentTools = await registry.syncTools();
          rebuildTools(currentTools);
          availableToolsPerStep.push([...currentTools]);
          return _opts;
        },
      });

      const aiMessages = mapMessages(test.messages);
      const resultPayload = await agentWithExec.generate({ messages: aiMessages });

      // Gather executed tool calls across all steps
      const executedCalls: ToolCall[] = [];
      const stepsToIterate =
        resultPayload.steps && resultPayload.steps.length > 0 ? resultPayload.steps : stepsHistory;
      if (stepsToIterate && stepsToIterate.length > 0) {
        for (const step of stepsToIterate) {
          if (step.toolCalls && step.toolCalls.length > 0) {
            for (const call of step.toolCalls) {
              const matchingResult: any = (step.toolResults ?? []).find(
                (r: any) => r.toolCallId === call.toolCallId || r.toolName === call.toolName,
              );
              const result = matchingResult
                ? (matchingResult.result ?? matchingResult.output)
                : undefined;
              executedCalls.push({
                functionName: call.toolName,
                args: (call as any).input || (call as any).args || (call as any).arguments || {},
                result,
              });
            }
          }
        }
      }

      const rawSteps =
        resultPayload.steps && resultPayload.steps.length > 0 ? resultPayload.steps : stepsHistory;

      const steps = rawSteps.map((step, idx) => ({
        text: step.text,
        reasoningText: step.reasoningText,
        toolCalls: step.toolCalls,
        toolResults: step.toolResults,
        availableTools: availableToolsPerStep[idx] || [],
      }));

      return {
        toolCalls: executedCalls,
        text: resultPayload.text,
        steps,
      };
    } catch (e: any) {
      this.logger.warn("Error running test in browser:", e);
      return {
        toolCalls: [],
        steps: buildErrorTrajectory(),
        error: e,
      };
    }
  }

  describe(): string {
    return `Vercel Backend using model: ${this.modelName}`;
  }
}
