/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFile, writeFile } from "fs/promises";
import { resolve } from "path";
import * as dotenv from "dotenv";
import { Eval } from "../types/evals.js";
import { SingleBar } from "cli-progress";
import minimist from "minimist";
import { WebmcpConfig } from "../types/config.js";
import { renderWebmcpReport } from "../report/report.js";
import { listToolsFromPage } from "../browser/webmcp.js";
import { executeInBrowserEvals, executeEvals } from "../evaluator.js";

dotenv.config();

const args = minimist(process.argv.slice(2));

if (!args.url) {
  console.error("The 'url' argument is required.");
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

const config: WebmcpConfig = {
  url: args.url,
  evalsFile: args.evals,
  backend: args.backend || "gemini",
  model: args.model || "gemini-2.5-flash",
};

const tools = await listToolsFromPage(config.url);

const tests: Array<Eval> = JSON.parse(
  await readFile(resolve(process.cwd(), config.evalsFile), "utf-8"),
);

const progressBar = new SingleBar({
  format:
    "progress [{bar}] {percentage}% | ETA: {eta}s | {value}/{total} | accuracy: {accuracy}%",
});

let passCount = 0;
const finalResults = await executeInBrowserEvals(tests, tools, config, (event) => {
  if (event.type === 'start') {
    progressBar.start(event.total, 0, { accuracy: "0.00" });
  } else if (event.type === 'progress') {
    if (event.result.outcome === "pass") passCount++;
    progressBar.update(event.testNumber, {
      accuracy: ((passCount / event.testNumber) * 100).toFixed(2),
    });
  }
});
progressBar.stop();

const report = renderWebmcpReport(config, finalResults);

const reportName = `report-${Date.now()}.html`;

await writeFile(reportName, report);
console.log(`\nReport saved to ${reportName}`);
process.exit();
