/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from "node:assert";
import { describe, it } from "node:test";
import {
  explicitToolFailure,
  runToolCallSequence,
  ToolSequenceRegistry,
  withTimeout,
} from "../simulate/toolSequence.js";
import { Tool } from "../types/tools.js";

const tool = (functionName: string): Tool => ({
  functionName,
  description: `${functionName} description`,
  parameters: {},
});

/** Serves a different tool list on each read, so a sequence can watch tools appear. */
class FakeRegistry implements ToolSequenceRegistry {
  calls: Array<{ name: string; args?: Record<string, unknown> }> = [];
  readCount = 0;

  constructor(
    private readonly toolsByRead: Tool[][],
    private readonly failures: Record<string, string> = {},
  ) {}

  async getCurrentTools(): Promise<Tool[]> {
    const tools = this.toolsByRead[Math.min(this.readCount, this.toolsByRead.length - 1)] || [];
    this.readCount++;
    return tools;
  }

  async executeToolChecked(
    name: string,
    args?: Record<string, unknown>,
  ): Promise<{ success: true; result: unknown } | { success: false; error: string }> {
    this.calls.push({ name, args });
    if (this.failures[name]) return { success: false, error: this.failures[name] };
    return { success: true, result: { ok: name } };
  }
}

const sequence = [
  { functionName: "first", arguments: { value: 1 } },
  { functionName: "second", arguments: { value: 2 } },
];

describe("runToolCallSequence", () => {
  it("executes calls in order and numbers them from one", async () => {
    const registry = new FakeRegistry([[tool("first")], [tool("second")]]);

    const outcomes = await runToolCallSequence(sequence, registry, { timeoutMs: 100 });

    assert.deepStrictEqual(
      outcomes.map((outcome) => [outcome.index, outcome.functionName, outcome.outcome]),
      [
        [1, "first", "pass"],
        [2, "second", "pass"],
      ],
    );
    assert.deepStrictEqual(registry.calls, [
      { name: "first", args: { value: 1 } },
      { name: "second", args: { value: 2 } },
    ]);
    assert.deepStrictEqual(outcomes[0].result, { ok: "first" });
  });

  it("reads the tool list once per call when the tool is already there", async () => {
    const registry = new FakeRegistry([[tool("first")], [tool("second")]]);

    await runToolCallSequence(sequence, registry, { timeoutMs: 100 });

    assert.strictEqual(registry.readCount, 2);
  });

  it("waits for a tool the page has not registered yet", async () => {
    const registry = new FakeRegistry([[], [], [tool("first")]]);

    const outcomes = await runToolCallSequence([sequence[0]], registry, { timeoutMs: 1000 });

    assert.strictEqual(outcomes[0].outcome, "pass");
    assert.ok(registry.readCount > 1, "expected the missing tool to be polled for");
  });

  it("abandons the rest of the sequence at the first failure", async () => {
    const registry = new FakeRegistry([[tool("first")], [tool("second")]], {
      first: "page rejected input",
    });

    const outcomes = await runToolCallSequence(sequence, registry, { timeoutMs: 100 });

    assert.strictEqual(outcomes.length, 1);
    assert.strictEqual(outcomes[0].outcome, "error");
    assert.deepStrictEqual(
      registry.calls.map((call) => call.name),
      ["first"],
    );
  });

  it("reports failure reasons unframed, for the caller to phrase", async () => {
    const registry = new FakeRegistry([[tool("first")]], { first: "page rejected input" });

    const outcomes = await runToolCallSequence([sequence[0]], registry, { timeoutMs: 100 });

    assert.strictEqual(outcomes[0].error, "page rejected input");
  });

  it("reports a tool that never appears", async () => {
    const registry = new FakeRegistry([[]]);

    const outcomes = await runToolCallSequence([sequence[0]], registry, { timeoutMs: 100 });

    assert.strictEqual(outcomes[0].outcome, "error");
    assert.strictEqual(outcomes[0].error, 'tool "first" is not available.');
  });

  it("fails a call whose payload reports failure despite succeeding", async () => {
    const registry: ToolSequenceRegistry = {
      getCurrentTools: async () => [tool("first")],
      executeToolChecked: async () => ({ success: true, result: "Error: item is out of stock" }),
    };

    const outcomes = await runToolCallSequence([sequence[0]], registry, { timeoutMs: 100 });

    assert.strictEqual(outcomes[0].outcome, "error");
    assert.match(outcomes[0].error || "", /tool reported failure.*out of stock/i);
  });

  it("times out a call that never settles", async () => {
    const registry: ToolSequenceRegistry = {
      getCurrentTools: async () => [tool("first")],
      executeToolChecked: async () => await new Promise(() => {}),
    };

    const outcomes = await runToolCallSequence([sequence[0]], registry, { timeoutMs: 5 });

    assert.strictEqual(outcomes[0].outcome, "error");
    assert.match(outcomes[0].error || "", /tool "first" timed out after 5 ms\./);
  });

  it("announces each call before attempting it and each result after", async () => {
    const registry = new FakeRegistry([[tool("first")], [tool("second")]], { second: "broken" });
    const events: string[] = [];

    await runToolCallSequence(sequence, registry, {
      timeoutMs: 100,
      onCallStart: (index) => events.push(`start ${index}`),
      onCallPass: (index, result) => events.push(`pass ${index} ${JSON.stringify(result)}`),
    });

    assert.deepStrictEqual(events, ["start 1", 'pass 1 {"ok":"first"}', "start 2"]);
  });

  it("does nothing when there is nothing to call", async () => {
    const registry = new FakeRegistry([[tool("first")]]);

    assert.deepStrictEqual(await runToolCallSequence([], registry), []);
    assert.strictEqual(registry.readCount, 0);
  });
});

describe("explicitToolFailure", () => {
  it("recognizes the shapes a tool uses to report failure in a successful response", () => {
    assert.match(explicitToolFailure("Error: sold out") || "", /sold out/);
    assert.match(explicitToolFailure({ success: false }) || "", /tool reported failure/);
    assert.match(explicitToolFailure({ isError: true, message: "nope" }) || "", /nope/);
    assert.match(explicitToolFailure('{"error":"bad id"}') || "", /bad id/);
  });

  it("passes through results that report nothing wrong", () => {
    assert.strictEqual(explicitToolFailure({ ok: true }), undefined);
    assert.strictEqual(explicitToolFailure("added to cart"), undefined);
    assert.strictEqual(explicitToolFailure(null), undefined);
    assert.strictEqual(explicitToolFailure(42), undefined);
  });
});

describe("withTimeout", () => {
  it("returns the value when the promise settles in time", async () => {
    assert.strictEqual(await withTimeout(Promise.resolve("done"), 100, "work"), "done");
  });

  it("labels the operation that ran out of time", async () => {
    await assert.rejects(
      () => withTimeout(new Promise(() => {}), 5, 'navigation to "https://example.test"'),
      /navigation to "https:\/\/example\.test" timed out after 5 ms\./,
    );
  });

  it("propagates the original rejection rather than a timeout", async () => {
    await assert.rejects(
      () => withTimeout(Promise.reject(new Error("page closed")), 100, "work"),
      /page closed/,
    );
  });
});
