/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import puppeteer, { Browser, ChromeReleaseChannel, ConsoleMessage } from "puppeteer-core";
import type {
  Frame,
  Page as BrowserPage,
  WebMCPToolCall,
  WebMCPToolCallResult,
} from "puppeteer-core";
import { AttemptedToolCallMetric, BrowserConsoleError } from "../types/evals.js";
import { Tool } from "../types/tools.js";
import { delay } from "../utils/async.js";
import { mapRawBrowserToolsToConfig } from "./mappers.js";
import type { SettleToolsOptions, ToolRegistry } from "./toolRegistry.js";

export type { Browser, BrowserPage };

export const PUPPETEER_FLAGS = [
  "--enable-features=WebMCP",
  "--no-sandbox",
  "--disable-setuid-sandbox",
];

export async function launchBrowser(
  chromeChannel: ChromeReleaseChannel = "chrome-canary",
): Promise<Browser> {
  return await puppeteer.launch({
    browser: "chrome",
    channel: chromeChannel,
    headless: true,
    // Clone so Puppeteer cannot mutate the global PUPPETEER_FLAGS.
    args: [...PUPPETEER_FLAGS],
  });
}

/** Result of a declarative form tool that is still waiting for a human to submit it. */
export const PENDING_FORM_RESULT = "pending form submission";

/** Default quiet window with no tool changes before `waitForToolsToSettle` resolves. */
const DEFAULT_SETTLE_QUIET_MS = 250;
/** Default upper bound for `waitForToolsToSettle`. */
export const DEFAULT_SETTLE_TIMEOUT_MS = 2_000;
/** Default polling interval while waiting for page readiness or tool changes. */
const DEFAULT_SETTLE_POLL_MS = 25;

export interface BrowserSettleToolsOptions extends SettleToolsOptions {
  quietMs?: number;
  pollMs?: number;
}

export interface SettleClock {
  now(): number;
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}

const realSettleClock: SettleClock = {
  now: () => performance.now(),
  sleep: (ms, signal) => delay(ms, signal),
};

export class BrowserToolRegistry implements ToolRegistry {
  private currentTools: Tool[] = [];
  private browserConsoleErrors: BrowserConsoleError[] = [];
  private activeToolCalls = new Map<symbol, BrowserConsoleError["toolCalls"][number]>();
  private stopObservingBrowserConsole: (() => void) | undefined;
  private toolAttempts: AttemptedToolCallMetric[] = [];
  private nextInvocationSeq = 1;

  constructor(private page: BrowserPage) {}

  getCurrentTools(): Tool[] {
    const rawTools = this.page.webmcp.tools() || [];
    this.currentTools = mapRawBrowserToolsToConfig(rawTools);
    return [...this.currentTools];
  }

  /** Agent-driven tool attempts recorded by {@link executeToolChecked}. */
  getToolAttemptMetrics(): readonly AttemptedToolCallMetric[] {
    return this.toolAttempts;
  }

  /**
   * Waits for the page's WebMCP tools to settle after a round of tool calls, so
   * the next step declares the tools the page has now.
   *
   * A tool call can navigate or render a view that registers tools asynchronously
   * after `execute()` resolves. This flushes a turn on the page, waits until the
   * document is complete and has at least one tool (so async views that clear old
   * tools while loading do not exit empty), then waits `quietMs` without further
   * tool changes, giving up after `timeoutMs` with whatever tools arrived by then.
   */
  // TODO(https://github.com/webmachinelearning/webmcp/pull/373): Replace or
  // supplement this quiet-window / toolCount > 0 heuristic once the spec's
  // `waitForToolsUntil()` stability signal and `ToolChangeEvent` are exposed
  // through `page.webmcp` (eliminating the 250ms settle delay and 0-tool timeout).
  async waitForToolsToSettle(
    {
      signal,
      quietMs = DEFAULT_SETTLE_QUIET_MS,
      timeoutMs = DEFAULT_SETTLE_TIMEOUT_MS,
      pollMs = DEFAULT_SETTLE_POLL_MS,
    }: BrowserSettleToolsOptions = {},
    clock: SettleClock = realSettleClock,
  ): Promise<void> {
    if (signal?.aborted || isPageClosed(this.page)) return;

    const intervalMs = Math.max(1, pollMs);
    const start = clock.now();
    const readToolsSnapshot = createToolsSnapshotReader(this.page);
    const initialSnapshot = readToolsSnapshot();

    let seenSignature = initialSnapshot.signature;
    let toolCount = initialSnapshot.count;
    let lastActivityAt = start;
    let pageReady = false;
    let navigationEpoch = 0;

    const stopController = new AbortController();
    const stopSettling = () => stopController.abort();

    const syncTools = (forceActivity = false) => {
      const snapshot = readToolsSnapshot();
      toolCount = snapshot.count;
      if (forceActivity || snapshot.signature !== seenSignature) {
        seenSignature = snapshot.signature;
        lastActivityAt = clock.now();
      }
    };
    const markToolChange = () => syncTools(true);

    const onFrameNavigated = (frame: Frame) => {
      const mainFrame = safeMainFrame(this.page);
      if (!mainFrame || frame === mainFrame) {
        navigationEpoch++;
        pageReady = false;
      } else {
        lastActivityAt = clock.now();
      }
    };

    const hasWebmcpEvents =
      typeof this.page.webmcp.on === "function" && typeof this.page.webmcp.off === "function";
    const hasPageEvents = typeof this.page.on === "function" && typeof this.page.off === "function";

    try {
      signal?.addEventListener("abort", stopSettling, { once: true });
      if (hasWebmcpEvents) {
        this.page.webmcp.on("toolsadded", markToolChange);
        this.page.webmcp.on("toolsremoved", markToolChange);
      }
      if (hasPageEvents) {
        this.page.on("framenavigated", onFrameNavigated);
        this.page.on("close", stopSettling);
      }

      while (
        !stopController.signal.aborted &&
        !isPageClosed(this.page) &&
        clock.now() - start < timeoutMs
      ) {
        if (!pageReady) {
          const epoch = navigationEpoch;
          const remaining = timeoutMs - (clock.now() - start);
          const ready =
            remaining > 0 &&
            (await isDocumentComplete(this.page, remaining, stopController.signal));
          if (stopController.signal.aborted || isPageClosed(this.page)) return;
          if (ready && epoch === navigationEpoch) {
            pageReady = true;
            lastActivityAt = clock.now();
          }
        }

        syncTools();

        if (pageReady && toolCount > 0 && clock.now() - lastActivityAt >= quietMs) {
          return;
        }

        const remaining = timeoutMs - (clock.now() - start);
        if (remaining <= 0) return;
        try {
          await clock.sleep(Math.min(intervalMs, remaining), stopController.signal);
        } catch (error) {
          if (!stopController.signal.aborted) throw error;
        }
      }
    } finally {
      signal?.removeEventListener("abort", stopSettling);
      stopController.abort();
      if (hasWebmcpEvents) {
        this.page.webmcp.off("toolsadded", markToolChange);
        this.page.webmcp.off("toolsremoved", markToolChange);
      }
      if (hasPageEvents) {
        this.page.off("framenavigated", onFrameNavigated);
        this.page.off("close", stopSettling);
      }
    }
  }

  getBrowserConsoleErrors(): BrowserConsoleError[] {
    return [...this.browserConsoleErrors];
  }

  async executeToolChecked(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<{ success: true; result: any } | { success: false; error: string }> {
    const invocationId = `inv-${this.nextInvocationSeq++}`;
    const startedAt = performance.now();
    const stopCollecting = this.startCollectingBrowserConsoleErrors(name, args);
    try {
      const outcome = await this.executeToolWithoutConsoleCapture(name, args);
      const durationMs = Math.round(performance.now() - startedAt);
      if (outcome.success) {
        this.toolAttempts.push({
          invocationId,
          functionName: name,
          arguments: args,
          outcome: "completed",
          durationMs,
        });
      } else {
        this.toolAttempts.push({
          invocationId,
          functionName: name,
          arguments: args,
          outcome: "error",
          durationMs,
          error: outcome.error,
        });
      }
      return outcome;
    } catch (e: unknown) {
      const durationMs = Math.round(performance.now() - startedAt);
      const message = e instanceof Error ? e.message : String(e);
      this.toolAttempts.push({
        invocationId,
        functionName: name,
        arguments: args,
        outcome: "error",
        durationMs,
        error: message,
      });
      throw e;
    } finally {
      stopCollecting();
    }
  }

  private startCollectingBrowserConsoleErrors(
    name: string,
    args: Record<string, unknown>,
  ): () => void {
    const callId = Symbol(name);
    this.activeToolCalls.set(callId, { functionName: name, args });
    if (this.activeToolCalls.size === 1) {
      this.stopObservingBrowserConsole = this.observeBrowserConsoleErrors();
    }
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      this.activeToolCalls.delete(callId);
      if (this.activeToolCalls.size === 0) {
        this.stopObservingBrowserConsole?.();
        this.stopObservingBrowserConsole = undefined;
      }
    };
  }

  private observeBrowserConsoleErrors(): (() => void) | undefined {
    const eventPage = this.page as BrowserPage & {
      on(event: string, listener: (...eventArgs: any[]) => void): unknown;
      off(event: string, listener: (...eventArgs: any[]) => void): unknown;
    };
    if (typeof eventPage.on !== "function" || typeof eventPage.off !== "function") return undefined;
    const onConsole = (entry: ConsoleMessage) => {
      if (entry.type() !== "error") return;
      this.browserConsoleErrors.push(
        consoleErrorFromMessage(entry, [...this.activeToolCalls.values()]),
      );
    };
    const onPageError = (error: Error) => {
      this.browserConsoleErrors.push({
        kind: "pageerror",
        message: error instanceof Error ? error.message : String(error),
        toolCalls: [...this.activeToolCalls.values()],
      });
    };
    eventPage.on("console", onConsole);
    eventPage.on("pageerror", onPageError);
    return () => {
      eventPage.off("console", onConsole);
      eventPage.off("pageerror", onPageError);
    };
  }

  private async executeToolWithoutConsoleCapture(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<{ success: true; result: any } | { success: false; error: string }> {
    let executionResult: { result?: any; error?: string } = {};

    try {
      const tools = this.page.webmcp.tools() || [];
      const tool = tools.find((t) => t.name === name);
      if (!tool) {
        return { success: false, error: `no tool named "${name}" was found` };
      }

      const isDeclarativeWithoutAutosubmit =
        Boolean(await tool.formElement) && !tool.annotations?.autosubmit;

      if (isDeclarativeWithoutAutosubmit) {
        const toolPromise = new Promise<{ success: boolean; data?: any; error?: string }>(
          (resolve) => {
            let timer: NodeJS.Timeout | null = null;

            const onToolInvoked = (call: WebMCPToolCall) => {
              if (!call.tool || call.tool.name === name) {
                timer = setTimeout(() => {
                  resolve({ success: true, data: PENDING_FORM_RESULT });
                }, 1000);
              }
            };

            this.page.webmcp.once("toolinvoked", onToolInvoked);

            tool
              .execute(args)
              .then((res: WebMCPToolCallResult) => {
                if (timer) clearTimeout(timer);
                this.page.webmcp.off("toolinvoked", onToolInvoked);
                if (res.status === "Completed") {
                  resolve({
                    success: true,
                    data: res.output !== undefined ? res.output : "Success",
                  });
                } else if (res.status === "Error") {
                  resolve({
                    success: false,
                    error: res.errorText || `Error executing tool "${name}"`,
                  });
                } else {
                  resolve({ success: false, error: `Tool execution status: ${res.status}` });
                }
              })
              .catch((err: unknown) => {
                if (timer) clearTimeout(timer);
                this.page.webmcp.off("toolinvoked", onToolInvoked);
                const message = err instanceof Error ? err.message : String(err);
                resolve({ success: false, error: message });
              });
          },
        );

        const toolResult = await toolPromise;
        if (toolResult && toolResult.success) {
          executionResult.result = toolResult.data;
        } else {
          return {
            success: false,
            error: toolResult?.error || `Error executing tool "${name}"`,
          };
        }
      } else {
        return interpretToolResponse(name, await tool.execute(args));
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return { success: false, error: `Tool execution error: ${message}` };
    }

    return interpretToolOutput(executionResult.result);
  }

  async executeTool(name: string, args: Record<string, unknown> = {}): Promise<any> {
    const outcome = await this.executeToolChecked(name, args);
    if (!outcome.success) return { error: outcome.error };
    return outcome.result !== undefined ? outcome.result : "Success";
  }
}

/**
 * Reads a completed tool's output the same way for every agent: parses JSON
 * strings, unwraps MCP-style `{ content: [{ text }] }`, and turns `isError`
 * results into failures.
 */
export function interpretToolOutput(
  output: unknown,
): { success: true; result: any } | { success: false; error: string } {
  let r: any = output;
  if (typeof r === "string") {
    try {
      r = JSON.parse(r);
    } catch {
      // Not JSON; keep the raw string.
    }
  }
  if (r?.content && Array.isArray(r.content) && r.content[0]?.text) {
    return r.isError
      ? { success: false, error: r.content[0].text }
      : { success: true, result: r.content[0].text };
  }
  if (r?.isError) {
    return { success: false, error: typeof r.error === "string" ? r.error : JSON.stringify(r) };
  }
  return { success: true, result: r };
}

/** Maps a WebMCP tool response to a registry outcome. Shared with `PageToolCallRecorder`. */
export function interpretToolResponse(
  name: string,
  res: Pick<WebMCPToolCallResult, "status" | "output" | "errorText">,
): { success: true; result: any } | { success: false; error: string } {
  if (res.status === "Error") {
    return { success: false, error: res.errorText || `Error executing tool "${name}"` };
  }
  if (res.status !== "Completed") {
    return { success: false, error: `Tool execution status: ${res.status}` };
  }
  return interpretToolOutput(res.output !== undefined ? res.output : "Success");
}

/** Report entry for a `console.error` seen while the given tool calls were running. */
export function consoleErrorFromMessage(
  entry: ConsoleMessage,
  toolCalls: BrowserConsoleError["toolCalls"],
): BrowserConsoleError {
  const location = entry.location();
  const error: BrowserConsoleError = { kind: "console", message: entry.text(), toolCalls };
  if (location.url) error.url = location.url;
  if (location.lineNumber !== undefined) error.lineNumber = location.lineNumber;
  if (location.columnNumber !== undefined) error.columnNumber = location.columnNumber;
  return error;
}

function isPageClosed(page: BrowserPage): boolean {
  return typeof page.isClosed === "function" && page.isClosed();
}

function safeMainFrame(page: BrowserPage): Frame | undefined {
  try {
    return typeof page.mainFrame === "function" ? page.mainFrame() : undefined;
  } catch {
    return undefined;
  }
}

function createToolsSnapshotReader(page: BrowserPage): () => { count: number; signature: string } {
  const frameIds = new WeakMap<object, number>();
  let nextFrameId = 1;
  const getFrameId = (frame: Frame | undefined): number => {
    if (!frame || typeof frame !== "object") return 0;
    let id = frameIds.get(frame);
    if (id === undefined) {
      id = nextFrameId++;
      frameIds.set(frame, id);
    }
    return id;
  };

  return () => {
    const tools = page.webmcp.tools() || [];
    return {
      count: tools.length,
      signature: JSON.stringify(
        tools.map((tool) => [
          getFrameId(tool.frame),
          tool.name,
          tool.description ?? "",
          tool.inputSchema ?? null,
          tool.annotations ?? null,
        ]),
      ),
    };
  };
}

/**
 * Yields one unthrottled task turn on the page via `MessageChannel` (avoiding
 * Chromium's 1 Hz background `setTimeout` throttling in occluded windows) and
 * checks whether `document.readyState === "complete"`.
 */
async function isDocumentComplete(
  page: BrowserPage,
  timeoutMs: number,
  stopSignal: AbortSignal,
): Promise<boolean> {
  if (stopSignal.aborted || isPageClosed(page)) return false;
  if (typeof page.evaluate !== "function") return true;

  const raceController = new AbortController();
  try {
    const evaluatePromise = page
      .evaluate(
        () =>
          new Promise<string>((resolve) => {
            const { port1, port2 } = new MessageChannel();
            port1.onmessage = () => resolve(document.readyState);
            port2.postMessage(undefined);
          }),
      )
      .catch(() => "loading");
    const readyState = await Promise.race([
      evaluatePromise,
      delay(timeoutMs, AbortSignal.any([stopSignal, raceController.signal])).then(
        () => "loading",
        () => "loading",
      ),
    ]);
    return readyState === "complete";
  } finally {
    raceController.abort();
  }
}
