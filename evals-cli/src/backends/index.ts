/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { WebmcpConfig } from "../types/config.js";
import { Eval, TestResult, TestResults } from "../types/evals.js";
import { Tool, ToolCall } from "../types/tools.js";

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

export interface Backend {
  executeLocalEvals(test: Eval): Promise<LocalEvalResult>;

  executeInBrowserEvals(
    tests: Array<Eval>,
    tools: Array<Tool>,
    config: WebmcpConfig,
    onEvent?: (event: RunEvent) => void,
  ): Promise<TestResults>;

  describe(): string;
}

export type RunEvent =
  | { type: "start"; total: number; message: string }
  | { type: "progress"; testNumber: number; result: TestResult }
  | { type: "completed"; results: TestResults; reportFile?: string }
  | { type: "error"; message: string };
