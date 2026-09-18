/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { LanguageModel, ModelMessage } from "ai";
import { TrajectoryStep } from "../types/evals.js";
import { ToolCall } from "../types/tools.js";
import { SimulationEndReason } from "../types/simulations.js";
import { ToolRegistry } from "../evaluator/toolRegistry.js";
import { AgentTurnRequest, AgentTurnResult, runAgentTurn } from "./agentTurn.js";
import {
  simulateUserTurn,
  UserTurnRequest,
  UserTurnResult,
  UserVisibleMessage,
} from "./userSimulator.js";
import { withTimeout } from "./toolSequence.js";

/** One exchange: what the user said, and everything the agent did in reply. */
export type ConversationTurn = {
  /** 1-based. */
  index: number;
  userMessage: string;
  agentText: string;
  steps: TrajectoryStep[];
  toolCalls: ToolCall[];
};

export type ConversationRequest = {
  userScenario: string;
  maxTurns: number;
  maxDurationMs: number;
  /** Cap on the agent's tool-calling steps within a single turn. */
  maxSteps: number;
  registry: ToolRegistry;
  agentModel: LanguageModel;
  userModel: LanguageModel;
};

export type ConversationResult = {
  turns: ConversationTurn[];
  /** The user's parting line, when the user is what ended the conversation. */
  closingMessage?: string;
  turnsUsed: number;
  durationMs: number;
  endedBy: SimulationEndReason;
  /** Set only when `endedBy` is `error`. */
  error?: unknown;
};

/**
 * Injection points for tests. Follows the shape `executeSmokeEvals` already
 * uses, so a conversation can be driven end to end without a model or a
 * browser.
 */
export type ConversationDependencies = {
  runAgentTurn?: (request: AgentTurnRequest) => Promise<AgentTurnResult>;
  simulateUserTurn?: (request: UserTurnRequest, model: LanguageModel) => Promise<UserTurnResult>;
};

/**
 * What the simulated user is shown: the words exchanged, and nothing about how
 * the agent produced them.
 */
function userVisibleTranscript(turns: ConversationTurn[]): UserVisibleMessage[] {
  return turns.flatMap((turn) => [
    { speaker: "user" as const, text: turn.userMessage },
    { speaker: "assistant" as const, text: turn.agentText },
  ]);
}

/**
 * Runs a simulated user and the agent against each other until the user is
 * satisfied, the turns run out, the clock runs out, or something breaks.
 *
 * The verdict is not decided here. Which of those endings occurred is recorded
 * in `endedBy` and handed to the judge as context: a conversation that ran out
 * of turns after the agent already finished the job is a pass, and one the user
 * closed politely after the agent achieved nothing is a failure.
 */
export async function runConversation(
  request: ConversationRequest,
  dependencies: ConversationDependencies = {},
): Promise<ConversationResult> {
  const agentTurn = dependencies.runAgentTurn || runAgentTurn;
  const userTurn = dependencies.simulateUserTurn || simulateUserTurn;

  const startedAt = Date.now();
  const deadlineAt = startedAt + request.maxDurationMs;
  // The budget is a deadline, not a per-call allowance: whatever a turn spends
  // comes out of what the next one has left.
  const remainingMs = () => deadlineAt - Date.now();

  const turns: ConversationTurn[] = [];
  const history: ModelMessage[] = [];
  let closingMessage: string | undefined;
  let endedBy: SimulationEndReason = "maxTurns";
  let error: unknown;

  try {
    for (let index = 1; index <= request.maxTurns; index++) {
      if (remainingMs() <= 0) {
        endedBy = "timeout";
        break;
      }

      const userReply = await withTimeout(
        userTurn(
          { userScenario: request.userScenario, transcript: userVisibleTranscript(turns) },
          request.userModel,
        ),
        remainingMs(),
        "the simulated user",
      );

      if (userReply.done) {
        closingMessage = userReply.message;
        endedBy = "user";
        break;
      }
      if (!userReply.message.trim()) {
        // Silence is not an ending the user chose, it is a simulator that
        // failed. Reporting it as a normal close would hide the fault behind a
        // plausible-looking verdict.
        throw new Error("The simulated user produced an empty message.");
      }

      if (remainingMs() <= 0) {
        endedBy = "timeout";
        break;
      }

      const controller = new AbortController();
      let agentResult: AgentTurnResult;
      try {
        agentResult = await withTimeout(
          agentTurn({
            messages: [...history, { role: "user", content: userReply.message }],
            registry: request.registry,
            model: request.agentModel,
            maxSteps: request.maxSteps,
            abortSignal: controller.signal,
          }),
          Math.max(remainingMs(), 1),
          "the agent's turn",
        );
      } catch (thrown) {
        // We are walking away from work still in flight; tell it to stop
        // rather than leaving a browser driving itself in the background.
        controller.abort();
        throw thrown;
      }

      turns.push({
        index,
        userMessage: userReply.message,
        agentText: agentResult.text,
        steps: agentResult.steps,
        toolCalls: agentResult.toolCalls,
      });

      if (agentResult.error) {
        // An abort we asked for is the budget expiring, not the agent failing.
        if (remainingMs() <= 0) {
          endedBy = "timeout";
        } else {
          endedBy = "error";
          error = agentResult.error;
        }
        break;
      }

      history.push({ role: "user", content: userReply.message });
      history.push(...agentResult.responseMessages);
    }
  } catch (thrown) {
    if (remainingMs() <= 0) {
      endedBy = "timeout";
    } else {
      endedBy = "error";
      error = thrown;
    }
  }

  return {
    turns,
    ...(closingMessage ? { closingMessage } : {}),
    turnsUsed: turns.length,
    durationMs: Date.now() - startedAt,
    endedBy,
    ...(error !== undefined ? { error } : {}),
  };
}
