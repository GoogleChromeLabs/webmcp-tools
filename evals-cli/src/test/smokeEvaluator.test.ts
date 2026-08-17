/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from "node:assert";
import { describe, it } from "node:test";
import {
  compileSmokeTests,
  executeSmokeEvals,
  runSmokeTest,
  SmokeToolRegistry,
} from "../evaluator/smokeEvaluator.js";
import { type Browser, type BrowserPage } from "../evaluator/browser.js";
import { Eval } from "../types/evals.js";
import { Tool } from "../types/tools.js";

const tool = (functionName: string): Tool => ({
  functionName,
  description: `${functionName} description`,
  parameters: {},
});

describe("compileSmokeTests", () => {
  it("flattens nested groups in authored order and skips optional calls", () => {
    const tests: Eval[] = [
      {
        name: "hotel search",
        messages: [],
        expectedCall: [
          {
            ordered: [
              { functionName: "search", arguments: { city: "Tokyo" } },
              {
                unordered: [
                  { functionName: "filter_price", arguments: { max: 200 } },
                  { functionName: "filter_amenity", arguments: { name: "gym" } },
                ],
              },
              { functionName: "summarize", arguments: {}, optional: true },
            ],
          },
        ],
      },
    ];

    assert.deepStrictEqual(
      compileSmokeTests(tests)[0].steps.map((step) => step.functionName),
      ["search", "filter_price", "filter_amenity"],
    );
  });

  it("resolves matcher constraints to concrete arguments automatically", () => {
    const tests: Eval[] = [
      {
        name: "constrained date with default",
        messages: [],
        expectedCall: [
          {
            functionName: "book",
            arguments: {
              name: { $pattern: "Bob.*Smith" },
              requests: { $contains: "anniversary" },
            },
          },
        ],
      },
    ];

    const compiled = compileSmokeTests(tests);
    assert.deepStrictEqual(compiled[0].steps[0].arguments, {
      name: "Bob Smith",
      requests: "anniversary",
    });
  });

  it("rejects missing arguments and empty required trajectories", () => {
    assert.throws(() => compileSmokeTests([]), /at least one eval case/i);

    assert.throws(
      () =>
        compileSmokeTests([
          {
            name: "missing args",
            messages: [],
            expectedCall: [{ functionName: "search" }],
          },
        ]),
      /missing args.*step 1.*arguments/i,
    );

    assert.throws(
      () =>
        compileSmokeTests([
          {
            name: "no journey",
            messages: [],
            expectedCall: [],
          },
        ]),
      /no journey.*required tool call/i,
    );
  });
});

class FakeRegistry implements SmokeToolRegistry {
  calls: Array<{ name: string; args: Record<string, unknown> | undefined }> = [];
  syncCount = 0;

  constructor(
    private readonly toolsBySync: Tool[][],
    private readonly failures: Record<string, string> = {},
  ) {}

  async getCurrentTools(): Promise<Tool[]> {
    const tools = this.toolsBySync[Math.min(this.syncCount, this.toolsBySync.length - 1)] || [];
    this.syncCount++;
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

describe("runSmokeTest", () => {
  const compiled = compileSmokeTests([
    {
      name: "dynamic journey",
      messages: [],
      expectedCall: [
        { functionName: "first", arguments: { value: 1 } },
        { functionName: "second", arguments: { value: 2 } },
      ],
    },
  ])[0];

  it("resynchronizes tools before every step and executes concrete arguments", async () => {
    const registry = new FakeRegistry([[tool("first")], [tool("second")]]);

    const results = await runSmokeTest(compiled, registry, 100);

    assert.deepStrictEqual(
      results.map((result) => result.outcome),
      ["pass", "pass"],
    );
    assert.strictEqual(registry.syncCount, 2);
    assert.deepStrictEqual(registry.calls, [
      { name: "first", args: { value: 1 } },
      { name: "second", args: { value: 2 } },
    ]);
  });

  it("stops the current journey with an actionable missing-tool error", async () => {
    const registry = new FakeRegistry([[tool("first")], []]);

    const results = await runSmokeTest(compiled, registry, 100);

    assert.deepStrictEqual(
      results.map((result) => result.outcome),
      ["pass", "error"],
    );
    assert.match(results[1].error || "", /dynamic journey.*step 2.*second.*not available/i);
    assert.strictEqual(registry.calls.length, 1);
  });

  it("reports checked execution failures", async () => {
    const registry = new FakeRegistry([[tool("first")]], { first: "page rejected input" });

    const results = await runSmokeTest(
      { ...compiled, steps: compiled.steps.slice(0, 1) },
      registry,
      100,
    );

    assert.strictEqual(results[0].outcome, "error");
    assert.match(results[0].error || "", /page rejected input/);
  });

  it("reports explicit failures returned by a tool object or string prefix", async () => {
    const registry: SmokeToolRegistry = {
      getCurrentTools: async () => [tool("first")],
      executeToolChecked: async () => ({
        success: true,
        result: "Error: item is out of stock",
      }),
    };

    const results = await runSmokeTest(
      { ...compiled, steps: compiled.steps.slice(0, 1) },
      registry,
      100,
    );

    assert.strictEqual(results[0].outcome, "error");
    assert.match(results[0].error || "", /tool reported failure.*out of stock/i);
  });

  it("times out a stuck tool call", async () => {
    const registry: SmokeToolRegistry = {
      getCurrentTools: async () => [tool("first")],
      executeToolChecked: async () => await new Promise(() => {}),
    };

    const results = await runSmokeTest(
      { ...compiled, steps: compiled.steps.slice(0, 1) },
      registry,
      5,
    );

    assert.strictEqual(results[0].outcome, "error");
    assert.match(results[0].error || "", /timed out.*5 ms/i);
  });
});

class FakePage {
  closed = false;
  navigatedTo = "";
  webmcp: any = { tools: () => [] };

  async goto(url: string): Promise<void> {
    this.navigatedTo = url;
  }

  async evaluate(): Promise<any> {
    return [];
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

class FakeBrowser {
  closed = false;
  pages: FakePage[] = [];

  async newPage(): Promise<BrowserPage> {
    const page = new FakePage();
    this.pages.push(page);
    return page as unknown as BrowserPage;
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

describe("executeSmokeEvals", () => {
  it("uses a fresh page per case and closes pages and browser after errors", async () => {
    const browser = new FakeBrowser();
    const tests: Eval[] = [
      {
        name: "case one",
        messages: [],
        expectedCall: [{ functionName: "one", arguments: {} }],
      },
      {
        name: "case two",
        messages: [],
        expectedCall: [{ functionName: "two", arguments: {} }],
      },
    ];

    const results = await executeSmokeEvals(
      tests,
      { url: "https://example.test", timeoutMs: 100 },
      {
        launchBrowser: async () => browser as unknown as Browser,
        createRegistry: (_page, testIndex) =>
          new FakeRegistry(
            [[tool(testIndex === 0 ? "one" : "two")]],
            testIndex === 1 ? { two: "broken" } : {},
          ),
      },
    );

    assert.strictEqual(results.passCount, 1);
    assert.strictEqual(results.errorCount, 1);
    assert.strictEqual(browser.pages.length, 2);
    assert.ok(browser.pages.every((page) => page.closed));
    assert.ok(browser.pages.every((page) => page.navigatedTo === "https://example.test"));
    assert.strictEqual(browser.closed, true);
  });

  it("validates every case before launching the browser", async () => {
    let launched = false;
    const tests: Eval[] = [
      {
        name: "valid first case",
        messages: [],
        expectedCall: [{ functionName: "one", arguments: {} }],
      },
      {
        name: "invalid later case",
        messages: [],
        expectedCall: [{ functionName: "two", arguments: null as any }],
      },
    ];

    await assert.rejects(
      executeSmokeEvals(
        tests,
        { url: "https://example.test", timeoutMs: 100 },
        {
          launchBrowser: async () => {
            launched = true;
            return new FakeBrowser() as unknown as Browser;
          },
        },
      ),
      /invalid later case.*arguments/i,
    );
    assert.strictEqual(launched, false);
  });
});
