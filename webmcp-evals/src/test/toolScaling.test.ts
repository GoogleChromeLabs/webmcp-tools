/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  BENCHMARK_INTENTS,
  MICRO_PILOT_N_GRID,
  MVP_N_GRID,
  assembleToolSet,
  buildMicroPilotTrials,
  buildMvpTrials,
  loadRealOrthogonalExampleTools,
  loadTargetShoppingTools,
} from "../toolScaling/dataset.js";
import {
  classifyGeminiError,
  loadAllJsonlRecords,
  runScalingTrials,
  type GeminiClientLike,
} from "../toolScaling/geminiRunner.js";
import {
  computeMacroF1,
  computePerToolMetrics,
  evaluatePreRegisteredCliff,
  groupAndSummarize,
  renderMarkdownReport,
  wilsonInterval,
} from "../toolScaling/metrics.js";

describe("toolScaling dataset", () => {
  it("builds 6 deterministic micro-pilot trials across N = 1, 5, 40, 100, 128, 150", () => {
    const trials = buildMicroPilotTrials();
    assert.deepStrictEqual(
      trials.map((t) => t.n),
      [...MICRO_PILOT_N_GRID],
    );
    for (const t of trials) {
      assert.strictEqual(t.tools.length, t.n);
      assert.ok(t.targetPosition >= 0 && t.targetPosition < t.n);
    }
  });

  it("builds exactly 900 deterministic MVP trials (780 natural + 120 verbose N=20)", () => {
    assert.strictEqual(BENCHMARK_INTENTS.length, 20);
    assert.strictEqual(BENCHMARK_INTENTS.filter((i) => i.expectedCall === null).length, 4);
    assert.strictEqual(BENCHMARK_INTENTS.filter((i) => i.expectedCall !== null).length, 16);

    const trials = buildMvpTrials();
    assert.strictEqual(trials.length, 900);
    assert.strictEqual(trials.filter((t) => t.arm === "natural-scaling").length, 780);
    assert.strictEqual(trials.filter((t) => t.arm === "verbosity-n20").length, 120);
    assert.deepStrictEqual([...MVP_N_GRID], [1, 5, 10, 20, 40, 50, 100]);

    const realShopping = loadTargetShoppingTools();
    const realOrtho = loadRealOrthogonalExampleTools();
    assert.strictEqual(realShopping.length, 5);
    assert.ok(realOrtho.length >= 20);

    // Every single MVP trial must have unique tool names and an accurately indexed target tool.
    for (const t of trials) {
      const names = new Set(t.tools.map((tool) => tool.name));
      assert.strictEqual(names.size, t.n, `Duplicate tool name in ${t.trialId}`);
      if (t.intent.expectedCall) {
        assert.ok(t.targetPosition >= 0 && t.targetPosition < t.n);
        assert.strictEqual(t.tools[t.targetPosition].name, t.intent.expectedCall.functionName);
      } else {
        assert.strictEqual(t.targetPosition, -1);
      }
    }
  });

  it("shuffles deterministically for the same seed and records exact targetPosition", () => {
    const a = assembleToolSet(40, "orthogonal", "concise", 12345, "addToCart");
    const b = assembleToolSet(40, "orthogonal", "concise", 12345, "addToCart");
    assert.deepStrictEqual(
      a.tools.map((t) => t.name),
      b.tools.map((t) => t.name),
    );
    assert.strictEqual(a.targetPosition, b.targetPosition);
    assert.strictEqual(a.tools[a.targetPosition].name, "addToCart");
  });
});

describe("toolScaling geminiRunner", () => {
  it("retains zero-arg calls via args ?? {}, captures 6 usage fields, and supports JSONL resume", async () => {
    const dir = mkdtempSync(join(tmpdir(), "webmcp-scaling-"));
    try {
      const checkpointPath = join(dir, "results.jsonl");
      const zeroArgTrial = buildMvpTrials().find(
        (t) => t.n === 5 && t.intent.expectedCall?.functionName === "getProducts",
      )!;
      const absTrial = buildMvpTrials().find((t) => t.n === 5 && t.intent.expectedCall === null)!;

      let generateCalls = 0;
      const mockClient: GeminiClientLike = {
        models: {
          countTokens: async (params: any) => ({
            totalTokens: params?.contents?.[0]?.parts?.[0]?.text?.includes("getProducts")
              ? 1500
              : 120,
          }),
          generateContent: async (params: any) => {
            generateCalls++;
            assert.strictEqual(params.config.toolConfig.functionCallingConfig.mode, "AUTO");
            const isFirst = generateCalls === 1;
            return {
              modelVersion: "gemini-2.5-flash-001",
              // Omit `args` on zero-arg tool call to verify `args ?? {}` handling.
              functionCalls: isFirst ? [{ name: "getProducts" }] : [],
              usageMetadata: {
                promptTokenCount: 1500,
                toolUsePromptTokenCount: 1380,
                candidatesTokenCount: 25,
                thoughtsTokenCount: 0,
                cachedContentTokenCount: 0,
                totalTokenCount: 1525,
              },
            };
          },
        },
      };

      const firstRun = await runScalingTrials([zeroArgTrial, absTrial], {
        model: "gemini-2.5-flash",
        thinkingBudget: 0,
        delayMs: 0,
        checkpointPath,
        resume: false,
        client: mockClient,
        sleepFn: async () => {},
      });

      assert.strictEqual(firstRun.records.length, 2);
      assert.strictEqual(firstRun.records[0].top1Correct, true);
      assert.strictEqual(firstRun.records[0].schemaValid, true);
      assert.strictEqual(firstRun.records[0].usage.toolUsePromptTokenCount, 1380);
      assert.strictEqual(firstRun.records[0].schemaOverheadTokens, 1380);
      assert.strictEqual(firstRun.records[1].abstentionCorrect, true);
      assert.strictEqual(firstRun.records[1].falsePositiveCall, false);

      // Resuming with the same checkpoint must make 0 additional API calls.
      const beforeResumeCalls = generateCalls;
      const secondRun = await runScalingTrials([zeroArgTrial, absTrial], {
        model: "gemini-2.5-flash",
        thinkingBudget: 0,
        delayMs: 0,
        checkpointPath,
        resume: true,
        client: mockClient,
        sleepFn: async () => {},
      });
      assert.strictEqual(generateCalls, beforeResumeCalls);
      assert.strictEqual(secondRun.records.length, 2);
      assert.strictEqual(loadAllJsonlRecords(checkpointPath).length, 2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("stops immediately on daily quota errors without retrying", async () => {
    const dir = mkdtempSync(join(tmpdir(), "webmcp-scaling-quota-"));
    try {
      const checkpointPath = join(dir, "results.jsonl");
      const trials = buildMicroPilotTrials().slice(0, 3);
      let calls = 0;

      const mockClient: GeminiClientLike = {
        models: {
          countTokens: async () => ({ totalTokens: 500 }),
          generateContent: async () => {
            calls++;
            throw new Error("429 RESOURCE_EXHAUSTED: GenerateRequestsPerDayPerProject exceeded");
          },
        },
      };

      const res = await runScalingTrials(trials, {
        model: "gemini-2.5-flash",
        delayMs: 0,
        maxRetries: 3,
        checkpointPath,
        measureSchemaTokens: false,
        client: mockClient,
        sleepFn: async () => {},
      });

      assert.strictEqual(calls, 1);
      assert.strictEqual(res.stoppedOnDailyQuota, true);
      assert.strictEqual(res.records[0].status, "quota_exhausted");
      assert.strictEqual(classifyGeminiError(new Error("400 INVALID_ARGUMENT")).kind, "fatal");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("toolScaling metrics", () => {
  it("computes Wilson CI, Macro-F1, pre-registered cliff, and Markdown report", () => {
    const ci = wilsonInterval(18, 20);
    assert.ok(ci.low > 0.65 && ci.high < 0.99);

    const trials = buildMicroPilotTrials().slice(0, 2); // N=1 and N=5
    const makeRec = (trial: (typeof trials)[number], correct: boolean) => ({
      trialId: trial.trialId,
      timestamp: "2026-11-28T00:00:00Z",
      arm: "natural-scaling" as const,
      n: trial.n,
      distractorType: trial.distractorType,
      schemaStyle: trial.schemaStyle,
      drawIndex: 1,
      shuffleSeed: trial.shuffleSeed,
      intentId: trial.intent.id,
      intentCategory: trial.intent.category,
      targetPosition: trial.targetPosition,
      expectedFunctionName: "filterByPreferences",
      actualFunctionName: correct ? "filterByPreferences" : "wrongTool",
      actualArgs: {},
      allCalledFunctions: [correct ? "filterByPreferences" : "wrongTool"],
      modelRequested: "gemini-2.5-flash",
      modelVersion: "gemini-2.5-flash-001",
      thinkingBudget: 0,
      status: "ok" as const,
      top1Correct: correct,
      abstentionCorrect: null,
      falsePositiveCall: false,
      schemaValid: correct,
      semanticArgsCorrect: correct,
      latencyMs: 320,
      usage: {
        promptTokenCount: 500,
        toolUsePromptTokenCount: 300,
        candidatesTokenCount: 20,
        thoughtsTokenCount: 0,
        cachedContentTokenCount: 0,
        totalTokenCount: 520,
      },
      schemaOverheadTokens: 300,
      realToolsCount: 1,
      syntheticToolsCount: 0,
    });

    const records = [makeRec(trials[0], true), makeRec(trials[1], false)];
    assert.ok(computeMacroF1(records) > 0);
    const perTool = computePerToolMetrics(records);
    assert.strictEqual(perTool.length, 1);
    assert.strictEqual(perTool[0].precision, 1);
    assert.strictEqual(perTool[0].recall, 0.5);
    const summaries = groupAndSummarize(records);
    const cliff = evaluatePreRegisteredCliff(summaries, "orthogonal");
    assert.strictEqual(typeof cliff.cliffDetected, "boolean");
    const md = renderMarkdownReport(records, summaries);
    assert.ok(md.includes("## Per-Tool Precision & Recall (Overall)"));
    assert.ok(md.includes("## Limitations"));
    assert.ok(md.includes("gemini-2.5-flash-001"));
  });
});
