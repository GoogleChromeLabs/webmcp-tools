/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from "node:assert";
import { describe, it } from "node:test";
import * as ai from "ai";
import type { SettleToolsOptions, ToolRegistry } from "../evaluator/toolRegistry.js";
import { runAgentTurn } from "../simulate/agentTurn.js";

const registry: any = {
  getCurrentTools: () => [
    { functionName: "addToCart", description: "Adds an item", parameters: { type: "object" } },
  ],
  executeTool: async () => ({}),
};

function turn(overrides: Record<string, unknown> = {}) {
  return {
    messages: [{ role: "user" as const, content: "I need a jacket." }],
    registry,
    model: {} as any,
    maxSteps: 6,
    ...overrides,
  };
}

describe("runAgentTurn", () => {
  it("hands the agent the whole conversation, not just the newest message", async (t) => {
    let captured: any = null;
    t.mock.method(ai.ToolLoopAgent.prototype, "generate", async (options: any) => {
      captured = options;
      return { steps: [], text: "Sure.", response: { messages: [] } };
    });

    const history = [
      { role: "user" as const, content: "I need a jacket." },
      { role: "assistant" as const, content: "What kind?" },
      { role: "user" as const, content: "Leather." },
    ];
    await runAgentTurn(turn({ messages: history }));

    assert.strictEqual(captured.messages.length, 3);
    assert.deepStrictEqual(captured.messages, history);
  });

  it("returns the messages the turn generated so the next turn can continue it", async (t) => {
    const generatedMessages = [
      { role: "assistant", content: [{ type: "tool-call", toolCallId: "c1" }] },
      { role: "tool", content: [{ type: "tool-result", toolCallId: "c1" }] },
    ];
    t.mock.method(ai.ToolLoopAgent.prototype, "generate", async () => ({
      steps: [],
      text: "Added.",
      response: { messages: generatedMessages },
    }));

    const result = await runAgentTurn(turn());

    assert.deepStrictEqual(result.responseMessages, generatedMessages);
    assert.strictEqual(result.text, "Added.");
  });

  it("pairs each tool call with its own result when one tool is called twice", async (t) => {
    t.mock.method(ai.ToolLoopAgent.prototype, "generate", async () => ({
      steps: [
        {
          text: "",
          toolCalls: [
            { toolName: "addToCart", toolCallId: "call-1", input: { productId: "p3" } },
            { toolName: "addToCart", toolCallId: "call-2", input: { productId: "p4" } },
          ],
          toolResults: [
            { toolName: "addToCart", toolCallId: "call-2", result: "p4 added" },
            { toolName: "addToCart", toolCallId: "call-1", result: "p3 added" },
          ],
        },
      ],
      text: "Both added.",
      response: { messages: [] },
    }));

    const result = await runAgentTurn(turn());

    assert.deepStrictEqual(
      result.toolCalls.map((call) => [call.args, call.result]),
      [
        [{ productId: "p3" }, "p3 added"],
        [{ productId: "p4" }, "p4 added"],
      ],
    );
  });

  it("keeps the steps taken before a turn broke, alongside the error", async (t) => {
    t.mock.method(ai.ToolLoopAgent.prototype, "generate", async function (this: any) {
      // Replays what the SDK does to a turn that dies midway: one step is
      // reported, then the call fails. Reaching for the agent's own
      // `settings` couples this to an SDK internal, but the callback is the
      // only route to the partial trajectory, and a rename breaks the test
      // loudly rather than quietly.
      this.settings.onStepFinish({ text: "Looking for jackets", toolCalls: [], toolResults: [] });
      throw new Error("aborted");
    });

    const result = await runAgentTurn(turn());

    assert.ok(result.error instanceof Error);
    assert.strictEqual((result.error as Error).message, "aborted");
    assert.strictEqual(result.text, "Looking for jackets");
    assert.strictEqual(result.steps.length, 1);
    assert.strictEqual(result.steps[0].text, "Looking for jackets");
    assert.deepStrictEqual(result.responseMessages, []);
  });

  it("publishes a snapshot after every completed step", async (t) => {
    t.mock.method(ai.ToolLoopAgent.prototype, "generate", async function (this: any) {
      this.settings.onStepFinish({
        text: "",
        toolCalls: [{ toolName: "addToCart", toolCallId: "call-1", input: { productId: "p3" } }],
        toolResults: [{ toolName: "addToCart", toolCallId: "call-1", result: "p3 added" }],
      });
      throw new Error("next step stalled");
    });
    let snapshot: any;

    await runAgentTurn(turn({ onProgress: (progress: any) => (snapshot = progress) }));

    assert.strictEqual(snapshot.steps.length, 1);
    assert.deepStrictEqual(snapshot.toolCalls, [
      { functionName: "addToCart", args: { productId: "p3" }, result: "p3 added" },
    ]);
  });

  it("forwards an abort signal so a budget can cut the turn short", async (t) => {
    let captured: any = null;
    t.mock.method(ai.ToolLoopAgent.prototype, "generate", async (options: any) => {
      captured = options;
      return { steps: [], text: "", response: { messages: [] } };
    });

    const controller = new AbortController();
    await runAgentTurn(turn({ abortSignal: controller.signal }));

    assert.strictEqual(captured.abortSignal, controller.signal);
  });

  it("omits the abort signal entirely when there is no budget to enforce", async (t) => {
    let captured: any = null;
    t.mock.method(ai.ToolLoopAgent.prototype, "generate", async (options: any) => {
      captured = options;
      return { steps: [], text: "", response: { messages: [] } };
    });

    await runAgentTurn(turn());

    assert.ok(!("abortSignal" in captured));
  });

  it("waits for tools to settle before follow-up steps and respects the abort signal", async (t) => {
    const settleOptions: Array<SettleToolsOptions | undefined> = [];
    let currentTools = [
      { functionName: "search_location", description: "Search", parameters: { type: "object" } },
    ];
    const dynamicRegistry: ToolRegistry = {
      getCurrentTools: () => currentTools,
      executeTool: async () => ({}),
      waitForToolsToSettle: async (opts?: SettleToolsOptions) => {
        settleOptions.push(opts);
        currentTools = [
          ...currentTools,
          {
            functionName: "filter_search_results",
            description: "Filter",
            parameters: { type: "object" },
          },
        ];
      },
    };

    t.mock.method(ai.ToolLoopAgent.prototype, "generate", async function (this: any) {
      const step0Result = await this.settings.prepareStep({ stepNumber: 0, steps: [] });
      assert.strictEqual(step0Result, undefined);
      assert.strictEqual(settleOptions.length, 0);
      assert.deepStrictEqual(Object.keys(this.settings.tools), ["search_location"]);

      const step1Result = await this.settings.prepareStep({ stepNumber: 1, steps: [{}] });
      assert.strictEqual(step1Result, undefined);
      assert.strictEqual(settleOptions.length, 1);
      assert.deepStrictEqual(Object.keys(this.settings.tools), [
        "search_location",
        "filter_search_results",
      ]);
      return {
        steps: [
          { text: "", toolCalls: [], toolResults: [] },
          { text: "Filtered.", toolCalls: [], toolResults: [] },
        ],
        text: "Filtered.",
        response: { messages: [] },
      };
    });

    const controller = new AbortController();
    const result = await runAgentTurn(
      turn({ registry: dynamicRegistry, abortSignal: controller.signal }),
    );

    assert.strictEqual(settleOptions[0]?.signal, controller.signal);
    assert.deepStrictEqual(
      result.steps.map((step) => step.availableTools?.map((tool) => tool.functionName)),
      [["search_location"], ["search_location", "filter_search_results"]],
    );

    // Without an abortSignal, waitForToolsToSettle receives undefined.
    await runAgentTurn(turn({ registry: dynamicRegistry }));
    assert.strictEqual(settleOptions[1], undefined);
  });

  it("aborts prepareStep immediately if abortSignal fires while settling tools", async (t) => {
    const controller = new AbortController();
    let getCurrentToolsCalls = 0;
    const abortingRegistry: ToolRegistry = {
      getCurrentTools: () => {
        getCurrentToolsCalls++;
        return [
          {
            functionName: "search_location",
            description: "Search",
            parameters: { type: "object" },
          },
        ];
      },
      executeTool: async () => ({}),
      waitForToolsToSettle: async () => {
        controller.abort(new Error("budget expired"));
      },
    };

    t.mock.method(ai.ToolLoopAgent.prototype, "generate", async function (this: any) {
      await this.settings.prepareStep({ stepNumber: 1, steps: [{}] });
      return { steps: [], text: "", response: { messages: [] } };
    });

    const result = await runAgentTurn(
      turn({ registry: abortingRegistry, abortSignal: controller.signal }),
    );
    assert.ok(result.error instanceof Error);
    assert.strictEqual((result.error as Error).message, "budget expired");
    assert.strictEqual(getCurrentToolsCalls, 1, "Should not re-read tools after abort");
  });
});
