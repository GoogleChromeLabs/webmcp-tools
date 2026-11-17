/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from "node:assert";
import { EventEmitter, getEventListeners } from "node:events";
import { describe, it } from "node:test";
import { BrowserPage, BrowserToolRegistry, type SettleClock } from "../evaluator/browser.js";

class MockBrowserPage {
  public evaluateResult: unknown = "complete";
  public evaluateCalls: Array<{ fn: string | Function; args: unknown[] }> = [];
  public webmcp: any = {
    tools: () => [],
  };

  async evaluate(fn: string | Function, ...args: unknown[]): Promise<any> {
    this.evaluateCalls.push({ fn, args });
    return this.evaluateResult;
  }
}

function createRegistry(page: MockBrowserPage): BrowserToolRegistry {
  return new BrowserToolRegistry(page as unknown as BrowserPage);
}

describe("BrowserToolRegistry", () => {
  it("should initialize and return empty list if page returns no tools", async () => {
    const page = new MockBrowserPage();

    const registry = createRegistry(page);
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

    const registry = createRegistry(page);
    const result = await registry.executeTool("click_button", { id: "btn-1" });

    assert.deepStrictEqual(result, { status: "clicked" });
    assert.deepStrictEqual(executedInput, { id: "btn-1" });
  });

  it("should return error when tool is not found", async () => {
    const page = new MockBrowserPage();

    const registry = createRegistry(page);
    const result = await registry.executeTool("click_button", { id: "btn-1" });

    assert.deepStrictEqual(result, { error: 'no tool named "click_button" was found' });
  });

  it("should expose page execution failures to deterministic callers", async () => {
    const page = new MockBrowserPage();

    const registry = createRegistry(page);
    const result = await registry.executeToolChecked("click_button", { id: "btn-1" });

    assert.deepStrictEqual(result, {
      success: false,
      error: 'no tool named "click_button" was found',
    });
  });

  it("should expose successful structured content to deterministic callers", async () => {
    const page = new MockBrowserPage();
    page.webmcp = {
      tools: () => [
        {
          name: "click_button",
          description: "Click a button",
          inputSchema: { type: "object" },
          execute: async () => ({
            status: "Completed",
            output: { content: [{ type: "text", text: "clicked" }] },
          }),
        },
      ],
    };

    const registry = createRegistry(page);
    const result = await registry.executeToolChecked("click_button", { id: "btn-1" });

    assert.deepStrictEqual(result, { success: true, result: "clicked" });
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

    const registry = createRegistry(page);
    const result = await registry.executeTool("failing_tool", {});

    assert.deepStrictEqual(result, { error: "Execution failed in page context" });
  });

  it("should preserve null return values in executeTool and executeToolChecked", async () => {
    const page = new MockBrowserPage();
    page.webmcp = {
      tools: () => [
        {
          name: "null_tool",
          description: "Tool that returns explicit null output",
          inputSchema: { type: "object" },
          execute: async () => ({
            status: "Completed",
            output: null,
          }),
        },
      ],
    };

    const registry = createRegistry(page);

    // 1. Verify executeToolChecked preserves null inside { success: true, result: null }
    const checkedResult = await registry.executeToolChecked("null_tool", {});
    assert.deepStrictEqual(checkedResult, { success: true, result: null });

    // 2. Verify executeTool returns null directly (instead of coercing to "Success")
    const result = await registry.executeTool("null_tool", {});
    assert.strictEqual(result, null);
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
    const registry = createRegistry(page);

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

  it("should propagate isError flag on structured MCP response as failure", async () => {
    const page = new MockBrowserPage();
    page.webmcp = {
      tools: () => [
        {
          name: "failing_mcp",
          description: "Fails with isError",
          inputSchema: { type: "object" },
          execute: async () => ({
            status: "Completed",
            output: { content: [{ type: "text", text: "Out of stock" }], isError: true },
          }),
        },
      ],
    };

    const registry = createRegistry(page);
    const result = await registry.executeToolChecked("failing_mcp", {});

    assert.deepStrictEqual(result, { success: false, error: "Out of stock" });
  });

  it("should preserve falsy returns like false or 0 in executeTool", async () => {
    const page = new MockBrowserPage();
    page.webmcp = {
      tools: () => [
        {
          name: "bool_tool",
          description: "Returns false",
          inputSchema: { type: "object" },
          execute: async () => ({
            status: "Completed",
            output: false,
          }),
        },
      ],
    };

    const registry = createRegistry(page);
    const result = await registry.executeTool("bool_tool", {});

    assert.strictEqual(result, false);
  });

  describe("waitForToolsToSettle", () => {
    function fakeSettleClock(onStep?: (prev: number, next: number) => void): {
      clock: SettleClock;
      elapsed: () => number;
    } {
      let now = 0;
      return {
        elapsed: () => now,
        clock: {
          now: () => now,
          sleep: async (ms, signal) => {
            signal?.throwIfAborted();
            const prev = now;
            now += ms;
            onStep?.(prev, now);
            signal?.throwIfAborted();
          },
        },
      };
    }

    it("should wait for late-registered tools until changes pause", async () => {
      type RawMockTool = {
        name: string;
        description: string;
        frame?: object;
        inputSchema?: object;
      };
      const webmcpEmitter = new EventEmitter() as EventEmitter & { tools: () => RawMockTool[] };
      let currentTools: RawMockTool[] = [{ name: "search_location", description: "Search" }];
      webmcpEmitter.tools = () => currentTools;

      const page = new EventEmitter() as EventEmitter & {
        webmcp: typeof webmcpEmitter;
        evaluate: () => Promise<string>;
      };
      page.webmcp = webmcpEmitter;
      page.evaluate = async () => "complete";

      const { clock, elapsed } = fakeSettleClock((prev, next) => {
        if (prev < 150 && next >= 150) {
          currentTools = [
            { name: "search_location", description: "Search" },
            { name: "get_hotel_search_results", description: "Get results" },
          ];
          webmcpEmitter.emit("toolsadded");
        }
        if (prev < 200 && next >= 200) {
          currentTools = [
            { name: "search_location", description: "Search" },
            { name: "get_hotel_search_results", description: "Get results" },
            { name: "filter_search_results", description: "Filter results" },
          ];
          webmcpEmitter.emit("toolsadded");
        }
      });

      const controller = new AbortController();
      const registry = new BrowserToolRegistry(page as unknown as BrowserPage);
      await registry.waitForToolsToSettle(
        { signal: controller.signal, quietMs: 250, timeoutMs: 2_000, pollMs: 25 },
        clock,
      );

      assert.deepStrictEqual(
        registry.getCurrentTools().map((tool) => tool.functionName),
        ["search_location", "get_hotel_search_results", "filter_search_results"],
      );
      assert.strictEqual(elapsed(), 450);
      assert.strictEqual(webmcpEmitter.listenerCount("toolsadded"), 0);
      assert.strictEqual(webmcpEmitter.listenerCount("toolsremoved"), 0);
      assert.strictEqual(page.listenerCount("framenavigated"), 0);
      assert.strictEqual(page.listenerCount("close"), 0);
      assert.strictEqual(getEventListeners(controller.signal, "abort").length, 0);
    });

    it("should wait across document navigation, evaluate rejections, and in-flight navigation races", async () => {
      type RawMockTool = { name: string; description: string };
      const webmcpEmitter = new EventEmitter() as EventEmitter & { tools: () => RawMockTool[] };
      let currentTools: RawMockTool[] = [{ name: "open_door", description: "Open door" }];
      let readyState = "complete";
      let rejectNextEvaluate = false;
      let triggerMidEvaluateNav = true;
      const mainFrame = {};
      webmcpEmitter.tools = () => currentTools;

      const page = new EventEmitter() as EventEmitter & {
        webmcp: typeof webmcpEmitter;
        mainFrame: () => object;
        evaluate: () => Promise<string>;
      };
      page.webmcp = webmcpEmitter;
      page.mainFrame = () => mainFrame;
      page.evaluate = async () => {
        if (triggerMidEvaluateNav) {
          triggerMidEvaluateNav = false;
          readyState = "loading";
          currentTools = [];
          page.emit("framenavigated", mainFrame);
          webmcpEmitter.emit("toolsremoved");
          rejectNextEvaluate = true;
          return "complete";
        }
        if (rejectNextEvaluate) {
          rejectNextEvaluate = false;
          throw new Error("Execution context was destroyed");
        }
        return readyState;
      };

      const { clock, elapsed } = fakeSettleClock((prev, next) => {
        if (prev < 100 && next >= 100) {
          readyState = "complete";
          currentTools = [{ name: "enter_forest", description: "Enter forest" }];
          webmcpEmitter.emit("toolsadded");
        }
      });

      const registry = new BrowserToolRegistry(page as unknown as BrowserPage);
      await registry.waitForToolsToSettle({ quietMs: 100, timeoutMs: 1_000, pollMs: 25 }, clock);

      assert.deepStrictEqual(
        registry.getCurrentTools().map((tool) => tool.functionName),
        ["enter_forest"],
      );
      assert.ok(
        elapsed() >= 200,
        `expected to wait until new page loaded + quietMs, got ${elapsed()}ms`,
      );
    });

    it("should detect subframe navigation, distinct frame tools, and in-place schema updates", async () => {
      const mainFrame = {};
      const childFrame = {};
      let currentTools: Array<{
        name: string;
        description: string;
        frame: object;
        inputSchema?: object;
      }> = [{ name: "submit", description: "Submit", frame: mainFrame, inputSchema: { v: 1 } }];

      const webmcpEmitter = new EventEmitter() as EventEmitter & {
        tools: () => typeof currentTools;
      };
      webmcpEmitter.tools = () => currentTools;

      const page = new EventEmitter() as EventEmitter & {
        webmcp: typeof webmcpEmitter;
        mainFrame: () => object;
        evaluate: () => Promise<string>;
      };
      page.webmcp = webmcpEmitter;
      page.mainFrame = () => mainFrame;
      let evaluateCalls = 0;
      page.evaluate = async () => {
        evaluateCalls++;
        return "complete";
      };

      const { clock, elapsed } = fakeSettleClock((prev, next) => {
        if (prev < 50 && next >= 50) {
          page.emit("framenavigated", childFrame);
          currentTools = [
            { name: "submit", description: "Submit", frame: childFrame, inputSchema: { v: 1 } },
          ];
        }
        if (prev < 100 && next >= 100) {
          currentTools = [
            { name: "submit", description: "Submit", frame: childFrame, inputSchema: { v: 2 } },
          ];
        }
      });

      const registry = new BrowserToolRegistry(page as unknown as BrowserPage);
      await registry.waitForToolsToSettle({ quietMs: 100, timeoutMs: 1_000, pollMs: 25 }, clock);

      assert.strictEqual(evaluateCalls, 1, "Subframe navigation should not reset main-frame ready");
      assert.strictEqual(elapsed(), 200);
    });

    it("should give up after timeoutMs when page registers no tools or evaluate hangs", async () => {
      const page = new MockBrowserPage();
      const registry = createRegistry(page);
      const { clock, elapsed } = fakeSettleClock();

      await registry.waitForToolsToSettle({ quietMs: 250, timeoutMs: 2_000, pollMs: 25 }, clock);
      assert.strictEqual(elapsed(), 2_000);

      const hungPage = new MockBrowserPage();
      hungPage.evaluate = () => new Promise(() => {});
      await assert.doesNotReject(
        createRegistry(hungPage).waitForToolsToSettle({ timeoutMs: 30, pollMs: 10 }),
      );
    });

    it("should return immediately on pre-aborted signal or already-closed page", async () => {
      const page = new MockBrowserPage();
      const registry = createRegistry(page);

      const preAborted = new AbortController();
      preAborted.abort();
      await registry.waitForToolsToSettle({ signal: preAborted.signal });
      assert.strictEqual(page.evaluateCalls.length, 0);

      const closedPage = new EventEmitter() as EventEmitter & {
        webmcp: { tools: () => never[] };
        isClosed: () => boolean;
        evaluate: () => Promise<string>;
      };
      closedPage.webmcp = { tools: () => [] };
      closedPage.isClosed = () => true;
      closedPage.evaluate = async () => {
        throw new Error("should not evaluate a closed page");
      };
      await new BrowserToolRegistry(closedPage as unknown as BrowserPage).waitForToolsToSettle();
    });

    it("should resolve early without throwing and clean up listeners on mid-wait abort or page close", async () => {
      const webmcpEmitter = new EventEmitter() as EventEmitter & {
        tools: () => Array<{ name: string; description: string }>;
      };
      webmcpEmitter.tools = () => [{ name: "search_location", description: "Search" }];

      const page = new EventEmitter() as EventEmitter & {
        webmcp: typeof webmcpEmitter;
        evaluate: () => Promise<string>;
      };
      page.webmcp = webmcpEmitter;
      page.evaluate = async () => "complete";

      // 1. Deterministic mid-wait AbortSignal cancellation with rejecting SettleClock.
      const abortController = new AbortController();
      const abortRun = fakeSettleClock((prev, next) => {
        if (prev < 50 && next >= 50) {
          abortController.abort(new Error("cancelled"));
        }
      });
      const registry = new BrowserToolRegistry(page as unknown as BrowserPage);
      await assert.doesNotReject(
        registry.waitForToolsToSettle(
          { signal: abortController.signal, quietMs: 500, timeoutMs: 2_000, pollMs: 25 },
          abortRun.clock,
        ),
      );
      assert.strictEqual(abortRun.elapsed(), 50);
      assert.strictEqual(getEventListeners(abortController.signal, "abort").length, 0);

      // 2. Deterministic mid-wait page "close" event with rejecting SettleClock.
      const closeSignal = new AbortController();
      const closeRun = fakeSettleClock((prev, next) => {
        if (prev < 50 && next >= 50) {
          page.emit("close");
        }
      });
      await assert.doesNotReject(
        registry.waitForToolsToSettle(
          { signal: closeSignal.signal, quietMs: 500, timeoutMs: 2_000, pollMs: 25 },
          closeRun.clock,
        ),
      );
      assert.strictEqual(closeRun.elapsed(), 50);
      assert.strictEqual(webmcpEmitter.listenerCount("toolsadded"), 0);
      assert.strictEqual(webmcpEmitter.listenerCount("toolsremoved"), 0);
      assert.strictEqual(page.listenerCount("framenavigated"), 0);
      assert.strictEqual(page.listenerCount("close"), 0);
      assert.strictEqual(getEventListeners(closeSignal.signal, "abort").length, 0);
    });
  });
});
