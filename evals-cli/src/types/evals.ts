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
  arguments: Record<string, unknown>;
};

export type FunctionResponseMessage = {
  role: "user";
  type: "functionresponse";
  name: string;
  response: Record<string, unknown>;
};

export type ExpectedCallNode =
  | FunctionCall
  | { unordered: ExpectedCallNode[] }
  | { ordered: ExpectedCallNode[] };

export type Eval = {
  messages: Message[];
  expectedCall: ExpectedCallNode[] | null;
};

export type FunctionCall = {
  functionName: string;
  arguments: Record<string, unknown>;
};

export type TestResult = {
  test: Eval;
  response: ToolCall | null;
  outcome: "pass" | "fail" | "error";
  trajectory?: unknown[];
};

export type TestResults = {
  results: Array<TestResult>;
  testCount: number;
  passCount: number;
  errorCount: number;
  failCount: number;
};
