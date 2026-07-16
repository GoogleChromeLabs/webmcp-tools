#!/usr/bin/env node

/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createRequire } from "node:module";
import { Command } from "commander";
import dotenv from "dotenv";
import { runLocalCommand, runWebCommand } from "../commands/index.js";

const require = createRequire(import.meta.url);
const pkg = require("../../package.json");

dotenv.config();

const program = new Command();

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
  .option("-o, --output-dir <path>", "Directory for reports", ".evals");

// Command: run static file evals
program
  .command("local")
  .description("Run evals against a static JSON tool schema definition file")
  .requiredOption("-t, --tools <path>", "Path to tool schema JSON file")
  .requiredOption("-e, --evals <path>", "Path to evals test suite JSON file")
  .action(runLocalCommand);

// Command: run live browser evals
program
  .command("browser")
  .description("Run evals live against WebMCP tools exposed on a web page via Puppeteer")
  .requiredOption("-u, --url <url>", "Target web page URL")
  .requiredOption("-e, --evals <path>", "Path to evals test suite JSON file")
  .option("--open", "Automatically open the HTML report in browser upon completion", false)
  .action(runWebCommand);

program.parse(process.argv);
