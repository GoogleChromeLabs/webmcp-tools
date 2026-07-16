/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ToolCall } from "./tools.js";

export type Message = ContentMessage | FunctionCallMessage | FunctionResponseMessage;

export type ContentMessage = {
  role: "user" | "model";
  type: "message";
  content: string;
};

export type FunctionCallMessage = {
  role: "model";
  type: "functioncall";
  name: string;
  arguments: object;
};

export type FunctionResponseMessage = {
  role: "user";
  type: "functionresponse";
  name: string;
  response: object;
};

export type ExpectedCallNode =
  | FunctionCall
  | { unordered: ExpectedCallNode[] }
  | { ordered: ExpectedCallNode[] };

export type Eval = {
  name?: string;
  messages: Message[];
  expectedCall: ExpectedCallNode[] | null;
};

export type FunctionCall = {
  functionName: string;
  // Optional: when omitted (or explicitly null), the eval imposes no
  // constraint on the tool call's arguments — any actual args are accepted.
  arguments?: object | null;
  // Optional: mock output returned to the model when it invokes this tool
  // during a local (non-browser) multi-step trajectory. When omitted, an
  // empty object `{}` is returned. Only consulted by `executeLocalEvals` —
  // browser evals always use real tool results.
  mockOutput?: unknown;
  // When true, this call is not required for the trajectory to pass.
  // Useful for tool calls some models make and others don't (e.g. an
  // eager model calling `get_current_results` for a summary between
  // steps). A skipped optional contributes no PASS, no FAIL, and no
  // consumed actual — it's simply omitted from the reconciliation.
  // If the model does make the call, it matches normally.
  optional?: boolean;
};

export type TestResult = {
  test: Eval;
  response: ToolCall | null;
  outcome: "pass" | "fail" | "error";
  trajectory?: any[];
  runIndex?: number;
  stepIndex?: number;
};


export type TestResults = {
  results: Array<TestResult>;
  testCount: number;
  passCount: number;
  errorCount: number;
  failCount: number;
};
