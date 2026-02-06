/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Checks if the actual argument matches the expected argument, supporting both exact matching and constraints.
 * 
 * If the expected argument is a constraint object (all keys start with `$`), it evaluates the constraints.
 * Otherwise, it performs a recursive deep equality check, allowing nested constraints.
 *
 * @param expected The expected value or constraint object.
 * @param actual The actual value to check.
 * @returns True if the actual value matches the expected value or satisfies the constraints.
 */
export function matchesArgument(expected: any, actual: any): boolean {
  if (isConstraintObject(expected)) {
    return matchesConstraint(expected, actual);
  }

  return matchesRecursive(expected, actual);
}

/**
 * Evaluates a constraint object against an actual value.
 * Supports operators:
 * - `$pattern`: Regex match (string)
 * - `$contains`: Substring match (string)
 * - `$gt`, `$gte`, `$lt`, `$lte`: Numeric comparisons
 * - `$type`: Type assertion ("string", "number", "boolean", "array", "object", "null")
 * - `$any`: Presence check (always true if key exists)
 *
 * @param constraint The constraint object (e.g., { "$gt": 10 }).
 * @param actual The value to test.
 * @returns True if all constraints in the object are satisfied.
 */
function matchesConstraint(constraint: any, actual: any): boolean {
  for (const key of Object.keys(constraint)) {
    if (key === "$pattern") {
      if (typeof actual !== "string") {
        return false;
      }
      const pattern = new RegExp(constraint[key]);
      if (!pattern.test(actual)) {
        return false;
      }
    } else if (key === "$contains") {
      if (typeof actual !== "string") {
        return false;
      }
      if (!actual.includes(constraint[key])) {
        return false;
      }
    } else if (["$gt", "$gte", "$lt", "$lte"].includes(key)) {
      if (typeof actual !== "number") {
        return false;
      }
      const val = constraint[key];
      if (key === "$gt" && !(actual > val)) return false;
      if (key === "$gte" && !(actual >= val)) return false;
      if (key === "$lt" && !(actual < val)) return false;
      if (key === "$lte" && !(actual <= val)) return false;
    } else if (key === "$type") {
      const type = constraint[key];
      if (type === "array") {
        if (!Array.isArray(actual)) return false;
      } else if (type === "null") {
        if (actual !== null) return false;
      } else if (type === "object") {
        if (
          typeof actual !== "object" ||
          actual === null ||
          Array.isArray(actual)
        )
          return false;
      } else {
        if (typeof actual !== type) return false;
      }
    } else if (key === "$any") {
      // Always matches if present
    }
    // Future constraints will go here
  }
  return true;
}

/**
 * Determines if an object is a constraint object.
 * An object is a constraint object if it is non-null, has at least one key,
 * and ALL its keys start with `$`.
 *
 * @param obj The object to check.
 * @returns True if strictly a constraint object.
 */
function isConstraintObject(obj: any): boolean {
  if (typeof obj !== "object" || obj === null) {
    return false;
  }
  const keys = Object.keys(obj);
  if (keys.length === 0) {
    return false;
  }
  return keys.every((key) => key.startsWith("$"));
}

/**
 * Recursively checks equality between two values.
 * If values are objects or arrays, it recurses into them.
 * Crucially, it calls `matchesArgument` for children, enabling nested constraints.
 *
 * @param expected The expected structure.
 * @param actual The actual structure.
 * @returns True if structures match recursively.
 */
function matchesRecursive(expected: any, actual: any): boolean {
  if (expected === actual) {
    return true;
  }

  if (
    expected === null ||
    actual === null ||
    typeof expected !== "object" ||
    typeof actual !== "object"
  ) {
    return false;
  }

  const keys1 = Object.keys(expected);
  const keys2 = Object.keys(actual);

  if (keys1.length !== keys2.length) {
    return false;
  }

  for (const key of keys1) {
    if (!keys2.includes(key) || !matchesArgument(expected[key], actual[key])) {
      return false;
    }
  }

  return true;
}
