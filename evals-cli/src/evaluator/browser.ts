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
  return await page.evaluate(async () => {
    if (document.modelContext && typeof document.modelContext.getTools === "function") {
      try {
        const raw = await document.modelContext.getTools();
        return (raw || []).map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        }));
      } catch {
        return [];
      }
    }
    return [];
  });
}

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
      const toolResult = await this.page.evaluate(
        async (name: string, callArgs: any) => {
          if (document.modelContext) {
            const mc = document.modelContext;
            if (typeof mc.getTools === "function" && typeof mc.executeTool === "function") {
              const tools = await mc.getTools();
              const tool = tools.find((item) => item.name === name);
              if (tool) {
                return new Promise((resolve) => {
                  let timer: any = null;

                  const onActivated = (e: any) => {
                    if (!e.toolName || e.toolName === name) {
                      timer = setTimeout(() => {
                        window.removeEventListener("toolactivated", onActivated);
                        resolve({ success: true, data: "pending form submission" });
                      }, 1000);
                    }
                  };

                  window.addEventListener("toolactivated", onActivated);

                  mc.executeTool(tool, JSON.stringify(callArgs || {}))
                    .then((resStr: any) => {
                      if (timer) clearTimeout(timer);
                      window.removeEventListener("toolactivated", onActivated);
                      try {
                        resolve({ success: true, data: JSON.parse(resStr as string) });
                      } catch {
                        resolve({ success: true, data: resStr });
                      }
                    })
                    .catch((err: any) => {
                      if (timer) clearTimeout(timer);
                      window.removeEventListener("toolactivated", onActivated);
                      resolve({ success: false, error: err?.message || String(err) });
                    });
                });
              }
            }
          }
          return { success: false };
        },
        name,
        args,
      );

      if (toolResult && toolResult.success) {
        executionResult.result = toolResult.data;
      } else {
        return { error: `no tool named "${name}" was found` };
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
