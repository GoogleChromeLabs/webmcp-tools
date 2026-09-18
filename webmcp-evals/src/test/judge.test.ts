/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from "node:assert";
import { describe, it } from "node:test";
import { mockModelReplying } from "./mockModel.js";
import { buildJudgePrompt, judgeSimulation, serializeTranscript } from "../simulate/judge.js";
import { JUDGE_SYSTEM_PROMPT } from "../simulate/prompts.js";
import { ConversationResult, ConversationTurn } from "../simulate/conversation.js";
import { ToolCallOutcome } from "../simulate/toolSequence.js";

const CRITERIA =
  "The Baseball Cap is no longer in the cart and the Bomber Jacket is still in it. No checkout was performed.";

function turn(overrides: Partial<ConversationTurn> = {}): ConversationTurn {
  return {
    index: 1,
    userMessage: "Take the hat out, please.",
    agentText: "Done, the cap is out of your cart.",
    steps: [],
    toolCalls: [],
    ...overrides,
  };
}

function conversation(overrides: Partial<ConversationResult> = {}): ConversationResult {
  return {
    turns: [turn()],
    turnsUsed: 1,
    durationMs: 4_200,
    endedBy: "user",
    ...overrides,
  };
}

const setupCalls: ToolCallOutcome[] = [
  {
    index: 1,
    functionName: "addToCart",
    arguments: { productId: "p3", quantity: 1 },
    outcome: "pass",
    result: { cart: ["Bomber Jacket"] },
  },
  {
    index: 2,
    functionName: "addToCart",
    arguments: { productId: "p4", quantity: 1 },
    outcome: "pass",
    result: { cart: ["Bomber Jacket", "Baseball Cap"] },
  },
];

const verdictText = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    reasoning: "removeFromCart returned a cart without the cap.",
    evidence: ['removeFromCart -> {"cart":["Bomber Jacket"]}'],
    passed: true,
    ...overrides,
  });

describe("serializeTranscript", () => {
  it("marks setup as world state that predates the assistant", () => {
    const transcript = serializeTranscript({
      successCriteria: CRITERIA,
      conversation: conversation(),
      setupCalls,
    });

    const [worldState, exchange] = transcript.split("# Conversation");
    assert.match(worldState, /never be credited to it/i);
    assert.match(worldState, /addToCart/);
    assert.ok(
      !exchange.includes("addToCart"),
      "setup calls must not appear among the assistant's own work",
    );
  });

  it("says plainly when nothing was set up", () => {
    const transcript = serializeTranscript({
      successCriteria: CRITERIA,
      conversation: conversation(),
    });

    assert.match(transcript, /Nothing was set up/i);
  });

  it("carries tool results, which are the only evidence there is", () => {
    const transcript = serializeTranscript({
      successCriteria: CRITERIA,
      conversation: conversation({
        turns: [
          turn({
            toolCalls: [
              {
                functionName: "removeFromCart",
                args: { productId: "p4" },
                result: { cart: ["Bomber Jacket"] },
              },
            ],
          }),
        ],
      }),
    });

    assert.match(transcript, /removeFromCart\(\{"productId":"p4"\}\)/);
    assert.match(transcript, /result: \{"cart":\["Bomber Jacket"\]\}/);
  });

  it("leaves the agent's reasoning out, since the model under test wrote it", () => {
    const transcript = serializeTranscript({
      successCriteria: CRITERIA,
      conversation: conversation({
        turns: [
          turn({
            steps: [
              { reasoningText: "The user probably means the cap, I will just say I did it." },
            ],
          }),
        ],
      }),
    });

    assert.ok(!transcript.includes("I will just say I did it"));
  });

  it("records a truncated conversation as truncated, not as a failure", () => {
    const transcript = serializeTranscript({
      successCriteria: CRITERIA,
      conversation: conversation({ endedBy: "maxTurns", turnsUsed: 6 }),
    });

    assert.match(transcript, /turn budget ran out/i);
    assert.match(transcript, /did not reach a natural close/i);
  });

  it("keeps the user's parting words, which are a claim like any other", () => {
    const transcript = serializeTranscript({
      successCriteria: CRITERIA,
      conversation: conversation({ closingMessage: "Great, that's sorted then." }),
    });

    assert.match(transcript, /parting message: Great, that's sorted then\./);
  });

  it("reports a failed setup call rather than passing it off as done", () => {
    const transcript = serializeTranscript({
      successCriteria: CRITERIA,
      conversation: conversation(),
      setupCalls: [
        {
          index: 1,
          functionName: "addToCart",
          arguments: { productId: "p3" },
          outcome: "error",
          error: 'tool "addToCart" is not available.',
        },
      ],
    });

    assert.match(transcript, /FAILED — tool "addToCart" is not available\./);
  });

  it("truncates a payload large enough to crowd out the conversation", () => {
    const transcript = serializeTranscript({
      successCriteria: CRITERIA,
      conversation: conversation({
        turns: [
          turn({
            toolCalls: [{ functionName: "getProducts", args: {}, result: "x".repeat(5_000) }],
          }),
        ],
      }),
    });

    assert.match(transcript, /… \(truncated\)/);
    assert.ok(transcript.length < 5_000, "the payload should not have been carried whole");
  });
});

describe("buildJudgePrompt", () => {
  it("leads with the outcome that was supposed to happen", () => {
    const prompt = buildJudgePrompt({ successCriteria: CRITERIA, conversation: conversation() });

    assert.match(prompt, /^# The outcome that was supposed to be achieved/);
    assert.ok(prompt.includes(CRITERIA));
  });
});

describe("JUDGE_SYSTEM_PROMPT", () => {
  it("separates evidence from claims and refuses partial credit", () => {
    assert.match(JUDGE_SYSTEM_PROMPT, /Tool results are evidence/);
    assert.match(JUDGE_SYSTEM_PROMPT, /Everything the assistant says is a claim/);
    assert.match(JUDGE_SYSTEM_PROMPT, /no partial credit/i);
    assert.match(JUDGE_SYSTEM_PROMPT, /not a failure in\s+itself/i);
  });
});

describe("judgeSimulation", () => {
  it("takes the measured facts from the conversation, not from the model", async () => {
    const model = mockModelReplying(
      verdictText({ turnsUsed: 99, durationMs: 1, endedBy: "error" }),
    );

    const verdict = await judgeSimulation(
      {
        successCriteria: CRITERIA,
        conversation: conversation({ turnsUsed: 3, durationMs: 4_200, endedBy: "maxTurns" }),
      },
      model,
    );

    assert.strictEqual(verdict.turnsUsed, 3);
    assert.strictEqual(verdict.durationMs, 4_200);
    assert.strictEqual(verdict.endedBy, "maxTurns");
    assert.strictEqual(verdict.passed, true);
    assert.deepStrictEqual(verdict.evidence, ['removeFromCart -> {"cart":["Bomber Jacket"]}']);
  });

  it("refuses a verdict that cites nothing, however confident it sounds", async () => {
    const model = mockModelReplying(verdictText({ evidence: [], passed: true }));

    await assert.rejects(
      () => judgeSimulation({ successCriteria: CRITERIA, conversation: conversation() }, model),
      /no evidence.*cannot be audited/i,
    );
  });

  it("refuses a verdict whose evidence is only whitespace", async () => {
    const model = mockModelReplying(verdictText({ evidence: ["   ", ""] }));

    await assert.rejects(
      () => judgeSimulation({ successCriteria: CRITERIA, conversation: conversation() }, model),
      /no evidence/i,
    );
  });

  it("refuses a verdict with no reasoning behind it", async () => {
    const model = mockModelReplying(verdictText({ reasoning: "  " }));

    await assert.rejects(
      () => judgeSimulation({ successCriteria: CRITERIA, conversation: conversation() }, model),
      /no reasoning/i,
    );
  });

  it("sends the rubric and the transcript to the model", async () => {
    const model = mockModelReplying(verdictText());

    await judgeSimulation(
      { successCriteria: CRITERIA, conversation: conversation(), setupCalls },
      model,
    );

    const sent = JSON.stringify(model.doGenerateCalls[0]);
    assert.ok(sent.includes("Tool results are evidence"), "the rubric should reach the model");
    assert.ok(sent.includes("Take the hat out"), "the transcript should reach the model");
  });
});
