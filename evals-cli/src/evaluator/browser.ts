/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

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
  const sanitizedParams = sanitizeSchema(t.parameters || {});
  return defineTool({
    description: t.description,
    parameters: jsonSchema(sanitizedParams) as any,
    inputSchema: jsonSchema(sanitizedParams) as any,
    execute: async (args: any) => {
      let executionResult: any = {};

      const tools = page.webmcp.tools();
      if (tools.length === 0) {
        return { error: "no tools were found" };
      }

      const tool = tools.find((tool) => tool.name === t.functionName);
      if (!tool) {
        return { error: `no tool named "${t.functionName}" were found` };
      }

      try {
        const result = await tool.execute(args);

        if (result.status === "Completed") {
          executionResult.result = result.output;
        } else {
          return { error: result.errorText };
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
    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: ["--enable-features=WebMCPTesting", "--no-sandbox", "--disable-setuid-sandbox"],
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

    const rawTools = page.webmcp.tools();

    console.log(`Found ${rawTools.length} tool(s) via Puppeteer.`);
    return mapRawBrowserToolsToConfig(rawTools, []);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
