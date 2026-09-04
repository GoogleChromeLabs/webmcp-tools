/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import puppeteer, { Browser, ChromeReleaseChannel, ConsoleMessage } from "puppeteer-core";
import type { Page as BrowserPage, WebMCPToolCall, WebMCPToolCallResult } from "puppeteer-core";
import { BrowserConsoleError } from "../types/evals.js";
import { Tool } from "../types/tools.js";
import { mapRawBrowserToolsToConfig } from "./mappers.js";
import { ToolRegistry } from "./toolRegistry.js";

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

export class BrowserToolRegistry implements ToolRegistry {
  private currentTools: Tool[] = [];
  private browserConsoleErrors: BrowserConsoleError[] = [];
  private activeToolCalls = new Map<symbol, BrowserConsoleError["toolCalls"][number]>();
  private stopObservingBrowserConsole: (() => void) | undefined;

  constructor(private page: BrowserPage) {}

  getCurrentTools(): Tool[] {
    const rawTools = this.page.webmcp.tools() || [];
    this.currentTools = mapRawBrowserToolsToConfig(rawTools);
    return [...this.currentTools];
  }

  getBrowserConsoleErrors(): BrowserConsoleError[] {
    return [...this.browserConsoleErrors];
  }

  async executeToolChecked(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<{ success: true; result: any } | { success: false; error: string }> {
    const stopCollecting = this.startCollectingBrowserConsoleErrors(name, args);
    try {
      return await this.executeToolWithoutConsoleCapture(name, args);
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
      const location = entry.location();
      const error: BrowserConsoleError = {
        kind: "console",
        message: entry.text(),
        toolCalls: [...this.activeToolCalls.values()],
      };
      if (location.url) error.url = location.url;
      if (location.lineNumber !== undefined) error.lineNumber = location.lineNumber;
      if (location.columnNumber !== undefined) error.columnNumber = location.columnNumber;
      this.browserConsoleErrors.push(error);
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
                  resolve({ success: true, data: "pending form submission" });
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
        const res = await tool.execute(args);
        if (res.status === "Completed") {
          executionResult.result = res.output !== undefined ? res.output : "Success";
        } else if (res.status === "Error") {
          return {
            success: false,
            error: res.errorText || `Error executing tool "${name}"`,
          };
        } else {
          return { success: false, error: `Tool execution status: ${res.status}` };
        }
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return { success: false, error: `Tool execution error: ${message}` };
    }

    let r = executionResult.result;
    if (typeof r === "string") {
      try {
        r = JSON.parse(r);
      } catch {}
    }

    // Attempt to drill down into structured responses
    if (r?.content && Array.isArray(r.content) && r.content[0]?.text) {
      if (r.isError) {
        return { success: false, error: r.content[0].text };
      }
      return { success: true, result: r.content[0].text };
    }
    if (r?.isError) {
      return {
        success: false,
        error: typeof r.error === "string" ? r.error : JSON.stringify(r),
      };
    }
    return { success: true, result: r };
  }

  async executeTool(name: string, args: Record<string, unknown> = {}): Promise<any> {
    const outcome = await this.executeToolChecked(name, args);
    if (!outcome.success) return { error: outcome.error };
    return outcome.result !== undefined ? outcome.result : "Success";
  }
}
