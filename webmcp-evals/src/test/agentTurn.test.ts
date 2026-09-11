/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from "node:assert";
import { describe, it } from "node:test";
import * as ai from "ai";
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
    assert.strictEqual(result.steps.length, 1);
    assert.strictEqual(result.steps[0].text, "Looking for jackets");
    assert.deepStrictEqual(result.responseMessages, []);
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
});
