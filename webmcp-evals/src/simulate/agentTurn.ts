/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Runs the agent for one turn of a simulated conversation: the simulated user
 * has just said something, and the agent answers — over as many tool-calling
 * steps as it needs — until it produces text.
 *
 * TODO(simulate): this mirrors `backends/vercel.ts#executeInBrowserEval` — the
 * same ToolLoopAgent wiring, the same per-step tool refresh, the same
 * reconciliation of tool calls against their results. It is separate because a
 * simulation needs a conversation that survives across turns, and that method
 * cannot express one: it takes an `Eval` with fixed `messages` and returns
 * nothing that can be fed back in for a second turn. Unifying them means
 * changing the `Backend` interface and every implementation of it, which is
 * not worth doing while the simulation type is still a proposal. Fold this
 * into the backend once it is accepted.
 */

import { LanguageModel, ModelMessage, stepCountIs, ToolLoopAgent } from "ai";
import { BrowserConsoleError, TrajectoryStep } from "../types/evals.js";
import { Tool, ToolCall } from "../types/tools.js";
import { BrowserToolRegistry } from "../evaluator/browser.js";
import { mapJsonSchemaToVercelTools } from "../evaluator/mappers.js";
import { SYSTEM_PROMPT } from "../evaluator/prompts.js";
import { ToolRegistry } from "../evaluator/toolRegistry.js";

export type AgentTurnRequest = {
  /** The whole conversation so far, including earlier turns' tool traffic. */
  messages: ModelMessage[];
  registry: ToolRegistry;
  model: LanguageModel;
  /** Cap on tool-calling steps within this one turn. */
  maxSteps: number;
  /** Ends the turn when the conversation's wall-clock budget expires. */
  abortSignal?: AbortSignal;
};

export type AgentTurnResult = {
  text: string;
  steps: TrajectoryStep[];
  toolCalls: ToolCall[];
  /** Append to `messages` to carry this turn into the next one. */
  responseMessages: ModelMessage[];
  browserConsoleErrors?: BrowserConsoleError[];
  /**
   * Set when the turn did not finish. `steps` still holds whatever the agent
   * managed beforehand: a half-finished turn is exactly what the judge has to
   * work with when a budget expires inside a tool call.
   */
  error?: unknown;
};

/**
 * Pairs each tool call with its result. Matching on `toolCallId` rather than
 * on the tool's name is what keeps two calls to the same tool in one step from
 * being credited with each other's output.
 */
function collectToolCalls(steps: any[]): ToolCall[] {
  const calls: ToolCall[] = [];
  for (const step of steps) {
    for (const call of step.toolCalls ?? []) {
      const matching = (step.toolResults ?? []).find((result: any) =>
        call.toolCallId ? result.toolCallId === call.toolCallId : result.toolName === call.toolName,
      );
      calls.push({
        functionName: call.toolName,
        args: call.input || call.args || call.arguments || {},
        result: matching ? (matching.result ?? matching.output) : undefined,
      });
    }
  }
  return calls;
}

export async function runAgentTurn(request: AgentTurnRequest): Promise<AgentTurnResult> {
  const { messages, registry, model, maxSteps, abortSignal } = request;

  const availableToolsPerStep: Tool[][] = [];
  const stepsHistory: TrajectoryStep[] = [];

  const consoleErrors = () =>
    registry instanceof BrowserToolRegistry ? registry.getBrowserConsoleErrors() : undefined;

  const asTrajectory = (steps: any[]): TrajectoryStep[] =>
    steps.map((step, index) => ({
      text: step.text,
      reasoningText: step.reasoningText,
      toolCalls: step.toolCalls,
      toolResults: step.toolResults,
      availableTools: availableToolsPerStep[index] || [],
    }));

  try {
    const executableTools: Record<string, any> = {};
    const rebuildTools = (tools: Tool[]) => {
      for (const key of Object.keys(executableTools)) delete executableTools[key];
      Object.assign(
        executableTools,
        mapJsonSchemaToVercelTools(tools, (fnName, args) => registry.executeTool(fnName, args)),
      );
    };
    rebuildTools(await registry.getCurrentTools());

    const agent = new ToolLoopAgent({
      model,
      tools: executableTools,
      instructions: SYSTEM_PROMPT,
      // The browser eval path leaves this to the SDK's default. A simulation
      // runs one of these per turn and several turns per case, so an agent
      // that will not stop costs real money as well as time.
      stopWhen: stepCountIs(maxSteps),
      onStepFinish: (event: any) => {
        stepsHistory.push({
          text: event.text,
          reasoningText: event.reasoningText,
          toolCalls: event.toolCalls,
          toolResults: event.toolResults,
        });
      },
      // WebMCP tools belong to the page, so the set changes as the agent
      // navigates. Re-read them before every step rather than once per turn.
      prepareStep: async (options: any): Promise<any> => {
        const tools = await registry.getCurrentTools();
        rebuildTools(tools);
        availableToolsPerStep.push([...tools]);
        return options;
      },
    });

    const generated = await agent.generate({
      messages,
      ...(abortSignal ? { abortSignal } : {}),
    });

    const rawSteps = generated.steps?.length ? generated.steps : stepsHistory;
    const browserConsoleErrors = consoleErrors();

    return {
      text: generated.text || "",
      steps: asTrajectory(rawSteps),
      toolCalls: collectToolCalls(rawSteps),
      responseMessages: generated.response?.messages ?? [],
      ...(browserConsoleErrors?.length ? { browserConsoleErrors } : {}),
    };
  } catch (error) {
    const browserConsoleErrors = consoleErrors();

    return {
      text: "",
      steps: asTrajectory(stepsHistory),
      toolCalls: collectToolCalls(stepsHistory),
      responseMessages: [],
      ...(browserConsoleErrors?.length ? { browserConsoleErrors } : {}),
      error,
    };
  }
}
