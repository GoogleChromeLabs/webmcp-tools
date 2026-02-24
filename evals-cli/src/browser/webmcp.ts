/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import puppeteer, { Browser } from "puppeteer-core";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { Tool } from "../types/tools.js";

type WebMcpToolSchema = {
  name: string;
  description: string;
  inputSchema: object | null;
};

import { findChromePath } from "../utils.js";
function mapToTools(rawTools: WebMcpToolSchema[]): Tool[] {
  return rawTools.map((t) => {
    const schema = t.inputSchema;
    const parameters =
      typeof schema === "string" ? JSON.parse(schema) : (schema ?? {});
    return {
      description: t.description,
      functionName: t.name,
      parameters,
    };
  });
}

/**
 * Launches Chrome Canary, navigates to the given URL, and retrieves the list
 * of tools exposed by the page via the WebMCP API
 * (`navigator.modelContextTesting.listTools()`).
 *
 * Requires Chrome Canary 146+ with the `chrome://flags/#enable-webmcp-testing`
 * flag enabled. The browser is always closed after the tools are retrieved,
 * even if an error occurs.
 *
 * @param url - The URL of the page to load. The page must implement the WebMCP
 *   API and expose at least one tool.
 * @returns A promise that resolves to the list of tools exposed by the page.
 * @throws If Chrome Canary is not found, the page fails to load, the WebMCP
 *   API is unavailable, or no tools are returned.
 */
export async function listToolsFromPage(url: string): Promise<Tool[]> {
  const executablePath = findChromePath();
  let browser: Browser | null = null;

  try {
    console.log(`Launching Chrome Canary from: ${executablePath}`);
    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: [
        "--enable-features=WebMCPTesting",
        "--no-sandbox",
        "--disable-setuid-sandbox",
      ],
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
      let mct = null;
      if (typeof (navigator as any).modelContext?.listTools === 'function') {
        mct = (navigator as any).modelContext;
      } else if (typeof (navigator as any).modelContextTesting?.listTools === 'function') {
        mct = (navigator as any).modelContextTesting;
      }

      if (!mct) {
        return null;
      }
      return await mct.listTools();
    });

    if (rawTools === null) {
      throw new Error(
        "The WebMCP API (window.navigator.modelContext or modelContextTesting) is not available on this page.\n" +
          "Please ensure:\n" +
          "  1. You are using Chrome Canary version 146 or later.\n" +
          "  2. The flag chrome://flags/#enable-webmcp-testing is enabled.\n" +
          `  3. The page at ${url} implements the WebMCP API.`,
      );
    }

    if (!Array.isArray(rawTools) || rawTools.length === 0) {
      throw new Error(
        `The WebMCP API returned no tools from ${url}. ` +
        "Ensure the page exposes tools via modelContext.listTools().",
      );
    }

    console.log(`Found ${rawTools.length} tool(s) via WebMCP API.`);
    return mapToTools(rawTools as WebMcpToolSchema[]);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
