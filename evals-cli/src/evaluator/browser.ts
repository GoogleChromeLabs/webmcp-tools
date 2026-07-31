/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../../../demos/shared/types/webmcp.d.ts" />

import puppeteer, { Browser } from "puppeteer-core";
import { Tool } from "../types/tools.js";
import { mapRawBrowserToolsToConfig } from "./mappers.js";
import { findChromePath } from "../utils.js";
import { BrowserPage } from "../backends/index.js";
import { ToolRegistry } from "./toolRegistry.js";

export async function getToolsFromBrowserPage(page: BrowserPage): Promise<any[]> {
  const tools = page.webmcp?.tools() || [];
  return tools.map((t: any) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }));
}

export const PUPPETEER_FLAGS = [
  "--enable-features=WebMCPTesting,DevToolsWebMCPSupport,WebMCP",
  "--no-sandbox",
  "--disable-setuid-sandbox",
];

export async function launchBrowser(): Promise<Browser> {
  const executablePath = await findChromePath();
  return await puppeteer.launch({
    executablePath,
    headless: true,
    args: PUPPETEER_FLAGS,
  });
}

export class BrowserToolRegistry implements ToolRegistry {
  private currentTools: Tool[] = [];

  constructor(private page: BrowserPage) {}

  async syncTools(): Promise<Tool[]> {
    const rawTools = await getToolsFromBrowserPage(this.page);
    this.currentTools = mapRawBrowserToolsToConfig(rawTools, this.currentTools);
    return this.currentTools;
  }

  getCurrentTools(): Tool[] {
    return this.currentTools;
  }

  async executeTool(name: string, args: any): Promise<any> {
    let executionResult: any = {};

    try {
      const tools = this.page.webmcp?.tools() || [];
      const tool = tools.find((t: any) => t.name === name);
      if (!tool) {
        return { error: `no tool named "${name}" was found` };
      }

      const isDeclarativeWithoutAutosubmit =
        Boolean(await tool.formElement) && !tool.annotations?.autosubmit;

      if (isDeclarativeWithoutAutosubmit) {
        const toolPromise = new Promise((resolve) => {
          let timer: any = null;

          const onToolInvoked = (call: any) => {
            if (!call.tool || call.tool.name === name) {
              timer = setTimeout(() => {
                this.page.webmcp?.off("toolinvoked", onToolInvoked);
                resolve({ success: true, data: "pending form submission" });
              }, 1000);
            }
          };

          if (this.page.webmcp) {
            this.page.webmcp.on("toolinvoked", onToolInvoked);
          }

          tool
            .execute(args || {})
            .then((res: any) => {
              if (timer) clearTimeout(timer);
              if (this.page.webmcp) {
                this.page.webmcp.off("toolinvoked", onToolInvoked);
              }
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
            .catch((err: any) => {
              if (timer) clearTimeout(timer);
              if (this.page.webmcp) {
                this.page.webmcp.off("toolinvoked", onToolInvoked);
              }
              resolve({ success: false, error: err?.message || String(err) });
            });
        });

        const toolResult: any = await toolPromise;
        if (toolResult && toolResult.success) {
          executionResult.result = toolResult.data;
        } else {
          return { error: toolResult?.error || `Error executing tool "${name}"` };
        }
      } else {
        const res = await tool.execute(args || {});
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
    } catch (e: any) {
      if (
        e.message.includes("Execution context was destroyed") ||
        e.message.includes("Target closed") ||
        e.message.includes("navigating")
      ) {
        await new Promise((r) => setTimeout(r, 500));
        executionResult = {
          result: `Tool ${name} executed and triggered a page navigation.`,
        };
      } else {
        executionResult = { error: e.message || String(e) };
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
