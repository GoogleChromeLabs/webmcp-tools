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

export type ConfirmPolicy = "allow-once" | "always-allow" | "deny" | "none";

/**
 * Shared options for evaluating a website's WebMCP tools against an external
 * Chrome MV3 agent extension (`--extension`) instead of the built-in Node.js
 * agent in `browser` and `simulate` commands.
 */
export type ExtensionConfigOptions = {
  /**
   * Installed extension identifier (32-char Chrome extension ID or manifest
   * `name`) or path to an unpacked extension directory containing `manifest.json`.
   */
  extension?: string;
  /**
   * Remote debugging HTTP URL or WebSocket endpoint of an already-running
   * Chrome instance (e.g. `http://127.0.0.1:9222`). Leaves the browser open on exit.
   */
  browserUrl?: string;
  /**
   * Persistent Chrome profile directory where the extension is already
   * installed and configured.
   */
  userDataDir?: string;
  /**
   * Explicit headless override when launching Chrome. When omitted in extension
   * mode, launches headed if a GUI display is available and headless otherwise.
   */
  headless?: boolean;
  /**
   * Relative HTML path of the extension's side panel or UI page inside
   * `chrome-extension://<id>/` (defaults to manifest `side_panel.default_path`,
   * then `sidepanel/index.html`).
   */
  extensionPanelPath?: string;
  /**
   * Policy for tool confirmation prompts surfaced in the extension UI
   * (`allow-once` by default).
   */
  confirmPolicy?: ConfirmPolicy;
};

export type WebmcpConfig = ExtensionConfigOptions & {
  url: string;
  evalsFile: string;
  backend: string;
  provider?: string;
  model: string;
  debug?: boolean;
  runs?: number;
  maxSteps?: number;
  /** Timeout for each page navigation, extension panel readiness wait, and setup tool call. */
  timeoutMs?: number;
  /** Maximum time to wait for the extension to finish one turn (`--extension` only). */
  turnTimeoutMs?: number;
  verbose?: boolean;
  outputDir?: string;
  reporter?: string[];
  chromeChannel?: ChromeReleaseChannel;
};

/**
 * Configuration for the `simulate` command. Up to three models may be in play:
 * the built-in agent driving the page's WebMCP tools (unless `--extension`
 * delegates agent turns to a Chrome extension), the optional simulated user,
 * and the optional judge.
 */
export type SimulationConfig = ExtensionConfigOptions & {
  url: string;
  simulationsFile: string;
  provider?: string;
  /** Model for the built-in agent. Also the default for cases that use a simulated user. */
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
  /** Per-operation timeout for `setup`, page navigation, extension panel readiness, and the LLM judge. */
  timeoutMs?: number;
  debug?: boolean;
  verbose?: boolean;
  outputDir?: string;
  reporter?: string[];
  chromeChannel?: ChromeReleaseChannel;
};
