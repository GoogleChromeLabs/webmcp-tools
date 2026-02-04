/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ToolCall } from "./tools.js";

export type Message =
  | ContentMessage
  | FunctionCallMessage
  | FunctionResponseMessage;

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

export type Eval = {
  messages: [Message];
  expectedCall: FunctionCall | null;
};

export type FunctionCall = {
  functionName: string;
  arguments: object;
};

export type TestResult = {
  test: Eval;
  response: ToolCall | null;
  outcome: "pass" | "fail" | "error";
};

export type TestResults = {
  results: Array<TestResult>;
  testCount: number;
  passCount: number;
  errorCount: number;
  failCount: number;
};
