/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference path="../../../demos/shared/types/webmcp.d.ts" />

import puppeteer, { Browser, Page } from "puppeteer-core";
import { tool as defineTool, jsonSchema } from "ai";
import { Tool } from "../types/tools.js";
import { mapRawBrowserToolsToConfig, sanitizeSchema } from "./mappers.js";
import { findChromePath } from "../utils.js";

/**
 * Creates a server-side AI SDK tool wrapper that executes arbitrary
 * WebMCP bindings inside the puppeteer browser execution context.
 */
export function createBrowserTool(t: Tool, page: Page): any {
  const hasParams = t.parameters && Object.keys(t.parameters).length > 0;
  const rawParams = hasParams ? t.parameters : { type: "object", properties: {} };
  const sanitizedParams = sanitizeSchema(rawParams);
  return defineTool({
    description: t.description,
    parameters: jsonSchema(sanitizedParams) as any,
    inputSchema: jsonSchema(sanitizedParams) as any,
    execute: async (args: any) => {
      let executionResult: any = {};

      try {
        const toolResult = await page.evaluate(async (name, callArgs) => {
          if (document.modelContext) {
            const mc = document.modelContext;
            if (typeof mc.getTools === "function" && typeof mc.executeTool === "function") {
              const tools = await mc.getTools();
              const tool = tools.find((item) => item.name === name);
              if (tool) {
                const resStr = await mc.executeTool(tool, JSON.stringify(callArgs || {}));
                try {
                  return { success: true, data: JSON.parse(resStr as string) };
                } catch {
                  return { success: true, data: resStr };
                }
              }
            }
          }
          return { success: false };
        }, t.functionName, args);

        if (toolResult && toolResult.success) {
          executionResult.result = toolResult.data;
        } else {
          return { error: `no tool named "${t.functionName}" was found` };
        }

        // If executionResult.result is null, it is due to a navigation happening.
        if (executionResult.result == null) {
          await page.waitForNavigation();
          executionResult = await page.evaluate(() => {
            const result = document.querySelector(
              'script[type="application/ld+json"]',
            )?.textContent;
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
            result: `Tool ${t.functionName} executed and triggered a page navigation.`,
          };
        } else {
          executionResult = { error: e.message || String(e) };
        }
      }

      let r = executionResult.result;
      if (typeof r === "string") {
        try {
          r = JSON.parse(r);
        } catch { }
      }

      // Attempt to drill down into structured responses
      if (r?.content && Array.isArray(r.content) && r.content[0]?.text) {
        return r.content[0].text;
      }
      return r || executionResult.error || "Success";
    },
  } as any);
}

export async function getToolsFromBrowserPage(page: Page): Promise<any[]> {
  return await page.evaluate(async () => {
    if (document.modelContext && typeof document.modelContext.getTools === "function") {
      try {
        const raw = await document.modelContext.getTools();
        return (raw || []).map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        }));
      } catch (e) {
        return [];
      }
    }
    return [];
  });
}

/**
 * Launches Chrome Canary, navigates to the given URL, and retrieves the list
 * of tools exposed by the page via Puppeteer.
 *
 * Requires Chrome Canary 150+ with the `chrome://flags/#enable-webmcp-testing`
 * flag enabled. The browser is always closed after the tools are retrieved,
 * even if an error occurs.
 */
export async function listToolsFromPage(url: string): Promise<Tool[]> {
  const executablePath = await findChromePath();
  let browser: Browser | null = null;

  try {
    console.log(`Launching Chrome Canary from: ${executablePath}`);
    const puppeteerFlags = ["--enable-features=WebMCPTesting", "--no-sandbox", "--disable-setuid-sandbox"];
    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: puppeteerFlags,
    });

    const page = await browser.newPage();

    console.log(`Navigating to: ${url}`);
    const response = await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    if (!response || !response.ok()) {
      throw new Error(
        `Failed to navigate to ${url}. HTTP status: ${response?.status() ?? "unknown"}`,
      );
    }

    const rawTools = await getToolsFromBrowserPage(page);
    if (rawTools.length === 0) {
      throw new Error(
        `WebMCP Tools are not available on ${url} (0 tools registered on page).\nDebug info: [URL="${url}", Executable="${executablePath}", Flags="${puppeteerFlags.join(" ")}"]`,
      );
    }

    console.log(`Found ${rawTools.length} tool(s) via Puppeteer/Native API.`);
    return mapRawBrowserToolsToConfig(rawTools, []);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
