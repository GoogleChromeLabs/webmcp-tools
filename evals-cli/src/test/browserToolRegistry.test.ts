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
  it("should initialize and return empty list if page returns none", async () => {
    const page = new MockBrowserPage();
    page.evaluateResult = []; // No tools on page

    const registry = new BrowserToolRegistry(page);
    assert.deepStrictEqual(registry.getCurrentTools(), []);

    const synced = await registry.syncTools();
    assert.deepStrictEqual(synced, []);
    assert.deepStrictEqual(registry.getCurrentTools(), []);
  });

  it("should fetch and map page-level tools when present", async () => {
    const page = new MockBrowserPage();
    page.evaluateResult = [
      {
        name: "page_action",
        description: "Executes a page action",
        inputSchema: {
          type: "object",
          properties: {
            elementId: { type: "string" },
          },
        },
      },
    ];

    const registry = new BrowserToolRegistry(page);
    const synced = await registry.syncTools();

    assert.strictEqual(synced.length, 1);
    assert.strictEqual(synced[0].functionName, "page_action");
    assert.strictEqual(synced[0].description, "Executes a page action");
    assert.deepStrictEqual(synced[0].parameters, {
      type: "object",
      properties: { elementId: { type: "string" } },
    });
  });

  it("should execute tool inside page context and return success result", async () => {
    const page = new MockBrowserPage();
    // Simulate modelContext executeTool response:
    page.evaluateResult = { success: true, data: { status: "clicked" } };

    const registry = new BrowserToolRegistry(page);
    const result = await registry.executeTool("click_button", { id: "btn-1" });

    assert.deepStrictEqual(result, { status: "clicked" });
    assert.strictEqual(page.evaluateCalls.length, 1);
    assert.strictEqual(page.evaluateCalls[0].args[0], "click_button");
    assert.deepStrictEqual(page.evaluateCalls[0].args[1], { id: "btn-1" });
  });

  it("should return 'pending form submission' when tool result data is 'pending form submission'", async () => {
    const page = new MockBrowserPage();
    page.evaluateResult = { success: true, data: "pending form submission" };

    const registry = new BrowserToolRegistry(page);
    const result = await registry.executeTool("book_table", { guests: 2 });

    assert.strictEqual(result, "pending form submission");
  });

  it("should return error if page execution reports success: false", async () => {
    const page = new MockBrowserPage();
    page.evaluateResult = { success: false };

    const registry = new BrowserToolRegistry(page);
    const result = await registry.executeTool("click_button", { id: "btn-1" });

    assert.deepStrictEqual(result, { error: 'no tool named "click_button" was found' });
  });

  it("should execute page script, handle toolactivated, and resolve pending form submission on timeout", async () => {
    const page = new MockBrowserPage();
    page.evaluate = async (fn: any, ...args: any[]) => {
      const listeners: Record<string, Function[]> = {};
      const fakeWindow = {
        addEventListener: (event: string, cb: Function) => {
          listeners[event] = listeners[event] || [];
          listeners[event].push(cb);
        },
        removeEventListener: (event: string, cb: Function) => {
          if (listeners[event]) {
            listeners[event] = listeners[event].filter((l) => l !== cb);
          }
        },
      };
      const fakeDocument = {
        modelContext: {
          getTools: async () => [{ name: "book_table" }],
          executeTool: async () => {
            // Trigger toolactivated event
            const activatedCb = listeners["toolactivated"]?.[0];
            if (activatedCb) {
              activatedCb({ toolName: "book_table" });
            }
            // Return a promise that never resolves (simulating manual form submit wait)
            return new Promise(() => {});
          },
        },
      };

      // Execute in fake environment with 10ms timeout for test speed
      const fnStr = fn.toString();
      const testFn = new Function(
        "window",
        "document",
        "name",
        "callArgs",
        `return (${fnStr.replace("1000", "10")})(name, callArgs);`,
      );
      return testFn(fakeWindow, fakeDocument, args[0], args[1]);
    };

    const registry = new BrowserToolRegistry(page);
    const result = await registry.executeTool("book_table", { guests: 2 });
    assert.strictEqual(result, "pending form submission");
  });
});
