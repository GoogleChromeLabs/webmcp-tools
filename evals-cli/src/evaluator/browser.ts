/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../../../demos/shared/types/webmcp.d.ts" />

import puppeteer, { Browser, ChromeReleaseChannel } from "puppeteer-core";
import type { Page as BrowserPage, WebMCPToolCall, WebMCPToolCallResult } from "puppeteer-core";
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

  constructor(private page: BrowserPage) {}

  getCurrentTools(): Tool[] {
    const rawTools = this.page.webmcp.tools() || [];
    this.currentTools = mapRawBrowserToolsToConfig(rawTools);
    return [...this.currentTools];
  }

  async executeToolChecked(
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
                  resolve({ success: true, data: res.output ?? "Success" });
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
    return outcome.result ?? "Success";
  }
}
