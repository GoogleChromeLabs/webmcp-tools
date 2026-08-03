/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../../../demos/shared/types/webmcp.d.ts" />

import puppeteer, { Browser } from "puppeteer-core";
import type { WebMCPToolCall, WebMCPToolCallResult } from "puppeteer-core";
import { Tool } from "../types/tools.js";
import { mapRawBrowserToolsToConfig } from "./mappers.js";
import { findChromePath } from "../utils.js";
import { BrowserPage } from "../backends/index.js";
import { ToolRegistry } from "./toolRegistry.js";

export const PUPPETEER_FLAGS = [
  "--enable-features=WebMCP",
  "--no-sandbox",
  "--disable-setuid-sandbox",
];

export async function launchBrowser(): Promise<Browser> {
  const executablePath = await findChromePath();
  return await puppeteer.launch({
    executablePath,
    headless: true,
    // Clone so Puppeteer cannot mutate the global PUPPETEER_FLAGS.
    args: [...PUPPETEER_FLAGS],
  });
}

export class BrowserToolRegistry implements ToolRegistry {
  private currentTools: Tool[] = [];

  constructor(private page: BrowserPage) {}

  async syncTools(): Promise<Tool[]> {
    let rawTools = this.page.webmcp.tools();
    // Work around potential Puppeteer bug, see https://github.com/GoogleChromeLabs/webmcp-tools/pull/342
    if (rawTools.length === 0) {
      if (typeof (this.page.webmcp as any).initialize === "function") {
        await (this.page.webmcp as any).initialize();
      }
      rawTools = this.page.webmcp.tools();
    }
    this.currentTools = mapRawBrowserToolsToConfig(rawTools);
    return this.currentTools;
  }

  getCurrentTools(): Tool[] {
    return this.currentTools;
  }

  async executeTool(name: string, args: Record<string, unknown> = {}): Promise<any> {
    let executionResult: { result?: any; error?: string } = {};

    try {
      const tools = this.page.webmcp.tools() || [];
      const tool = tools.find((t) => t.name === name);
      if (!tool) {
        return { error: `no tool named "${name}" was found` };
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
          return { error: toolResult?.error || `Error executing tool "${name}"` };
        }
      } else {
        const res = await tool.execute(args);
        if (res.status === "Completed") {
          executionResult.result = res.output !== undefined ? res.output : "Success";
        } else if (res.status === "Error") {
          return { error: res.errorText || `Error executing tool "${name}"` };
        } else {
          return { error: `Tool execution status: ${res.status}` };
        }
      }

      // If executionResult.result is null, it is due to a navigation happening.
      if (executionResult.result == null) {
        await this.page.waitForNavigation();
        executionResult = await this.page.evaluate(() => {
          const result = document.querySelector('script[type="application/ld+json"]')?.textContent;
          return { result, crossDocument: true };
        });
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (
        message.includes("Execution context was destroyed") ||
        message.includes("Target closed") ||
        message.includes("navigating")
      ) {
        await new Promise((r) => setTimeout(r, 500));
        executionResult = {
          result: `Tool ${name} executed and triggered a page navigation.`,
        };
      } else {
        executionResult = { error: message };
      }
    }

    let r = executionResult.result;
    if (typeof r === "string") {
      try {
        r = JSON.parse(r);
      } catch {}
    }

    // Attempt to drill down into structured responses
    if (r?.content && Array.isArray(r.content) && r.content[0]?.text) {
      return r.content[0].text;
    }
    return r || executionResult.error || "Success";
  }
}
