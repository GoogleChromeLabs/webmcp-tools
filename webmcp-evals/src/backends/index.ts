/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BrowserConsoleError,
  Eval,
  TestResult,
  TestResults,
  TrajectoryStep,
} from "../types/evals.js";
import { ToolCall } from "../types/tools.js";
import { ToolRegistry } from "../evaluator/toolRegistry.js";

export type { BrowserPage } from "../evaluator/browser.js";

/**
 * Result of running a single test through the local (non-browser) path.
 *
 * `toolCalls` is the full trajectory of tool invocations the model made
 * across all agent-loop steps — in order — not just the first one. An
 * empty array means the model responded with text and no tool calls.
 *
 * `text` is the model's final natural-language response, if any.
 */
export type LocalEvalResult = {
  toolCalls: ToolCall[];
  text?: string;
};

export type BrowserEvalResult = {
  toolCalls: ToolCall[];
  text?: string;
  steps?: TrajectoryStep[];
  browserConsoleErrors?: BrowserConsoleError[];
  error?: any;
};

export interface Backend {
  executeLocalEvals(test: Eval, registry: ToolRegistry): Promise<LocalEvalResult>;

  executeInBrowserEval(test: Eval, registry: ToolRegistry): Promise<BrowserEvalResult>;

  describe(): string;
}

export type RunEvent =
  | { type: "start"; total: number; message: string }
  | { type: "progress"; testCaseNumber: number; result: TestResult }
  | { type: "completed"; results: TestResults; reportFile?: string }
  | { type: "error"; message: string };

export { createBackend } from "./factory.js";
