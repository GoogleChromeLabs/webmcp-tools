/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `browser --extension`: runs the same `evals.json` cases as
 * `executeInBrowserEvals`, but a Chrome extension is the agent. Its tool calls
 * are recorded on the web page instead of coming back from a model.
 */

import chalk from "chalk";
import type { RunEvent } from "../backends/index.js";
import {
  type AgentExtensionController,
  connectExtensionController,
  DEFAULT_TURN_TIMEOUT_MS,
  describeExtensionBrowser,
  PageToolCallRecorder,
  runRecordedExtensionTurn,
} from "../extension/index.js";
import {
  explicitToolFailure,
  runToolCallSequence,
  TimeoutError,
  type ToolCallOutcome,
  type ToolCallRequest,
  type ToolSequenceRegistry,
} from "../simulate/toolSequence.js";
import type { WebmcpConfig } from "../types/config.js";
import type {
  BrowserConsoleError,
  Eval,
  Message,
  TestResult,
  TestResults,
  TrajectoryStep,
} from "../types/evals.js";
import { logger } from "../utils/logger.js";
import { type BrowserPage, BrowserToolRegistry } from "./browser.js";
import { buildTestResults, DEFAULT_TIMEOUT_MS } from "./browserEvaluator.js";

type ExtensionBrowserRegistry = ToolSequenceRegistry & {
  getBrowserConsoleErrors?(): BrowserConsoleError[];
};

/** Injection points for tests, so a run needs no Chrome. */
type ExtensionBrowserEvalDependencies = {
  connectExtensionController?: () => Promise<AgentExtensionController>;
  createRegistry?: (page: BrowserPage) => ExtensionBrowserRegistry;
};

function isHistoricalFunctionResponseError(response: unknown): boolean {
  if (explicitToolFailure(response)) return true;
  if (response && typeof response === "object" && "result" in response) {
    return Boolean(explicitToolFailure((response as Record<string, unknown>).result));
  }
  return false;
}

/**
 * Sent as the current user message when a case's history does not end with a
 * user message (for example, when it ends with a tool response).
 */
export const CONTINUE_PROMPT =
  "Continue and complete the user's request based on the tool result above.";

/**
 * The earlier `functioncall` steps to replay on the live page, in order. Each
 * `functionresponse` answers the oldest unanswered call to the same tool (first
 * in, first out), so parallel calls to one tool get their own responses. A call
 * whose recorded response was an error (for example in a validation-error
 * recovery case) is not replayed; it only appears in the prompt context.
 */
function setupCallsToReplay(messages: readonly Message[]): ToolCallRequest[] {
  const calls: Array<{ request: ToolCallRequest; failed: boolean }> = [];
  const unanswered = new Map<string, number[]>();
  for (const msg of messages) {
    if (msg.type === "functioncall") {
      const queue = unanswered.get(msg.name) ?? [];
      queue.push(calls.length);
      unanswered.set(msg.name, queue);
      calls.push({
        request: {
          functionName: msg.name,
          arguments: (msg.arguments as Record<string, unknown>) || {},
        },
        failed: false,
      });
    } else if (msg.type === "functionresponse") {
      const index = unanswered.get(msg.name)?.shift();
      if (index !== undefined && isHistoricalFunctionResponseError(msg.response)) {
        calls[index].failed = true;
      }
    }
  }
  return calls.filter((call) => !call.failed).map((call) => call.request);
}

function contextLine(msg: Message): string {
  if (msg.type === "functioncall") {
    return `Assistant called ${msg.name}(${JSON.stringify(msg.arguments)})`;
  }
  if (msg.type === "functionresponse") {
    return `Tool ${msg.name} returned ${JSON.stringify(msg.response)}`;
  }
  return `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`;
}

/**
 * Turns an `evals.json` message array into what an extension run needs: the
 * earlier `functioncall` steps to replay on the live page, and the one prompt to
 * send. The built-in agent gets the whole history in one request; an extension
 * keeps its own chat, so earlier messages travel inside the prompt as context.
 * `prompt` is `null` when the case has nothing to send.
 */
export function prepareExtensionEvalPrompt(messages: readonly Message[]): {
  setupCalls: ToolCallRequest[];
  prompt: string | null;
} {
  const sendable = messages.filter((m) => m.type !== "message" || m.content.trim().length > 0);
  const last = sendable.at(-1);
  if (!last) return { setupCalls: [], prompt: null };

  const endsWithUserMessage = last.type === "message" && last.role === "user";
  if (sendable.length === 1 && endsWithUserMessage) {
    return { setupCalls: [], prompt: last.content.trim() };
  }

  const prior = endsWithUserMessage ? sendable.slice(0, -1) : sendable;
  const currentMessage = endsWithUserMessage ? last.content.trim() : CONTINUE_PROMPT;
  return {
    setupCalls: setupCallsToReplay(sendable),
    prompt:
      prior.length > 0
        ? `[Prior conversation context]\n${prior.map(contextLine).join("\n")}\n\n[Current user message]\n${currentMessage}`
        : currentMessage,
  };
}

export async function executeExtensionBrowserEvals(
  tests: Array<Eval>,
  config: WebmcpConfig,
  onEvent?: (event: RunEvent) => void,
  dependencies: ExtensionBrowserEvalDependencies = {},
): Promise<TestResults> {
  if (!config.extension) {
    throw new Error("executeExtensionBrowserEvals requires `config.extension` to be set.");
  }

  const runs = config.runs || 1;
  const connect =
    dependencies.connectExtensionController || (() => connectExtensionController(config));
  const createRegistry =
    dependencies.createRegistry || ((page: BrowserPage) => new BrowserToolRegistry(page));

  const controller = await connect();
  try {
    onEvent?.({
      type: "start",
      total: tests.length * runs,
      message: `Running evals against extension "${controller.extensionName}" (${controller.extensionId}) (${runs} runs)`,
    });

    let testCount = 0;
    const results: TestResult[] = [];
    for (let run = 1; run <= runs; run++) {
      for (const test of tests) {
        testCount++;
        for (const result of await runSingleExtensionBrowserTest(
          test,
          controller,
          config,
          run,
          createRegistry,
        )) {
          results.push(result);
          onEvent?.({ type: "progress", testCaseNumber: testCount, result });
        }
      }
    }

    return {
      results,
      testCount,
      passCount: results.filter((result) => result.outcome === "pass").length,
      failCount: results.filter((result) => result.outcome === "fail").length,
      errorCount: results.filter((result) => result.outcome === "error").length,
      extension: { id: controller.extensionId, name: controller.extensionName },
    };
  } finally {
    await controller.dispose();
  }
}

async function runSingleExtensionBrowserTest(
  test: Eval,
  controller: AgentExtensionController,
  config: WebmcpConfig,
  runIndex: number,
  createRegistry: (page: BrowserPage) => ExtensionBrowserRegistry,
): Promise<TestResult[]> {
  let registry: ExtensionBrowserRegistry | undefined;
  let recorder: PageToolCallRecorder | undefined;
  let setupCalls: ToolCallOutcome[] | undefined;
  const trajectory: TrajectoryStep[] = [];
  const stepTimeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const turnTimeoutMs = config.turnTimeoutMs ?? DEFAULT_TURN_TIMEOUT_MS;
  const consoleErrors = (): BrowserConsoleError[] => [
    ...(registry?.getBrowserConsoleErrors?.() || []),
    ...(recorder?.getBrowserConsoleErrors() || []),
  ];

  try {
    const prepared = prepareExtensionEvalPrompt(test.messages);
    const prompt = prepared.prompt;
    if (prompt === null) {
      throw new Error("The case has no message to send to the extension.");
    }

    if (config.verbose) {
      console.log(
        chalk.cyan(
          `\n[Browser] Preparing tab with extension "${controller.extensionName}" for "${test.name || "eval"}" at ${config.url}...`,
        ),
      );
    }

    const page = await controller.openWebApp(config.url, stepTimeoutMs);

    registry = createRegistry(page);
    const currentTools = await registry.getCurrentTools();
    if (!currentTools || currentTools.length === 0) {
      throw new Error(
        `WebMCP tools are not available on ${config.url} (0 tools registered on page). ` +
          `Debug info: [URL="${config.url}", Browser="${describeExtensionBrowser(config)}"]`,
      );
    }

    if (prepared.setupCalls.length > 0) {
      setupCalls = await runToolCallSequence(prepared.setupCalls, registry, {
        timeoutMs: stepTimeoutMs,
        ...(config.verbose
          ? {
              onCallStart: (index: number) => {
                const call = prepared.setupCalls[index - 1];
                console.log(
                  chalk.dim(
                    `  [Setup] Running ${call.functionName}(${JSON.stringify(call.arguments)})`,
                  ),
                );
              },
            }
          : {}),
      });
      const failed = setupCalls.find((call) => call.outcome === "error");
      if (failed) {
        throw new Error(
          `setup call ${failed.index} (${failed.functionName}) failed: ${failed.error}`,
        );
      }
    }

    recorder = PageToolCallRecorder.attach(page);
    const turn = await runRecordedExtensionTurn({
      controller,
      recorder,
      prompt,
      config,
      timeoutMs: turnTimeoutMs,
    });
    trajectory.push(...turn.steps);
    if (turn.error) {
      throw turn.error;
    }

    const results = buildTestResults(
      test,
      turn.toolCalls,
      { text: turn.text },
      trajectory,
      runIndex,
      consoleErrors(),
    );
    if (setupCalls && results[0]) {
      results[0] = { ...results[0], setupCalls };
    }
    return results;
  } catch (e: unknown) {
    logger.warn("Error running extension browser test:", e);
    // Keep whatever the agent did before the failure (e.g. a turn that timed out).
    if (recorder) {
      trajectory.push(...recorder.flushTurn("").steps);
    }
    const message = e instanceof Error ? e.message : String(e);
    const browserConsoleErrors = consoleErrors();
    return [
      {
        test,
        response: null,
        outcome: "error",
        // Only the extension turn can time out here: setup calls report their own errors.
        error:
          e instanceof TimeoutError
            ? `${message} Raise --turn-timeout to allow longer turns.`
            : message,
        ...(setupCalls ? { setupCalls } : {}),
        ...(trajectory.length > 0 ? { trajectory } : {}),
        runIndex,
        stepIndex: 1,
        ...(browserConsoleErrors.length > 0 ? { browserConsoleErrors } : {}),
      },
    ];
  } finally {
    recorder?.dispose();
    await controller.closeCurrentWebApp();
  }
}
