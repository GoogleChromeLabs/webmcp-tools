/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from "node:assert";
import { EventEmitter } from "node:events";
import { describe, it } from "node:test";
import type { BrowserPage } from "../backends/index.js";
import { BrowserToolRegistry } from "../evaluator/browser.js";

describe("BrowserToolRegistry console errors", () => {
  it("attributes errors emitted during a tool call and stops listening afterwards", async () => {
    const page = new EventEmitter() as EventEmitter & BrowserPage;
    page.webmcp = {
      tools: () => [
        {
          name: "submit_order",
          description: "Submit an order",
          inputSchema: { type: "object" },
          execute: async () => {
            page.emit("console", {
              type: () => "warning",
              text: () => "Deprecated API",
              location: () => ({
                url: "https://example.test/app.js",
                lineNumber: 4,
                columnNumber: 2,
              }),
            });
            page.emit("console", {
              type: () => "error",
              text: () => "Request failed",
              location: () => ({
                url: "https://example.test/app.js",
                lineNumber: 8,
                columnNumber: 12,
              }),
            });
            page.emit("pageerror", new Error("Unhandled failure"));
            return { status: "Completed", output: "submitted" };
          },
        },
      ],
    } as any;

    const registry = new BrowserToolRegistry(page);
    await registry.executeTool("submit_order", { orderId: "<unsafe>" });

    page.emit("console", {
      type: () => "error",
      text: () => "Unrelated background failure",
      location: () => ({}),
    });

    assert.deepStrictEqual(registry.getBrowserConsoleErrors(), [
      {
        kind: "console",
        message: "Request failed",
        url: "https://example.test/app.js",
        lineNumber: 8,
        columnNumber: 12,
        toolCalls: [
          {
            functionName: "submit_order",
            args: { orderId: "<unsafe>" },
          },
        ],
      },
      {
        kind: "pageerror",
        message: "Unhandled failure",
        toolCalls: [
          {
            functionName: "submit_order",
            args: { orderId: "<unsafe>" },
          },
        ],
      },
    ]);
    assert.strictEqual(page.listenerCount("console"), 0);
    assert.strictEqual(page.listenerCount("pageerror"), 0);
  });

  it("records one diagnostic with every overlapping tool call as a candidate", async () => {
    const page = new EventEmitter() as EventEmitter & BrowserPage;
    page.webmcp = {
      tools: () =>
        ["first_tool", "second_tool"].map((name) => ({
          name,
          description: name,
          inputSchema: { type: "object" },
          execute: async () => ({ status: "Completed", output: "done" }),
        })),
    } as any;

    const registry = new BrowserToolRegistry(page);
    const first = registry.executeTool("first_tool", { id: 1 });
    const second = registry.executeTool("second_tool", { id: 2 });

    page.emit("console", {
      type: () => "error",
      text: () => "Failure during overlapping calls",
      location: () => ({}),
    });
    await Promise.all([first, second]);

    assert.deepStrictEqual(registry.getBrowserConsoleErrors(), [
      {
        kind: "console",
        message: "Failure during overlapping calls",
        toolCalls: [
          { functionName: "first_tool", args: { id: 1 } },
          { functionName: "second_tool", args: { id: 2 } },
        ],
      },
    ]);
    assert.strictEqual(page.listenerCount("console"), 0);
    assert.strictEqual(page.listenerCount("pageerror"), 0);
  });

  it("removes listeners when tool execution fails", async () => {
    const page = new EventEmitter() as EventEmitter & BrowserPage;
    page.webmcp = {
      tools: () => [
        {
          name: "failing_tool",
          description: "Always fails",
          inputSchema: { type: "object" },
          execute: async () => {
            throw new Error("Tool failed");
          },
        },
      ],
    } as any;

    const registry = new BrowserToolRegistry(page);
    assert.deepStrictEqual(await registry.executeTool("failing_tool"), {
      error: "Tool failed",
    });
    assert.strictEqual(page.listenerCount("console"), 0);
    assert.strictEqual(page.listenerCount("pageerror"), 0);
  });
});
