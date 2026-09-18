#!/usr/bin/env node

/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createRequire } from "node:module";
import { Command, InvalidArgumentError } from "commander";
import dotenv from "dotenv";
import {
  runLocalCommand,
  runWebCommand,
  runSimulateCommand,
  runSmokeCommand,
  runAnalyzeCommand,
} from "../commands/index.js";

const require = createRequire(import.meta.url);
const pkg = require("../../package.json");

dotenv.config({ quiet: true });

const program = new Command();

function positiveInteger(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidArgumentError("Expected a positive integer.");
  }
  return parsed;
}

program
  .name("webmcp-evals")
  .description("Evaluation framework and CLI for WebMCP tools and agentic workflows")
  .version(pkg.version);

// Global options shared across commands
program
  .option("-b, --backend <backend>", "Model backend (vercel, gemini, ollama)", "vercel")
  .option("-m, --model <model>", "Model identifier", "gemini-3.5-flash")
  .option("-r, --runs <number>", "Number of runs per test case", (v) => parseInt(v, 10), 1)
  .option("--max-steps <number>", "Maximum agent step count", (v) => parseInt(v, 10))
  .option("--reporter <reporters...>", "Reporters to use (console, json, html)", [
    "console",
    "html",
  ])
  .option("-o, --output-dir <path>", "Directory for reports", ".evals")
  .option("--analyzer-model <model>", "Model identifier for report analysis", "gemini-3.5-flash")
  .option(
    "--open-analysis",
    "Automatically open the analysis markdown report upon completion",
    false,
  )
  .option(
    "--chrome-channel <channel>",
    "Chrome browser channel (chrome, chrome-beta, chrome-canary, chrome-dev)",
    "chrome-canary",
  );

// Command: run static file evals
program
  .command("local")
  .description("Run evals against a static JSON tool schema definition file")
  .requiredOption("-t, --tools <path>", "Path to tool schema JSON file")
  .requiredOption("-e, --evals <path>", "Path to evals test suite JSON file")
  .option("--analyze", "Automatically run LLM report analysis upon completion", false)
  .action(runLocalCommand);

// Command: run live browser evals
program
  .command("browser")
  .description("Run evals live against WebMCP tools exposed on a web page via Puppeteer")
  .requiredOption("-u, --url <url>", "Target web page URL")
  .requiredOption("-e, --evals <path>", "Path to evals test suite JSON file")
  .option("--open", "Automatically open the HTML report in browser upon completion", false)
  .option("--analyze", "Automatically run LLM report analysis upon completion", false)
  .action(runWebCommand);

// Command: run deterministic browser smoke tests without an LLM
program
  .command("smoke")
  .description("Execute concrete expected tool calls against a live WebMCP page")
  .requiredOption("-u, --url <url>", "Target web page URL")
  .requiredOption("-e, --evals <path>", "Path to evals test suite JSON file")
  .option("--timeout <milliseconds>", "Timeout per navigation or tool step", positiveInteger, 30000)
  .option("-v, --verbose", "Print live step-by-step navigation and tool call logs", false)
  .action(runSmokeCommand);

// Command: run goal-oriented simulations against a live WebMCP page
program
  .command("simulate")
  .description(
    "Run goal-oriented simulations: a simulated user talks to the agent and a judge grades the outcome",
  )
  .requiredOption("-u, --url <url>", "Target web page URL")
  .requiredOption("-s, --simulations <path>", "Path to simulations JSON file")
  .option(
    "--judge-model <model>",
    "Model identifier for the judge (defaults to the analyzer model, so the agent does not grade itself)",
  )
  .option(
    "--user-model <model>",
    "Model identifier for the simulated user (defaults to the agent's model)",
  )
  // No --max-turns: every case states its own, because it is the one budget
  // that changes what the case measures.
  .option(
    "--max-duration <milliseconds>",
    "Wall-clock budget for cases that do not set maxDurationMs",
    positiveInteger,
    300000,
  )
  .option(
    "--timeout <milliseconds>",
    "Timeout per navigation or setup tool call",
    positiveInteger,
    30000,
  )
  .option("-v, --verbose", "Print live page and turn logs", false)
  .action(runSimulateCommand);

// Command: analyze evaluation report using an LLM
program
  .command("analyze")
  .description(
    "Analyze an evaluation JSON report using an LLM to identify root causes and hypotheses for eval failures",
  )
  .argument("<report-path>", "Path to the JSON report file (e.g. .evals/report-*.json)")
  .option("-m, --model <model>", "Model identifier for the analyzer (defaults to gemini-3.5-flash)")
  .option("--open", "Automatically open the analysis markdown report upon completion", false)
  .action(runAnalyzeCommand);

program.parse(process.argv);
