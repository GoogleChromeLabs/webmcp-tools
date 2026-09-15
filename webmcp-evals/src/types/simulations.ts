/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A simulation case: a brief for a simulated user, a budget for the
 * conversation, and the outcome a judge weighs the resulting transcript
 * against. Distinct from `Eval`, which asserts on a trajectory of tool calls.
 */
export type Simulation = {
  name?: string;
  // Tool calls the harness executes before the agent joins the conversation,
  // so a case can start from a world that is already in some state.
  setup?: SimulationSetupCall[];
  // The brief for the simulated user. Never sees `successCriteria`: a user
  // that knows the answer hands it to the agent and the case passes for the
  // wrong reason.
  userScenario: string;
  maxTurns: number;
  // Wall-clock budget for the whole conversation. Falls back to the CLI
  // default when omitted. `maxTurns` cannot bound a turn that stalls inside a
  // tool call; this can.
  maxDurationMs?: number;
  // One prose statement of the intended outcome, weighed whole by the judge
  // rather than scored item by item.
  successCriteria: string;
};

/**
 * Spelled like `expectedCall`'s `FunctionCall` so authors moving between the
 * two file types do not learn a second spelling, but `arguments` is required
 * and concrete: setup runs without a model, so there is nobody to fill in a
 * value the author left out.
 */
export type SimulationSetupCall = {
  functionName: string;
  arguments: Record<string, unknown>;
};

/** A simulation with its reporting name resolved, as the loader returns it. */
export type LoadedSimulation = Simulation & { name: string };

/**
 * Why a conversation stopped. Reported beside the verdict, never in place of
 * one — exhausting a budget is not itself a failure.
 */
export type SimulationEndReason = "user" | "maxTurns" | "timeout" | "error";

export type SimulationVerdict = {
  passed: boolean;
  reasoning: string;
  // Transcript excerpts the judge relied on. Because the criteria are prose,
  // there is nothing per-criterion to cross-check `passed` against, and this
  // is the only audit trail a verdict carries.
  evidence: string[];
  turnsUsed: number;
  durationMs: number;
  endedBy: SimulationEndReason;
};
