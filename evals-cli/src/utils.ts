/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { FunctionCall } from './types/evals.js';
import { ToolCall } from './types/tools.js';

export function functionCallOutcome(expected: FunctionCall | null, actual: ToolCall | null): "pass" | "fail" {
  if (expected === null && actual === null) {
    return "pass";
  } 

  if (expected?.functionName !== actual?.functionName) {
    return "fail";
  }

  if (!deepEqual(expected?.arguments, actual?.args)) {
    return "fail";
  }

  return "pass";
}

export function deepEqual(obj1: any, obj2: any): boolean {
  if (obj1 === obj2) {
    return true;
  }

  if (
    obj1 === null ||
    obj2 === null ||
    typeof obj1 !== "object" ||
    typeof obj2 !== "object"
  ) {
    return false;
  }

  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);

  if (keys1.length !== keys2.length) {
    return false;
  }

  for (const key of keys1) {
    if (!keys2.includes(key) || !deepEqual(obj1[key], obj2[key])) {
      return false;
    }
  }

  return true;
}
