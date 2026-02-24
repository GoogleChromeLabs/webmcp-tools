/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { FunctionCall } from "./types/evals.js";
import { ToolCall } from "./types/tools.js";
import { matchesArgument } from "./matcher.js";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";

export const CHROME_CANARY_PATHS: string[] = [
  // Windows
  path.join(
    os.homedir(),
    "AppData",
    "Local",
    "Google",
    "Chrome SxS",
    "Application",
    "chrome.exe",
  ),
  // macOS
  "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
  // Linux unstable channel
  "/usr/bin/google-chrome-unstable",
  "/opt/google/chrome-unstable/google-chrome",
  "/usr/bin/google-chrome-canary"
];

export function findChromePath(): string {
  for (const candidate of CHROME_CANARY_PATHS) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(
    "Chrome Canary not found. Please install Chrome Canary (version 146+).\n" +
      "Checked paths:\n" +
      CHROME_CANARY_PATHS.map((p) => `  - ${p}`).join("\n"),
  );
}


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
