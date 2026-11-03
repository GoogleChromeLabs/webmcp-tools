/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from "node:assert";
import { EventEmitter } from "node:events";
import { describe, it } from "node:test";
import type { Page } from "puppeteer-core";
import { prepareExtensionEvalPrompt } from "../evaluator/extensionBrowserEvaluator.js";
import { executeExtensionBrowserEvals, executeSimulations } from "../evaluator/index.js";
import type {
  AgentExtensionController,
  RunTurnOptions,
  RunTurnResult,
} from "../extension/index.js";
import { renderWebmcpReport } from "../report/report.js";
import { renderSimulationReport } from "../report/simulationReport.js";
import type { DomAssertionResult } from "../simulate/domAssertions.js";
import { TimeoutError } from "../simulate/toolSequence.js";
import type { SimulationConfig, WebmcpConfig } from "../types/config.js";
import type { Eval } from "../types/evals.js";
import type { DomAssertion, LoadedSimulation } from "../types/simulations.js";

class MockWebMcpPage extends EventEmitter {
  readonly webmcpEmitter = new EventEmitter();
  state: Record<string, unknown> = {};

  readonly webmcp = {
    tools: () => [
      {
        name: "setCrust",
        description: "Sets crust",
        inputSchema: { type: "object", properties: { crust: { type: "string" } } },
      },
      {
        name: "addTopping",
        description: "Adds topping",
        inputSchema: { type: "object", properties: { topping: { type: "string" } } },
      },
    ],
    on: (event: "toolinvoked" | "toolresponded", listener: (...args: any[]) => void) =>
      this.webmcpEmitter.on(event, listener),
    off: (event: "toolinvoked" | "toolresponded", listener: (...args: any[]) => void) =>
      this.webmcpEmitter.off(event, listener),
  };

  simulateExtensionToolCall(
    id: string,
    name: string,
    input: Record<string, unknown>,
    output: unknown,
  ) {
    this.webmcpEmitter.emit("toolinvoked", { id, tool: { name }, input });
    this.state[name] = input;
    this.webmcpEmitter.emit("toolresponded", {
      id,
      status: "Completed",
      output: JSON.stringify(output),
    });
  }
}

class MockExtensionController implements AgentExtensionController {
  readonly extensionId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  readonly extensionName = "WebMCP Agent";
  webAppPage: Page | null = null;
  openedUrls: string[] = [];
  closedCount = 0;
  disposed = false;
  promptsSeen: Array<{ prompt: string; options?: RunTurnOptions }> = [];

  constructor(
    private readonly onTurn: (
      prompt: string,
      page: MockWebMcpPage,
      turnIndex: number,
      options?: RunTurnOptions,
    ) => Promise<{ responseText: string; error?: string }>,
  ) {}

  async openWebApp(url: string): Promise<Page> {
    this.openedUrls.push(url);
    this.webAppPage = new MockWebMcpPage() as unknown as Page;
    return this.webAppPage;
  }

  async closeCurrentWebApp(): Promise<void> {
    this.closedCount++;
    this.webAppPage = null;
  }

  async runTurn(prompt: string, options?: RunTurnOptions): Promise<RunTurnResult> {
    this.promptsSeen.push({ prompt, options });
    const page = this.webAppPage as unknown as MockWebMcpPage;
    const outcome = await this.onTurn(prompt, page, this.promptsSeen.length, options);
    return { responseText: outcome.responseText, error: outcome.error ?? null };
  }

  async dispose(): Promise<void> {
    this.disposed = true;
  }
}

const TOOL_DESCRIPTIONS = { setCrust: "Sets crust", addTopping: "Adds topping" } as const;

type FailedCall = { success: false; error: string };

/**
 * A registry with the page's tools. Every call succeeds with `{ ok: true }` unless
 * `onCall` returns a failure.
 */
function registry(
  tools: Array<keyof typeof TOOL_DESCRIPTIONS>,
  onCall?: (name: string, args?: Record<string, unknown>) => FailedCall | void,
) {
  return {
    getCurrentTools: () =>
      tools.map((name) => ({
        functionName: name,
        description: TOOL_DESCRIPTIONS[name],
        parameters: {},
      })),
    executeTool: async (name: string, args?: Record<string, unknown>) => {
      const failure = onCall?.(name, args);
      return failure ? { error: failure.error } : { ok: true };
    },
    executeToolChecked: async (name: string, args?: Record<string, unknown>) =>
      onCall?.(name, args) || { success: true as const, result: { ok: true } },
  };
}

function browserConfig(overrides: Partial<WebmcpConfig> = {}): WebmcpConfig {
  return {
    url: "http://localhost:5173",
    evalsFile: "evals.json",
    backend: "extension",
    model: "extension:WebMCP Agent",
    extension: "WebMCP Agent",
    ...overrides,
  };
}

function simConfig(overrides: Partial<SimulationConfig> = {}): SimulationConfig {
  return {
    url: "http://localhost:5173",
    simulationsFile: "simulations.json",
    model: "unused",
    extension: "WebMCP Agent",
    ...overrides,
  };
}

/**
 * Stands in for the DOM check: every assertion passes when the last `tool` call on
 * the mock page set `field` to `expected`.
 */
function domAssertionsFromState(tool: string, field: string, expected: string) {
  return async (page: Page, assertions: DomAssertion[]): Promise<DomAssertionResult[]> => {
    const input = (page as unknown as MockWebMcpPage).state[tool] as
      | Record<string, unknown>
      | undefined;
    const actual = input?.[field];
    return assertions.map((assertion) => ({
      assertion,
      outcome: actual === expected ? "pass" : "fail",
      expected,
      actual: actual ?? "",
    }));
  };
}

describe("executeExtensionBrowserEvals", () => {
  it("replays prior setup tool calls without crediting them to the agent and matches expected trajectory", async () => {
    const setupExecuted: Array<{ name: string; args?: Record<string, unknown> }> = [];
    const controller = new MockExtensionController(async (_prompt, page) => {
      page.simulateExtensionToolCall(
        "ext-1",
        "addTopping",
        { topping: "pepperoni" },
        { added: "pepperoni" },
      );
      return { responseText: "Added pepperoni to your thin crust pizza!" };
    });

    const tests: Eval[] = [
      {
        name: "Multi-turn topping addition",
        messages: [
          { role: "user", type: "message", content: "Use thin crust" },
          {
            role: "model",
            type: "functioncall",
            name: "setCrust",
            arguments: { crust: "thin" },
          },
          {
            role: "user",
            type: "functionresponse",
            name: "setCrust",
            response: { ok: true },
          },
          { role: "model", type: "message", content: "Thin crust selected." },
          { role: "user", type: "message", content: "Now add pepperoni" },
        ],
        expectedCall: [
          {
            functionName: "addTopping",
            arguments: { topping: "pepperoni" },
            result: { added: "pepperoni" },
          },
        ],
      },
    ];

    const config = browserConfig({
      userDataDir: "/tmp/chrome-profile",
      confirmPolicy: "always-allow",
      timeoutMs: 15_000,
      turnTimeoutMs: 45_000,
    });

    const results = await executeExtensionBrowserEvals(tests, config, undefined, {
      connectExtensionController: async () => controller,
      createRegistry: () =>
        registry(["setCrust", "addTopping"], (name, args) => {
          setupExecuted.push({ name, args });
        }),
    });

    assert.strictEqual(results.passCount, 1);
    assert.strictEqual(results.failCount, 0);
    assert.strictEqual(results.errorCount, 0);
    assert.deepStrictEqual(setupExecuted, [{ name: "setCrust", args: { crust: "thin" } }]);
    assert.deepStrictEqual(
      results.results[0]?.setupCalls?.map((call) => call.functionName),
      ["setCrust"],
    );
    assert.deepStrictEqual(results.extension, {
      id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      name: "WebMCP Agent",
    });
    assert.strictEqual(controller.promptsSeen[0]?.options?.onConfirmation, "always-allow");
    // --turn-timeout limits the turn; --timeout is only for navigation and setup.
    assert.strictEqual(controller.promptsSeen[0]?.options?.timeoutMs, 45_000);
    assert.strictEqual(controller.closedCount, 1);
    assert.strictEqual(controller.disposed, true);
  });

  it("reports a failed setup replay as an error and does not send the prompt", async () => {
    const controller = new MockExtensionController(async () => ({ responseText: "unused" }));
    const config = browserConfig();
    const results = await executeExtensionBrowserEvals(
      [
        {
          name: "Needs a crust first",
          messages: [
            { role: "model", type: "functioncall", name: "setCrust", arguments: { crust: "thin" } },
            { role: "user", type: "functionresponse", name: "setCrust", response: { ok: true } },
            { role: "user", type: "message", content: "Now add pepperoni" },
          ],
          expectedCall: [{ functionName: "addTopping", arguments: { topping: "pepperoni" } }],
        },
      ],
      config,
      undefined,
      {
        connectExtensionController: async () => controller,
        createRegistry: () =>
          registry(["setCrust"], () => ({ success: false, error: "crust is sold out" })),
      },
    );

    assert.strictEqual(results.errorCount, 1);
    assert.match(
      results.results[0]?.error ?? "",
      /setup call 1 \(setCrust\) failed: crust is sold out/,
    );
    assert.strictEqual(results.results[0]?.setupCalls?.[0]?.outcome, "error");
    assert.strictEqual(controller.promptsSeen.length, 0);
    assert.match(renderWebmcpReport(config, results), /Could not evaluate/);
  });

  it("scores tool calls made before an extension error, and errors when no tool was called", async () => {
    const controller = new MockExtensionController(async (_prompt, page, turnIndex) => {
      if (turnIndex === 1) {
        page.simulateExtensionToolCall("t1", "addTopping", { topping: "basil" }, { ok: true });
      }
      return { responseText: "", error: "I couldn't generate a response." };
    });
    const caseFor = (name: string): Eval => ({
      name,
      messages: [{ role: "user", type: "message", content: "Add basil" }],
      expectedCall: [{ functionName: "addTopping", arguments: { topping: "basil" } }],
    });

    const results = await executeExtensionBrowserEvals(
      [caseFor("Tool call then error"), caseFor("Error before any tool call")],
      browserConfig(),
      undefined,
      {
        connectExtensionController: async () => controller,
        createRegistry: () => registry(["addTopping"]),
      },
    );

    const [scored, errored] = results.results;
    assert.strictEqual(scored?.outcome, "pass");
    assert.match(
      JSON.stringify(scored?.trajectory),
      /\[Extension error\] I couldn't generate a response\./,
    );
    assert.strictEqual(errored?.outcome, "error");
    assert.match(errored?.error ?? "", /reported an error before calling any tool/);
    assert.strictEqual(errored?.trajectory, undefined);
  });

  it("keeps the tool calls of a turn that timed out and points to --turn-timeout", async () => {
    const controller = new MockExtensionController(async (_prompt, page) => {
      page.simulateExtensionToolCall("slow-1", "addTopping", { topping: "basil" }, { ok: true });
      throw new TimeoutError("Extension agent turn", 1_000);
    });

    const results = await executeExtensionBrowserEvals(
      [
        {
          name: "Slow turn",
          messages: [{ role: "user", type: "message", content: "Add basil" }],
          expectedCall: [{ functionName: "addTopping", arguments: { topping: "basil" } }],
        },
      ],
      browserConfig(),
      undefined,
      {
        connectExtensionController: async () => controller,
        createRegistry: () => registry(["addTopping"]),
      },
    );

    const [run] = results.results;
    assert.strictEqual(run?.outcome, "error");
    assert.match(run?.error ?? "", /timed out after 1000 ms\. Raise --turn-timeout/);
    assert.deepStrictEqual(
      run?.trajectory?.flatMap((step) => step.toolCalls?.map((call) => call.toolName) ?? []),
      ["addTopping"],
    );
    assert.strictEqual(controller.closedCount, 1);
  });

  it("reports a case without a message as an error, before opening a tab or sending anything", async () => {
    const controller = new MockExtensionController(async () => ({ responseText: "unused" }));

    const results = await executeExtensionBrowserEvals(
      [
        {
          name: "Empty case",
          messages: [],
          expectedCall: [{ functionName: "addTopping", arguments: { topping: "basil" } }],
        },
      ],
      browserConfig(),
      undefined,
      {
        connectExtensionController: async () => controller,
        createRegistry: () => registry(["addTopping"]),
      },
    );

    assert.strictEqual(results.errorCount, 1);
    assert.match(results.results[0]?.error ?? "", /no message to send to the extension/);
    assert.deepStrictEqual(controller.openedUrls, []);
    assert.strictEqual(controller.promptsSeen.length, 0);
  });

  it("sends a case with several user messages as one turn", async () => {
    const controller = new MockExtensionController(async (_prompt, page) => {
      page.simulateExtensionToolCall("t1", "setCrust", { crust: "thin" }, { ok: true });
      return { responseText: "Thin crust it is." };
    });

    const results = await executeExtensionBrowserEvals(
      [
        {
          name: "Two user messages",
          messages: [
            { role: "user", type: "message", content: "I'd like a pizza." },
            { role: "user", type: "message", content: "Thin crust, please." },
          ],
          expectedCall: [{ functionName: "setCrust", arguments: { crust: "thin" } }],
        },
      ],
      browserConfig(),
      undefined,
      {
        connectExtensionController: async () => controller,
        createRegistry: () => registry(["setCrust"]),
      },
    );

    assert.strictEqual(results.passCount, 1);
    assert.deepStrictEqual(
      controller.promptsSeen.map((seen) => seen.prompt),
      [
        "[Prior conversation context]\nUser: I'd like a pizza.\n\n[Current user message]\nThin crust, please.",
      ],
    );
  });
});

describe("prepareExtensionEvalPrompt", () => {
  it("sends a single user message as it is", () => {
    const prepared = prepareExtensionEvalPrompt([
      { role: "user", type: "message", content: "Find flights to Tokyo" },
    ]);

    assert.deepStrictEqual(prepared, {
      setupCalls: [],
      prompt: "Find flights to Tokyo",
    });
  });

  it("sends several user messages as one prompt, as the built-in agent gets them in one request", () => {
    const prepared = prepareExtensionEvalPrompt([
      { role: "user", type: "message", content: "I'd like to order a pizza." },
      { role: "user", type: "message", content: "Large, thin crust, with pepperoni." },
    ]);

    assert.deepStrictEqual(prepared, {
      setupCalls: [],
      prompt:
        "[Prior conversation context]\nUser: I'd like to order a pizza.\n\n[Current user message]\nLarge, thin crust, with pepperoni.",
    });
  });

  it("returns no prompt for a case without a message to send", () => {
    assert.deepStrictEqual(prepareExtensionEvalPrompt([]), { setupCalls: [], prompt: null });
    assert.deepStrictEqual(
      prepareExtensionEvalPrompt([{ role: "user", type: "message", content: "   " }]),
      { setupCalls: [], prompt: null },
    );
  });

  it("extracts historical functioncall setup and formats context for multi-turn evals ending in a user message", () => {
    const prepared = prepareExtensionEvalPrompt([
      { role: "user", type: "message", content: "Start a large thin crust pizza" },
      {
        role: "model",
        type: "functioncall",
        name: "setSizeAndCrust",
        arguments: { size: "large", crust: "thin" },
      },
      {
        role: "user",
        type: "functionresponse",
        name: "setSizeAndCrust",
        response: { status: "ok" },
      },
      { role: "model", type: "message", content: "Done! What toppings would you like?" },
      { role: "user", type: "message", content: "Add pepperoni and mushrooms" },
    ]);

    assert.deepStrictEqual(prepared.setupCalls, [
      { functionName: "setSizeAndCrust", arguments: { size: "large", crust: "thin" } },
    ]);
    assert.match(prepared.prompt ?? "", /\[Prior conversation context\]/);
    assert.match(prepared.prompt ?? "", /setSizeAndCrust/);
    assert.match(prepared.prompt ?? "", /\[Current user message\]\nAdd pepperoni and mushrooms/);
  });

  it("pairs parallel calls to the same tool with their own responses, first in first out", () => {
    const prepared = prepareExtensionEvalPrompt([
      { role: "user", type: "message", content: "Add basil and unicorn" },
      { role: "model", type: "functioncall", name: "addTopping", arguments: { topping: "basil" } },
      {
        role: "model",
        type: "functioncall",
        name: "addTopping",
        arguments: { topping: "unicorn" },
      },
      { role: "user", type: "functionresponse", name: "addTopping", response: { ok: true } },
      {
        role: "user",
        type: "functionresponse",
        name: "addTopping",
        response: { error: "unknown topping: unicorn" },
      },
      { role: "user", type: "message", content: "Then add olives" },
    ]);

    // Only the call whose own response succeeded is replayed on the live page.
    assert.deepStrictEqual(prepared.setupCalls, [
      { functionName: "addTopping", arguments: { topping: "basil" } },
    ]);
  });

  it("preserves prior tool traffic when messages end with functionresponse and skips replaying error functioncalls", () => {
    // 1. Continuation after successful functionresponse (e.g. examples/events/evals.json)
    const continuation = prepareExtensionEvalPrompt([
      {
        role: "user",
        type: "message",
        content: "Book Ginno's pizza at 7PM and then add it to my calendar",
      },
      {
        role: "model",
        type: "functioncall",
        name: "bookRestaurant",
        arguments: { restaurant: "Ginno's pizza", time: "19:00" },
      },
      {
        role: "user",
        type: "functionresponse",
        name: "bookRestaurant",
        response: { result: "Booked successfully" },
      },
    ]);

    assert.deepStrictEqual(continuation.setupCalls, [
      {
        functionName: "bookRestaurant",
        arguments: { restaurant: "Ginno's pizza", time: "19:00" },
      },
    ]);
    assert.match(continuation.prompt ?? "", /Assistant called bookRestaurant/);
    assert.match(continuation.prompt ?? "", /Tool bookRestaurant returned/);
    assert.match(
      continuation.prompt ?? "",
      /\[Current user message\]\nContinue and complete the user's request based on the tool result above\./,
    );

    // 2. Error-recovery eval ending in an ERROR functionresponse (e.g. examples/travel/evals.json)
    const errorRecovery = prepareExtensionEvalPrompt([
      {
        role: "user",
        type: "message",
        content: "Search flights from London to New York",
      },
      {
        role: "model",
        type: "functioncall",
        name: "searchFlights",
        arguments: { origin: "LON", destination: "New York" },
      },
      {
        role: "user",
        type: "functionresponse",
        name: "searchFlights",
        response: { result: "ERROR: destination must be a 3 letter IATA code" },
      },
    ]);

    // The intentionally invalid tool call is not replayed on the live page,
    // but it is still part of the prompt's [Prior conversation context].
    assert.deepStrictEqual(errorRecovery.setupCalls, []);
    assert.match(errorRecovery.prompt ?? "", /ERROR: destination must be a 3 letter IATA code/);
    assert.match(
      errorRecovery.prompt ?? "",
      /Continue and complete the user's request based on the tool result above\./,
    );
  });
});

describe("executeSimulations with extension agent", () => {
  it("runs setup and DOM assertions without crediting setup calls to the extension", async () => {
    const setupCallsSeen: string[] = [];
    const controller = new MockExtensionController(async (_prompt, page) => {
      page.simulateExtensionToolCall("sim-1", "addTopping", { topping: "mushrooms" }, { ok: true });
      return { responseText: "Added mushrooms." };
    });

    const simulations: LoadedSimulation[] = [
      {
        name: "Adds mushrooms after crust setup",
        setup: [{ functionName: "setCrust", arguments: { crust: "sourdough" } }],
        userMessage: "Please add mushrooms.",
        maxTurns: 1,
        assertions: [
          {
            type: "dom",
            selector: "#topping-list",
            expect: { text: { $contains: "mushrooms" } },
          },
        ],
      },
    ];

    const config = simConfig({ browserUrl: "http://127.0.0.1:9222" });

    const results = await executeSimulations(simulations, config, undefined, {
      connectExtensionController: async () => controller,
      createRegistry: () =>
        registry(["setCrust", "addTopping"], (name) => {
          setupCallsSeen.push(name);
        }),
      evaluateDomAssertions: domAssertionsFromState("addTopping", "topping", "mushrooms"),
    });

    assert.strictEqual(results.passCount, 1);
    assert.deepStrictEqual(setupCallsSeen, ["setCrust"]);
    // Setup call is recorded in setupCalls and NOT in the agent's turn toolCalls
    assert.strictEqual(results.results[0]?.setupCalls?.length, 1);
    assert.strictEqual(results.results[0]?.setupCalls?.[0]?.functionName, "setCrust");
    assert.deepStrictEqual(
      results.results[0]?.conversation?.turns[0]?.toolCalls.map((c) => c.functionName),
      ["addTopping"],
    );
    assert.strictEqual(controller.closedCount, 1);
    assert.strictEqual(controller.disposed, true);

    const html = renderSimulationReport(config, results);
    assert.match(html, />Agent extension</);
    assert.match(html, /WebMCP Agent \(a{32}\)/);
    assert.match(html, />Browser</);
    assert.doesNotMatch(html, />Chrome channel</);
    assert.match(html, /Attached \(http:\/\/127\.0\.0\.1:9222\)/);
  });

  it("drives a multi-turn simulated user and LLM judge through the extension", async () => {
    const controller = new MockExtensionController(async (_prompt, page, turnIndex) => {
      if (turnIndex === 1) {
        page.simulateExtensionToolCall("t1", "setCrust", { crust: "thin" }, { ok: true });
        return { responseText: "Thin crust set! Any toppings?" };
      }
      page.simulateExtensionToolCall("t2", "addTopping", { topping: "olives" }, { ok: true });
      return { responseText: "Olives added!" };
    });

    let judgeCalledWithTurns = 0;
    let userStep = 0;
    const scriptedReplies = [
      { message: "Start with thin crust", done: false },
      { message: "Add olives please", done: false },
      { message: "Looks great, thank you!", done: true },
    ];

    const results = await executeSimulations(
      [
        {
          name: "Two-turn pizza build",
          userScenario: "Ask for thin crust first, then olives.",
          maxTurns: 3,
          successCriteria: "Thin crust and olives were both configured.",
        },
      ],
      simConfig({ confirmPolicy: "always-allow" }),
      undefined,
      {
        models: { user: {} as any, judge: {} as any },
        connectExtensionController: async () => controller,
        createRegistry: () => registry(["setCrust", "addTopping"]),
        simulateUserTurn: async () => scriptedReplies[userStep++],
        judgeSimulation: async (req) => {
          judgeCalledWithTurns = req.conversation.turns.length;
          return {
            passed:
              req.conversation.turns[0]?.toolCalls[0]?.functionName === "setCrust" &&
              req.conversation.turns[1]?.toolCalls[0]?.functionName === "addTopping",
            reasoning: "Both crust and topping were applied across two turns.",
            evidence: ["setCrust", "addTopping"],
            turnsUsed: req.conversation.turnsUsed,
            durationMs: req.conversation.durationMs,
            endedBy: req.conversation.endedBy,
          };
        },
      },
    );

    assert.strictEqual(results.passCount, 1);
    assert.strictEqual(judgeCalledWithTurns, 2);
    assert.deepStrictEqual(
      controller.promptsSeen.map((p) => p.prompt),
      ["Start with thin crust", "Add olives please"],
    );
    assert.strictEqual(controller.promptsSeen[0]?.options?.onConfirmation, "always-allow");
  });

  it("aborts the extension turn and still evaluates DOM assertions when maxDurationMs expires", async () => {
    let turnSettled = false;
    let turnSettledBeforeAssertions = false;
    const controller = new MockExtensionController(async (_prompt, page, _turnIndex, options) => {
      // One tool call completes, then the agent stalls until maxDurationMs aborts the turn.
      page.simulateExtensionToolCall("slow-1", "addTopping", { topping: "basil" }, { ok: true });
      await new Promise<void>((_, reject) => {
        options?.signal?.addEventListener(
          "abort",
          () => {
            // Like the real controller, settle a little later, once the extension has stopped.
            setTimeout(() => {
              turnSettled = true;
              reject(options.signal?.reason ?? new Error("Aborted"));
            }, 20);
          },
          { once: true },
        );
      });
      return { responseText: "" };
    });
    const basilFromState = domAssertionsFromState("addTopping", "topping", "basil");

    const results = await executeSimulations(
      [
        {
          name: "Budget expiry after partial progress",
          userMessage: "Add basil to my pizza",
          maxTurns: 1,
          maxDurationMs: 40,
          assertions: [
            {
              type: "dom",
              selector: "#topping-list",
              expect: { text: { $contains: "basil" } },
            },
          ],
        },
      ],
      simConfig(),
      undefined,
      {
        connectExtensionController: async () => controller,
        createRegistry: () => registry(["addTopping"]),
        evaluateDomAssertions: async (page, assertions) => {
          turnSettledBeforeAssertions = turnSettled;
          return basilFromState(page, assertions);
        },
      },
    );

    assert.strictEqual(results.results[0]?.conversation?.endedBy, "timeout");
    assert.strictEqual(results.passCount, 1);
    assert.strictEqual(controller.promptsSeen[0]?.options?.signal?.aborted, true);
    // The page is only read once the aborted turn has finished.
    assert.strictEqual(turnSettledBeforeAssertions, true);
    assert.deepStrictEqual(
      results.results[0]?.conversation?.turns[0]?.toolCalls.map((c) => c.functionName),
      ["addTopping"],
    );
  });

  /** A turn that makes `before` calls, then one more call while it stops after the abort. */
  function controllerWithCallAfterAbort(before: string[], afterAbort: string) {
    return new MockExtensionController(async (_prompt, page, _turnIndex, options) => {
      for (const topping of before) {
        page.simulateExtensionToolCall(
          `before-${topping}`,
          "addTopping",
          { topping },
          { ok: true },
        );
      }
      await new Promise<void>((_, reject) => {
        options?.signal?.addEventListener(
          "abort",
          () => {
            setTimeout(() => {
              page.simulateExtensionToolCall(
                "after-abort",
                "addTopping",
                { topping: afterAbort },
                { ok: true },
              );
              reject(options.signal?.reason ?? new Error("Aborted"));
            }, 20);
          },
          { once: true },
        );
      });
      return { responseText: "" };
    });
  }

  const toppingsOf = (calls: Array<{ args: object }> | undefined) =>
    (calls ?? []).map((call) => (call.args as { topping?: string }).topping);

  it("gives the judge the calls an aborted extension turn made while it stopped, like the DOM checks", async () => {
    let judgedToppings: Array<string | undefined> = [];

    const results = await executeSimulations(
      [
        {
          name: "Budget expiry while the extension is still working",
          userMessage: "Add basil and olives",
          maxTurns: 1,
          maxDurationMs: 40,
          assertions: [
            { type: "dom", selector: "#topping-list", expect: { text: { $contains: "olives" } } },
          ],
          successCriteria: "Basil and olives were both added.",
        },
      ],
      simConfig(),
      undefined,
      {
        models: { judge: {} as any },
        connectExtensionController: async () => controllerWithCallAfterAbort(["basil"], "olives"),
        createRegistry: () => registry(["addTopping"]),
        evaluateDomAssertions: domAssertionsFromState("addTopping", "topping", "olives"),
        judgeSimulation: async (req) => {
          judgedToppings = toppingsOf(req.conversation.turns.flatMap((turn) => turn.toolCalls));
          return {
            passed: true,
            reasoning: "Both toppings were added.",
            evidence: [],
            turnsUsed: req.conversation.turnsUsed,
            durationMs: req.conversation.durationMs,
            endedBy: req.conversation.endedBy,
          };
        },
      },
    );

    const run = results.results[0];
    assert.strictEqual(run?.conversation?.endedBy, "timeout");
    assert.strictEqual(run?.outcome, "pass");
    assert.deepStrictEqual(judgedToppings, ["basil", "olives"]);
    assert.strictEqual(run?.conversation?.turnsUsed, 1);
  });

  it("adds a turn for calls an aborted extension turn made only after the abort", async () => {
    const results = await executeSimulations(
      [
        {
          name: "Budget expiry before the first call",
          userMessage: "Add basil",
          maxTurns: 1,
          maxDurationMs: 40,
          assertions: [
            { type: "dom", selector: "#topping-list", expect: { text: { $contains: "basil" } } },
          ],
        },
      ],
      simConfig(),
      undefined,
      {
        connectExtensionController: async () => controllerWithCallAfterAbort([], "basil"),
        createRegistry: () => registry(["addTopping"]),
        evaluateDomAssertions: domAssertionsFromState("addTopping", "topping", "basil"),
      },
    );

    const conversation = results.results[0]?.conversation;
    assert.strictEqual(conversation?.endedBy, "timeout");
    assert.strictEqual(conversation?.turnsUsed, 1);
    assert.strictEqual(conversation?.turns[0]?.userMessage, "Add basil");
    assert.deepStrictEqual(toppingsOf(conversation?.turns[0]?.toolCalls), ["basil"]);
  });

  it("keeps evaluating a simulation when the extension shows an error after making tool calls", async () => {
    const controller = new MockExtensionController(async (_prompt, page) => {
      page.simulateExtensionToolCall("t1", "addTopping", { topping: "olives" }, { ok: true });
      return { responseText: "", error: "Reached the tool-call limit." };
    });

    const results = await executeSimulations(
      [
        {
          name: "Olives despite a tool-call limit message",
          userMessage: "Add olives",
          maxTurns: 1,
          assertions: [
            { type: "dom", selector: "#topping-list", expect: { text: { $contains: "olives" } } },
          ],
        },
      ],
      simConfig(),
      undefined,
      {
        connectExtensionController: async () => controller,
        createRegistry: () => registry(["addTopping"]),
        evaluateDomAssertions: domAssertionsFromState("addTopping", "topping", "olives"),
      },
    );

    const run = results.results[0];
    assert.strictEqual(run?.outcome, "pass");
    assert.strictEqual(run?.conversation?.endedBy, "singleTurn");
    assert.match(
      run?.conversation?.turns[0]?.agentText ?? "",
      /\[Extension error\] Reached the tool-call limit\./,
    );
  });
});
