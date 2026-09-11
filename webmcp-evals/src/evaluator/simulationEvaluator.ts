/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The browser-lifecycle counterpart of `executeInBrowserEvals`: for every
 * simulation and every run, open a fresh page, put the world into its starting
 * state, let a simulated user and the agent talk, and have a judge weigh what
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
import { LoadedSimulation, SimulationVerdict } from "../types/simulations.js";
import { ANALYZER_MODEL_DEFAULT } from "../analyzer/index.js";
import {
  ConversationRequest,
  ConversationResult,
  runConversation,
} from "../simulate/conversation.js";
import { judgeSimulation, JudgeRequest } from "../simulate/judge.js";
import { ToolCallOutcome, runToolCallSequence } from "../simulate/toolSequence.js";
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

/** Per-tool-call ceiling for `setup`, and for the initial page load. */
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

/**
 * Injection points for tests, following `SmokeDependencies`. `runConversation`
 * and `judgeSimulation` are replaceable so the lifecycle above them can be
 * exercised without a model or a key.
 */
export type SimulationDependencies = {
  launchBrowser?: () => Promise<Browser>;
  createRegistry?: (page: BrowserPage) => SimulationRegistry;
  runConversation?: (request: ConversationRequest) => Promise<ConversationResult>;
  judgeSimulation?: (request: JudgeRequest, model: LanguageModel) => Promise<SimulationVerdict>;
  models?: SimulationModels;
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

export function resolveSimulationModels(config: SimulationConfig): SimulationModels {
  return {
    agent: resolveOne(config, config.model),
    user: resolveOne(config, config.userModel || config.model),
    judge: resolveOne(config, config.judgeModel || ANALYZER_MODEL_DEFAULT),
  };
}

async function runOneSimulation(
  simulation: LoadedSimulation,
  runIndex: number,
  browser: Browser,
  config: SimulationConfig,
  models: SimulationModels,
  dependencies: Required<Pick<SimulationDependencies, "createRegistry">> & SimulationDependencies,
): Promise<SimulationResult> {
  const conversationOf = dependencies.runConversation || runConversation;
  const judgeOf = dependencies.judgeSimulation || judgeSimulation;
  const timeoutMs = config.timeoutMs || DEFAULT_TIMEOUT_MS;

  const page = await browser.newPage();
  let registry: SimulationRegistry | undefined;

  const consoleErrors = () => {
    const errors = registry?.getBrowserConsoleErrors?.() || [];
    return errors.length > 0 ? { browserConsoleErrors: errors } : {};
  };

  try {
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

    let setupCalls: ToolCallOutcome[] | undefined;
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

    const conversation = await conversationOf({
      userScenario: simulation.userScenario,
      maxTurns: simulation.maxTurns,
      maxDurationMs: simulation.maxDurationMs || config.maxDurationMs || DEFAULT_MAX_DURATION_MS,
      maxSteps: config.maxSteps || DEFAULT_MAX_STEPS,
      registry: registry as any,
      agentModel: models.agent,
      userModel: models.user,
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

    const verdict = await judgeOf(
      {
        successCriteria: simulation.successCriteria,
        conversation,
        ...(setupCalls ? { setupCalls } : {}),
      },
      models.judge,
    );

    return {
      simulation,
      runIndex,
      outcome: verdict.passed ? "pass" : "fail",
      verdict,
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
      error: messageOf(error),
      ...consoleErrors(),
    };
  } finally {
    await page.close();
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
  const models = dependencies.models || resolveSimulationModels(config);
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
