#!/usr/bin/env node

/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFile, writeFile } from "fs/promises";
import { resolve } from "path";
import * as dotenv from "dotenv";
import { Eval } from "../types/evals.js";
import { Tool, ToolsSchema } from "../types/tools.js";
import { SingleBar } from "cli-progress";
import minimist from "minimist";
import { Config } from "../types/config.js";
import { renderReport } from "../report/report.js";
import { executeLocalEvals } from "../evaluator/index.js";
import { cleanOldReports } from "../utils.js";

dotenv.config();

const args = minimist(process.argv.slice(2));

if (args.help || args.h) {
  console.log(`
Usage: runevals [options]

Options:
  --tools <string>     Path to the tool schema JSON file (required)
  --evals <string>     Path to the evals JSON file (required)
  --backend <string>   Execution backend (gemini, ollama, vercel) (default: gemini)
  --provider <string>  Model provider (e.g., google, openai, anthropic)
  --model <string>     Model name (default: gemini-3-flash-preview)
  --runs <number>      Number of runs (default: 1)
  --max-steps <number> Maximum evaluation steps
  --help, -h           Show help
`);
  process.exit(0);
}

if (!args.tools) {
  console.error("The 'tools' argument is required.");
  process.exit(1);
}

if (!args.evals) {
  console.error("The 'evals' argument is required.");
  process.exit(1);
}

if (args.backend && args.backend === "ollama" && !args.model) {
  console.error("The 'model' argument is required when 'backend' is set to 'ollama'.");
  process.exit(1);
}

const config: Config = {
  toolSchemaFile: args.tools,
  evalsFile: args.evals,
  backend: args.backend || "gemini",
  provider: args.provider,
  model: args.model || "gemini-3-flash-preview",
  runs: args.runs ? parseInt(args.runs, 10) : 1,
  maxSteps: args["max-steps"] ? parseInt(args["max-steps"], 10) : undefined,
};

const toolsSchema: ToolsSchema = JSON.parse(
  await readFile(resolve(process.cwd(), config.toolSchemaFile), "utf-8"),
);
const tools: Array<Tool> = toolsSchema.tools.map((t) => {
  return {
    description: t.description,
    functionName: t.name,
    parameters: t.inputSchema || {},
  };
});
const tests: Array<Eval> = JSON.parse(
  await readFile(resolve(process.cwd(), config.evalsFile), "utf-8"),
);

const progressBar = new SingleBar({
  format: "progress [{bar}] {percentage}% | ETA: {eta}s | {value}/{total} | accuracy: {accuracy}%",
});

let passCount = 0;
let stepCount = 0;
const finalResults = await executeLocalEvals(tests, tools, config, (event) => {
  if (event.type === "start") {
    console.log(event.message);
    progressBar.start(event.total, 0, { accuracy: "0.00" });
  } else if (event.type === "progress") {
    stepCount++;
    if (event.result.outcome === "pass") passCount++;
    progressBar.update(stepCount, {
      accuracy: ((passCount / stepCount) * 100).toFixed(2),
    });
  }
});
progressBar.stop();

const report = renderReport(config, finalResults);

const reportName = `report-${Date.now()}.html`;

await cleanOldReports();
await writeFile(reportName, report);
console.log(`\nReport saved to ${reportName}`);
process.exit();
