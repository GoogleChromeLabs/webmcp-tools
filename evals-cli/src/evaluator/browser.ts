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
      let executionResult: any;

      executionResult = await page.evaluate(
        async (name, args) => {
          try {
            let mct = null;
            if (typeof (navigator as any).modelContext?.executeTool === "function") {
              mct = (navigator as any).modelContext;
            } else if (typeof (navigator as any).modelContextTesting?.executeTool === "function") {
              mct = (navigator as any).modelContextTesting;
            }
            if (!mct) return { error: "modelContext not found" };
            const payload = typeof args === "string" ? args : JSON.stringify(args || {});
            const timeoutPromise = new Promise(r => setTimeout(() => r(null), 1000));
            const result = await Promise.race([mct.executeTool(name, payload), timeoutPromise]);

            return { result };
          } catch (e: any) {
            return { error: e.message || String(e) };
          }
        },
        t.functionName,
        args,
      );

      // If executionResult.result is null, it might be due to a navigation happening,
      // or because the form requires manual user confirmation. Simulator clicks submit.
      if (!executionResult.result) {
        await page.evaluate((toolName) => {
          const form = document.querySelector(`form[toolname="${toolName}"]`);
          if (form) {
            const btn = form.querySelector('button[type="submit"], input[type="submit"]');
            if (btn) (btn as any).click();
            else (form as any).requestSubmit();
          }
        }, t.functionName).catch(() => {});
        
        await page.waitForNavigation({ timeout: 5000 }).catch(() => {});
        executionResult = await page.evaluate(async () => {
          try {
            let mct = null;
            if (typeof (navigator as any).modelContext?.executeTool === "function") {
              mct = (navigator as any).modelContext;
            } else if (typeof (navigator as any).modelContextTesting?.executeTool === "function") {
              mct = (navigator as any).modelContextTesting;
            }

            if (!mct) return { error: "modelContext not found" };

            const result = await mct.getCrossDocumentScriptToolResult();
            return { result, crossDocument: true };
          } catch (e: any) {
            return { error: e.message || String(e) };
          }
        });
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
    },
  } as any);
}

/**
 * Launches Chrome Canary, navigates to the given URL, and retrieves the list
 * of tools exposed by the page via the WebMCP API.
 *
 * Requires Chrome Canary 146+ with the `chrome://flags/#enable-webmcp-testing`
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

    const rawTools = await page.evaluate(async () => {
      let modelContext = null;
      if (typeof (navigator as any).modelContext?.listTools === "function") {
        modelContext = (navigator as any).modelContext;
      } else if (typeof (navigator as any).modelContextTesting?.listTools === "function") {
        modelContext = (navigator as any).modelContextTesting;
      }

      if (!modelContext) {
        return null;
      }
      return await modelContext.listTools();
    });

    if (rawTools === null) {
      throw new Error(
        "The WebMCP API (window.navigator.modelContextTesting) is not available on this page.\n" +
          "Please ensure:\n" +
          "  1. You are using Chrome Canary version 146 or later.\n" +
          "  2. The flag chrome://flags/#enable-webmcp-testing is enabled.\n" +
          `  3. The page at ${url} implements the WebMCP API.`,
      );
    }

    if (!Array.isArray(rawTools) || rawTools.length === 0) {
      throw new Error(
        `The WebMCP API returned no tools from ${url}. ` +
          "Ensure the page exposes tools via modelContextTesting.listTools().",
      );
    }

    console.log(`Found ${rawTools.length} tool(s) via WebMCP API.`);
    return mapRawBrowserToolsToConfig(rawTools, []);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
