/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { generateObject, LanguageModel } from "ai";
import { z } from "zod";
import { SimulationEndReason, SimulationVerdict } from "../types/simulations.js";
import { ConversationResult } from "./conversation.js";
import { JUDGE_SYSTEM_PROMPT } from "./prompts.js";
import { ToolCallOutcome } from "./toolSequence.js";

/**
 * Long tool payloads are trimmed before the judge sees them. A page that
 * returns its whole catalogue would otherwise crowd out the rest of the
 * transcript, and the interesting part of a result is almost always its head.
 */
const MAX_SERIALIZED_VALUE_LENGTH = 2_000;

export type JudgeRequest = {
  successCriteria: string;
  conversation: ConversationResult;
  /** Tool calls the harness made before the agent joined, if any. */
  setupCalls?: ToolCallOutcome[];
};

const verdictSchema = z.object({
  reasoning: z
    .string()
    .describe("What was and was not achieved, and on what basis you concluded it."),
  evidence: z
    .array(z.string())
    .describe(
      "The specific tool results you relied on, quoted, or a precise statement of which " +
        "result is missing. Never empty.",
    ),
  passed: z.boolean().describe("True only if the whole stated outcome is supported by evidence."),
});

function formatValue(value: unknown): string {
  if (value === undefined) return "(no result)";
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  if (serialized === undefined) return String(value);
  return serialized.length > MAX_SERIALIZED_VALUE_LENGTH
    ? `${serialized.slice(0, MAX_SERIALIZED_VALUE_LENGTH)}… (truncated)`
    : serialized;
}

function describeEnding(endedBy: SimulationEndReason, conversation: ConversationResult): string {
  switch (endedBy) {
    case "user":
      return "The user ended the conversation, considering the matter closed.";
    case "maxTurns":
      return `The conversation was cut off after ${conversation.turnsUsed} turns, when the turn budget ran out. It did not reach a natural close.`;
    case "timeout":
      return `The conversation was cut off after ${conversation.turnsUsed} turns, when the time budget ran out. It did not reach a natural close.`;
    case "error":
      return "The conversation was cut short by a failure in the assistant or the page.";
  }
}

function serializeSetup(setupCalls: ToolCallOutcome[] | undefined): string {
  if (!setupCalls?.length) {
    return "# World state before the conversation\n\nNothing was set up. The conversation began from the application's initial state.";
  }

  const lines = setupCalls.map(
    (call) =>
      `${call.index}. ${call.functionName}(${formatValue(call.arguments)})\n   result: ${
        call.outcome === "error" ? `FAILED — ${call.error}` : formatValue(call.result)
      }`,
  );

  return [
    "# World state before the conversation",
    "",
    "The harness made these tool calls before the assistant joined, to set the scene. This is not",
    "the assistant's work and must never be credited to it.",
    "",
    ...lines,
  ].join("\n");
}

/**
 * Renders the conversation for the judge.
 *
 * The agent's reasoning traces are left out on purpose. Reasoning is written by
 * the model under test, which makes it a claim like any other thing it says,
 * and a confident chain of thought about an action that never landed is exactly
 * the input most likely to talk a judge into a false pass.
 */
export function serializeTranscript(request: JudgeRequest): string {
  const { conversation } = request;
  const sections = [serializeSetup(request.setupCalls), "", "# Conversation"];

  if (conversation.turns.length === 0) {
    sections.push("", "(The assistant and the user never exchanged anything.)");
  }

  for (const turn of conversation.turns) {
    sections.push("", `## Turn ${turn.index}`, "", `User: ${turn.userMessage}`);

    if (turn.toolCalls.length > 0) {
      sections.push("", "Assistant's tool calls:");
      for (const call of turn.toolCalls) {
        sections.push(
          `- ${call.functionName}(${formatValue(call.args)})`,
          `  result: ${formatValue(call.result)}`,
        );
      }
    } else {
      sections.push("", "Assistant's tool calls: none.");
    }

    sections.push("", `Assistant said: ${turn.agentText.trim() || "(nothing)"}`);
  }

  if (conversation.closingMessage) {
    sections.push("", `User's parting message: ${conversation.closingMessage}`);
  }

  sections.push(
    "",
    "# How the conversation ended",
    "",
    describeEnding(conversation.endedBy, conversation),
  );

  return sections.join("\n");
}

export function buildJudgePrompt(request: JudgeRequest): string {
  return [
    "# The outcome that was supposed to be achieved",
    "",
    request.successCriteria,
    "",
    serializeTranscript(request),
  ].join("\n");
}

export async function judgeSimulation(
  request: JudgeRequest,
  model: LanguageModel,
): Promise<SimulationVerdict> {
  const generated = await generateObject({
    model,
    schema: verdictSchema,
    system: JUDGE_SYSTEM_PROMPT,
    prompt: buildJudgePrompt(request),
  });

  const { reasoning, evidence, passed } = generated.object;
  const citedEvidence = evidence.filter((item) => item.trim().length > 0);

  if (citedEvidence.length === 0) {
    // The criteria are prose, so there is no per-criterion score for the
    // harness to check `passed` against. Cited evidence is the entire audit
    // trail, and a verdict without one cannot be reviewed by anybody — so it
    // is treated as a judgement that failed to happen, not as a result.
    throw new Error(
      "The judge returned a verdict with no evidence. A verdict that cites nothing cannot be audited.",
    );
  }
  if (!reasoning.trim()) {
    throw new Error("The judge returned a verdict with no reasoning.");
  }

  return {
    passed,
    reasoning: reasoning.trim(),
    evidence: citedEvidence,
    // Taken from the conversation, never from the model: these are facts the
    // harness measured, and asking a model to restate them only invites it to
    // get them wrong.
    turnsUsed: request.conversation.turnsUsed,
    durationMs: request.conversation.durationMs,
    endedBy: request.conversation.endedBy,
  };
}
