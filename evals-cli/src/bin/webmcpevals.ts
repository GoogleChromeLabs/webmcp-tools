/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFile, writeFile } from "fs/promises";
import { resolve } from "path";
import * as dotenv from "dotenv";
import { Eval, FunctionCall } from "../types/evals.js";
import { WebmcpConfig } from "../types/config.js";
import ora from "ora";
import chalk from "chalk";
import Table from "cli-table3";
import minimist from "minimist";
import open from "open";
import { renderWebmcpReport } from "../report/report.js";
import { executeInBrowserEvals, listToolsFromPage } from "../evaluator/index.js";
import { sortObjectKeys, cleanOldReports } from "../utils.js";

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
  console.error("The 'model' argument is required when 'backend' is set to 'ollama'.");
  process.exit(1);
}

process.on("SIGINT", () => {
  console.log("\nGracefully shutting down from SIGINT (Ctrl-C)");
  process.kill(process.pid, "SIGKILL");
});

const debug = args.debug || args.verbose || false;

const config: WebmcpConfig = {
  url: args.url,
  evalsFile: args.evals,
  backend: args.backend || "vercel",
  provider: args.provider || "gemini",
  model: args.model || "gemini-2.5-flash",
  debug,
};

const tools = await listToolsFromPage(config.url);

const tests: Array<Eval> = JSON.parse(
  await readFile(resolve(process.cwd(), config.evalsFile), "utf-8"),
);

const spinner = ora({ discardStdin: false, isSilent: config.debug });
const resultsList: any[] = [];

const finalResults = await executeInBrowserEvals(tests, tools, config, (event) => {
  if (event.type === "start") {
    spinner.start(`Running evals (${event.total} steps)...`);
  } else if (event.type === "progress") {
    const res = event.result;
    resultsList.push(res);

    if (config.debug) {
      spinner.stop();
      console.log(
        `\n--- [DEBUG] Test ${resultsList.length} Outcome: ${res.outcome.toUpperCase()} ---`,
      );

      if (res.outcome !== "pass") {
        const expectedSorted = sortObjectKeys(res.test.expectedCall);
        const actualSorted = sortObjectKeys(res.response);
        console.log(`Expected: ${JSON.stringify(expectedSorted, null, 2)}`);
        console.log(`Actual: ${JSON.stringify(actualSorted, null, 2)}`);
      }

      spinner.start();
    }

    const passRate = (
      (resultsList.filter((r) => r.outcome === "pass").length / resultsList.length) *
      100
    ).toFixed(2);
    spinner.text = `Running... pass rate: ${passRate}% (${resultsList.length} steps)`;
  }
});
spinner.stop();

console.log("\n" + chalk.bold.underline("Evaluation Summary") + "\n");

const table = new Table({
  head: ["Step", "Status", "Expected Function", "Actual Function"],
  style: {
    head: ["cyan"],
    border: ["grey"],
  },
});

for (let i = 0; i < finalResults.results.length; i++) {
  const res = finalResults.results[i];
  const passed = res.outcome === "pass";
  table.push([
    i + 1,
    passed ? chalk.green("PASS") : chalk.red(res.outcome.toUpperCase()),
    (res.test.expectedCall?.[0] as FunctionCall)?.functionName || "-",
    res.response?.functionName || "-",
  ]);
}

console.log(table.toString());

const totalSteps = finalResults.results.length;
const passRate = ((finalResults.passCount / totalSteps) * 100).toFixed(1);
const color =
  finalResults.passCount === totalSteps
    ? chalk.green
    : finalResults.passCount === 0
      ? chalk.red
      : chalk.yellow;
console.log(`\nPass count: ${color(`${finalResults.passCount}/${totalSteps}`)} (${passRate}%)\n`);

const report = renderWebmcpReport(config, finalResults);

const reportName = `report-${Date.now()}.html`;

await cleanOldReports();
await writeFile(reportName, report);
console.log(`Report saved to ${reportName}`);

await open(reportName);

process.exit();
