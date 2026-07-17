/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Command } from "commander";
import { readFile, writeFile, mkdir } from "fs/promises";
import { resolve } from "path";
import { SingleBar } from "cli-progress";
import chalk from "chalk";
import Table from "cli-table3";
import open from "open";
import ora from "ora";
import { Config, WebmcpConfig } from "../types/config.js";
import { Eval, FunctionCall } from "../types/evals.js";
import { Tool, ToolsSchema } from "../types/tools.js";
import { executeLocalEvals, executeInBrowserEvals, listToolsFromPage } from "../evaluator/index.js";
import { renderReport, renderWebmcpReport } from "../report/report.js";
import { createBackend } from "../backends/index.js";

export interface CommandOptions {
  backend: string;
  model: string;
  runs: number;
  maxSteps?: number;
  reporter: string[];
  outputDir: string;
  tools?: string;
  evals?: string;
  url?: string;
  open?: boolean;
}

export async function runLocalCommand(options: CommandOptions, command?: Command): Promise<void> {
  const opts: CommandOptions = command?.optsWithGlobals ? command.optsWithGlobals() : options;

  const toolsFile = opts.tools!;
  const evalsFile = opts.evals!;

  const config: Config = {
    toolSchemaFile: toolsFile,
    evalsFile,
    backend: opts.backend,
    model: opts.model,
    runs: opts.runs,
    maxSteps: opts.maxSteps,
    outputDir: opts.outputDir,
    reporter: opts.reporter,
  };

  const toolsSchema: ToolsSchema = JSON.parse(
    await readFile(resolve(process.cwd(), toolsFile), "utf-8"),
  );
  const tools: Array<Tool> = toolsSchema.tools.map((t) => ({
    description: t.description,
    functionName: t.name,
    parameters: t.inputSchema || {},
  }));

  const tests: Array<Eval> = JSON.parse(await readFile(resolve(process.cwd(), evalsFile), "utf-8"));

  const reporters = opts.reporter || ["console", "html"];
  const useConsole = reporters.includes("console");

  let progressBar: SingleBar | undefined;
  let passCount = 0;
  let stepCount = 0;

  if (useConsole) {
    progressBar = new SingleBar({
      format:
        "progress [{bar}] {percentage}% | ETA: {eta}s | {value}/{total} | accuracy: {accuracy}%",
    });
  }

  const backend = createBackend(config, tools);
  const finalResults = await executeLocalEvals(tests, backend, config, (event) => {
    if (useConsole && progressBar) {
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
    }
  });

  if (useConsole && progressBar) {
    progressBar.stop();
    printConsoleSummary(finalResults);
  }

  await outputReports(config, finalResults, reporters, opts.outputDir, opts.open);
}

export async function runWebCommand(options: CommandOptions, command?: Command): Promise<void> {
  const opts: CommandOptions = command?.optsWithGlobals ? command.optsWithGlobals() : options;

  const url = opts.url!;
  const evalsFile = opts.evals!;

  process.on("SIGINT", () => {
    console.log("\nGracefully shutting down from SIGINT (Ctrl-C)");
    process.exit(1);
  });

  try {
    const config: WebmcpConfig = {
      url,
      evalsFile,
      backend: opts.backend,
      model: opts.model,
      runs: opts.runs,
      maxSteps: opts.maxSteps,
      outputDir: opts.outputDir,
      reporter: opts.reporter,
    };

    const tools = await listToolsFromPage(config.url);

    const tests: Array<Eval> = JSON.parse(
      await readFile(resolve(process.cwd(), evalsFile), "utf-8"),
    );

    const reporters = opts.reporter || ["console", "html"];
    const useConsole = reporters.includes("console");

    let spinner: ReturnType<typeof ora> | undefined;
    const resultsList: any[] = [];

    if (useConsole) {
      spinner = ora({ discardStdin: false });
    }

    const backend = createBackend(config, tools);
    const finalResults = await executeInBrowserEvals(tests, backend, config, (event) => {
      if (useConsole && spinner) {
        if (event.type === "start") {
          spinner.start(`Running evals (${event.total} steps)...`);
        } else if (event.type === "progress") {
          resultsList.push(event.result);
          const passRate = (
            (resultsList.filter((r) => r.outcome === "pass").length / resultsList.length) *
            100
          ).toFixed(2);
          spinner.text = `Running... pass rate: ${passRate}% (${resultsList.length} steps)`;
        }
      }
    });

    if (useConsole && spinner) {
      spinner.stop();
      printConsoleSummary(finalResults);
    }

    await outputReports(config, finalResults, reporters, opts.outputDir, opts.open, true);
  } catch (error: any) {
    console.error(`\n${chalk.red.bold("❌ Error:")} ${error.message || error}\n`);
    process.exit(1);
  }
}

function printConsoleSummary(finalResults: any): void {
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
  const passRate =
    totalSteps > 0 ? ((finalResults.passCount / totalSteps) * 100).toFixed(1) : "0.0";
  const color =
    finalResults.passCount === totalSteps
      ? chalk.green
      : finalResults.passCount === 0
        ? chalk.red
        : chalk.yellow;
  console.log(`\nPass count: ${color(`${finalResults.passCount}/${totalSteps}`)} (${passRate}%)\n`);
}

async function outputReports(
  config: any,
  finalResults: any,
  reporters: string[],
  outputDir: string = ".evals",
  shouldOpen: boolean = false,
  isWeb: boolean = false,
): Promise<void> {
  if (reporters.includes("html") || reporters.includes("json")) {
    await mkdir(resolve(process.cwd(), outputDir), { recursive: true });
  }

  let htmlPath: string | undefined;

  if (reporters.includes("html")) {
    const reportHtml = isWeb
      ? renderWebmcpReport(config, finalResults)
      : renderReport(config, finalResults);
    htmlPath = resolve(process.cwd(), outputDir, `report-${Date.now()}.html`);
    await writeFile(htmlPath, reportHtml);
    console.log(`HTML report saved to ${htmlPath}`);
  }

  if (reporters.includes("json")) {
    const jsonPath = resolve(process.cwd(), outputDir, `report-${Date.now()}.json`);
    await writeFile(jsonPath, JSON.stringify({ config, results: finalResults }, null, 2));
    console.log(`JSON report saved to ${jsonPath}`);
  }

  if (shouldOpen && htmlPath) {
    await open(htmlPath);
  }
}
