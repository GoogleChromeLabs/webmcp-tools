/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { WebmcpConfig } from "../types/config.js";
import { Eval, TestResult, TestResults } from "../types/evals.js";
import { Tool } from "../types/tools.js";

export interface Backend {
  executeLocalEvals(test: Eval): Promise<any>;

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
