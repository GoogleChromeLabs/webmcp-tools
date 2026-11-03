/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ConsoleMessage, Page, WebMCPToolCall, WebMCPToolCallResult } from "puppeteer-core";
import type { BrowserConsoleError, TrajectoryStep } from "../types/evals.js";
import type { Tool, ToolCall } from "../types/tools.js";
import {
  consoleErrorFromMessage,
  interpretToolResponse,
  PENDING_FORM_RESULT,
} from "../evaluator/browser.js";
import { mapRawBrowserToolsToConfig } from "../evaluator/mappers.js";
import { logger } from "../utils/logger.js";

interface RecordedInvocation {
  readonly id: string;
  readonly functionName: string;
  readonly args: Record<string, unknown>;
  readonly availableTools: Tool[];
  status: "pending" | "completed" | "error";
  result?: unknown;
  /** Whether the tool is a declarative `<form toolname>` tool; `undefined` until known. */
  isFormTool?: boolean;
}

/** Result reported for any other tool that had not answered when the turn ended. */
const PENDING_CALL_RESULT = "pending (no response before the turn ended)";

/**
 * Normalizes a Puppeteer `page.webmcp` `toolresponded` payload with the same code
 * as `BrowserToolRegistry` (`interpretToolResponse`), so `evals.json` result matchers
 * and simulation judges see the same tool outputs with the built-in agent and with
 * `--extension`.
 */
export function normalizeWebMcpResult(
  functionName: string,
  response: Pick<WebMCPToolCallResult, "status" | "output" | "errorText">,
): unknown {
  const outcome = interpretToolResponse(functionName, response);
  if (!outcome.success) return { error: outcome.error };
  return outcome.result !== undefined ? outcome.result : "Success";
}

function toPlainArgs(input: unknown): Record<string, unknown> {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return { ...(input as Record<string, unknown>) };
  }
  return {};
}

/**
 * Passively records WebMCP tool invocations (`toolinvoked` / `toolresponded`)
 * and correlated console/page errors on the foreground web app page while an
 * external browser-extension agent drives the page.
 */
export class PageToolCallRecorder {
  private readonly records: RecordedInvocation[] = [];
  private readonly activeCalls = new Map<string, Pick<ToolCall, "functionName" | "args">>();
  private readonly browserConsoleErrors: BrowserConsoleError[] = [];
  private turnStartIndex = 0;
  private disposed = false;

  private readonly onToolInvoked = (call: WebMCPToolCall): void => {
    const functionName = call.tool?.name || "unknown";
    const args = toPlainArgs(call.input);
    const record: RecordedInvocation = {
      id: call.id,
      functionName,
      args,
      availableTools: mapRawBrowserToolsToConfig(this.page.webmcp.tools()),
      status: "pending",
    };
    this.records.push(record);
    this.activeCalls.set(call.id, { functionName, args });
    // Only declarative form tools wait for a human to submit, which decides the
    // label for a call that is still pending when the turn ends.
    Promise.resolve(call.tool?.formElement).then(
      (form) => {
        record.isFormTool = Boolean(form);
        void form?.dispose().catch(() => undefined);
      },
      () => {
        record.isFormTool = false;
      },
    );
  };

  private readonly onToolResponded = (res: WebMCPToolCallResult): void => {
    this.activeCalls.delete(res.id);
    // Responses to calls invoked before this recorder attached (e.g. setup calls) are ignored.
    for (let i = this.records.length - 1; i >= 0; i--) {
      const record = this.records[i];
      if (record.id === res.id && record.status === "pending") {
        record.status = res.status === "Completed" ? "completed" : "error";
        record.result = normalizeWebMcpResult(record.functionName, res);
        return;
      }
    }
  };

  private readonly onConsole = (entry: ConsoleMessage): void => {
    if (this.activeCalls.size === 0 || entry.type() !== "error") return;
    this.browserConsoleErrors.push(consoleErrorFromMessage(entry, [...this.activeCalls.values()]));
  };

  private readonly onPageError = (err: unknown): void => {
    if (this.activeCalls.size === 0) return;
    this.browserConsoleErrors.push({
      kind: "pageerror",
      message: err instanceof Error ? err.message : String(err),
      toolCalls: [...this.activeCalls.values()],
    });
  };

  private constructor(private readonly page: Page) {
    this.page.webmcp.on("toolinvoked", this.onToolInvoked);
    this.page.webmcp.on("toolresponded", this.onToolResponded);
    this.page.on("console", this.onConsole);
    this.page.on("pageerror", this.onPageError);
  }

  static attach(page: Page): PageToolCallRecorder {
    return new PageToolCallRecorder(page);
  }

  /**
   * Marks the start of a new conversational turn. Calls recorded since the last
   * `flushTurn()` arrived after the previous turn was judged finished; they are
   * counted in this turn, with a warning, rather than dropped.
   */
  markTurnStart(): void {
    const lateCalls = this.records.length - this.turnStartIndex;
    if (lateCalls > 0) {
      logger.warn(
        `${lateCalls} WebMCP tool call(s) arrived after the previous extension turn ended. They are counted in the next turn.`,
      );
    }
  }

  /** Number of tool calls recorded since the current turn started. */
  turnCallCount(): number {
    return this.records.length - this.turnStartIndex;
  }

  /**
   * Non-destructively snapshots the `ToolCall[]` and `TrajectoryStep[]` observed
   * since the last `flushTurn()` so live progress / abort handlers can report partial work.
   */
  snapshotTurn(finalText = ""): { toolCalls: ToolCall[]; steps: TrajectoryStep[] } {
    const slice = this.records.slice(this.turnStartIndex);
    return buildTurnTrajectory(slice, finalText, () =>
      mapRawBrowserToolsToConfig(this.page.webmcp.tools()),
    );
  }

  /**
   * Returns the `ToolCall[]` and `TrajectoryStep[]` observed since the last
   * `flushTurn()` (or since attachment). A declarative form tool call still
   * waiting for a human to submit it gets the result `"pending form submission"`,
   * like `BrowserToolRegistry`; any other unanswered call is labelled as such.
   */
  flushTurn(finalText = ""): { toolCalls: ToolCall[]; steps: TrajectoryStep[] } {
    const snapshot = this.snapshotTurn(finalText);
    this.activeCalls.clear();
    this.turnStartIndex = this.records.length;
    return snapshot;
  }

  getBrowserConsoleErrors(): BrowserConsoleError[] {
    return [...this.browserConsoleErrors];
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.page.webmcp.off("toolinvoked", this.onToolInvoked);
    this.page.webmcp.off("toolresponded", this.onToolResponded);
    this.page.off("console", this.onConsole);
    this.page.off("pageerror", this.onPageError);
  }
}

function resultOf(rec: RecordedInvocation): unknown {
  if (rec.status !== "pending") return rec.result;
  return rec.isFormTool === true ? PENDING_FORM_RESULT : PENDING_CALL_RESULT;
}

function buildTurnTrajectory(
  records: readonly RecordedInvocation[],
  finalText: string,
  currentToolsFallback: () => Tool[],
): { toolCalls: ToolCall[]; steps: TrajectoryStep[] } {
  const toolCalls: ToolCall[] = records.map((rec) => ({
    functionName: rec.functionName,
    args: rec.args,
    result: resultOf(rec),
  }));
  const steps: TrajectoryStep[] = records.map((rec) => ({
    toolCalls: [{ toolCallId: rec.id, toolName: rec.functionName, input: rec.args }],
    toolResults: [{ toolCallId: rec.id, toolName: rec.functionName, output: resultOf(rec) }],
    availableTools: rec.availableTools,
  }));

  if (finalText.trim().length > 0) {
    steps.push({
      text: finalText,
      availableTools: records.at(-1)?.availableTools ?? currentToolsFallback(),
    });
  }

  return { toolCalls, steps };
}
