/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Drives a fixed list of tool calls against a live page with no model in the
 * loop — the mechanism behind a simulation's `setup`.
 *
 * TODO(simulate): this duplicates the execution loop in
 * `evaluator/smokeEvaluator.ts`. The timeout wrapper, the tool-availability
 * poll, the payload-level failure check and the stop-at-first-error loop are
 * the same logic there, differing only in how errors are phrased and what
 * result shape comes back. The duplication is deliberate while simulations are
 * a proposal: `smoke` is the one deterministic, key-free signal in this repo
 * and is not worth destabilising for a type that may not ship. Once the
 * simulation type is accepted, collapse the two into one runner — smoke's
 * error strings are pinned by `smokeEvaluator.test.ts` and must survive the
 * merge unchanged.
 */

import { Tool } from "../types/tools.js";

// TODO(simulate): same value as `DEFAULT_SMOKE_TIMEOUT_MS`; single source of
// truth when the runners merge.
export const DEFAULT_TOOL_TIMEOUT_MS = 30_000;

/**
 * How long to keep re-reading the tool list after a tool turns up missing.
 * WebMCP tools are registered by the page, so one belonging to a view the
 * previous call navigated to may not exist at the instant we look.
 */
const TOOL_DISCOVERY_POLL_CAP_MS = 5_000;
const TOOL_DISCOVERY_POLL_INTERVAL_MS = 100;

export interface ToolSequenceRegistry {
  getCurrentTools(): Tool[] | Promise<Tool[]>;
  executeToolChecked(
    name: string,
    args?: Record<string, unknown>,
  ): Promise<{ success: true; result: unknown } | { success: false; error: string }>;
}

export type ToolCallRequest = {
  functionName: string;
  arguments: Record<string, unknown>;
};

export type ToolCallOutcome = {
  /** 1-based position in the sequence. */
  index: number;
  functionName: string;
  arguments: Record<string, unknown>;
  outcome: "pass" | "error";
  result?: unknown;
  /**
   * The bare reason, with no framing: the caller knows which simulation this
   * setup belongs to and phrases the error for its own report.
   */
  error?: string;
};

export type ToolSequenceOptions = {
  timeoutMs?: number;
  /** Called before a call is attempted, for live progress output. */
  onCallStart?: (index: number) => void;
  onCallPass?: (index: number, result: unknown) => void;
};

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  promise.catch(() => {}); // Prevent unhandled rejections if timeout occurs first
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${timeoutMs} ms.`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Detects a tool that answered successfully at the transport level while
 * reporting a failure in its payload. Without this, a page that responds
 * `{ success: false }` to every call still looks like a clean run.
 */
export function explicitToolFailure(result: unknown): string | undefined {
  if (typeof result === "string") {
    const trimmed = result.trim();
    if (/^error[:\s]/i.test(trimmed)) {
      return `tool reported failure: ${trimmed}`;
    }
    try {
      result = JSON.parse(result);
    } catch {
      return undefined;
    }
  }

  if (result === null || typeof result !== "object") return undefined;
  const response = result as Record<string, unknown>;
  if (
    response.success === false ||
    response.isError === true ||
    (response.error !== undefined && typeof response.error === "string")
  ) {
    const detail = response.error ?? response.message;
    return typeof detail === "string" && detail.trim()
      ? `tool reported failure: ${detail}`
      : `tool reported failure: ${JSON.stringify(result)}`;
  }
  return undefined;
}

async function waitForTool(
  registry: ToolSequenceRegistry,
  functionName: string,
  timeoutMs: number,
): Promise<boolean> {
  const hasTool = (tools: Tool[]) =>
    tools.some((candidate) => candidate.functionName === functionName);

  const tools = await withTimeout(
    Promise.resolve(registry.getCurrentTools()),
    timeoutMs,
    `tool discovery for "${functionName}"`,
  );
  if (hasTool(tools)) return true;

  const pollStart = Date.now();
  const pollCapMs = Math.min(timeoutMs, TOOL_DISCOVERY_POLL_CAP_MS);
  while (Date.now() - pollStart < pollCapMs) {
    await new Promise((resolve) => setTimeout(resolve, TOOL_DISCOVERY_POLL_INTERVAL_MS));
    if (hasTool(await registry.getCurrentTools())) return true;
  }
  return false;
}

/**
 * Stops at the first failure — a setup sequence describes one journey into a
 * starting state, and every later call was written assuming the earlier ones
 * succeeded.
 */
export async function runToolCallSequence(
  calls: ToolCallRequest[],
  registry: ToolSequenceRegistry,
  options: ToolSequenceOptions = {},
): Promise<ToolCallOutcome[]> {
  const timeoutMs = options.timeoutMs || DEFAULT_TOOL_TIMEOUT_MS;
  const outcomes: ToolCallOutcome[] = [];

  for (const [position, call] of calls.entries()) {
    const attempt = {
      index: position + 1,
      functionName: call.functionName,
      arguments: call.arguments,
    };

    try {
      options.onCallStart?.(attempt.index);

      if (!(await waitForTool(registry, call.functionName, timeoutMs))) {
        outcomes.push({
          ...attempt,
          outcome: "error",
          error: `tool "${call.functionName}" is not available.`,
        });
        break;
      }

      const executed = await withTimeout(
        registry.executeToolChecked(call.functionName, call.arguments),
        timeoutMs,
        `tool "${call.functionName}"`,
      );
      if (!executed.success) {
        outcomes.push({ ...attempt, outcome: "error", error: executed.error });
        break;
      }

      const reportedFailure = explicitToolFailure(executed.result);
      if (reportedFailure) {
        outcomes.push({ ...attempt, outcome: "error", error: reportedFailure });
        break;
      }

      options.onCallPass?.(attempt.index, executed.result);
      outcomes.push({ ...attempt, outcome: "pass", result: executed.result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      outcomes.push({ ...attempt, outcome: "error", error: message });
      break;
    }
  }

  return outcomes;
}
