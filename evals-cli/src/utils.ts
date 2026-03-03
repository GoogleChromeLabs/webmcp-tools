/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExpectedCallNode, FunctionCall } from "./types/evals.js";
import { ToolCall } from "./types/tools.js";
import { matchesArgument } from "./matcher.js";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

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

export async function findChromePath(): Promise<string> {
  for (const candidate of CHROME_CANARY_PATHS) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // file does not exist or cannot be accessed, continue to next candidate
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
  if (expected === null && actual === null) return "pass";
  if (!expected || !actual) return "fail";

  return expected.functionName === actual.functionName &&
    matchesArgument(expected.arguments, actual.args)
    ? "pass"
    : "fail";
}

export interface TrajectoryResult {
  expected: FunctionCall | null;
  actual: ToolCall | null;
  outcome: "pass" | "fail";
}

export interface MatchResult {
  matches: boolean;
  consumed: number;
  mappedResults: TrajectoryResult[];
}

export function isUnorderedGroup(node: ExpectedCallNode): node is { unordered: ExpectedCallNode[] } {
  return node !== null && typeof node === 'object' && 'unordered' in node;
}

export function isOrderedGroup(node: ExpectedCallNode): node is { ordered: ExpectedCallNode[] } {
  return node !== null && typeof node === 'object' && 'ordered' in node;
}

export function isFunctionCall(node: ExpectedCallNode): node is FunctionCall {
  // Positive type guard checking for the presence of the property instead of negatively inferring
  return node !== null && typeof node === 'object' && 'functionName' in node;
}

export function countExpectedCalls(nodes: ExpectedCallNode[]): number {
  return nodes.reduce((count, node) => {
    if (isUnorderedGroup(node)) return count + countExpectedCalls(node.unordered);
    if (isOrderedGroup(node)) return count + countExpectedCalls(node.ordered);
    return count + 1;
  }, 0);
}

function hasNestedCalls(nodes: ExpectedCallNode[]): boolean {
  return nodes.some(node => isUnorderedGroup(node) || isOrderedGroup(node));
}

export function matchUnorderedGroup(nodes: ExpectedCallNode[], executions: ToolCall[], startIndex: number): MatchResult {
  if (!hasNestedCalls(nodes)) {
    return matchSimpleUnorderedGroup(nodes, executions, startIndex);
  }

  const poolSize = countExpectedCalls(nodes);
  return matchNestedUnorderedGroup(nodes, executions, startIndex, poolSize);
}

function matchSimpleUnorderedGroup(nodes: ExpectedCallNode[], executions: ToolCall[], startIndex: number): MatchResult {
  const expectedNodesCount = nodes.length;
  const executionPoolSize = Math.max(0, Math.min(expectedNodesCount, executions.length - startIndex));

  // Create bipartite graph of expected indices mapping to all potentially matching actual executions
  const adjacencyList: number[][] = [];
  for (let i = 0; i < expectedNodesCount; i++) {
    const expected = nodes[i];
    if (!isFunctionCall(expected)) {
      throw new Error("Expected FunctionCall in simple unordered group");
    }

    const matches: number[] = [];
    for (let j = 0; j < executionPoolSize; j++) {
      if (functionCallOutcome(expected, executions[startIndex + j]) === "pass") {
        matches.push(j);
      }
    }
    adjacencyList.push(matches);
  }

  const executionToExpectedMatchMap = new Array(executionPoolSize).fill(-1);

  // Maximum Bipartite Matching algorithm (Hopcroft-Karp / DFS based)
  // Needed due to argument `constraints` matching unequally against similar executions
  function findAugmentingPath(expectedIndex: number, visited: boolean[]): boolean {
    for (const executionIndex of adjacencyList[expectedIndex]) {
      if (!visited[executionIndex]) {
        visited[executionIndex] = true;

        const previousExpectedMatch = executionToExpectedMatchMap[executionIndex];
        // If execution is unassigned OR we can reassign its current expected match to another execution
        if (previousExpectedMatch < 0 || findAugmentingPath(previousExpectedMatch, visited)) {
          executionToExpectedMatchMap[executionIndex] = expectedIndex;
          return true;
        }
      }
    }
    return false;
  }

  let matchesCount = 0;
  const visited = new Array(executionPoolSize);
  for (let i = 0; i < expectedNodesCount; i++) {
    visited.fill(false);
    if (findAugmentingPath(i, visited)) {
      matchesCount++;
    }
  }

  const allMatched = matchesCount === expectedNodesCount && executionPoolSize === expectedNodesCount;

  // Track which expected nodes were successfully matched
  const matchedExpectedIndices = new Set<number>();
  for (let i = 0; i < executionPoolSize; i++) {
    const expIndex = executionToExpectedMatchMap[i];
    if (expIndex !== -1) {
      matchedExpectedIndices.add(expIndex);
    }
  }

  // Get unmatched expected nodes
  const unmatchedExpectedNodes = nodes.filter((_, index) => !matchedExpectedIndices.has(index)) as FunctionCall[];

  // Map result array
  const mappedResults: TrajectoryResult[] = [];
  for (let j = 0; j < executionPoolSize; j++) {
    const expectedIndex = executionToExpectedMatchMap[j];
    const actual = executions[startIndex + j];
    if (expectedIndex !== -1) {
      mappedResults.push({ expected: nodes[expectedIndex] as FunctionCall, actual, outcome: "pass" });
    } else {
      // Execution has no matching expected call, assign from unmatched pool if available
      mappedResults.push({ expected: unmatchedExpectedNodes.shift() || null, actual, outcome: "fail" });
    }
  }

  // Any leftover unmatched expected nodes are added as failures with no actual execution
  for (const expected of unmatchedExpectedNodes) {
    mappedResults.push({ expected, actual: null, outcome: "fail" });
  }

  return {
    matches: allMatched,
    consumed: expectedNodesCount,
    mappedResults
  };
}

function matchNestedUnorderedGroup(nodes: ExpectedCallNode[], executions: ToolCall[], startIndex: number, expectedTotalConsumed: number): MatchResult {
  const n = nodes.length;
  // Guard against performance bottlenecks from combinatorial explosion
  if (n > 15) {
    throw new Error(`Unordered group too large (${n} nodes). Max length is 15.`);
  }

  const bestState = {
    matches: false,
    maxPasses: -1,
    mappedResults: [] as TrajectoryResult[]
  };

  const visited = new Array<boolean>(n).fill(false);
  const matchCache = new Map<string, MatchResult>();

  function getMatch(nodeIndex: number, execIndex: number): MatchResult {
    const key = `${nodeIndex}:${execIndex}`;
    let res = matchCache.get(key);
    if (!res) {
      res = matchExpectedNode(nodes[nodeIndex], executions, execIndex);
      matchCache.set(key, res);
    }
    return res;
  }

  function backtrack(
    nodesProcessed: number,
    currentConsumed: number,
    currentMatches: boolean,
    currentPasses: number,
    currentMappedResults: TrajectoryResult[]
  ): void {
    // Base case: all groups/nodes matched
    if (nodesProcessed === n) {
      if (currentPasses > bestState.maxPasses) {
        bestState.maxPasses = currentPasses;
        bestState.matches = currentMatches;
        bestState.mappedResults = [...currentMappedResults];
      }
      return;
    }

    const currentIndex = startIndex + currentConsumed;

    for (let i = 0; i < n; i++) {
      if (visited[i]) continue;

      visited[i] = true;
      const nodeRes = getMatch(i, currentIndex);

      const nodePasses = nodeRes.mappedResults.filter(r => r.outcome === "pass").length;
      currentMappedResults.push(...nodeRes.mappedResults);

      backtrack(
        nodesProcessed + 1,
        currentConsumed + nodeRes.consumed,
        currentMatches && nodeRes.matches,
        currentPasses + nodePasses,
        currentMappedResults
      );

      // Undo modifications for backtracking
      currentMappedResults.length -= nodeRes.mappedResults.length;
      visited[i] = false;
    }
  }

  backtrack(0, 0, true, 0, []);

  return {
    matches: bestState.matches,
    consumed: expectedTotalConsumed,
    mappedResults: bestState.mappedResults
  };
}

export function matchExpectedNode(node: ExpectedCallNode, executions: ToolCall[], startIndex: number): MatchResult {
  if (isUnorderedGroup(node)) {
    return matchUnorderedGroup(node.unordered, executions, startIndex);
  } else if (isOrderedGroup(node)) {
    return matchSequence(node.ordered, executions, startIndex);
  } else if (isFunctionCall(node)) {
    if (startIndex >= executions.length) {
      return {
        matches: false,
        consumed: 1,
        mappedResults: [{ expected: node, actual: null, outcome: "fail" }]
      };
    }
    const actual = executions[startIndex];
    const outcome = functionCallOutcome(node, actual);
    return {
      matches: outcome === "pass",
      consumed: 1,
      mappedResults: [{ expected: node, actual, outcome }]
    };
  }

  // Fallback for an unknown or unmapped node type (e.g. if the signature changes)
  return { matches: false, consumed: 0, mappedResults: [] };
}

export function matchSequence(nodes: ExpectedCallNode[], executions: ToolCall[], startIndex: number): MatchResult {
  let currentIndex = startIndex;
  let allMatched = true;
  let mappedResults: TrajectoryResult[] = [];

  // Walking through standard sequential tree configurations
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

export function evaluateExecutionTrajectory(expectedCalls: ExpectedCallNode[] | null, executions: ToolCall[]): TrajectoryResult[] {
  if (!expectedCalls || expectedCalls.length === 0) {
    if (executions.length === 0) {
      return expectedCalls === null ? [{ expected: null, actual: null, outcome: "pass" }] : [];
    } else {
      return executions.map(actual => ({ expected: null, actual, outcome: "fail" }));
    }
  }

  const { mappedResults, consumed } = matchSequence(expectedCalls, executions, 0);

  return [
    ...mappedResults,
    ...executions.slice(consumed).map(actual => ({
      expected: null,
      actual,
      outcome: "fail" as const
    }))
  ];
}

export function sortObjectKeys<T>(obj: T, visited = new WeakMap<object, unknown>()): T {
  // Return primitives and null immediately
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  // Prevent infinite loops on circular references
  if (visited.has(obj)) {
    return visited.get(obj) as T;
  }

  if (Array.isArray(obj)) {
    const res: unknown[] = [];
    visited.set(obj, res);
    for (const item of obj) {
      res.push(sortObjectKeys(item, visited));
    }
    return res as unknown as T;
  }

  // Prevent destruction of non-plain JS objects (Date, RegExp, Buffer, Error, etc.).
  if (Object.getPrototypeOf(obj) !== Object.prototype && Object.getPrototypeOf(obj) !== null) {
    return obj;
  }

  // Sort keys alphabetically
  const res: Record<string, unknown> = {};
  visited.set(obj, res);
  const sortedKeys = Object.keys(obj).sort();
  for (const key of sortedKeys) {
    res[key] = sortObjectKeys((obj as Record<string, unknown>)[key], visited);
  }
  return res as T;
}

export async function cleanOldReports(): Promise<void> {
  const dir = process.cwd();
  try {
    const files = await fs.readdir(dir);
    for (const file of files) {
      if (file.startsWith('report-') && file.endsWith('.html')) {
        await fs.unlink(path.join(dir, file));
      }
    }
  } catch (error) {
    // Ignore errors during cleanup
  }
}

