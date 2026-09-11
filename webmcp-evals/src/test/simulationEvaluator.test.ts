/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from "node:assert";
import { describe, it } from "node:test";
import {
  executeSimulations,
  resolveSimulationModels,
  SimulationDependencies,
  SimulationRegistry,
  SimulationRunEvent,
} from "../evaluator/simulationEvaluator.js";
import { type Browser, type BrowserPage } from "../evaluator/browser.js";
import { ConversationRequest, ConversationResult } from "../simulate/conversation.js";
import { SimulationConfig } from "../types/config.js";
import { LoadedSimulation, SimulationVerdict } from "../types/simulations.js";
import { BrowserConsoleError } from "../types/evals.js";
import { Tool } from "../types/tools.js";

const tool = (functionName: string): Tool => ({
  functionName,
  description: `${functionName} description`,
  parameters: {},
});

class FakePage {
  closed = false;
  navigatedTo = "";
  webmcp: any = { tools: () => [] };

  async goto(url: string): Promise<void> {
    this.navigatedTo = url;
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

class FakeRegistry implements SimulationRegistry {
  executed: Array<{ name: string; args?: Record<string, unknown> }> = [];

  constructor(
    private tools: Tool[] = [tool("addToCart"), tool("removeFromCart")],
    private failing: Record<string, string> = {},
    private consoleErrors: BrowserConsoleError[] = [],
  ) {}

  getCurrentTools(): Tool[] {
    return [...this.tools];
  }

  async executeTool(name: string, args?: Record<string, unknown>): Promise<any> {
    this.executed.push({ name, args });
    return { ok: true };
  }

  async executeToolChecked(
    name: string,
    args?: Record<string, unknown>,
  ): Promise<{ success: true; result: unknown } | { success: false; error: string }> {
    this.executed.push({ name, args });
    if (this.failing[name]) return { success: false, error: this.failing[name] };
    return { success: true, result: { ok: true } };
  }

  getBrowserConsoleErrors(): BrowserConsoleError[] {
    return [...this.consoleErrors];
  }
}

function simulation(overrides: Partial<LoadedSimulation> = {}): LoadedSimulation {
  return {
    name: "Removes the cap",
    userScenario: "You have two things in your cart and want the hat gone.",
    maxTurns: 4,
    successCriteria: "The cap is out of the cart and the jacket is still in it.",
    ...overrides,
  };
}

function config(overrides: Partial<SimulationConfig> = {}): SimulationConfig {
  return {
    url: "https://example.test",
    simulationsFile: "simulations.json",
    model: "test-agent",
    timeoutMs: 100,
    ...overrides,
  };
}

const conversationResult = (overrides: Partial<ConversationResult> = {}): ConversationResult => ({
  turns: [
    {
      index: 1,
      userMessage: "Drop the hat.",
      agentText: "Removed.",
      steps: [],
      toolCalls: [],
    },
  ],
  turnsUsed: 1,
  durationMs: 500,
  endedBy: "user",
  ...overrides,
});

const verdict = (overrides: Partial<SimulationVerdict> = {}): SimulationVerdict => ({
  passed: true,
  reasoning: "The cart came back without the cap.",
  evidence: ["removeFromCart -> ok"],
  turnsUsed: 1,
  durationMs: 500,
  endedBy: "user",
  ...overrides,
});

/**
 * Stubs out both models-in-the-loop stages, so a whole lifecycle runs with no
 * key and no network.
 */
function deps(overrides: SimulationDependencies = {}): SimulationDependencies {
  return {
    models: { agent: "test-agent", user: "test-user", judge: "test-judge" },
    createRegistry: () => new FakeRegistry(),
    runConversation: async () => conversationResult(),
    judgeSimulation: async () => verdict(),
    ...overrides,
  };
}

describe("executeSimulations", () => {
  it("counts one result per simulation per run, not one per step", async () => {
    const browser = new FakeBrowser();

    const results = await executeSimulations(
      [simulation({ name: "first" }), simulation({ name: "second" })],
      config({ runs: 2 }),
      undefined,
      deps({ launchBrowser: async () => browser as unknown as Browser }),
    );

    assert.strictEqual(results.results.length, 4);
    assert.strictEqual(results.simulationCount, 2);
    assert.strictEqual(results.passCount, 4);
    assert.deepStrictEqual(
      results.results.map((result) => [result.simulation.name, result.runIndex]),
      [
        ["first", 1],
        ["second", 1],
        ["first", 2],
        ["second", 2],
      ],
    );
  });

  it("opens a fresh page per simulation per run and closes everything", async () => {
    const browser = new FakeBrowser();

    await executeSimulations(
      [simulation(), simulation({ name: "other" })],
      config({ runs: 2 }),
      undefined,
      deps({ launchBrowser: async () => browser as unknown as Browser }),
    );

    assert.strictEqual(browser.pages.length, 4, "setup state must not leak between cases");
    assert.ok(browser.pages.every((page) => page.closed));
    assert.ok(browser.pages.every((page) => page.navigatedTo === "https://example.test"));
    assert.ok(browser.closed);
  });

  it("turns a failing verdict into a fail, not an error", async () => {
    const results = await executeSimulations(
      [simulation()],
      config(),
      undefined,
      deps({
        launchBrowser: async () => new FakeBrowser() as unknown as Browser,
        judgeSimulation: async () => verdict({ passed: false }),
      }),
    );

    assert.strictEqual(results.failCount, 1);
    assert.strictEqual(results.errorCount, 0);
    assert.strictEqual(results.results[0].outcome, "fail");
    assert.strictEqual(results.results[0].verdict?.passed, false);
  });

  it("runs setup before the conversation and hands the calls to the judge", async () => {
    const registry = new FakeRegistry();
    let judged: { setupCalls?: unknown[] } | undefined;

    const results = await executeSimulations(
      [
        simulation({
          setup: [{ functionName: "addToCart", arguments: { productId: "p3" } }],
        }),
      ],
      config(),
      undefined,
      deps({
        launchBrowser: async () => new FakeBrowser() as unknown as Browser,
        createRegistry: () => registry,
        runConversation: async () => {
          assert.deepStrictEqual(
            registry.executed.map((call) => call.name),
            ["addToCart"],
            "setup must have run before the agent joined",
          );
          return conversationResult();
        },
        judgeSimulation: async (request) => {
          judged = request;
          return verdict();
        },
      }),
    );

    assert.strictEqual(results.passCount, 1);
    assert.strictEqual(judged?.setupCalls?.length, 1);
    assert.strictEqual(results.results[0].setupCalls?.[0].functionName, "addToCart");
  });

  it("errors without paying for a judge call when setup breaks", async () => {
    let judgeCalls = 0;

    const results = await executeSimulations(
      [simulation({ setup: [{ functionName: "addToCart", arguments: { productId: "p3" } }] })],
      config(),
      undefined,
      deps({
        launchBrowser: async () => new FakeBrowser() as unknown as Browser,
        createRegistry: () => new FakeRegistry(undefined, { addToCart: "out of stock" }),
        judgeSimulation: async () => {
          judgeCalls++;
          return verdict();
        },
      }),
    );

    assert.strictEqual(results.errorCount, 1);
    assert.strictEqual(judgeCalls, 0);
    assert.match(results.results[0].error || "", /setup call 1 \(addToCart\) failed: out of stock/);
    assert.strictEqual(results.results[0].setupCalls?.[0].outcome, "error");
  });

  it("errors without a judge call when the page registers no tools", async () => {
    let judgeCalls = 0;

    const results = await executeSimulations(
      [simulation()],
      config(),
      undefined,
      deps({
        launchBrowser: async () => new FakeBrowser() as unknown as Browser,
        createRegistry: () => new FakeRegistry([]),
        judgeSimulation: async () => {
          judgeCalls++;
          return verdict();
        },
      }),
    );

    assert.strictEqual(results.errorCount, 1);
    assert.strictEqual(judgeCalls, 0);
    assert.match(results.results[0].error || "", /0 tools registered/);
  });

  it("errors without a judge call when the conversation breaks off", async () => {
    let judgeCalls = 0;

    const results = await executeSimulations(
      [simulation()],
      config(),
      undefined,
      deps({
        launchBrowser: async () => new FakeBrowser() as unknown as Browser,
        runConversation: async () =>
          conversationResult({ endedBy: "error", error: new Error("the model hung up") }),
        judgeSimulation: async () => {
          judgeCalls++;
          return verdict();
        },
      }),
    );

    assert.strictEqual(results.errorCount, 1);
    assert.strictEqual(judgeCalls, 0);
    assert.match(results.results[0].error || "", /broke off: the model hung up/);
    // The partial transcript survives: it is the only account of what went wrong.
    assert.strictEqual(results.results[0].conversation?.turns.length, 1);
  });

  it("judges a conversation that ran out of turns, which is not itself a failure", async () => {
    const results = await executeSimulations(
      [simulation()],
      config(),
      undefined,
      deps({
        launchBrowser: async () => new FakeBrowser() as unknown as Browser,
        runConversation: async () => conversationResult({ endedBy: "maxTurns", turnsUsed: 4 }),
        judgeSimulation: async () => verdict({ passed: true, endedBy: "maxTurns", turnsUsed: 4 }),
      }),
    );

    assert.strictEqual(results.passCount, 1);
    assert.strictEqual(results.results[0].outcome, "pass");
    assert.strictEqual(results.results[0].verdict?.endedBy, "maxTurns");
  });

  it("reports a judge that refuses to answer as an error, not a fail", async () => {
    const results = await executeSimulations(
      [simulation()],
      config(),
      undefined,
      deps({
        launchBrowser: async () => new FakeBrowser() as unknown as Browser,
        judgeSimulation: async () => {
          throw new Error("The judge returned a verdict with no evidence.");
        },
      }),
    );

    assert.strictEqual(results.errorCount, 1);
    assert.strictEqual(results.failCount, 0);
    assert.match(results.results[0].error || "", /no evidence/);
  });

  it("keeps going through the remaining cases after one errors", async () => {
    let call = 0;

    const results = await executeSimulations(
      [simulation({ name: "broken" }), simulation({ name: "fine" })],
      config(),
      undefined,
      deps({
        launchBrowser: async () => new FakeBrowser() as unknown as Browser,
        runConversation: async () => {
          if (call++ === 0) throw new Error("browser went away");
          return conversationResult();
        },
      }),
    );

    assert.deepStrictEqual(
      results.results.map((result) => [result.simulation.name, result.outcome]),
      [
        ["broken", "error"],
        ["fine", "pass"],
      ],
    );
  });

  it("resolves each budget from the case, falling back to the CLI only where it is silent", async () => {
    const requests: ConversationRequest[] = [];
    const record = deps({
      launchBrowser: async () => new FakeBrowser() as unknown as Browser,
      runConversation: async (request) => {
        requests.push(request);
        return conversationResult();
      },
    });

    await executeSimulations(
      [
        simulation({ name: "own budget", maxTurns: 3, maxDurationMs: 1_000 }),
        simulation({ name: "cli budget", maxTurns: 9 }),
      ],
      config({ maxDurationMs: 7_000, maxSteps: 11 }),
      undefined,
      record,
    );

    assert.deepStrictEqual(
      requests.map((request) => [request.maxTurns, request.maxDurationMs]),
      [
        [3, 1_000],
        [9, 7_000],
      ],
    );
    assert.ok(requests.every((request) => request.maxSteps === 11));
  });

  it("attaches browser console errors to the result", async () => {
    const consoleError: BrowserConsoleError = {
      kind: "console",
      message: "Uncaught TypeError",
      toolCalls: [],
    };

    const results = await executeSimulations(
      [simulation()],
      config(),
      undefined,
      deps({
        launchBrowser: async () => new FakeBrowser() as unknown as Browser,
        createRegistry: () => new FakeRegistry(undefined, {}, [consoleError]),
      }),
    );

    assert.deepStrictEqual(results.results[0].browserConsoleErrors, [consoleError]);
  });

  it("reports progress one event per result, matching the spinner's contract", async () => {
    const events: SimulationRunEvent[] = [];

    await executeSimulations(
      [simulation({ name: "a" }), simulation({ name: "b" })],
      config({ runs: 2 }),
      (event) => events.push(event),
      deps({ launchBrowser: async () => new FakeBrowser() as unknown as Browser }),
    );

    const [start, ...progress] = events;
    assert.strictEqual(start.type, "start");
    assert.strictEqual(start.type === "start" && start.total, 4);
    assert.strictEqual(progress.length, 4);
    assert.deepStrictEqual(
      progress.map((event) => event.type === "progress" && event.simulationNumber),
      [1, 2, 3, 4],
    );
  });

  it("refuses an empty simulation file before opening a browser", async () => {
    let launched = false;

    await assert.rejects(
      executeSimulations(
        [],
        config(),
        undefined,
        deps({
          launchBrowser: async () => {
            launched = true;
            return new FakeBrowser() as unknown as Browser;
          },
        }),
      ),
      /at least one simulation/i,
    );
    assert.strictEqual(launched, false);
  });
});

describe("resolveSimulationModels", () => {
  it("defaults the user to the agent's model and the judge to the analyzer's", () => {
    const models = resolveSimulationModels(config({ model: "gemini-3-flash-preview" }));

    assert.strictEqual((models.agent as any).modelId, "gemini-3-flash-preview");
    assert.strictEqual((models.user as any).modelId, "gemini-3-flash-preview");
    assert.strictEqual((models.judge as any).modelId, "gemini-3.5-flash");
  });

  it("resolves each of the three independently", () => {
    const models = resolveSimulationModels(
      config({ model: "agent-model", userModel: "user-model", judgeModel: "judge-model" }),
    );

    assert.strictEqual((models.agent as any).modelId, "agent-model");
    assert.strictEqual((models.user as any).modelId, "user-model");
    assert.strictEqual((models.judge as any).modelId, "judge-model");
  });

  it("lets a prefixed model id name its own provider instead of the global one", () => {
    const models = resolveSimulationModels(
      config({ provider: "openai", model: "gpt-5", judgeModel: "google:gemini-3.5-flash" }),
    );

    assert.match((models.agent as any).provider, /openai/);
    assert.match((models.judge as any).provider, /google/);
  });
});
