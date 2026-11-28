#!/usr/bin/env node

/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import dotenv from "dotenv";
import { resolve } from "node:path";
import { Command } from "commander";
import { assembleToolSet, buildMicroPilotTrials, buildMvpTrials } from "./dataset.js";
import { loadAllJsonlRecords, runQuotaProbe, runScalingTrials } from "./geminiRunner.js";
import { groupAndSummarize, writeOutputs } from "./metrics.js";
import { runOpenAiCompatTrials, type OpenAiCompatProvider } from "./openAiCompatRunner.js";
import { GoogleGenAI } from "@google/genai";

dotenv.config({ quiet: true });

const program = new Command();

program
  .name("webmcp-tool-scaling")
  .description(
    "Isolated #422 scaling benchmark evaluating website WebMCP tool catalogues against Gemini",
  )
  .version("0.1.0");

program
  .command("micro-pilot")
  .description("Run the 6-request technical micro-pilot (N = 1, 5, 40, 100, 128, 150)")
  .option("--provider <provider>", "Model provider (gemini | openrouter | groq)", "gemini")
  .option("-m, --model <model>", "Model ID", "gemini-3.5-flash")
  .option(
    "--thinking-budget <number>",
    "Optional fixed thinkingBudget value (omit if unsupported by model)",
    (v) => parseInt(v, 10),
  )
  .option("--delay-ms <number>", "Delay between calls in ms", (v) => parseInt(v, 10), 1500)
  .option("-o, --out-dir <path>", "Output directory", ".evals/tool-scaling/micro-pilot")
  .option("--resume", "Resume from existing JSONL checkpoint", true)
  .action(async (opts) => {
    const outDir = resolve(process.cwd(), opts.outDir);
    const checkpointPath = `${outDir}/results.jsonl`;
    const trials = buildMicroPilotTrials();
    console.log(
      `Running micro-pilot (${trials.length} calls) on provider=${opts.provider}, model=${opts.model}, thinkingBudget=${opts.thinkingBudget ?? "default"}...`,
    );
    const onTrialComplete = (rec: any, i: number, total: number) => {
      console.log(
        `[${i}/${total}] N=${rec.n} status=${rec.status} call=${rec.actualFunctionName ?? "NONE"} promptTokens=${rec.usage.promptTokenCount} schemaEst=${rec.schemaOverheadTokens} modelVer=${rec.modelVersion}`,
      );
    };
    const { records, stoppedOnDailyQuota } =
      opts.provider === "gemini"
        ? await runScalingTrials(trials, {
            model: opts.model,
            thinkingBudget: opts.thinkingBudget,
            delayMs: opts.delayMs,
            checkpointPath,
            resume: opts.resume,
            onTrialComplete,
          })
        : await runOpenAiCompatTrials(trials, {
            provider: opts.provider as OpenAiCompatProvider,
            model: opts.model,
            delayMs: opts.delayMs,
            checkpointPath,
            resume: opts.resume,
            onTrialComplete,
          });
    const summaries = groupAndSummarize(records);
    const { csvPath, reportPath } = writeOutputs(outDir, records, summaries);
    console.log(`Saved JSONL: ${checkpointPath}`);
    console.log(`Saved CSV: ${csvPath}`);
    console.log(`Saved Report: ${reportPath}`);
    if (stoppedOnDailyQuota) {
      console.warn("Stopped early due to daily quota exhaustion. Resume later with --resume.");
      process.exitCode = 2;
    }
  });

program
  .command("quota-probe")
  .description("Run 20 countTokens requests to verify live AI Studio quota behavior")
  .option("-m, --model <model>", "Gemini model ID", "gemini-3.5-flash")
  .option("-n, --tools-count <number>", "Number of tools to probe", (v) => parseInt(v, 10), 40)
  .option("--calls <number>", "Number of countTokens calls", (v) => parseInt(v, 10), 20)
  .action(async (opts) => {
    const apiKey =
      process.env.GOOGLE_AI ||
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) throw new Error("Missing GOOGLE_AI / GEMINI_API_KEY in .env");
    const client = new GoogleGenAI({ apiKey });
    const { tools } = assembleToolSet(
      opts.toolsCount,
      "orthogonal",
      "concise",
      422,
      "filterByPreferences",
    );
    const probe = await runQuotaProbe(client, opts.model, tools, opts.calls);
    console.log(JSON.stringify(probe, null, 2));
  });

program
  .command("run")
  .description("Run the full MVP scaling experiment (900 calls) with JSONL checkpoint/resume")
  .option("--provider <provider>", "Model provider (gemini | openrouter | groq)", "gemini")
  .option("-m, --model <model>", "Model ID", "gemini-3.5-flash")
  .option(
    "--thinking-budget <number>",
    "Optional fixed thinkingBudget value (omit if unsupported by model)",
    (v) => parseInt(v, 10),
  )
  .option("--delay-ms <number>", "Delay between calls in ms", (v) => parseInt(v, 10), 4500)
  .option("-o, --out-dir <path>", "Output directory", ".evals/tool-scaling/mvp")
  .option("--resume", "Resume from existing JSONL checkpoint", true)
  .action(async (opts) => {
    const outDir = resolve(process.cwd(), opts.outDir);
    const checkpointPath = `${outDir}/results.jsonl`;
    const trials = buildMvpTrials();
    console.log(`Loaded ${trials.length} MVP trials. Resuming/starting in ${outDir}...`);
    const onTrialComplete = (rec: any, i: number, total: number) => {
      if (i % 10 === 0 || rec.status !== "ok") {
        console.log(
          `[${i}/${total}] ${rec.trialId} status=${rec.status} correct=${rec.top1Correct} tokens=${rec.usage.totalTokenCount}`,
        );
      }
    };
    const { records, stoppedOnDailyQuota } =
      opts.provider === "gemini"
        ? await runScalingTrials(trials, {
            model: opts.model,
            thinkingBudget: opts.thinkingBudget,
            delayMs: opts.delayMs,
            checkpointPath,
            resume: opts.resume,
            onTrialComplete,
          })
        : await runOpenAiCompatTrials(trials, {
            provider: opts.provider as OpenAiCompatProvider,
            model: opts.model,
            delayMs: opts.delayMs,
            checkpointPath,
            resume: opts.resume,
            onTrialComplete,
          });
    const allRecords = loadAllJsonlRecords(checkpointPath);
    const summaries = groupAndSummarize(allRecords.length > 0 ? allRecords : records);
    const { csvPath, reportPath } = writeOutputs(outDir, allRecords, summaries);
    console.log(`CSV: ${csvPath}`);
    console.log(`Report: ${reportPath}`);
    if (stoppedOnDailyQuota) {
      console.warn("Stopped on daily quota. Re-run with --resume after quota reset.");
      process.exitCode = 2;
    }
  });

program
  .command("report")
  .description("Regenerate CSV and Markdown report from an existing results.jsonl")
  .requiredOption("-i, --input <path>", "Path to results.jsonl")
  .option("-o, --out-dir <path>", "Output directory", ".evals/tool-scaling/mvp")
  .action((opts) => {
    const records = loadAllJsonlRecords(resolve(process.cwd(), opts.input));
    const summaries = groupAndSummarize(records);
    const { csvPath, reportPath } = writeOutputs(
      resolve(process.cwd(), opts.outDir),
      records,
      summaries,
    );
    console.log(`Regenerated:\n- ${csvPath}\n- ${reportPath}`);
  });

program.parse();
