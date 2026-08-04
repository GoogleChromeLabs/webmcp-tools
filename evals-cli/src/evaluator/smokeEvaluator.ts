/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import chalk from "chalk";
import type { ChromeReleaseChannel } from "puppeteer-core";
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
  chromeChannel?: ChromeReleaseChannel;
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
  const dollarKeys = entries.map(([key]) => key).filter((key) => key.startsWith("$"));
  const childKeys = entries.flatMap(([, child]) => constraintKeys(child));
  return [...dollarKeys, ...childKeys];
}

export function resolveConcreteValue(key: string, value: unknown): any {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveConcreteValue(key, item));
  }

  const obj = value as Record<string, unknown>;

  if ("$eq" in obj) return resolveConcreteValue(key, obj.$eq);
  if ("$contains" in obj) return resolveConcreteValue(key, obj.$contains);
  if ("$gt" in obj) return resolveConcreteValue(key, obj.$gt);
  if ("$gte" in obj) return resolveConcreteValue(key, obj.$gte);
  if ("$lt" in obj) return resolveConcreteValue(key, obj.$lt);
  if ("$lte" in obj) return resolveConcreteValue(key, obj.$lte);

  if ("$pattern" in obj && typeof obj.$pattern === "string") {
    let pattern = obj.$pattern;
    pattern = pattern.replace(/[\^\$]/g, "");
    pattern = pattern.replace(/\.\*/g, " ");
    pattern = pattern.replace(/\\d\+/g, "123");
    pattern = pattern.replace(/\[\^?.*?\]/g, "a");
    return pattern.trim() || "sample";
  }

  if ("$type" in obj && typeof obj.$type === "string") {
    if (obj.$type === "string") {
      if (key.toLowerCase().includes("date")) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        return tomorrow.toISOString().split("T")[0];
      }
      return "sample";
    }
    if (obj.$type === "number") return 1;
    if (obj.$type === "boolean") return true;
    if (obj.$type === "array") return [];
    if (obj.$type === "object") return {};
  }

  if ("$any" in obj) return "sample";

  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!k.startsWith("$")) {
      result[k] = resolveConcreteValue(k, v);
    }
  }
  return result;
}

export function resolveConcreteArguments(args: Record<string, unknown>): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(args)) {
    resolved[key] = resolveConcreteValue(key, val);
  }
  return resolved;
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

    const concreteArgs = resolveConcreteArguments(node.arguments as Record<string, unknown>);

    steps.push({
      functionName: node.functionName,
      arguments: concreteArgs,
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
  promise.catch(() => {}); // Prevent unhandled rejections if timeout occurs first
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
  if (typeof result === "string") {
    const trimmed = result.trim();
    if (/^error[:\s]/i.test(trimmed)) {
      return `tool reported failure: ${trimmed}`;
    }
    try {
      result = JSON.parse(result);
    } catch {
      return undefined;
    }
  }

  if (result === null || typeof result !== "object") return undefined;
  const response = result as Record<string, unknown>;
  if (
    response.success === false ||
    response.isError === true ||
    (response.error !== undefined && typeof response.error === "string")
  ) {
    const detail = response.error ?? response.message;
    return typeof detail === "string" && detail.trim()
      ? `tool reported failure: ${detail}`
      : `tool reported failure: ${JSON.stringify(result)}`;
  }
  return undefined;
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
        const pollCapMs = Math.min(timeoutMs, 5000);
        while (Date.now() - pollStart < pollCapMs) {
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
    dependencies.launchBrowser ||
    (async () => (await launchBrowser(config.chromeChannel)) as unknown as SmokeBrowser);
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
        await withTimeout(
          Promise.resolve(
            page.goto(config.url, {
              waitUntil: "networkidle2",
              timeout: timeoutMs,
            }),
          ),
          timeoutMs,
          `navigation to ${config.url}`,
        );
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
