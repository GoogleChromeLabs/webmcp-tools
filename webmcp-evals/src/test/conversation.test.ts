/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from "node:assert";
import { describe, it } from "node:test";
import { runConversation, ConversationDependencies } from "../simulate/conversation.js";
import { AgentTurnRequest, AgentTurnResult } from "../simulate/agentTurn.js";
import { UserTurnRequest, UserTurnResult } from "../simulate/userSimulator.js";

const registry: any = { getCurrentTools: () => [], executeTool: async () => ({}) };

function request(overrides: Record<string, unknown> = {}) {
  return {
    userScenario: "You need a jacket.",
    maxTurns: 4,
    maxDurationMs: 5_000,
    maxSteps: 6,
    registry,
    agentModel: {} as any,
    userModel: {} as any,
    ...overrides,
  };
}

/** Replays a scripted user, then repeats its last line forever. */
function scriptedUser(replies: UserTurnResult[]) {
  const seen: UserTurnRequest[] = [];
  const fn = async (userRequest: UserTurnRequest): Promise<UserTurnResult> => {
    seen.push(userRequest);
    return replies[Math.min(seen.length - 1, replies.length - 1)];
  };
  return { fn, seen };
}

function agentReplying(text: string, overrides: Partial<AgentTurnResult> = {}) {
  const seen: AgentTurnRequest[] = [];
  const fn = async (agentRequest: AgentTurnRequest): Promise<AgentTurnResult> => {
    seen.push(agentRequest);
    return {
      text,
      steps: [],
      toolCalls: [],
      responseMessages: [{ role: "assistant", content: text }],
      ...overrides,
    };
  };
  return { fn, seen };
}

function deps(user: any, agent: any): ConversationDependencies {
  return { simulateUserTurn: user, runAgentTurn: agent };
}

describe("runConversation", () => {
  it("ends when the user says it is finished, and keeps its parting line", async () => {
    const user = scriptedUser([
      { message: "I need a jacket.", done: false },
      { message: "Perfect, thanks.", done: true },
    ]);
    const agent = agentReplying("Added a leather jacket to your cart.");

    const result = await runConversation(request(), deps(user.fn, agent.fn));

    assert.strictEqual(result.endedBy, "user");
    assert.strictEqual(result.turnsUsed, 1);
    assert.strictEqual(result.closingMessage, "Perfect, thanks.");
    assert.strictEqual(result.turns[0].agentText, "Added a leather jacket to your cart.");
  });

  it("ends on the turn budget without calling the conversation a failure", async () => {
    const user = scriptedUser([{ message: "And another one?", done: false }]);
    const agent = agentReplying("Done.");

    const result = await runConversation(request({ maxTurns: 3 }), deps(user.fn, agent.fn));

    assert.strictEqual(result.endedBy, "maxTurns");
    assert.strictEqual(result.turnsUsed, 3);
    assert.strictEqual(result.error, undefined);
  });

  it("ends on the clock when the agent will not return", async () => {
    const user = scriptedUser([{ message: "I need a jacket.", done: false }]);
    const stuckAgent = async (): Promise<AgentTurnResult> => await new Promise(() => {});

    const startedAt = Date.now();
    const result = await runConversation(request({ maxDurationMs: 60 }), deps(user.fn, stuckAgent));

    assert.strictEqual(result.endedBy, "timeout");
    assert.ok(Date.now() - startedAt < 2_000, "the budget must not be waited out");
    assert.strictEqual(result.error, undefined, "a timeout is not an error");
  });

  it("keeps the turns completed before the clock ran out", async () => {
    let calls = 0;
    const user = scriptedUser([{ message: "Keep going.", done: false }]);
    const agent = async (): Promise<AgentTurnResult> => {
      calls++;
      if (calls > 1) return await new Promise(() => {});
      return {
        text: "First reply.",
        steps: [],
        toolCalls: [],
        responseMessages: [{ role: "assistant", content: "First reply." }],
      };
    };

    const result = await runConversation(request({ maxDurationMs: 120 }), deps(user.fn, agent));

    assert.strictEqual(result.endedBy, "timeout");
    assert.strictEqual(result.turnsUsed, 1);
    assert.strictEqual(result.turns[0].agentText, "First reply.");
  });

  it("aborts the turn it walked away from", async () => {
    const user = scriptedUser([{ message: "I need a jacket.", done: false }]);
    let signal: AbortSignal | undefined;
    const stuckAgent = async (agentRequest: AgentTurnRequest): Promise<AgentTurnResult> => {
      signal = agentRequest.abortSignal;
      return await new Promise(() => {});
    };

    await runConversation(request({ maxDurationMs: 60 }), deps(user.fn, stuckAgent));

    assert.ok(signal, "the agent should have been given a signal");
    assert.strictEqual(signal!.aborted, true);
  });

  it("reports an agent failure as an error, with the steps it managed first", async () => {
    const user = scriptedUser([{ message: "I need a jacket.", done: false }]);
    const agent = agentReplying("", {
      error: new Error("page crashed"),
      steps: [{ text: "Looking for jackets" }],
    });

    const result = await runConversation(request(), deps(user.fn, agent.fn));

    assert.strictEqual(result.endedBy, "error");
    assert.strictEqual((result.error as Error).message, "page crashed");
    assert.strictEqual(result.turnsUsed, 1);
    assert.deepStrictEqual(result.turns[0].steps, [{ text: "Looking for jackets" }]);
  });

  it("reports a broken simulated user rather than a tidy ending", async () => {
    const user = scriptedUser([{ message: "   ", done: false }]);
    const agent = agentReplying("never reached");

    const result = await runConversation(request(), deps(user.fn, agent.fn));

    assert.strictEqual(result.endedBy, "error");
    assert.match((result.error as Error).message, /empty message/i);
    assert.strictEqual(agent.seen.length, 0);
  });

  it("carries the agent's own tool traffic into the next turn", async () => {
    const user = scriptedUser([
      { message: "I need a jacket.", done: false },
      { message: "Buy it.", done: false },
      { message: "Thanks.", done: true },
    ]);
    const agent = agentReplying("Found one.");

    await runConversation(request(), deps(user.fn, agent.fn));

    assert.strictEqual(agent.seen.length, 2);
    assert.deepStrictEqual(agent.seen[1].messages, [
      { role: "user", content: "I need a jacket." },
      { role: "assistant", content: "Found one." },
      { role: "user", content: "Buy it." },
    ]);
  });

  it("shows the user the words exchanged and none of the machinery", async () => {
    const user = scriptedUser([
      { message: "I need a jacket.", done: false },
      { message: "Thanks.", done: true },
    ]);
    const agent = agentReplying("Found one.", {
      toolCalls: [{ functionName: "searchProducts", args: { query: "jacket" }, result: "3 hits" }],
      steps: [{ text: "searching", toolCalls: [{ toolName: "searchProducts" }] }],
    });

    await runConversation(request(), deps(user.fn, agent.fn));

    const shownToUser = JSON.stringify(user.seen[1].transcript);
    assert.deepStrictEqual(user.seen[1].transcript, [
      { speaker: "user", text: "I need a jacket." },
      { speaker: "assistant", text: "Found one." },
    ]);
    assert.ok(!shownToUser.includes("searchProducts"), "tool traffic leaked to the user");
  });

  it("reports how long the conversation took", async () => {
    const user = scriptedUser([{ message: "Thanks.", done: true }]);
    const agent = agentReplying("Hello.");

    const result = await runConversation(request(), deps(user.fn, agent.fn));

    assert.strictEqual(result.turnsUsed, 0);
    assert.ok(result.durationMs >= 0);
    assert.strictEqual(result.endedBy, "user");
  });
});
