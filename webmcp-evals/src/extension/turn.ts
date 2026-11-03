/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import chalk from "chalk";
import { TimeoutError } from "../simulate/toolSequence.js";
import type { ConfirmPolicy, ExtensionConfigOptions } from "../types/config.js";
import type { TrajectoryStep } from "../types/evals.js";
import type { ToolCall } from "../types/tools.js";
import { delay } from "./asyncUtils.js";
import {
  type AgentExtensionController,
  type AgentPanelStatus,
  type ConfirmationDecision,
  type HandledConfirmationRecord,
  type PendingConfirmation,
  type RunTurnOptions,
  type RunTurnResult,
  DEFAULT_CONFIRM_POLICY,
  extractFinalResponse,
} from "./contract.js";
import type { PageToolCallRecorder } from "./pageTelemetry.js";

/** Default limit for one extension turn (`browser --turn-timeout`). */
export const DEFAULT_TURN_TIMEOUT_MS = 120_000;
/** How often the panel is read while a turn runs. */
const POLL_INTERVAL_MS = 250;
/** If the agent is never seen busy, idle time starts counting this long after the prompt. */
const MIN_RUN_MS = 1_500;
/** Continuous idle time that ends a turn. */
const IDLE_CONFIRM_MS = 2_500;

/** The decision to apply for a `--confirm-policy`, or `null` to leave prompts for a human. */
export function confirmationDecisionFor(
  policy: ConfirmPolicy | undefined,
): ConfirmationDecision | null {
  const resolved = policy ?? DEFAULT_CONFIRM_POLICY;
  return resolved === "none" ? null : resolved;
}

/**
 * Decides what an extension error message (an error bubble in its panel) means
 * for a turn. If the turn already made tool calls, those calls are still scored
 * and the message becomes part of the reply. Without tool calls there is nothing
 * to score, so the turn is an error.
 */
export function extensionTurnOutcome(
  responseText: string | null,
  error: string | null,
  toolCallCount: number,
): { text: string; error?: string } {
  const text = responseText ?? "";
  if (!error) return { text };
  if (toolCallCount === 0) return { text, error };
  return { text: [text, `[Extension error] ${error}`].filter(Boolean).join("\n\n") };
}

/** Panel operations the turn loop needs. The controller provides the real ones. */
export interface TurnDriver {
  readStatus(signal?: AbortSignal): Promise<AgentPanelStatus>;
  /** Clicks the answer and resolves `true` once the prompt is gone. */
  answerConfirmation(
    card: PendingConfirmation,
    decision: ConfirmationDecision,
    signal?: AbortSignal,
  ): Promise<boolean>;
  stop(): Promise<boolean>;
}

export interface TurnClock {
  now(): number;
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}

const realClock: TurnClock = {
  now: () => Date.now(),
  sleep: (ms, signal) => delay(ms, signal),
};

/**
 * Waits for the agent to finish the current turn, answering permission prompts
 * on the way.
 *
 * The turn ends after `IDLE_CONFIRM_MS` of continuous idle time. Idle time only
 * starts counting once the agent was seen busy, or `MIN_RUN_MS` after submit if
 * it never looked busy. On timeout or abort the extension is asked to stop first.
 */
export async function waitForTurnToFinish(
  driver: TurnDriver,
  options: RunTurnOptions = {},
  clock: TurnClock = realClock,
): Promise<RunTurnResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TURN_TIMEOUT_MS;
  const policyDecision = confirmationDecisionFor(options.onConfirmation);
  const { signal } = options;

  try {
    const startedAt = clock.now();
    const deadline = startedAt + timeoutMs;
    const resolvedIds = new Set<string>();
    let seenBusy = false;
    let idleSince: number | null = null;

    while (clock.now() < deadline) {
      signal?.throwIfAborted();
      const status = await driver.readStatus(signal);
      if (status.busy) {
        seenBusy = true;
        idleSince = null;
      }

      const pending = status.pendingConfirmations.filter((c) => !resolvedIds.has(c.id));
      if (pending.length > 0 && policyDecision !== null) {
        for (const card of pending) {
          // A budget that expired while we were polling must not let one more tool run.
          signal?.throwIfAborted();
          const decision: ConfirmationDecision =
            policyDecision === "always-allow" && !card.canAlwaysAllow
              ? "allow-once"
              : policyDecision;
          if (await driver.answerConfirmation(card, decision, signal)) {
            resolvedIds.add(card.id);
            options.onConfirmationHandled?.({ confirmation: card, decision });
          } else {
            const afterAttempt = await driver.readStatus(signal);
            if (afterAttempt.pendingConfirmations.some((c) => c.id === card.id)) {
              throw new Error(
                `Failed to resolve extension confirmation card "${card.id}" (${card.toolName ?? card.title}) with decision "${decision}".`,
              );
            }
          }
        }
        idleSince = null;
        await clock.sleep(POLL_INTERVAL_MS, signal);
        continue;
      }

      if (!status.busy && (seenBusy || clock.now() - startedAt >= MIN_RUN_MS)) {
        idleSince ??= clock.now();
        if (clock.now() - idleSince >= IDLE_CONFIRM_MS) {
          return {
            responseText: extractFinalResponse(status.raw.items),
            error: status.error,
          };
        }
      }

      await clock.sleep(POLL_INTERVAL_MS, signal);
    }

    await driver.stop().catch(() => false);
    throw new TimeoutError("Extension agent turn", timeoutMs);
  } catch (error) {
    if (signal?.aborted) {
      await driver.stop().catch(() => false);
    }
    throw error;
  }
}

function logConfirmation(record: HandledConfirmationRecord): void {
  console.log(
    chalk.dim(
      `  [Confirm] ${record.decision} -> ${record.confirmation.toolName ?? record.confirmation.title}`,
    ),
  );
}

/**
 * Runs one extension turn while recording WebMCP tool calls on the page, shared
 * by both `browser --extension` and `simulate --extension`. An extension error
 * with no tool calls comes back as `error`; the caller decides how to fail.
 */
export async function runRecordedExtensionTurn(params: {
  controller: AgentExtensionController;
  recorder: PageToolCallRecorder;
  prompt: string;
  config: Pick<ExtensionConfigOptions, "confirmPolicy"> & { verbose?: boolean };
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<{ text: string; toolCalls: ToolCall[]; steps: TrajectoryStep[]; error?: Error }> {
  const { controller, recorder, prompt, config, timeoutMs, signal } = params;
  if (config.verbose) {
    console.log(
      chalk.cyan(
        `  [Turn] Submitting prompt to "${controller.extensionName}": ${JSON.stringify(prompt)}`,
      ),
    );
  }
  recorder.markTurnStart();
  const turnResult = await controller.runTurn(prompt, {
    onConfirmation: config.confirmPolicy,
    ...(config.verbose ? { onConfirmationHandled: logConfirmation } : {}),
    timeoutMs,
    signal,
  });
  const outcome = extensionTurnOutcome(
    turnResult.responseText,
    turnResult.error,
    recorder.turnCallCount(),
  );
  const flushed = recorder.flushTurn(outcome.text);
  if (config.verbose) {
    const names = flushed.toolCalls.map((c) => c.functionName).join(", ") || "none";
    console.log(
      chalk.dim(`  [Turn] Finished (${flushed.toolCalls.length} tool call(s): ${names})`),
    );
  }
  return {
    text: outcome.text,
    toolCalls: flushed.toolCalls,
    steps: flushed.steps,
    ...(outcome.error
      ? {
          error: new Error(
            `The extension reported an error before calling any tool: ${outcome.error}`,
          ),
        }
      : {}),
  };
}
