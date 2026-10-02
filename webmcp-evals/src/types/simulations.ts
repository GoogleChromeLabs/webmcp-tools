/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A simulation case: either a brief for a simulated user or one direct user
 * message, plus the outcome checked against the resulting application state.
 * Distinct from `Eval`, which asserts on a trajectory of tool calls.
 */
type SimulationBase = {
  name?: string;
  // Tool calls the harness executes before the agent joins the conversation,
  // so a case can start from a world that is already in some state.
  setup?: SimulationSetupCall[];
  // Wall-clock budget for the whole conversation. Falls back to the CLI
  // default when omitted. `maxTurns` cannot bound a turn that stalls inside a
  // tool call; this can.
  maxDurationMs?: number;
  // Deterministic checks against the final page state.
  assertions?: DomAssertion[];
  // Optional prose outcome weighed whole by an LLM judge. A simulation must
  // define assertions, successCriteria, or both.
  successCriteria?: string;
};

type SimulatedUserSimulation = SimulationBase & {
  // The brief for the simulated user. Never sees `successCriteria`: a user
  // that knows the answer hands it to the agent and the case passes for the
  // wrong reason.
  userScenario: string;
  userMessage?: never;
  // Defaults to one. Values above one matter when a simulated user is enabled.
  maxTurns?: number;
};

type DirectUserSimulation = SimulationBase & {
  // Exact message sent to the agent. No user model is invoked in this mode.
  userMessage: string;
  userScenario?: never;
  maxTurns?: never;
};

export type Simulation = SimulatedUserSimulation | DirectUserSimulation;

type AtLeastOne<T> = {
  [Key in keyof T]-?: Required<Pick<T, Key>> & Partial<Omit<T, Key>>;
}[keyof T];

export type AssertionMatcher = AtLeastOne<{
  $any?: true;
  $contains?: string;
  $gt?: number;
  $gte?: number;
  $lt?: number;
  $lte?: number;
  $pattern?: string;
  $type?: "string" | "number" | "boolean" | "array" | "object" | "null";
}>;

export type DomAssertionExpectation =
  | { exists: boolean }
  | { count: number | AssertionMatcher }
  | { text: string | AssertionMatcher }
  | {
      attribute: {
        name: string;
        value: string | null | AssertionMatcher;
      };
    };

export type DomAssertion = {
  type: "dom";
  selector: string;
  expect: DomAssertionExpectation;
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

/** A simulation with loader defaults and its reporting name resolved. */
export type LoadedSimulation =
  | (Omit<SimulatedUserSimulation, "name" | "maxTurns"> & { name: string; maxTurns: number })
  | (Omit<DirectUserSimulation, "name" | "maxTurns"> & { name: string; maxTurns: 1 });

/**
 * Why a conversation stopped. Reported beside the verdict, never in place of
 * one — exhausting a budget is not itself a failure.
 */
export type SimulationEndReason = "user" | "singleTurn" | "maxTurns" | "timeout" | "error";

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
