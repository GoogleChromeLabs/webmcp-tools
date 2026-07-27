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

  it("should return error if page execution reports success: false", async () => {
    const page = new MockBrowserPage();
    page.evaluateResult = { success: false };

    const registry = new BrowserToolRegistry(page);
    const result = await registry.executeTool("click_button", { id: "btn-1" });

    assert.deepStrictEqual(result, { error: 'no tool named "click_button" was found' });
  });
});
