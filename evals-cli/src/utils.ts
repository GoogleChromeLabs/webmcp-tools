/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExpectedCallNode, FunctionCall } from "./types/evals.js";
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

  if (!expected || !actual) {
    return "fail";
  }

  if (expected.functionName !== actual.functionName) {
    return "fail";
  }

  if (!matchesArgument(expected.arguments, actual?.args)) {
    return "fail";
  }

  return "pass";
}

export interface MatchResult {
  matches: boolean;
  consumed: number;
  mappedResults: { expected: FunctionCall | null, actual: ToolCall | null, outcome: "pass" | "fail" }[];
}

export function countExpectedCalls(nodes: ExpectedCallNode[] | null): number {
  if (nodes === null) return 1;
  let count = 0;
  for (const node of nodes) {
    if ('unordered' in node) {
      count += countExpectedCalls(node.unordered);
    } else if ('ordered' in node) {
      count += countExpectedCalls(node.ordered);
    } else {
      count += 1;
    }
  }
  return count;
}

function hasNestedCalls(nodes: ExpectedCallNode[]): boolean {
  return nodes.some(n => 'unordered' in n || 'ordered' in n);
}

export function matchUnorderedGroup(nodes: ExpectedCallNode[], executions: ToolCall[], startIndex: number): MatchResult {
  const poolSize = countExpectedCalls(nodes);

  if (!hasNestedCalls(nodes)) {
    const pool = executions.slice(startIndex, startIndex + poolSize);
    const matchedIndices = new Set<number>();
    const mappedExpected = new Set<ExpectedCallNode>();
    let allMatched = true;
    const mappedResults: { expected: FunctionCall | null, actual: ToolCall | null, outcome: "pass" | "fail" }[] = [];

    // Assign perfectly matching pairs first
    for (const node of nodes) {
      const expected = node as FunctionCall;
      let foundIndex = -1;
      for (let i = 0; i < pool.length; i++) {
        if (!matchedIndices.has(i) && functionCallOutcome(expected, pool[i]) === "pass") {
          foundIndex = i;
          break;
        }
      }
      if (foundIndex !== -1) {
        matchedIndices.add(foundIndex);
        mappedExpected.add(node);
        mappedResults.push({ expected, actual: pool[foundIndex], outcome: "pass" });
      }
    }

    // Assign unused elements 1-to-1 with remaining expectations
    const unmatchedPool = pool.filter((_, idx) => !matchedIndices.has(idx));
    let unmatchedIndex = 0;

    for (const node of nodes) {
      if (!mappedExpected.has(node)) {
        allMatched = false;
        const expected = node as FunctionCall;
        if (unmatchedIndex < unmatchedPool.length) {
          mappedResults.push({ expected, actual: unmatchedPool[unmatchedIndex], outcome: "fail" });
          unmatchedIndex++;
        } else {
          mappedResults.push({ expected, actual: null, outcome: "fail" });
        }
      }
    }

    return {
      matches: allMatched && matchedIndices.size === pool.length && pool.length === nodes.length,
      consumed: poolSize,
      mappedResults
    };
  }

  let bestResult: MatchResult | null = null;

  // We use an explicit stack to convert the backtracking recursion into an iterative approach.
  // Each item in the stack represents a distinct state in our depth-first search (DFS) path.
  type SearchState = {
    usedIndices: Set<number>;
    currentIndex: number;
    mappedResults: { expected: FunctionCall | null, actual: ToolCall | null, outcome: "pass" | "fail" }[];
  };

  // Initialize the stack with our starting state: nothing matched, starting at 'startIndex'
  const stack: SearchState[] = [{
    usedIndices: new Set(),
    currentIndex: startIndex,
    mappedResults: []
  }];

  // Keep processing path states until we either find a perfect match or run out of permutations
  while (stack.length > 0) {
    // Pop the most recently added state (Depth-First Search mapping)
    const currentState = stack.pop()!;

    // STEP 1: Check if this state has successfully matched all the nodes in the unordered group
    if (currentState.usedIndices.size === nodes.length) {
      const allPassed = currentState.mappedResults.every(r => r.outcome === "pass");

      const res: MatchResult = {
        matches: allPassed,
        consumed: currentState.currentIndex - startIndex,
        mappedResults: currentState.mappedResults
      };

      // STEP 2: If we found a perfect sequence that passes all expectations, we short-circuit immediately!
      if (res.matches) {
        return res;
      }

      // STEP 3: Even if it wasn't a perfect match, we save it if it's the "best" partial match we've seen.
      // This is crucial for rendering accurate partial-failure reports to the user.
      if (!bestResult) {
        bestResult = res;
      } else {
        const currentPasses = res.mappedResults.filter(r => r.outcome === "pass").length;
        const bestPasses = bestResult.mappedResults.filter(r => r.outcome === "pass").length;
        if (currentPasses > bestPasses) {
          bestResult = res;
        }
      }

      // We finished evaluating this specific permutation branch, continue to the next one from the stack
      continue;
    }

    // STEP 4: Branch out to test every remaining unordered node at this state's execution index.
    // We iterate backwards so the first items are pushed last, meaning they pop off the stack first
    // This preserves a left-to-right verification ordering similar to actual human logic.
    for (let i = nodes.length - 1; i >= 0; i--) {
      if (!currentState.usedIndices.has(i)) {

        // Clone the used indices set and mark this node as historically 'used' for this specific branch
        const nextUsedIndices = new Set(currentState.usedIndices);
        nextUsedIndices.add(i);

        // Advance the parser by evaluating this newly selected node against the executions
        const nodeRes = matchExpectedNode(nodes[i], executions, currentState.currentIndex);

        // Collect all mapped rows resulting from this node evaluation
        const nextMappedResults = [...currentState.mappedResults, ...nodeRes.mappedResults];

        // Push this new potential pathway onto the stack to evaluate deeper in the next loop evaluation
        stack.push({
          usedIndices: nextUsedIndices,
          currentIndex: currentState.currentIndex + nodeRes.consumed,
          mappedResults: nextMappedResults
        });
      }
    }
  }

  return bestResult || { matches: false, consumed: poolSize, mappedResults: [] };
}

export function matchExpectedNode(node: ExpectedCallNode, executions: ToolCall[], startIndex: number): MatchResult {
  if ('unordered' in node) {
    return matchUnorderedGroup(node.unordered, executions, startIndex);
  } else if ('ordered' in node) {
    return matchSequence(node.ordered, executions, startIndex);
  } else {
    if (startIndex >= executions.length) {
      return {
        matches: false,
        consumed: 1,
        mappedResults: [{ expected: node as FunctionCall, actual: null, outcome: "fail" }]
      };
    }
    const actual = executions[startIndex];
    const outcome = functionCallOutcome(node as FunctionCall, actual);
    return {
      matches: outcome === "pass",
      consumed: 1,
      mappedResults: [{ expected: node as FunctionCall, actual, outcome }]
    };
  }
}

export function matchSequence(nodes: ExpectedCallNode[], executions: ToolCall[], startIndex: number): MatchResult {
  let currentIndex = startIndex;
  let allMatched = true;
  const mappedResults: { expected: FunctionCall | null, actual: ToolCall | null, outcome: "pass" | "fail" }[] = [];

  for (const node of nodes) {
    const res = matchExpectedNode(node, executions, currentIndex);
    if (!res.matches) allMatched = false;
    currentIndex += res.consumed;
    mappedResults.push(...res.mappedResults);
  }

  return {
    matches: allMatched,
    consumed: currentIndex - startIndex,
    mappedResults
  };
}

export function evaluateExecutionTrajectory(expectedCalls: ExpectedCallNode[] | null, executions: ToolCall[]): { expected: FunctionCall | null, actual: ToolCall | null, outcome: "pass" | "fail" }[] {
  if (expectedCalls === null) {
    if (executions.length === 0) {
      return [{ expected: null, actual: null, outcome: "pass" }];
    } else {
      return [{ expected: null, actual: executions[0], outcome: "fail" }];
    }
  }

  if (expectedCalls.length === 0) {
    return [];
  }

  const { mappedResults } = matchSequence(expectedCalls, executions, 0);
  return mappedResults;
}

export function sortObjectKeys(obj: any): any {
  if (typeof obj === 'string') {
    try {
      const parsed = JSON.parse(obj);
      if (typeof parsed === 'object' && parsed !== null) {
        obj = parsed;
      }
    } catch (e) {
      // not JSON string, return as is
    }
  }

  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys);
  }
  const sortedKeys = Object.keys(obj).sort();
  const res: any = {};
  for (const k of sortedKeys) {
    res[k] = sortObjectKeys(obj[k]);
  }
  return res;
}
