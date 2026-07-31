/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import chalk from "chalk";
import { BrowserPage } from "../backends/index.js";
import { Eval, ExpectedCallNode } from "../types/evals.js";
import { Tool } from "../types/tools.js";
import { isFunctionCall, isOrderedGroup, isUnorderedGroup } from "../utils.js";
import { BrowserToolRegistry, launchBrowser } from "./browser.js";

export const DEFAULT_SMOKE_TIMEOUT_MS = 30_000;

export type SmokeConfig = {
  url: string;
  timeoutMs?: number;
  verbose?: boolean;
};

export type CompiledSmokeStep = {
  functionName: string;
  arguments: object;
  stepIndex: number;
};

export type CompiledSmokeTest = {
  name: string;
  testIndex: number;
  steps: CompiledSmokeStep[];
};

export type SmokeStepResult = CompiledSmokeStep & {
  testName: string;
  outcome: "pass" | "error";
  result?: unknown;
  error?: string;
};

export type SmokeResults = {
  results: SmokeStepResult[];
  testCount: number;
  passCount: number;
  errorCount: number;
  totalExpectedSteps: number;
};

export interface SmokeToolRegistry {
  syncTools(): Tool[] | Promise<Tool[]>;
  executeToolChecked(
    name: string,
    args: object,
  ): Promise<{ success: true; result: unknown } | { success: false; error: string }>;
}

export interface SmokePage extends BrowserPage {
  goto(url: string, options?: Record<string, unknown>): Promise<unknown>;
  close(): Promise<void>;
}

export interface SmokeBrowser {
  newPage(): Promise<SmokePage>;
  close(): Promise<void>;
}

type SmokeDependencies = {
  launchBrowser?: () => Promise<SmokeBrowser>;
  createRegistry?: (page: SmokePage, testIndex: number) => SmokeToolRegistry;
};

function testName(test: Eval, testIndex: number): string {
  if (test.name?.trim()) return test.name.trim();
  const firstMessage = test.messages.find((message) => message.type === "message");
  if (firstMessage?.type === "message" && firstMessage.content.trim()) {
    return firstMessage.content.trim();
  }
  return `Test ${testIndex + 1}`;
}

function constraintKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(constraintKeys);
  if (value === null || typeof value !== "object") return [];

  const entries = Object.entries(value as Record<string, unknown>);
  const keys = entries.map(([key]) => key);
  if (keys.length > 0 && keys.every((key) => key.startsWith("$"))) return keys;
  return entries.flatMap(([, child]) => constraintKeys(child));
}

function appendSmokeSteps(
  nodes: ExpectedCallNode[],
  name: string,
  steps: CompiledSmokeStep[],
): void {
  for (const node of nodes) {
    if (isOrderedGroup(node)) {
      appendSmokeSteps(node.ordered, name, steps);
      continue;
    }
    if (isUnorderedGroup(node)) {
      // A smoke run needs one deterministic order. Preserve the author's
      // order without changing the looser matching semantics of eval runs.
      appendSmokeSteps(node.unordered, name, steps);
      continue;
    }
    if (!isFunctionCall(node) || node.optional) continue;

    const stepIndex = steps.length + 1;
    if (
      node.arguments === undefined ||
      node.arguments === null ||
      Array.isArray(node.arguments) ||
      typeof node.arguments !== "object"
    ) {
      throw new Error(
        `Smoke test "${name}" step ${stepIndex} (${node.functionName}) requires an ` +
          "arguments object with concrete values.",
      );
    }

    const constraints = constraintKeys(node.arguments);
    if (constraints.length > 0) {
      throw new Error(
        `Smoke test "${name}" step ${stepIndex} (${node.functionName}) uses matcher ` +
          `constraint ${constraints.join(", ")}; smoke tests require concrete arguments.`,
      );
    }

    steps.push({
      functionName: node.functionName,
      arguments: node.arguments,
      stepIndex,
    });
  }
}

export function compileSmokeTests(tests: Eval[]): CompiledSmokeTest[] {
  if (!Array.isArray(tests) || tests.length === 0) {
    throw new Error("Smoke eval file must contain at least one eval case.");
  }
  return tests.map((test, testIndex) => {
    const name = testName(test, testIndex);
    const steps: CompiledSmokeStep[] = [];
    appendSmokeSteps(test.expectedCall || [], name, steps);
    if (steps.length === 0) {
      throw new Error(`Smoke test "${name}" must contain at least one required tool call.`);
    }
    return { name, testIndex, steps };
  });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${timeoutMs} ms.`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function stepError(
  step: CompiledSmokeStep,
  test: CompiledSmokeTest,
  error: string,
): SmokeStepResult {
  return {
    ...step,
    testName: test.name,
    outcome: "error",
    error: `Smoke test "${test.name}" step ${step.stepIndex} (${step.functionName}): ${error}`,
  };
}

function explicitToolFailure(result: unknown): string | undefined {
  if (result === null || typeof result !== "object") return undefined;
  const response = result as Record<string, unknown>;
  if (response.success !== false && response.isError !== true) return undefined;

  const detail = response.error ?? response.message;
  return typeof detail === "string" && detail.trim()
    ? `tool reported failure: ${detail}`
    : `tool reported failure: ${JSON.stringify(result)}`;
}

export async function runSmokeTest(
  test: CompiledSmokeTest,
  registry: SmokeToolRegistry,
  timeoutMs = DEFAULT_SMOKE_TIMEOUT_MS,
  verbose = false,
): Promise<SmokeStepResult[]> {
  const results: SmokeStepResult[] = [];

  for (const step of test.steps) {
    try {
      if (verbose) {
        console.log(
          chalk.dim(
            `[Smoke] Case "${test.name}" Step ${step.stepIndex}/${test.steps.length}: Calling tool "${step.functionName}" with args: ${JSON.stringify(step.arguments)}`,
          ),
        );
      }
      let tools = await withTimeout(
        Promise.resolve(registry.syncTools()),
        timeoutMs,
        `tool discovery for "${step.functionName}"`,
      );
      if (!tools.some((candidate) => candidate.functionName === step.functionName)) {
        const pollStart = Date.now();
        while (Date.now() - pollStart < 2000) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          tools = await registry.syncTools();
          if (tools.some((candidate) => candidate.functionName === step.functionName)) {
            break;
          }
        }
      }
      if (!tools.some((candidate) => candidate.functionName === step.functionName)) {
        results.push(stepError(step, test, `tool "${step.functionName}" is not available.`));
        break;
      }

      const outcome = await withTimeout(
        registry.executeToolChecked(step.functionName, step.arguments),
        timeoutMs,
        `tool "${step.functionName}"`,
      );
      if (!outcome.success) {
        results.push(stepError(step, test, outcome.error));
        break;
      }
      const reportedFailure = explicitToolFailure(outcome.result);
      if (reportedFailure) {
        results.push(stepError(step, test, reportedFailure));
        break;
      }
      if (verbose) {
        const formattedResult =
          typeof outcome.result === "object"
            ? JSON.stringify(outcome.result)
            : String(outcome.result);
        console.log(chalk.green(`  └─ PASS: Output: ${formattedResult}`));
      }
      results.push({
        ...step,
        testName: test.name,
        outcome: "pass",
        result: outcome.result,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push(stepError(step, test, message));
      break;
    }
  }

  return results;
}

export async function executeSmokeEvals(
  tests: Eval[],
  config: SmokeConfig,
  dependencies: SmokeDependencies = {},
): Promise<SmokeResults> {
  // Validate the entire file before executing any page-controlled code. A
  // later unsupported constraint must not leave an earlier journey half-run.
  const compiled = compileSmokeTests(tests);
  const timeoutMs = config.timeoutMs || DEFAULT_SMOKE_TIMEOUT_MS;
  const openBrowser =
    dependencies.launchBrowser || (async () => (await launchBrowser()) as unknown as SmokeBrowser);
  const createRegistry =
    dependencies.createRegistry ||
    ((page: SmokePage) => new BrowserToolRegistry(page) as unknown as SmokeToolRegistry);

  const browser = await openBrowser();
  const results: SmokeStepResult[] = [];
  try {
    for (const test of compiled) {
      if (config.verbose) {
        console.log(
          chalk.cyan(`\n[Smoke] Opening fresh page for "${test.name}" at ${config.url}...`),
        );
      }
      const page = await browser.newPage();
      try {
        await page.goto(config.url, {
          waitUntil: "networkidle2",
          timeout: timeoutMs,
        });
        results.push(
          ...(await runSmokeTest(
            test,
            createRegistry(page, test.testIndex),
            timeoutMs,
            config.verbose,
          )),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const firstStep = test.steps[0];
        results.push({
          functionName: firstStep?.functionName || "setup",
          arguments: firstStep?.arguments || {},
          stepIndex: firstStep?.stepIndex || 1,
          testName: test.name,
          outcome: "error",
          error: `Smoke test "${test.name}" page setup failed: ${message}`,
        });
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }

  const totalExpectedSteps = compiled.reduce((sum, test) => sum + test.steps.length, 0);

  return {
    results,
    testCount: compiled.length,
    passCount: results.filter((result) => result.outcome === "pass").length,
    errorCount: results.filter((result) => result.outcome === "error").length,
    totalExpectedSteps,
  };
}
