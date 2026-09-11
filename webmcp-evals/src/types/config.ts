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
 * Configuration for the `simulate` command. Three models are in play at once —
 * the agent under test, the simulated user, and the judge — so unlike
 * `WebmcpConfig` a single `model` field cannot carry them all.
 */
export type SimulationConfig = {
  url: string;
  simulationsFile: string;
  provider?: string;
  /** The agent under test. Also the default for the simulated user. */
  model: string;
  /** Defaults to the analyzer's model, not to the agent's: a model should not
   * grade itself, and the judge's job is closer to the analyzer's than to the
   * agent's. */
  judgeModel?: string;
  userModel?: string;
  runs?: number;
  /** Cap on the agent's tool-calling steps within one turn. */
  maxSteps?: number;
  /**
   * Wall-clock budget applied to cases that do not state their own. A case's
   * `maxDurationMs` always wins. There is no CLI equivalent for `maxTurns`,
   * which every case must state for itself: it is the one budget that changes
   * what a case measures, so it belongs with the case rather than with whoever
   * happens to be running it.
   */
  maxDurationMs?: number;
  /** Per-tool-call timeout for `setup`, and for page navigation. */
  timeoutMs?: number;
  debug?: boolean;
  verbose?: boolean;
  outputDir?: string;
  reporter?: string[];
  chromeChannel?: ChromeReleaseChannel;
};
