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
 * `ConversationResult` and `ToolCallOutcome`s from `src/simulate/`, and having
 * the types directory depend on implementation modules would point the
 * dependency the wrong way. `smokeEvaluator.ts` keeps `SmokeResults` locally
 * for the same reason.
 */

import chalk from "chalk";
import { LanguageModel } from "ai";
import { SimulationConfig } from "../types/config.js";
import { BrowserConsoleError } from "../types/evals.js";
import { DomAssertion, LoadedSimulation, SimulationVerdict } from "../types/simulations.js";
import { ANALYZER_MODEL_DEFAULT } from "../analyzer/index.js";
import {
  ConversationRequest,
  ConversationResult,
  runConversation,
} from "../simulate/conversation.js";
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

/** Per-operation ceiling for `setup`, the initial page load, and the judge. */
export const DEFAULT_TIMEOUT_MS = 30_000;

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
type AvailableSimulationModels = Pick<SimulationModels, "agent"> &
  Partial<Pick<SimulationModels, "user" | "judge">>;

/**
 * Injection points for tests, following `SmokeDependencies`. `runConversation`
 * and `judgeSimulation` are replaceable so the lifecycle above them can be
 * exercised without a model or a key.
 */
export type SimulationDependencies = {
  launchBrowser?: () => Promise<Browser>;
  createRegistry?: (page: BrowserPage) => SimulationRegistry;
  runConversation?: (request: ConversationRequest) => Promise<ConversationResult>;
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
): AvailableSimulationModels;
export function resolveSimulationModels(
  config: SimulationConfig,
  options: { includeJudge?: boolean; includeUser?: boolean } = {},
): AvailableSimulationModels {
  return {
    agent: resolveOne(config, config.model),
    ...(options.includeUser === false
      ? {}
      : { user: resolveOne(config, config.userModel || config.model) }),
    ...(options.includeJudge === false
      ? {}
      : { judge: resolveOne(config, config.judgeModel || ANALYZER_MODEL_DEFAULT) }),
  };
}

async function runOneSimulation(
  simulation: LoadedSimulation,
  runIndex: number,
  browser: Browser,
  config: SimulationConfig,
  models: AvailableSimulationModels,
  dependencies: Required<Pick<SimulationDependencies, "createRegistry">> & SimulationDependencies,
): Promise<SimulationResult> {
  const conversationOf = dependencies.runConversation || runConversation;
  const judgeOf = dependencies.judgeSimulation || judgeSimulation;
  const evaluateAssertions = dependencies.evaluateDomAssertions || evaluateDomAssertions;
  const timeoutMs = config.timeoutMs || DEFAULT_TIMEOUT_MS;

  // A new page alone shares cookies and origin storage with earlier runs.
  const context = await browser.createBrowserContext();
  let registry: SimulationRegistry | undefined;
  let setupCalls: ToolCallOutcome[] | undefined;
  let conversation: ConversationResult | undefined;
  let assertionResults: DomAssertionResult[] | undefined;

  const consoleErrors = () => {
    const errors = registry?.getBrowserConsoleErrors?.() || [];
    return errors.length > 0 ? { browserConsoleErrors: errors } : {};
  };

  try {
    const page = await context.newPage();
    if (config.verbose) {
      console.log(
        chalk.cyan(`\n[Simulate] Opening fresh page for "${simulation.name}" at ${config.url}...`),
      );
    }
    await page.goto(config.url, { waitUntil: "networkidle2", timeout: timeoutMs });
    registry = dependencies.createRegistry(page);

    const tools = await registry.getCurrentTools();
    if (!tools || tools.length === 0) {
      return {
        simulation,
        runIndex,
        outcome: "error",
        error:
          `WebMCP tools are not available on ${config.url} (0 tools registered on page). ` +
          `Debug info: [URL="${config.url}", Channel="${config.chromeChannel || "chrome-canary"}", Flags="${PUPPETEER_FLAGS.join(" ")}"]`,
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
    conversation = await conversationOf({
      ...conversationInput,
      maxTurns: simulation.maxTurns,
      maxDurationMs: simulation.maxDurationMs || config.maxDurationMs || DEFAULT_MAX_DURATION_MS,
      maxSteps: config.maxSteps || DEFAULT_MAX_STEPS,
      registry: registry as any,
      agentModel: models.agent,
    });

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
    // Also closes any additional pages opened by tools during the simulation.
    await context.close();
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
    resolveSimulationModels(config, { includeJudge: needsJudge, includeUser: needsUser });
  const openBrowser =
    dependencies.launchBrowser || (async () => await launchBrowser(config.chromeChannel));
  const createRegistry =
    dependencies.createRegistry ||
    ((page: BrowserPage) => new BrowserToolRegistry(page) as SimulationRegistry);

  onEvent?.({
    type: "start",
    total: simulations.length * runs,
    message: `Running ${simulations.length} simulation(s) against ${config.url} (${runs} run(s))`,
  });

  const results: SimulationResult[] = [];
  const browser = await openBrowser();
  try {
    for (let run = 1; run <= runs; run++) {
      for (const simulation of simulations) {
        const result = await runOneSimulation(simulation, run, browser, config, models, {
          ...dependencies,
          createRegistry,
        });
        results.push(result);
        onEvent?.({ type: "progress", simulationNumber: results.length, result });
      }
    }
  } finally {
    await browser.close();
  }

  return {
    results,
    simulationCount: simulations.length,
    passCount: results.filter((result) => result.outcome === "pass").length,
    failCount: results.filter((result) => result.outcome === "fail").length,
    errorCount: results.filter((result) => result.outcome === "error").length,
  };
}
