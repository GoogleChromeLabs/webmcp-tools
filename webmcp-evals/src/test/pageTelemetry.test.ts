/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from "node:assert";
import { EventEmitter } from "node:events";
import { describe, it, mock } from "node:test";
import type { Page } from "puppeteer-core";
import { normalizeWebMcpResult, PageToolCallRecorder } from "../extension/pageTelemetry.js";

class FakeWebMcpPage extends EventEmitter {
  readonly webmcpEmitter = new EventEmitter();
  rawTools: any[] = [
    {
      name: "addToCart",
      description: "Adds an item to the cart",
      inputSchema: { type: "object", properties: { itemId: { type: "string" } } },
    },
    {
      name: "checkoutForm",
      description: "Declarative checkout form",
      inputSchema: { type: "object", properties: { email: { type: "string" } } },
    },
  ];

  readonly webmcp = {
    tools: () => this.rawTools,
    on: (event: "toolinvoked" | "toolresponded", listener: (...args: any[]) => void) =>
      this.webmcpEmitter.on(event, listener),
    off: (event: "toolinvoked" | "toolresponded", listener: (...args: any[]) => void) =>
      this.webmcpEmitter.off(event, listener),
  };

  invoke(
    id: string,
    name: string,
    input: Record<string, unknown>,
    formElement?: Promise<{ dispose(): Promise<void> } | undefined>,
  ) {
    this.webmcpEmitter.emit("toolinvoked", { id, tool: { name, formElement }, input });
  }

  respond(
    id: string,
    status: "Completed" | "Error" | "Canceled",
    output?: unknown,
    errorText?: string,
  ) {
    this.webmcpEmitter.emit("toolresponded", { id, status, output, errorText });
  }

  emitConsoleError(text: string, url = "http://localhost:5173/app.js", lineNumber = 42) {
    this.emit("console", {
      type: () => "error",
      text: () => text,
      location: () => ({ url, lineNumber, columnNumber: 8 }),
    });
  }

  emitConsoleLog(text: string) {
    this.emit("console", {
      type: () => "log",
      text: () => text,
      location: () => ({}),
    });
  }
}

describe("normalizeWebMcpResult", () => {
  it("unwraps JSON strings, MCP content envelopes, and error payloads consistently", () => {
    assert.deepStrictEqual(
      normalizeWebMcpResult("search", {
        status: "Completed",
        output: JSON.stringify({ count: 2 }),
      }),
      { count: 2 },
    );

    assert.strictEqual(
      normalizeWebMcpResult("search", {
        status: "Completed",
        output: JSON.stringify({ content: [{ type: "text", text: "Added!" }] }),
      }),
      "Added!",
    );

    assert.deepStrictEqual(
      normalizeWebMcpResult("search", {
        status: "Completed",
        output: { content: [{ type: "text", text: "Invalid SKU" }], isError: true },
      }),
      { error: "Invalid SKU" },
    );

    assert.deepStrictEqual(
      normalizeWebMcpResult("search", {
        status: "Error",
        errorText: "Tool threw TypeError",
      }),
      { error: "Tool threw TypeError" },
    );

    assert.strictEqual(normalizeWebMcpResult("ping", { status: "Completed" }), "Success");
  });
});

describe("PageToolCallRecorder", () => {
  it("records completed tool calls and pending form tools, and does not blame later console errors on a finished turn", async () => {
    const page = new FakeWebMcpPage();
    const recorder = PageToolCallRecorder.attach(page as unknown as Page);

    // Turn 1: one completed imperative tool call
    recorder.markTurnStart();
    page.invoke("call-1", "addToCart", { itemId: "sku-99" });
    // Before the formElement microtask settles, an unanswered imperative call is
    // labelled as a pending call rather than a pending form submission.
    assert.strictEqual(
      recorder.snapshotTurn("").toolCalls[0]?.result,
      "pending (no response before the turn ended)",
    );
    page.respond("call-1", "Completed", JSON.stringify({ cartCount: 1 }));

    const turn1 = recorder.flushTurn("Added sku-99 to your cart.");
    assert.deepStrictEqual(turn1.toolCalls, [
      {
        functionName: "addToCart",
        args: { itemId: "sku-99" },
        result: { cartCount: 1 },
      },
    ]);
    assert.strictEqual(turn1.steps.length, 2);
    assert.strictEqual(turn1.steps[0]?.availableTools?.length, 2);
    assert.strictEqual(turn1.steps[1]?.text, "Added sku-99 to your cart.");

    // Turn 2: declarative form filled without autosubmit (remains pending)
    recorder.markTurnStart();
    page.invoke(
      "call-2",
      "checkoutForm",
      { email: "alex@example.com" },
      Promise.resolve({ dispose: async () => {} }),
    );
    await Promise.resolve();

    const turn2 = recorder.flushTurn("I filled in your email; please submit the form.");
    assert.deepStrictEqual(turn2.toolCalls, [
      {
        functionName: "checkoutForm",
        args: { email: "alex@example.com" },
        result: "pending form submission",
      },
    ]);

    // A console.error after Turn 2 was flushed is not blamed on Turn 2's pending form.
    page.emitConsoleError("background analytics error between turns");
    assert.strictEqual(recorder.getBrowserConsoleErrors().length, 0);

    recorder.dispose();
  });

  it("labels unanswered calls by tool kind and ignores responses to calls it never saw", async () => {
    const page = new FakeWebMcpPage();
    const recorder = PageToolCallRecorder.attach(page as unknown as Page);
    let formHandleDisposed = false;

    recorder.markTurnStart();
    page.invoke(
      "form-1",
      "checkoutForm",
      { email: "alex@example.com" },
      Promise.resolve({
        dispose: async () => {
          formHandleDisposed = true;
        },
      }),
    );
    page.invoke("call-1", "addToCart", { itemId: "sku-1" }, Promise.resolve(undefined));
    // A late response to a harness setup call made before the recorder attached.
    page.respond("setup-1", "Completed", JSON.stringify({ ok: true }));
    await new Promise((resolve) => setImmediate(resolve));

    const turn = recorder.flushTurn("");
    assert.deepStrictEqual(
      turn.toolCalls.map((call) => [call.functionName, call.result]),
      [
        ["checkoutForm", "pending form submission"],
        ["addToCart", "pending (no response before the turn ended)"],
      ],
    );
    assert.ok(formHandleDisposed, "the form element handle is released");

    recorder.dispose();
  });

  it("correlates console.error and pageerror events only while a WebMCP tool call is active", () => {
    const page = new FakeWebMcpPage();
    const recorder = PageToolCallRecorder.attach(page as unknown as Page);

    // Unrelated error outside any tool call is ignored
    page.emitConsoleError("unrelated startup warning");
    assert.strictEqual(recorder.getBrowserConsoleErrors().length, 0);

    // Start a tool call and emit console.log (ignored), console.error (captured), and pageerror (captured)
    page.invoke("call-err", "addToCart", { itemId: "bad-id" });
    page.emitConsoleLog("normal debug output");
    page.emitConsoleError("Failed to read inventory");
    page.emit("pageerror", new Error("Cannot read properties of undefined"));
    page.respond("call-err", "Error", undefined, "Inventory lookup failed");

    const errors = recorder.getBrowserConsoleErrors();
    assert.strictEqual(errors.length, 2);
    assert.deepStrictEqual(errors[0], {
      kind: "console",
      message: "Failed to read inventory",
      url: "http://localhost:5173/app.js",
      lineNumber: 42,
      columnNumber: 8,
      toolCalls: [{ functionName: "addToCart", args: { itemId: "bad-id" } }],
    });
    assert.deepStrictEqual(errors[1], {
      kind: "pageerror",
      message: "Cannot read properties of undefined",
      toolCalls: [{ functionName: "addToCart", args: { itemId: "bad-id" } }],
    });

    assert.strictEqual(recorder.flushTurn("").toolCalls.length, 1);
    recorder.dispose();
    // After dispose, further events are ignored
    recorder.markTurnStart();
    page.invoke("call-after", "addToCart", { itemId: "after" });
    assert.strictEqual(recorder.flushTurn("").toolCalls.length, 0);
  });

  it("counts tool calls that arrive between turns in the next turn instead of dropping them", () => {
    const page = new FakeWebMcpPage();
    const recorder = PageToolCallRecorder.attach(page as unknown as Page);
    const warn = mock.method(console, "warn", () => undefined);

    try {
      recorder.markTurnStart();
      page.invoke("call-1", "addToCart", { itemId: "sku-1" });
      page.respond("call-1", "Completed", JSON.stringify({ ok: true }));
      assert.deepStrictEqual(
        recorder.flushTurn("").toolCalls.map((call) => call.args),
        [{ itemId: "sku-1" }],
      );

      // The extension makes one more call after its turn was judged finished.
      page.invoke("late-1", "addToCart", { itemId: "sku-late" });
      page.respond("late-1", "Completed", JSON.stringify({ ok: true }));

      recorder.markTurnStart();
      page.invoke("call-2", "addToCart", { itemId: "sku-2" });
      page.respond("call-2", "Completed", JSON.stringify({ ok: true }));
      assert.deepStrictEqual(
        recorder.flushTurn("").toolCalls.map((call) => call.args),
        [{ itemId: "sku-late" }, { itemId: "sku-2" }],
      );
      assert.match(
        String(warn.mock.calls[0]?.arguments[0]),
        /1 WebMCP tool call\(s\) arrived after the previous extension turn ended/,
      );
    } finally {
      warn.mock.restore();
      recorder.dispose();
    }
  });
});
