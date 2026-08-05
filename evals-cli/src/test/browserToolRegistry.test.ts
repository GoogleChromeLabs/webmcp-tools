/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from "node:assert";
import { describe, it } from "node:test";
import { BrowserPage } from "../backends/index.js";
import { BrowserToolRegistry } from "../evaluator/browser.js";

class MockBrowserPage implements BrowserPage {
  public evaluateResult: unknown = [];
  public evaluateCalls: Array<{ fn: string | Function; args: unknown[] }> = [];
  public navigationCalls: Array<{ options?: unknown }> = [];
  public webmcp: any = {
    tools: () => [],
  };

  async evaluate(fn: string | Function, ...args: unknown[]): Promise<any> {
    this.evaluateCalls.push({ fn, args });
    return this.evaluateResult;
  }

  async waitForNavigation(options?: unknown): Promise<any> {
    this.navigationCalls.push({ options });
    return {};
  }
}

describe("BrowserToolRegistry", () => {
  it("should initialize and return empty list if page returns no tools", async () => {
    const page = new MockBrowserPage();

    const registry = new BrowserToolRegistry(page);
    assert.deepStrictEqual(registry.getCurrentTools(), []);

    const synced = registry.syncTools();
    assert.deepStrictEqual(synced, []);
    assert.deepStrictEqual(registry.getCurrentTools(), []);
  });

  it("should execute tool via page.webmcp and return output on Completed status", async () => {
    let executedInput: unknown = null;
    const page = new MockBrowserPage();
    page.webmcp = {
      tools: () => [
        {
          name: "click_button",
          description: "Click a button",
          inputSchema: { type: "object" },
          execute: async (input: unknown) => {
            executedInput = input;
            return { status: "Completed", output: { status: "clicked" } };
          },
        },
      ],
    };

    const registry = new BrowserToolRegistry(page);
    const result = await registry.executeTool("click_button", { id: "btn-1" });

    assert.deepStrictEqual(result, { status: "clicked" });
    assert.deepStrictEqual(executedInput, { id: "btn-1" });
  });

  it("should return error when tool is not found", async () => {
    const page = new MockBrowserPage();

    const registry = new BrowserToolRegistry(page);
    const result = await registry.executeTool("click_button", { id: "btn-1" });

    assert.deepStrictEqual(result, { error: 'no tool named "click_button" was found' });
  });

  it("should return error when tool execution fails with Error status", async () => {
    const page = new MockBrowserPage();
    page.webmcp = {
      tools: () => [
        {
          name: "failing_tool",
          description: "Fails always",
          inputSchema: { type: "object" },
          execute: async () => {
            return { status: "Error", errorText: "Execution failed in page context" };
          },
        },
      ],
    };

    const registry = new BrowserToolRegistry(page);
    const result = await registry.executeTool("failing_tool", {});

    assert.deepStrictEqual(result, { error: "Execution failed in page context" });
  });

  it("should handle navigation when tool execution output is null", async () => {
    const page = new MockBrowserPage();
    page.evaluateResult = { result: '{"type":"JSON-LD"}', crossDocument: true };
    page.webmcp = {
      tools: () => [
        {
          name: "nav_tool",
          description: "Navigates page",
          inputSchema: { type: "object" },
          execute: async () => {
            return { status: "Completed", output: null };
          },
        },
      ],
    };

    const registry = new BrowserToolRegistry(page);
    const result = await registry.executeTool("nav_tool", {});

    assert.strictEqual(page.navigationCalls.length, 1);
    assert.deepStrictEqual(result, { type: "JSON-LD" });
  });

  it("should handle declarative tool without autosubmit, listen for toolinvoked, and resolve pending form submission on timeout", async () => {
    const listeners: Record<string, Function[]> = {};
    const page = new MockBrowserPage();
    page.webmcp = {
      once: (event: string, cb: Function) => {
        listeners[event] = listeners[event] || [];
        listeners[event].push(cb);
      },
      off: (event: string, cb: Function) => {
        if (listeners[event]) {
          listeners[event] = listeners[event].filter((l) => l !== cb);
        }
      },
      tools: () => [
        {
          name: "book_table",
          description: "Form-based tool without autosubmit",
          formElement: Promise.resolve({} as any),
          annotations: { autosubmit: false },
          execute: async () => {
            // Trigger toolinvoked listener like Puppeteer CDP event would
            const invokedCb = listeners["toolinvoked"]?.[0];
            if (invokedCb) {
              invokedCb({ tool: { name: "book_table" } });
            }
            // Promise that doesn't resolve immediately (simulating form wait)
            return new Promise(() => {});
          },
        },
      ],
    };

    // Override setTimeout in execution context with fast timeout for speed
    const registry = new BrowserToolRegistry(page);

    // Fast-forward or test using speed up: since code uses 1000ms timeout, let's test execution
    const origSetTimeout = global.setTimeout;
    try {
      global.setTimeout = ((cb: Function, _ms: number) => origSetTimeout(cb, 10)) as any;
      const result = await registry.executeTool("book_table", { guests: 2 });
      assert.strictEqual(result, "pending form submission");
    } finally {
      global.setTimeout = origSetTimeout;
    }
  });
});
