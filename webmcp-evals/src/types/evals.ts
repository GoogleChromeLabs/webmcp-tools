/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Tool, ToolCall } from "./tools.js";

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
  // Optional: when specified, checks whether the actual tool execution result
  // matches this expected value or constraint.
  result?: unknown;
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

export interface TrajectoryStep {
  text?: string;
  reasoningText?: string;
  toolCalls?: any[];
  toolResults?: any[];
  availableTools?: Tool[];
}

export type BrowserConsoleError = {
  kind: "console" | "pageerror";
  message: string;
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
  toolCalls: Array<Pick<ToolCall, "functionName" | "args">>;
};

/**
 * One tool call the harness ran on the page itself, such as a simulation's
 * `setup` or a replayed `functioncall` step. Not the agent's work.
 */
export type ToolCallOutcome = {
  /** 1-based position in the sequence. */
  index: number;
  functionName: string;
  arguments: Record<string, unknown>;
  outcome: "pass" | "error";
  result?: unknown;
  /**
   * The bare reason, with no framing: the caller knows which case this call
   * belongs to and phrases the error for its own report.
   */
  error?: string;
};

/**
 * One agent-driven page tool invocation (built-in browser path).
 * `outcome` is protocol completion, not business success — `{ok:false}` may
 * still be `completed`. Missing measurements stay absent (never coerced to 0).
 */
export type AttemptedToolCallMetric = {
  /** Distinct per registry instance; two calls with the same tool name stay separate. */
  invocationId: string;
  functionName: string;
  arguments: Record<string, unknown>;
  outcome: "completed" | "error";
  /** Wall-clock ms for this attempt; omitted when unavailable. */
  durationMs?: number;
  error?: string;
};

/** Per case/run metrics. Independent of trajectory-step `passCount`. */
export type CaseRunMetrics = {
  /** Case wall-clock ms (not the sum of parallel tool durations). */
  durationMs?: number;
  toolAttempts: AttemptedToolCallMetric[];
  attempted: number;
  completed: number;
  errors: number;
};

export type TestResult = {
  test: Eval;
  response: ToolCall | null;
  outcome: "pass" | "fail" | "error";
  /** Why the case could not be evaluated, when `outcome` is `error`. */
  error?: string;
  /** Earlier `functioncall` steps replayed on the live page (`--extension` only). */
  setupCalls?: ToolCallOutcome[];
  trajectory?: TrajectoryStep[];
  browserConsoleErrors?: BrowserConsoleError[];
  runIndex?: number;
  stepIndex?: number;
  /**
   * Case/run metrics. Attached to every step row for the same run so JSON
   * consumers can read them without joining on stepIndex. Do not use
   * `passCount` as a case-success numerator when aggregating.
   */
  metrics?: CaseRunMetrics;
};

/** Rollup across cases (one entry per case/run, not per trajectory step). */
export type CaseMetricsSummary = {
  caseCount: number;
  casesWithDuration: number;
  /** Sum of known case durations only; null when no case reported duration. */
  totalDurationMs: number | null;
  attempted: number;
  completed: number;
  errors: number;
};

export type TestResults = {
  results: Array<TestResult>;
  testCount: number;
  passCount: number;
  errorCount: number;
  failCount: number;
  /** The extension the evals ran against (`--extension` only). */
  extension?: { id: string; name: string };
  /** Built-in browser metrics rollup; omitted when no case metrics were recorded. */
  caseMetricsSummary?: CaseMetricsSummary;
};
