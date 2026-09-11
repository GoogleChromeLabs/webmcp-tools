/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFile } from "fs/promises";
import { resolve } from "path";
import { LoadedSimulation, SimulationSetupCall } from "../types/simulations.js";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
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

  return raw.map((entry, index) => {
    const position = `${fileLabel}: simulation #${index + 1}`;
    if (!isPlainObject(entry)) {
      throw new Error(`${position} must be an object.`);
    }

    const { name: rawName, userScenario, successCriteria, maxTurns, maxDurationMs, setup } = entry;

    if (rawName !== undefined && !isNonEmptyString(rawName)) {
      throw new Error(`${position}: "name" must be a non-empty string when present.`);
    }
    // Reports key on the name, and `userScenario` is a paragraph rather than a
    // label, so an unnamed case gets a positional name instead of borrowing
    // its scenario text the way `Eval` borrows its first message.
    const name = isNonEmptyString(rawName) ? rawName.trim() : `Simulation ${index + 1}`;
    const label = `${position} ("${name}")`;

    if (!isNonEmptyString(userScenario)) {
      throw new Error(`${label}: "userScenario" must be a non-empty string.`);
    }
    if (Array.isArray(successCriteria)) {
      throw new Error(
        `${label}: "successCriteria" must be a single prose string, not a list. ` +
          "State the intended outcome as one paragraph the judge weighs whole.",
      );
    }
    if (!isNonEmptyString(successCriteria)) {
      throw new Error(`${label}: "successCriteria" must be a non-empty string.`);
    }
    if (!isPositiveInteger(maxTurns)) {
      throw new Error(`${label}: "maxTurns" must be a positive integer.`);
    }
    let durationBudget: number | undefined;
    if (maxDurationMs !== undefined) {
      if (!isPositiveInteger(maxDurationMs)) {
        throw new Error(`${label}: "maxDurationMs" must be a positive integer when present.`);
      }
      durationBudget = maxDurationMs;
    }

    rejectUnusedKeys(
      entry,
      ["name", "setup", "userScenario", "maxTurns", "maxDurationMs", "successCriteria"],
      label,
      {
        messages: "a simulation generates its own user; it has no authored conversation",
        expectedCall: "a simulation is judged on its outcome, not on a trajectory",
      },
    );

    const setupCalls = parseSetup(setup, label);

    return {
      name,
      userScenario: userScenario.trim(),
      successCriteria: successCriteria.trim(),
      maxTurns,
      ...(durationBudget !== undefined ? { maxDurationMs: durationBudget } : {}),
      ...(setupCalls ? { setup: setupCalls } : {}),
    };
  });
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
