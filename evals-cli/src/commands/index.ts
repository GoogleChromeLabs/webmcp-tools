/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Command } from "commander";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { resolve, basename, extname, join } from "path";
import { SingleBar } from "cli-progress";
import chalk from "chalk";
import Table from "cli-table3";
import open from "open";
import ora from "ora";
import { Config, WebmcpConfig } from "../types/config.js";
import { Eval, FunctionCall } from "../types/evals.js";
import { Tool, ToolsSchema } from "../types/tools.js";
import { executeLocalEvals, executeInBrowserEvals } from "../evaluator/index.js";
import { renderReport, renderWebmcpReport } from "../report/report.js";
import { createBackend } from "../backends/index.js";
import { analyzeEvalReport, ANALYZER_MODEL_DEFAULT, formatShortTitle } from "../analyzer/index.js";

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
  analyze?: boolean;
  analyzerModel?: string;
  openAnalysis?: boolean;
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
  const finalReporters =
    opts.analyze && !reporters.includes("json") ? [...reporters, "json"] : reporters;

  if (opts.analyze && !reporters.includes("json")) {
    console.log(chalk.blue("ℹ Info: JSON reporter enabled automatically for report analysis."));
  }

  let progressBar: SingleBar | undefined;

  if (useConsole) {
    progressBar = new SingleBar({
      format: "progress [{bar}] {percentage}% | ETA: {eta}s | {value}/{total}",
    });
  }

  const backend = createBackend(config);
  const finalResults = await executeLocalEvals(tests, backend, tools, config, (event) => {
    if (useConsole && progressBar) {
      if (event.type === "start") {
        console.log(event.message);
        progressBar.start(event.total, 0);
      } else if (event.type === "progress") {
        progressBar.update(event.testCaseNumber);
      }
    }
  });

  if (useConsole && progressBar) {
    progressBar.stop();
    printConsoleSummary(finalResults);
  }

  if (opts.analyze) {
    // Override open for outputReports so we only open the analysis markdown report (if requested)
    const { jsonPath } = await outputReports(
      config,
      finalResults,
      finalReporters,
      opts.outputDir,
      opts.open,
    );
    if (jsonPath) {
      await runAnalyzeCommand(jsonPath, opts, command);
    }
  } else {
    await outputReports(config, finalResults, finalReporters, opts.outputDir, opts.open);
  }
}

function getProgressBar(ratio: number, size = 10): string {
  const filled = Math.min(size, Math.floor(ratio * size));
  const empty = size - filled;
  const filledPart = chalk.cyan("━".repeat(filled));
  const emptyPart = chalk.gray.dim("─".repeat(empty));
  return `${filledPart}${emptyPart}`;
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

    const tests: Array<Eval> = JSON.parse(
      await readFile(resolve(process.cwd(), evalsFile), "utf-8"),
    );

    const reporters = opts.reporter || ["console", "html"];
    const useConsole = reporters.includes("console");
    const finalReporters =
      opts.analyze && !reporters.includes("json") ? [...reporters, "json"] : reporters;

    if (opts.analyze && !reporters.includes("json")) {
      console.log(chalk.blue("ℹ Info: JSON reporter enabled automatically for report analysis."));
    }

    let spinner: ReturnType<typeof ora> | undefined;
    const resultsList: any[] = [];

    if (useConsole) {
      console.log();
      spinner = ora({ discardStdin: false });
    }

    const backend = createBackend(config);
    const finalResults = await executeInBrowserEvals(tests, backend, config, (event) => {
      if (useConsole && spinner) {
        if (event.type === "start") {
          console.log("Running evals...");
          const bar = getProgressBar(0);
          const coloredPercentage = chalk.cyan("0%");
          spinner.start(
            `${bar} ${coloredPercentage}  [Run 1/${config.runs || 1}] Test Case 1/${tests.length}`,
          );
        } else if (event.type === "progress") {
          resultsList.push(event.result);
          const currentRun = event.result.runIndex || 1;
          const caseIndex = event.testCaseNumber - (currentRun - 1) * tests.length;
          const totalCases = tests.length * (config.runs || 1);
          const ratio = event.testCaseNumber / totalCases;
          const percentage = Math.round(ratio * 100);
          const bar = getProgressBar(ratio);
          const coloredPercentage = chalk.cyan(`${percentage}%`);
          spinner.text = `${bar} ${coloredPercentage}  [Run ${currentRun}/${config.runs || 1}] Test Case ${caseIndex}/${tests.length}`;
        }
      }
    });

    if (useConsole && spinner) {
      const finalBar = getProgressBar(1);
      const coloredPercentage = chalk.cyan("100%");
      spinner.succeed(`Evals completed! ${finalBar} ${coloredPercentage}`);
      printConsoleSummary(finalResults);
    }

    if (opts.analyze) {
      // Override open for outputReports so we only open the analysis markdown report (if requested)
      const { jsonPath } = await outputReports(
        config,
        finalResults,
        finalReporters,
        opts.outputDir,
        opts.open,
        true,
      );
      if (jsonPath) {
        await runAnalyzeCommand(jsonPath, opts, command);
      }
    } else {
      await outputReports(config, finalResults, finalReporters, opts.outputDir, opts.open, true);
    }
  } catch (error: any) {
    console.error(`\n${chalk.red.bold("❌ Error:")} ${error.message || error}\n`);
    process.exit(1);
  }
}

import { matchesArgument } from "../matcher.js";

function getFailureDetail(res: any): string {
  if (res.outcome === "pass") return "-";
  if (!res.response) return "No tool called";

  const expected = res.test.expectedCall?.[0] as FunctionCall | undefined;
  if (!expected) return "Unexpected tool call";

  if (expected.functionName !== res.response.functionName) {
    return `Function mismatch (expected "${expected.functionName}", got "${res.response.functionName}")`;
  }

  if (expected.arguments != null && !matchesArgument(expected.arguments, res.response.args)) {
    return "Arguments mismatch";
  }

  if (expected.result !== undefined && !matchesArgument(expected.result, res.response.result)) {
    const expStr =
      typeof expected.result === "object"
        ? JSON.stringify(expected.result)
        : String(expected.result);
    const actStr =
      typeof res.response.result === "object"
        ? JSON.stringify(res.response.result)
        : String(res.response.result ?? null);
    const truncatedAct = actStr.length > 40 ? actStr.slice(0, 37) + "..." : actStr;
    return `Result mismatch: expected "${expStr}", got "${truncatedAct}"`;
  }

  return res.outcome === "error" ? "Execution error" : "Failed";
}

function printConsoleSummary(finalResults: any): void {
  console.log("\n" + chalk.bold.underline("Evaluation Summary") + "\n");

  const table = new Table({
    head: ["Step", "Status", "Expected Function", "Actual Function", "Details"],
    style: {
      head: ["whiteBright"],
      border: ["grey"],
    },
  });

  // Group by testName, then by runIndex
  const groupedResults = new Map<string, Map<number, any[]>>();
  for (const res of finalResults.results) {
    const run = res.runIndex || 1;
    const name = res.test.name || "Unnamed Test";
    if (!groupedResults.has(name)) {
      groupedResults.set(name, new Map<number, any[]>());
    }
    const testMap = groupedResults.get(name)!;
    if (!testMap.has(run)) {
      testMap.set(run, []);
    }
    testMap.get(run)!.push(res);
  }

  for (const [testName, runs] of groupedResults.entries()) {
    // Add overarching row for Test Case
    table.push([{ colSpan: 4, content: chalk.bold.blue(`Test Case: ${testName}`) }]);

    for (const [runIndex, steps] of runs.entries()) {
      // Add a grouping header row for the Run
      table.push([{ colSpan: 4, content: chalk.bold.magenta(` • [Run ${runIndex}]`) }]);

      for (const res of steps) {
        const passed = res.outcome === "pass";
        table.push([
          res.stepIndex,
          passed ? chalk.green("PASS") : chalk.red(res.outcome.toUpperCase()),
          (res.test.expectedCall?.[0] as FunctionCall)?.functionName || "-",
          res.response?.functionName || "-",
          getFailureDetail(res),
        ]);
      }
    }
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
  console.log(
    `\nPass count (steps): ${color(`${finalResults.passCount}/${totalSteps}`)} (${passRate}%)\n`,
  );
}

async function outputReports(
  config: any,
  finalResults: any,
  reporters: string[],
  outputDir: string = ".evals",
  shouldOpen: boolean = false,
  isWeb: boolean = false,
): Promise<{ htmlPath?: string; jsonPath?: string }> {
  if (reporters.includes("html") || reporters.includes("json")) {
    await mkdir(resolve(process.cwd(), outputDir), { recursive: true });
  }

  const timestamp = Date.now();
  let htmlPath: string | undefined;
  let jsonPath: string | undefined;

  if (reporters.includes("html")) {
    const reportHtml = isWeb
      ? renderWebmcpReport(config, finalResults)
      : renderReport(config, finalResults);
    htmlPath = resolve(process.cwd(), outputDir, `report-${timestamp}.html`);
    await writeFile(htmlPath, reportHtml);
    console.log(`HTML report saved to ${htmlPath}`);
  }

  if (reporters.includes("json")) {
    jsonPath = resolve(process.cwd(), outputDir, `report-${timestamp}.json`);
    await writeFile(jsonPath, JSON.stringify({ config, results: finalResults }, null, 2));
    console.log(`JSON report saved to ${jsonPath}`);
  }

  if (shouldOpen && htmlPath) {
    await open(htmlPath);
  }

  return { htmlPath, jsonPath };
}

function getUniqueOutputPath(dir: string, base: string): string {
  let candidate = resolve(dir, `${base}-analysis.md`);
  if (!existsSync(candidate)) {
    return candidate;
  }
  let index = 1;
  while (true) {
    candidate = resolve(dir, `${base}-analysis-${index}.md`);
    if (!existsSync(candidate)) {
      return candidate;
    }
    index++;
  }
}

export async function runAnalyzeCommand(
  reportPath: string,
  options: CommandOptions,
  command?: Command,
): Promise<void> {
  const isAnalyzeCommand = command?.name() === "analyze";
  const localOpts = isAnalyzeCommand ? command.opts() : {};
  const globalOpts = command?.optsWithGlobals ? command.optsWithGlobals() : options;

  const config: Config = {
    toolSchemaFile: "",
    evalsFile: "",
    backend: localOpts.backend || globalOpts.backend || "vercel",
    model: localOpts.model || globalOpts.analyzerModel || ANALYZER_MODEL_DEFAULT,
    runs: globalOpts.runs,
    outputDir: globalOpts.outputDir,
    reporter: globalOpts.reporter,
  };

  const spinner = ora({ discardStdin: false });
  spinner.start("Analyzing evals report...");

  try {
    const analysisText = await analyzeEvalReport(reportPath, config);
    spinner.stop();

    const outputDir = globalOpts.outputDir || ".evals";
    await mkdir(resolve(process.cwd(), outputDir), { recursive: true });

    // Determine output filename matching the input report filename
    const base = formatShortTitle(basename(reportPath, extname(reportPath)));
    const outputPath = getUniqueOutputPath(resolve(process.cwd(), outputDir), base);

    await writeFile(outputPath, analysisText, "utf-8");

    console.log(`\n${chalk.green.bold("📝 Analysis Report Completed:")}`);
    console.log(`Saved to: ${outputPath}\n`);

    if (localOpts.open || globalOpts.openAnalysis) {
      try {
        await open(outputPath, { app: { name: "google chrome" } });
      } catch {
        await open(outputPath);
      }
    }

    // Log a brief snippet of the summary to console
    const summaryLines = analysisText.split("\n").slice(0, 15).join("\n");
    console.log(summaryLines);
    console.log("\n...\n");
  } catch (error: any) {
    spinner.stop();
    console.error(`\n${chalk.red.bold("❌ Error:")} ${error.message || error}\n`);
    process.exit(1);
  }
}
