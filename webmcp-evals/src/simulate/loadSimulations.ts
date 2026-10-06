/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFile } from "fs/promises";
import { resolve } from "path";
import {
  AssertionMatcher,
  DomAssertion,
  DomAssertionExpectation,
  LoadedSimulation,
  SimulationSetupCall,
} from "../types/simulations.js";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

const SUPPORTED_MATCHERS = new Set([
  "$any",
  "$contains",
  "$gt",
  "$gte",
  "$lt",
  "$lte",
  "$pattern",
  "$type",
]);

function isMatcher(value: unknown): value is AssertionMatcher {
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value);
  if (keys.length === 0 || !keys.every((key) => SUPPORTED_MATCHERS.has(key))) return false;

  return keys.every((key) => {
    const operand = value[key];
    if (key === "$any") return operand === true;
    if (key === "$contains" || key === "$pattern") return typeof operand === "string";
    if (["$gt", "$gte", "$lt", "$lte"].includes(key)) {
      return typeof operand === "number" && Number.isFinite(operand);
    }
    return (
      key === "$type" &&
      typeof operand === "string" &&
      ["string", "number", "boolean", "array", "object", "null"].includes(operand)
    );
  });
}

/**
 * A key an author can plausibly write and be silently disappointed by: either
 * borrowed from the `FunctionCall` shape `setup` imitates, or a near-miss of a
 * real field. Ignoring these quietly is the failure mode worth spending an
 * error on — a `setup` call marked `optional` still runs, and a `maxDuration`
 * that should have been `maxDurationMs` leaves the case on the default budget.
 */
function rejectUnusedKeys(
  entry: Record<string, unknown>,
  known: string[],
  label: string,
  hints: Record<string, string> = {},
): void {
  const unused = Object.keys(entry).filter((key) => !known.includes(key));
  if (unused.length === 0) return;

  const detail = unused
    .map((key) => (hints[key] ? `"${key}" (${hints[key]})` : `"${key}"`))
    .join(", ");
  throw new Error(
    `${label} has keys it does not use: ${detail}. Recognised keys are ${known
      .map((key) => `"${key}"`)
      .join(", ")}.`,
  );
}

function parseSetup(raw: unknown, label: string): SimulationSetupCall[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) {
    throw new Error(`${label}: "setup" must be an array of tool calls.`);
  }

  return raw.map((entry, index) => {
    const callLabel = `${label} setup call #${index + 1}`;
    if (!isPlainObject(entry)) {
      throw new Error(`${callLabel} must be an object.`);
    }
    const { functionName, arguments: args } = entry;
    if (!isNonEmptyString(functionName)) {
      throw new Error(`${callLabel} must have a non-empty "functionName".`);
    }
    if (!isPlainObject(args)) {
      throw new Error(
        `${callLabel} must have an "arguments" object with concrete values. ` +
          "Setup runs without a model, so nothing fills in an omitted argument.",
      );
    }
    rejectUnusedKeys(entry, ["functionName", "arguments"], callLabel, {
      optional: "every setup call runs, unconditionally, before the agent joins",
      result: "setup establishes world state; it is never asserted on",
      mockOutput: "setup drives the real page, so nothing is mocked",
    });
    return { functionName: functionName.trim(), arguments: args };
  });
}

function parseExpectation(raw: unknown, label: string): DomAssertionExpectation {
  if (!isPlainObject(raw)) {
    throw new Error(`${label}: "expect" must be an object.`);
  }

  const expectationKeys = ["exists", "count", "text", "attribute"];
  const selected = Object.keys(raw).filter((key) => expectationKeys.includes(key));
  if (selected.length !== 1 || Object.keys(raw).length !== 1) {
    throw new Error(
      `${label}: "expect" must define exactly one of ${expectationKeys
        .map((key) => `"${key}"`)
        .join(", ")}.`,
    );
  }

  const key = selected[0];
  const value = raw[key];
  if (key === "exists") {
    if (typeof value !== "boolean") {
      throw new Error(`${label}: "exists" must be a boolean.`);
    }
    return { exists: value };
  }

  if (key === "count") {
    if (
      !(typeof value === "number" && Number.isInteger(value) && value >= 0) &&
      !isMatcher(value)
    ) {
      throw new Error(`${label}: "count" must be a non-negative integer or matcher object.`);
    }
    return { count: value };
  }

  if (key === "text") {
    if (typeof value !== "string" && !isMatcher(value)) {
      throw new Error(`${label}: "text" must be a string or matcher object.`);
    }
    return { text: value };
  }

  if (!isPlainObject(value)) {
    throw new Error(`${label}: "attribute" must be an object.`);
  }
  rejectUnusedKeys(value, ["name", "value"], `${label} attribute expectation`);
  if (!isNonEmptyString(value.name)) {
    throw new Error(`${label} attribute expectation must have a non-empty "name".`);
  }
  if (!Object.prototype.hasOwnProperty.call(value, "value")) {
    throw new Error(`${label} attribute expectation must define "value".`);
  }
  if (typeof value.value !== "string" && value.value !== null && !isMatcher(value.value)) {
    throw new Error(
      `${label} attribute expectation "value" must be a string, null, or matcher object.`,
    );
  }
  return {
    attribute: {
      name: value.name.trim(),
      value: value.value,
    },
  };
}

function parseAssertions(raw: unknown, label: string): DomAssertion[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(`${label}: "assertions" must be a non-empty array.`);
  }

  return raw.map((entry, index) => {
    const assertionLabel = `${label} assertion #${index + 1}`;
    if (!isPlainObject(entry)) {
      throw new Error(`${assertionLabel} must be an object.`);
    }
    rejectUnusedKeys(entry, ["type", "selector", "expect"], assertionLabel);
    if (entry.type !== "dom") {
      throw new Error(`${assertionLabel}: "type" must be "dom".`);
    }
    if (!isNonEmptyString(entry.selector)) {
      throw new Error(`${assertionLabel} must have a non-empty "selector".`);
    }
    return {
      type: "dom",
      selector: entry.selector.trim(),
      expect: parseExpectation(entry.expect, assertionLabel),
    };
  });
}

/**
 * Validates a whole simulation file before anything is executed, the way
 * `compileSmokeTests` does: a bad case at the end of the file must not be
 * discovered after an earlier case has already driven a browser.
 */
export function parseSimulations(raw: unknown, fileLabel: string): LoadedSimulation[] {
  if (!Array.isArray(raw)) {
    throw new Error(`${fileLabel}: expected an array of simulations.`);
  }
  if (raw.length === 0) {
    throw new Error(`${fileLabel}: contains no simulations.`);
  }

  const simulations = raw.map((entry, index) => {
    const position = `${fileLabel}: simulation #${index + 1}`;
    if (!isPlainObject(entry)) {
      throw new Error(`${position} must be an object.`);
    }

    const {
      name: rawName,
      userScenario,
      userMessage,
      successCriteria,
      assertions,
      maxTurns,
      maxDurationMs,
      setup,
    } = entry;

    if (rawName !== undefined && !isNonEmptyString(rawName)) {
      throw new Error(`${position}: "name" must be a non-empty string when present.`);
    }
    // Reports key on the name, and `userScenario` is a paragraph rather than a
    // label, so an unnamed case gets a positional name instead of borrowing
    // its scenario text the way `Eval` borrows its first message.
    const name = isNonEmptyString(rawName) ? rawName.trim() : `Simulation ${index + 1}`;
    const label = `${position} ("${name}")`;

    if (userScenario !== undefined && !isNonEmptyString(userScenario)) {
      throw new Error(`${label}: "userScenario" must be a non-empty string when present.`);
    }
    if (userMessage !== undefined && !isNonEmptyString(userMessage)) {
      throw new Error(`${label}: "userMessage" must be a non-empty string when present.`);
    }
    if ((userScenario === undefined) === (userMessage === undefined)) {
      throw new Error(`${label}: define exactly one of "userScenario" or "userMessage".`);
    }
    if (Array.isArray(successCriteria)) {
      throw new Error(
        `${label}: "successCriteria" must be a single prose string, not a list. ` +
          "State the intended outcome as one paragraph the judge weighs whole.",
      );
    }
    if (successCriteria !== undefined && !isNonEmptyString(successCriteria)) {
      throw new Error(`${label}: "successCriteria" must be a non-empty string when present.`);
    }
    if (maxTurns !== undefined && !isPositiveInteger(maxTurns)) {
      throw new Error(`${label}: "maxTurns" must be a positive integer when present.`);
    }
    if (userMessage !== undefined && maxTurns !== undefined) {
      throw new Error(`${label}: "maxTurns" cannot be used with "userMessage".`);
    }
    const turnBudget = userMessage !== undefined ? 1 : maxTurns === undefined ? 1 : maxTurns;
    let durationBudget: number | undefined;
    if (maxDurationMs !== undefined) {
      if (!isPositiveInteger(maxDurationMs)) {
        throw new Error(`${label}: "maxDurationMs" must be a positive integer when present.`);
      }
      durationBudget = maxDurationMs;
    }

    rejectUnusedKeys(
      entry,
      [
        "name",
        "setup",
        "userScenario",
        "userMessage",
        "assertions",
        "maxTurns",
        "maxDurationMs",
        "successCriteria",
      ],
      label,
      {
        messages: "use one userScenario or userMessage instead of an authored conversation",
        expectedCall: "a simulation is judged on its outcome, not on a trajectory",
      },
    );

    const setupCalls = parseSetup(setup, label);
    const parsedAssertions = parseAssertions(assertions, label);
    if (!parsedAssertions && successCriteria === undefined) {
      throw new Error(`${label} must define at least one of "assertions" or "successCriteria".`);
    }

    const common = {
      name,
      ...(isNonEmptyString(successCriteria) ? { successCriteria: successCriteria.trim() } : {}),
      ...(parsedAssertions ? { assertions: parsedAssertions } : {}),
      ...(durationBudget !== undefined ? { maxDurationMs: durationBudget } : {}),
      ...(setupCalls ? { setup: setupCalls } : {}),
    };

    if (isNonEmptyString(userScenario)) {
      return { ...common, userScenario: userScenario.trim(), maxTurns: turnBudget };
    }
    return { ...common, userMessage: (userMessage as string).trim(), maxTurns: 1 as const };
  });

  const firstPositionByName = new Map<string, number>();
  for (const [index, simulation] of simulations.entries()) {
    const firstPosition = firstPositionByName.get(simulation.name);
    if (firstPosition !== undefined) {
      throw new Error(
        `${fileLabel}: simulations #${firstPosition} and #${index + 1} use the duplicate name "${simulation.name}".`,
      );
    }
    firstPositionByName.set(simulation.name, index + 1);
  }

  return simulations;
}

export async function loadSimulations(path: string): Promise<LoadedSimulation[]> {
  const absolutePath = resolve(process.cwd(), path);

  let contents: string;
  try {
    contents = await readFile(absolutePath, "utf-8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not read simulation file ${path}: ${message}`);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(contents);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not parse ${path} as JSON: ${message}`);
  }

  return parseSimulations(raw, path);
}
