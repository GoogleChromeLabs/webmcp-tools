/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from "node:assert";
import { describe, it } from "node:test";
import { BrowserPage } from "../backends/index.js";
import { BrowserToolRegistry } from "../evaluator/browser.js";
import { Tool } from "../types/tools.js";

class MockBrowserPage implements BrowserPage {
  public evaluateResult: any[] = [];
  public evaluateCalls: Array<{ fn: any; args: any[] }> = [];
  public navigationCalls: any[] = [];

  async evaluate(fn: string | Function, ...args: any[]): Promise<any> {
    this.evaluateCalls.push({ fn, args });
    return this.evaluateResult;
  }

  async waitForNavigation(options?: any): Promise<any> {
    this.navigationCalls.push({ options });
    return {};
  }
}

describe("BrowserToolRegistry", () => {
  const fallbackTools: Tool[] = [
    {
      functionName: "fallback_tool",
      description: "Fallback description",
      parameters: { type: "object", properties: {} },
    },
  ];

  it("should initialize with empty currentTools and fallback to initial tools if page returns none", async () => {
    const page = new MockBrowserPage();
    page.evaluateResult = []; // No tools on page

    const registry = new BrowserToolRegistry(fallbackTools, page);
    assert.deepStrictEqual(registry.getCurrentTools(), []);

    const synced = await registry.syncTools();
    assert.deepStrictEqual(synced, fallbackTools);
    assert.deepStrictEqual(registry.getCurrentTools(), fallbackTools);

    // Verify fallback tool was bound to execution triggers
    assert.ok(registry.aiToolsWithExecution["fallback_tool"]);
    assert.strictEqual(
      registry.aiToolsWithExecution["fallback_tool"].description,
      "Fallback description",
    );
  });

  it("should fetch, map, and wrap page-level tools when present", async () => {
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

    const registry = new BrowserToolRegistry(fallbackTools, page);
    const synced = await registry.syncTools();

    assert.strictEqual(synced.length, 1);
    assert.strictEqual(synced[0].functionName, "page_action");
    assert.strictEqual(synced[0].description, "Executes a page action");
    assert.deepStrictEqual(synced[0].parameters, {
      type: "object",
      properties: { elementId: { type: "string" } },
    });

    assert.ok(registry.aiToolsWithExecution["page_action"]);
    assert.ok(!registry.aiToolsWithExecution["fallback_tool"]);
    assert.strictEqual(
      registry.aiToolsWithExecution["page_action"].description,
      "Executes a page action",
    );
  });

  it("should update dynamic tools and clear old tool wrappers on subsequent sync calls", async () => {
    const page = new MockBrowserPage();
    page.evaluateResult = [
      {
        name: "tool_one",
        description: "First tool",
        inputSchema: { type: "object" },
      },
    ];

    const registry = new BrowserToolRegistry(fallbackTools, page);
    await registry.syncTools();
    assert.ok(registry.aiToolsWithExecution["tool_one"]);

    // Change page tools dynamically (e.g. after a navigation step)
    page.evaluateResult = [
      {
        name: "tool_two",
        description: "Second tool",
        inputSchema: { type: "object" },
      },
    ];

    const updated = await registry.syncTools();
    assert.strictEqual(updated.length, 1);
    assert.strictEqual(updated[0].functionName, "tool_two");

    // Old wrapper is removed, new wrapper is added
    assert.ok(!registry.aiToolsWithExecution["tool_one"]);
    assert.ok(registry.aiToolsWithExecution["tool_two"]);
  });
});
