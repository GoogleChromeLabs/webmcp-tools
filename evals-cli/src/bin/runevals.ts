/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleAiBackend } from "../backend/googleai.js";
import { readFile, writeFile } from "fs/promises";
import * as dotenv from "dotenv";
import { functionCallOutcome } from "../utils.js";
import { Eval, TestResult } from "../types/evals.js";
import { OllamaBackend } from "../backend/ollama.js";
import { Tool, ToolsSchema } from "../types/tools.js";
import { SingleBar } from "cli-progress";
import minimist from "minimist";
import { Config } from "../types/config.js";
import { renderReport } from "../report/report.js";

const SYSTEM_PROMPT = `
# INSTRUCTIONS
You are an agent helping a user navigate a page via the tools made available to you. You must
use the tools available to help the user.

# ADDITIONAL CONTEXT
Today's date is: Monday 19th of January, 2026.
`;

dotenv.config();

const args = minimist(process.argv.slice(2));
if (!args.tools) {
  console.error("The 'tools' argument is required.");
  process.exit(1);
}

if (!args.evals) {
  console.error("The 'evals' argument is required.");
  process.exit(1);
}

if (args.backend && args.backend === "ollama" && !args.model) {
  console.error(
    "The 'model' argument is required when 'backend' is set to 'ollama'.",
  );
  process.exit(1);
}

const config: Config = {
  toolSchemaFile: args.tools,
  evalsFile: args.evals,
  backend: args.backend || "gemini",
  model: args.model || "gemini-2.5-flash",
};

const toolsSchema: ToolsSchema = JSON.parse(
  await readFile(config.toolSchemaFile, "utf-8"),
);
const tools: Array<Tool> = toolsSchema.tools.map((t) => {
  return {
    description: t.description,
    functionName: t.name,
    parameters: t.inputSchema || {},
  };
});
const tests: Array<Eval> = JSON.parse(
  await readFile(config.evalsFile, "utf-8"),
);

let backend;
switch (config.backend) {
  case "ollama":
    backend = new OllamaBackend(
      process.env.OLLAMA_HOST!,
      config.model,
      SYSTEM_PROMPT,
      tools,
    );
    break;
  default:
    backend = new GoogleAiBackend(
      process.env.GOOGLE_AI!,
      config.model,
      SYSTEM_PROMPT,
      tools,
    );
}

const progressBar = new SingleBar({
  format:
    "progress [{bar}] {percentage}% | ETA: {eta}s | {value}/{total} | accuracy: {accuracy}%",
});
progressBar.start(tests.length, 0, { accuracy: "0.00" });
let testCount = 0;
let passCount = 0;
let failCount = 0;
let errorCount = 0;
const testResults: Array<TestResult> = [];
for (const test of tests) {
  testCount++;
  try {
    const response = await backend.execute(test.messages);
    const outcome = functionCallOutcome(test.expectedCall, response);
    testResults.push({ test, response, outcome });
    outcome === "pass" ? passCount++ : failCount++;
  } catch (e) {
    console.warn("Error running test:", e);
    errorCount++;
  }
  progressBar.update(testCount, {
    accuracy: ((passCount / testCount) * 100).toFixed(2),
  });
}

const report = renderReport(config, {
  results: testResults,
  testCount,
  errorCount,
  failCount,
  passCount,
});

await writeFile("report.html", report);
console.log("\nReport saved to report.html");
process.exit();
