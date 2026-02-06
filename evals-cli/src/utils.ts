/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { FunctionCall } from "./types/evals.js";
import { ToolCall } from "./types/tools.js";
import { matchesArgument } from "./matcher.js";

export function functionCallOutcome(
  expected: FunctionCall | null,
  actual: ToolCall | null,
): "pass" | "fail" {
  if (expected === null && actual === null) {
    return "pass";
  }

  if (expected?.functionName !== actual?.functionName) {
    return "fail";
  }

  if (!matchesArgument(expected?.arguments, actual?.args)) {
    return "fail";
  }

  return "pass";
}
