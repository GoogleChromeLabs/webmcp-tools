/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ChromeReleaseChannel } from "puppeteer-core";

export type Config = {
  toolSchemaFile: string;
  evalsFile: string;
  backend: string;
  provider?: string;
  model: string;
  debug?: boolean;
  runs?: number;
  // Upper bound on the local agent loop's step count. Fed to
  // `stopWhen: stepCountIs(maxSteps)` in `executeLocalEvals`. Larger values
  // let longer trajectories complete; smaller values cap runaway loops.
  // Ignored by `executeInBrowserEvals`.
  maxSteps?: number;
  outputDir?: string;
  reporter?: string[];
  chromeChannel?: ChromeReleaseChannel;
};

export type WebmcpConfig = {
  url: string;
  evalsFile: string;
  backend: string;
  provider?: string;
  model: string;
  debug?: boolean;
  runs?: number;
  maxSteps?: number;
  outputDir?: string;
  reporter?: string[];
  chromeChannel?: ChromeReleaseChannel;
};

/**
 * Configuration for the `simulate` command. Up to three models may be in play:
 * the agent under test, the optional simulated user, and the optional judge.
 */
export type SimulationConfig = {
  url: string;
  simulationsFile: string;
  provider?: string;
  /** The agent under test. Also the default for cases that use a simulated user. */
  model: string;
  /** Defaults to the analyzer's model, not to the agent's: a model should not
   * grade itself, and the judge's job is closer to the analyzer's than to the
   * agent's. */
  judgeModel?: string;
  /** Model used only by cases with `userScenario`. */
  userModel?: string;
  runs?: number;
  /** Cap on the agent's tool-calling steps within one turn. */
  maxSteps?: number;
  /**
   * Wall-clock budget applied to cases that do not state their own. A case's
   * `maxDurationMs` always wins. There is no CLI equivalent for `maxTurns`,
   * which is an optional case-specific limit for simulated-user conversations
   * and defaults to one turn when omitted. Direct-message cases are always
   * single-turn and cannot set it.
   */
  maxDurationMs?: number;
  /** Per-operation timeout for `setup`, page navigation, and the LLM judge. */
  timeoutMs?: number;
  debug?: boolean;
  verbose?: boolean;
  outputDir?: string;
  reporter?: string[];
  chromeChannel?: ChromeReleaseChannel;
};
