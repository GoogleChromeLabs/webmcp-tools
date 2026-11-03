/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The browser-lifecycle counterpart of `executeInBrowserEvals`: for every
 * simulation and every run, open an isolated browser context, put the world into its starting
 * state, run either a direct message or simulated conversation, and check what
 * came of it.
 *
 * Result types live here rather than in `src/types/` because they carry a
 * `ConversationResult` from `src/simulate/`, and having the types directory
 * depend on implementation modules would point the dependency the wrong way.
 * `smokeEvaluator.ts` keeps `SmokeResults` locally for the same reason.
 */

import chalk from "chalk";
import { LanguageModel } from "ai";
import type { BrowserContext } from "puppeteer-core";
import { SimulationConfig } from "../types/config.js";
import { BrowserConsoleError, TrajectoryStep } from "../types/evals.js";
import type { ToolCall } from "../types/tools.js";
import { DomAssertion, LoadedSimulation, SimulationVerdict } from "../types/simulations.js";
import { ANALYZER_MODEL_DEFAULT } from "../analyzer/index.js";
import {
  AgentTurnInput,
  ConversationDependencies,
  ConversationRequest,
  ConversationResult,
  runConversation,
} from "../simulate/conversation.js";
import type { AgentTurnResult } from "../simulate/agentTurn.js";
import { judgeSimulation, JudgeRequest } from "../simulate/judge.js";
import { ToolCallOutcome, runToolCallSequence, withTimeout } from "../simulate/toolSequence.js";
import { DomAssertionResult, evaluateDomAssertions } from "../simulate/domAssertions.js";
import {
  Browser,
  BrowserPage,
  BrowserToolRegistry,
  launchBrowser,
  PUPPETEER_FLAGS,
} from "./browser.js";
import { DEFAULT_TIMEOUT_MS } from "./browserEvaluator.js";
import {
  type AgentExtensionController,
  connectExtensionController,
  describeExtensionBrowser,
  PageToolCallRecorder,
  runRecordedExtensionTurn,
} from "../extension/index.js";
import { getModel } from "./models.js";
import { logger } from "../utils/logger.js";

/** Wall-clock budget for one conversation when neither the case nor the CLI says. */
export const DEFAULT_MAX_DURATION_MS = 300_000;

/**
 * Cap on the agent's tool-calling steps within one turn. Matches
 * `VercelBackend`'s default: a turn of a simulated conversation is the same
 * unit of work as a whole browser eval.
 */
export const DEFAULT_MAX_STEPS = 6;

// Per-operation ceiling for `setup`, the initial page load, and the judge. It is
// defined once, in browserEvaluator.ts, because `browser --timeout` has the same default.
export { DEFAULT_TIMEOUT_MS };

export type SimulationResult = {
  simulation: LoadedSimulation;
  /** 1-based. */
  runIndex: number;
  /**
   * `error` is not a bad verdict, it is the absence of one: the run never got
   * far enough to be judged. Kept apart from `fail` so a broken page does not
   * read as a model that cannot shop.
   */
  outcome: "pass" | "fail" | "error";
  verdict?: SimulationVerdict;
  error?: string;
  /** Present whenever setup ran, including when it is what went wrong. */
  setupCalls?: ToolCallOutcome[];
  /** The trajectory the report expands into. Absent only if nothing was said. */
  conversation?: ConversationResult;
  /** Deterministic observations taken from the final page state. */
  assertionResults?: DomAssertionResult[];
  browserConsoleErrors?: BrowserConsoleError[];
};

export type SimulationResults = {
  results: SimulationResult[];
  simulationCount: number;
  passCount: number;
  failCount: number;
  errorCount: number;
  /** The extension the simulations ran against (`--extension` only). */
  extension?: { id: string; name: string };
};

/**
 * The same shape as `RunEvent`, with its own payload: `RunEvent`'s `progress`
 * is typed to `TestResult`, which describes one step of an asserted
 * trajectory and has nothing to say about a simulation.
 */
export type SimulationRunEvent =
  | { type: "start"; total: number; message: string }
  | { type: "progress"; simulationNumber: number; result: SimulationResult }
  | { type: "error"; message: string };

/** Everything the registry has to offer to drive setup and a conversation. */
export type SimulationRegistry = {
  getCurrentTools(): any;
  executeTool(name: string, args?: Record<string, unknown>): Promise<any>;
  executeToolChecked(
    name: string,
    args?: Record<string, unknown>,
  ): Promise<{ success: true; result: unknown } | { success: false; error: string }>;
  getBrowserConsoleErrors?(): BrowserConsoleError[];
};

export type SimulationModels = {
  agent: LanguageModel;
  user: LanguageModel;
  judge: LanguageModel;
};

export type SimulationActorModels = Pick<SimulationModels, "agent" | "user">;
type AvailableSimulationModels = Partial<SimulationModels>;

/**
 * Injection points for tests, following `SmokeDependencies`. `runConversation`
 * and `judgeSimulation` are replaceable so the lifecycle above them can be
 * exercised without a model or a key.
 */
export type SimulationDependencies = {
  launchBrowser?: () => Promise<Browser>;
  connectExtensionController?: () => Promise<AgentExtensionController>;
  createRegistry?: (page: BrowserPage) => SimulationRegistry;
  runConversation?: (request: ConversationRequest) => Promise<ConversationResult>;
  simulateUserTurn?: ConversationDependencies["simulateUserTurn"];
  judgeSimulation?: (
    request: JudgeRequest,
    model: LanguageModel,
    abortSignal: AbortSignal,
  ) => Promise<SimulationVerdict>;
  evaluateDomAssertions?: (
    page: BrowserPage,
    assertions: DomAssertion[],
  ) => Promise<DomAssertionResult[]>;
  models?: AvailableSimulationModels;
};

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * A `provider:` prefix on a model id names its own provider, so the global
 * `--provider` is dropped for it. Without this, `--provider openai` with a
 * `--judge-model google:...` would send the judge through the OpenAI client.
 */
function resolveOne(config: SimulationConfig, modelId: string): LanguageModel {
  const carriesProvider = /^(openai|anthropic|ollama|google):/.test(modelId);
  return getModel({
    model: modelId,
    ...(carriesProvider ? {} : { provider: config.provider }),
  });
}

export function resolveSimulationModels(config: SimulationConfig): SimulationModels;
export function resolveSimulationModels(
  config: SimulationConfig,
  options: { includeJudge: false; includeUser?: true },
): SimulationActorModels;
export function resolveSimulationModels(
  config: SimulationConfig,
  options: { includeJudge: false; includeUser: false },
): Pick<SimulationModels, "agent">;
export function resolveSimulationModels(
  config: SimulationConfig,
  options: { includeJudge?: true; includeUser: false },
): Pick<SimulationModels, "agent" | "judge">;
export function resolveSimulationModels(
  config: SimulationConfig,
  options: { includeJudge?: boolean; includeUser?: boolean },
): Pick<SimulationModels, "agent"> & Partial<Pick<SimulationModels, "user" | "judge">>;
export function resolveSimulationModels(
  config: SimulationConfig,
  options: { includeAgent?: boolean; includeJudge?: boolean; includeUser?: boolean },
): AvailableSimulationModels;
export function resolveSimulationModels(
  config: SimulationConfig,
  options: { includeAgent?: boolean; includeJudge?: boolean; includeUser?: boolean } = {},
): AvailableSimulationModels {
  return {
    ...(options.includeAgent === false ? {} : { agent: resolveOne(config, config.model) }),
    ...(options.includeUser === false
      ? {}
      : { user: resolveOne(config, config.userModel || config.model) }),
    ...(options.includeJudge === false
      ? {}
      : { judge: resolveOne(config, config.judgeModel || ANALYZER_MODEL_DEFAULT) }),
  };
}

/** `runConversation` always ends `messages` with the user's next message as plain text. */
function latestUserMessage(messages: AgentTurnInput["messages"]): string {
  const last = messages.at(-1);
  if (last?.role !== "user" || typeof last.content !== "string") {
    throw new Error("Expected the conversation to end with a user text message.");
  }
  return last.content;
}

/**
 * What an extension turn that the budget aborted had done by the time the
 * extension stopped. `runConversation` returns as soon as the budget runs out,
 * with only the calls seen at that moment.
 */
type SettledAbortedTurn = {
  userMessage: string;
  /** Whether `runConversation` recorded the turn from the calls seen at the abort. */
  recordedAtAbort: boolean;
  text: string;
  steps: TrajectoryStep[];
  toolCalls: ToolCall[];
};

/**
 * Runs the conversation's agent turns through a browser extension instead of
 * the built-in model loop.
 */
function createExtensionTurnRunner(
  controller: AgentExtensionController,
  recorder: PageToolCallRecorder,
  config: SimulationConfig,
): {
  runAgentTurn: (request: AgentTurnInput) => Promise<AgentTurnResult>;
  /**
   * Resolves once the last turn has settled, including stopping the extension
   * after an abort, with what an aborted turn did in the end.
   */
  waitForCleanup: () => Promise<SettledAbortedTurn | undefined>;
} {
  let inFlightTurn: Promise<unknown> | undefined;
  let settledAbortedTurn: SettledAbortedTurn | undefined;
  return {
    waitForCleanup: async () => {
      await inFlightTurn?.catch(() => undefined);
      return settledAbortedTurn;
    },
    runAgentTurn: async (turnRequest: AgentTurnInput): Promise<AgentTurnResult> => {
      const { abortSignal, onProgress } = turnRequest;
      const prompt = latestUserMessage(turnRequest.messages);
      let recordedAtAbort = false;
      // `runConversation` stops waiting as soon as its budget aborts the turn, so the
      // tool calls made so far have to be published right then.
      const publishPartialOnAbort = () => {
        const partial = recorder.snapshotTurn("");
        if (partial.toolCalls.length > 0) {
          recordedAtAbort = true;
          onProgress?.({ text: "", steps: partial.steps, toolCalls: partial.toolCalls });
        }
      };
      abortSignal?.addEventListener("abort", publishPartialOnAbort, { once: true });
      // Let `runConversation`'s `maxDurationMs` clock (`abortSignal`) govern the
      // overall turn budget, so an exhausted budget ends the conversation with
      // `endedBy: "timeout"` and the DOM assertions and the judge still run.
      const turnPromise = runRecordedExtensionTurn({
        controller,
        recorder,
        prompt,
        config,
        timeoutMs: Number.POSITIVE_INFINITY,
        signal: abortSignal,
      });
      inFlightTurn = turnPromise;
      try {
        const turn = await turnPromise;
        if (abortSignal?.aborted) {
          settledAbortedTurn = {
            userMessage: prompt,
            recordedAtAbort,
            text: turn.text,
            steps: turn.steps,
            toolCalls: turn.toolCalls,
          };
        }
        onProgress?.({ text: turn.text, steps: turn.steps, toolCalls: turn.toolCalls });
        return {
          text: turn.text,
          steps: turn.steps,
          toolCalls: turn.toolCalls,
          responseMessages: [{ role: "assistant", content: turn.text }],
          ...(turn.error ? { error: turn.error } : {}),
        };
      } catch (turnErr) {
        const flushed = recorder.flushTurn("");
        if (abortSignal?.aborted) {
          settledAbortedTurn = {
            userMessage: prompt,
            recordedAtAbort,
            text: "",
            steps: flushed.steps,
            toolCalls: flushed.toolCalls,
          };
        } else if (flushed.toolCalls.length > 0) {
          onProgress?.({ text: "", steps: flushed.steps, toolCalls: flushed.toolCalls });
        }
        throw turnErr;
      } finally {
        abortSignal?.removeEventListener("abort", publishPartialOnAbort);
      }
    },
  };
}

/**
 * Puts what an aborted extension turn did before the extension stopped into the
 * transcript, so the DOM assertions and the judge see the same work: calls that
 * finished or started after the abort, and the final results of calls that were
 * still running at that moment.
 */
function withSettledAbortedTurn(
  conversation: ConversationResult,
  settled: SettledAbortedTurn | undefined,
): ConversationResult {
  if (!settled || (settled.toolCalls.length === 0 && !settled.text)) return conversation;
  const turns = [...conversation.turns];
  const last = turns.at(-1);
  if (settled.recordedAtAbort && last) {
    turns[turns.length - 1] = {
      ...last,
      agentText: settled.text || last.agentText,
      steps: settled.steps,
      toolCalls: settled.toolCalls,
    };
  } else {
    turns.push({
      index: turns.length + 1,
      userMessage: settled.userMessage,
      agentText: settled.text,
      steps: settled.steps,
      toolCalls: settled.toolCalls,
    });
  }
  return { ...conversation, turns, turnsUsed: turns.length };
}

type SimulationTargetRuntime =
  | { kind: "bundled"; browser: Browser }
  | { kind: "extension"; controller: AgentExtensionController };

async function runOneSimulation(
  simulation: LoadedSimulation,
  runIndex: number,
  runtime: SimulationTargetRuntime,
  config: SimulationConfig,
  models: AvailableSimulationModels,
  dependencies: Required<Pick<SimulationDependencies, "createRegistry">> & SimulationDependencies,
): Promise<SimulationResult> {
  const judgeOf = dependencies.judgeSimulation || judgeSimulation;
  const evaluateAssertions = dependencies.evaluateDomAssertions || evaluateDomAssertions;
  const timeoutMs = config.timeoutMs || DEFAULT_TIMEOUT_MS;

  let context: BrowserContext | undefined;
  let registry: SimulationRegistry | undefined;
  let recorder: PageToolCallRecorder | undefined;
  let setupCalls: ToolCallOutcome[] | undefined;
  let conversation: ConversationResult | undefined;
  let assertionResults: DomAssertionResult[] | undefined;

  const consoleErrors = () => {
    const errors = [
      ...(registry?.getBrowserConsoleErrors?.() || []),
      ...(recorder?.getBrowserConsoleErrors() || []),
    ];
    return errors.length > 0 ? { browserConsoleErrors: errors } : {};
  };

  try {
    let page: BrowserPage;
    if (runtime.kind === "bundled") {
      // A new page alone shares cookies and origin storage with earlier runs.
      context = await runtime.browser.createBrowserContext();
      page = await context.newPage();
      if (config.verbose) {
        console.log(
          chalk.cyan(
            `\n[Simulate] Opening fresh page for "${simulation.name}" at ${config.url}...`,
          ),
        );
      }
      await page.goto(config.url, { waitUntil: "networkidle2", timeout: timeoutMs });
    } else {
      // Extensions do not run in incognito contexts, so each run gets a new tab in the
      // default context instead; `openWebApp` clears the site's data when it can.
      if (config.verbose) {
        console.log(
          chalk.cyan(
            `\n[Simulate] Preparing tab with extension "${runtime.controller.extensionName}" for "${simulation.name}" at ${config.url}...`,
          ),
        );
      }
      page = await runtime.controller.openWebApp(config.url, timeoutMs);
    }

    registry = dependencies.createRegistry(page);

    const tools = await registry.getCurrentTools();
    if (!tools || tools.length === 0) {
      const browserInfo =
        runtime.kind === "extension"
          ? `Browser="${describeExtensionBrowser(config)}"`
          : `Channel="${config.chromeChannel || "chrome-canary"}", Flags="${PUPPETEER_FLAGS.join(" ")}"`;
      return {
        simulation,
        runIndex,
        outcome: "error",
        error:
          `WebMCP tools are not available on ${config.url} (0 tools registered on page). ` +
          `Debug info: [URL="${config.url}", ${browserInfo}]`,
        ...consoleErrors(),
      };
    }

    if (simulation.setup?.length) {
      setupCalls = await runToolCallSequence(simulation.setup, registry, { timeoutMs });
      const broken = setupCalls.find((call) => call.outcome === "error");
      if (broken) {
        // No judge call. The world never reached the state the case was written
        // around, so there is no question left worth asking — and a judge
        // invocation on a run this broken is money spent on noise.
        return {
          simulation,
          runIndex,
          outcome: "error",
          setupCalls,
          error: `setup call ${broken.index} (${broken.functionName}) failed: ${broken.error}`,
          ...consoleErrors(),
        };
      }
    }

    let conversationInput:
      | { userMessage: string }
      | { userScenario: string; userModel: LanguageModel };
    if (simulation.userMessage !== undefined) {
      conversationInput = { userMessage: simulation.userMessage };
    } else {
      if (!models.user)
        throw new Error("the simulation requires a user model, but none is available");
      conversationInput = { userScenario: simulation.userScenario, userModel: models.user };
    }

    let extensionTurns: ReturnType<typeof createExtensionTurnRunner> | undefined;
    if (runtime.kind === "extension") {
      // Attach telemetry AFTER setup so setup tool calls are never credited to the agent.
      recorder = PageToolCallRecorder.attach(page);
      extensionTurns = createExtensionTurnRunner(runtime.controller, recorder, config);
    }
    const conversationDependencies: ConversationDependencies = {
      ...(extensionTurns ? { runAgentTurn: extensionTurns.runAgentTurn } : {}),
      ...(dependencies.simulateUserTurn ? { simulateUserTurn: dependencies.simulateUserTurn } : {}),
    };
    const conversationOf =
      dependencies.runConversation ||
      ((request: ConversationRequest) => runConversation(request, conversationDependencies));
    conversation = await conversationOf({
      ...conversationInput,
      maxTurns: simulation.maxTurns,
      maxDurationMs: simulation.maxDurationMs || config.maxDurationMs || DEFAULT_MAX_DURATION_MS,
      maxSteps: config.maxSteps || DEFAULT_MAX_STEPS,
      registry: registry as any,
      agentModel: models.agent,
    });
    // An expired budget returns before the extension has stopped. Wait for it before
    // reading the page, and keep what it did meanwhile in the transcript.
    if (extensionTurns) {
      conversation = withSettledAbortedTurn(conversation, await extensionTurns.waitForCleanup());
    }

    if (conversation.endedBy === "error") {
      // An exhausted budget still gets judged (ADR D6); a crash does not. The
      // transcript was cut off by something going wrong rather than by a limit
      // we chose, so what is missing from it is unknown, and a verdict read off
      // it would be a guess dressed as a result.
      return {
        simulation,
        runIndex,
        outcome: "error",
        ...(setupCalls ? { setupCalls } : {}),
        conversation,
        error: `the conversation broke off: ${messageOf(conversation.error)}`,
        ...consoleErrors(),
      };
    }

    if (simulation.assertions?.length) {
      assertionResults = await evaluateAssertions(page, simulation.assertions);
      const brokenAssertion = assertionResults.find((result) => result.outcome === "error");
      if (brokenAssertion) {
        return {
          simulation,
          runIndex,
          outcome: "error",
          ...(setupCalls ? { setupCalls } : {}),
          conversation,
          assertionResults,
          error: `DOM assertion for selector ${JSON.stringify(brokenAssertion.assertion.selector)} could not be evaluated: ${brokenAssertion.error}`,
          ...consoleErrors(),
        };
      }

      // Deterministic checks are a hard gate: an LLM judge may add a further
      // requirement, but it must never override a measured DOM mismatch.
      if (assertionResults.some((result) => result.outcome === "fail")) {
        return {
          simulation,
          runIndex,
          outcome: "fail",
          ...(setupCalls ? { setupCalls } : {}),
          conversation,
          assertionResults,
          ...consoleErrors(),
        };
      }

      if (!simulation.successCriteria) {
        return {
          simulation,
          runIndex,
          outcome: "pass",
          ...(setupCalls ? { setupCalls } : {}),
          conversation,
          assertionResults,
          ...consoleErrors(),
        };
      }
    }

    if (!simulation.successCriteria) {
      return {
        simulation,
        runIndex,
        outcome: "error",
        ...(setupCalls ? { setupCalls } : {}),
        conversation,
        error: "the simulation has neither DOM assertions nor LLM success criteria",
        ...consoleErrors(),
      };
    }

    if (!models.judge) {
      return {
        simulation,
        runIndex,
        outcome: "error",
        ...(setupCalls ? { setupCalls } : {}),
        conversation,
        ...(assertionResults ? { assertionResults } : {}),
        error: "the simulation defines LLM success criteria, but no judge model is available",
        ...consoleErrors(),
      };
    }

    const judgeController = new AbortController();
    let verdict: SimulationVerdict;
    try {
      verdict = await withTimeout(
        judgeOf(
          {
            successCriteria: simulation.successCriteria,
            conversation,
            ...(setupCalls ? { setupCalls } : {}),
          },
          models.judge,
          judgeController.signal,
        ),
        timeoutMs,
        "the judge",
      );
    } catch (error) {
      // Stop the provider request when the harness stops waiting for it. This
      // prevents a timed-out judge from continuing to consume tokens while the
      // next simulation is already running.
      judgeController.abort();
      throw error;
    }

    return {
      simulation,
      runIndex,
      outcome: verdict.passed ? "pass" : "fail",
      verdict,
      ...(assertionResults ? { assertionResults } : {}),
      ...(setupCalls ? { setupCalls } : {}),
      conversation,
      ...consoleErrors(),
    };
  } catch (error) {
    logger.warn(`Error running simulation "${simulation.name}":`, error);
    return {
      simulation,
      runIndex,
      outcome: "error",
      ...(setupCalls ? { setupCalls } : {}),
      ...(conversation ? { conversation } : {}),
      ...(assertionResults ? { assertionResults } : {}),
      error: messageOf(error),
      ...consoleErrors(),
    };
  } finally {
    recorder?.dispose();
    if (runtime.kind === "bundled") {
      // Also closes any additional pages opened by tools during the simulation.
      await context?.close();
    } else {
      await runtime.controller.closeCurrentWebApp();
    }
  }
}

export async function executeSimulations(
  simulations: LoadedSimulation[],
  config: SimulationConfig,
  onEvent?: (event: SimulationRunEvent) => void,
  dependencies: SimulationDependencies = {},
): Promise<SimulationResults> {
  if (simulations.length === 0) {
    throw new Error("Simulation file must contain at least one simulation.");
  }

  const runs = config.runs || 1;
  const needsJudge = simulations.some((simulation) => Boolean(simulation.successCriteria));
  const needsUser = simulations.some((simulation) => simulation.userScenario !== undefined);
  const models =
    dependencies.models ||
    resolveSimulationModels(config, {
      includeAgent: !config.extension,
      includeJudge: needsJudge,
      includeUser: needsUser,
    });
  const createRegistry =
    dependencies.createRegistry ||
    ((page: BrowserPage) => new BrowserToolRegistry(page) as SimulationRegistry);

  const results: SimulationResult[] = [];
  let runtime: SimulationTargetRuntime;
  if (config.extension) {
    const connect =
      dependencies.connectExtensionController || (() => connectExtensionController(config));
    runtime = { kind: "extension", controller: await connect() };
  } else {
    const openBrowser =
      dependencies.launchBrowser || (async () => await launchBrowser(config.chromeChannel));
    onEvent?.({
      type: "start",
      total: simulations.length * runs,
      message: `Running ${simulations.length} simulation(s) against ${config.url} (${runs} run(s))`,
    });
    runtime = { kind: "bundled", browser: await openBrowser() };
  }

  try {
    if (runtime.kind === "extension") {
      // Announced only once connected, because the message names the extension found.
      onEvent?.({
        type: "start",
        total: simulations.length * runs,
        message: `Running ${simulations.length} simulation(s) against ${config.url} with extension "${runtime.controller.extensionName}" (${runtime.controller.extensionId}) (${runs} run(s))`,
      });
    }
    for (let run = 1; run <= runs; run++) {
      for (const simulation of simulations) {
        const result = await runOneSimulation(simulation, run, runtime, config, models, {
          ...dependencies,
          createRegistry,
        });
        results.push(result);
        onEvent?.({ type: "progress", simulationNumber: results.length, result });
      }
    }
  } finally {
    if (runtime.kind === "extension") {
      await runtime.controller.dispose();
    } else {
      await runtime.browser.close();
    }
  }

  return {
    results,
    simulationCount: simulations.length,
    passCount: results.filter((result) => result.outcome === "pass").length,
    failCount: results.filter((result) => result.outcome === "fail").length,
    errorCount: results.filter((result) => result.outcome === "error").length,
    ...(runtime.kind === "extension"
      ? {
          extension: { id: runtime.controller.extensionId, name: runtime.controller.extensionName },
        }
      : {}),
  };
}
