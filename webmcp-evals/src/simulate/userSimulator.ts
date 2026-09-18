/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { generateText, LanguageModel, ModelMessage } from "ai";
import { END_CONVERSATION_MARKER, userSimulatorSystemPrompt } from "./prompts.js";

/**
 * One line of the conversation as the simulated user experiences it. Tool
 * calls and their results are deliberately absent: a real user cannot see the
 * assistant's machinery, only what it says back.
 */
export type UserVisibleMessage = {
  speaker: "user" | "assistant";
  text: string;
};

/**
 * Everything the simulated user is allowed to know. There is no field here
 * that could carry the case's success criteria, and that is the point — the
 * separation is structural rather than a rule someone has to remember.
 */
export type UserTurnRequest = {
  userScenario: string;
  transcript: UserVisibleMessage[];
};

export type UserTurnResult = {
  message: string;
  /** The user considers the conversation finished, one way or the other. */
  done: boolean;
};

/** Stands in for the assistant's opening move, which has not happened yet. */
const OPENING_CUE = "(You have the assistant's attention. Say what you came for.)";

/** Shown when the agent finished a turn without saying anything to the user. */
const SILENT_REPLY = "(The assistant did not say anything.)";

export function buildUserSimulatorMessages(request: UserTurnRequest): {
  system: string;
  messages: ModelMessage[];
} {
  // Roles are inverted on purpose. The model here is playing the *user*, so
  // the user's own past lines are its previous output ("assistant") and the
  // real agent's replies are its input ("user").
  const messages: ModelMessage[] = request.transcript.map((entry) => ({
    role: entry.speaker === "user" ? ("assistant" as const) : ("user" as const),
    content: entry.text.trim() || SILENT_REPLY,
  }));

  if (messages.length === 0 || messages[messages.length - 1].role === "assistant") {
    messages.push({ role: "user", content: OPENING_CUE });
  }

  return { system: userSimulatorSystemPrompt(request.userScenario), messages };
}

/**
 * Splits the closing marker off the message the agent should actually receive.
 * The marker has to be matched literally: treating a phrase like "we're done"
 * as an ending would let an agreeable user close a conversation it never
 * finished.
 */
export function parseSimulatedUserReply(text: string): UserTurnResult {
  const done = text.includes(END_CONVERSATION_MARKER);
  const message = text.split(END_CONVERSATION_MARKER).join("").trim();
  return { message, done };
}

export async function simulateUserTurn(
  request: UserTurnRequest,
  model: LanguageModel,
): Promise<UserTurnResult> {
  const { system, messages } = buildUserSimulatorMessages(request);
  const generated = await generateText({ model, system, messages });
  return parseSimulatedUserReply(generated.text || "");
}
