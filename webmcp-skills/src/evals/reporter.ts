/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from "node:fs";
import path from "node:path";
import { buildBenchmarkReport } from "./aggregate-benchmark.js";
import type { BenchmarkReport, SingleRunResult } from "./types.js";

export interface ReporterOptions {
  workspaceDir?: string;
  iteration?: number;
  model?: string;
  runsPerConfiguration?: number;
}

/**
 * Discovers the next available iteration number in the workspace directory.
 */
export function getNextIteration(workspaceSkillDir: string): number {
  if (!fs.existsSync(workspaceSkillDir)) {
    return 1;
  }

  const entries = fs.readdirSync(workspaceSkillDir);
  let maxIteration = 0;

  for (const entry of entries) {
    const match = entry.match(/^iteration-(\d+)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxIteration) {
        maxIteration = num;
      }
    }
  }

  return maxIteration + 1;
}

/**
 * Saves all run outputs and benchmark artifacts conforming to the agentskills.io layout.
 */
export function saveBenchmarkWorkspace(
  skillName: string,
  runs: SingleRunResult[],
  options: ReporterOptions = {},
): { iterationDir: string; benchmarkPath: string; report: BenchmarkReport } {
  const rootWorkspace = path.resolve(options.workspaceDir || "evals-workspace");
  const skillWorkspace = path.join(rootWorkspace, skillName);
  const iteration = options.iteration || getNextIteration(skillWorkspace);
  const iterationDir = path.join(skillWorkspace, `iteration-${iteration}`);

  fs.mkdirSync(iterationDir, { recursive: true });

  const runsPerConfig =
    typeof options.runsPerConfiguration === "number" && options.runsPerConfiguration > 0
      ? options.runsPerConfiguration
      : runs.some((r) => (r.run_number || 1) > 1)
        ? Math.max(...runs.map((r) => r.run_number || 1))
        : 1;

  // Save individual run artifacts
  for (const run of runs) {
    const runNum = run.run_number || 1;
    const baseConfigDir = path.join(iterationDir, `eval-${run.eval_id}`, run.config);

    // Store in run-N if multi-run, and also at baseConfigDir for run 1 for compatibility
    const targetDirs = [
      ...(runsPerConfig > 1 ? [path.join(baseConfigDir, `run-${runNum}`)] : []),
      ...(runNum === 1 || runsPerConfig === 1 ? [baseConfigDir] : []),
    ];

    for (const dir of targetDirs) {
      const outputsDir = path.join(dir, "outputs");
      fs.mkdirSync(outputsDir, { recursive: true });

      // 1. Output response
      fs.writeFileSync(path.join(outputsDir, "response.md"), run.output, "utf8");

      // 2. Timing
      fs.writeFileSync(
        path.join(dir, "timing.json"),
        JSON.stringify(run.timing, null, 2) + "\n",
        "utf8",
      );

      // 3. Grading
      fs.writeFileSync(
        path.join(dir, "grading.json"),
        JSON.stringify(run.grading, null, 2) + "\n",
        "utf8",
      );

      // 4. Agent loop trace (turns and files read via read_file)
      if (typeof run.turns === "number") {
        fs.writeFileSync(
          path.join(dir, "agent.json"),
          JSON.stringify({ turns: run.turns, files_read: run.files_read ?? [] }, null, 2) + "\n",
          "utf8",
        );
      }
    }
  }

  // 5. Aggregated benchmark.json
  const report = buildBenchmarkReport(skillName, iteration, runs, {
    model: options.model,
    runsPerConfiguration: runsPerConfig,
  });
  const benchmarkPath = path.join(iterationDir, "benchmark.json");
  fs.writeFileSync(benchmarkPath, JSON.stringify(report, null, 2) + "\n", "utf8");

  return { iterationDir, benchmarkPath, report };
}

/**
 * Prints a clean, formatted terminal summary of the evaluation run.
 */
export function printConsoleSummary(report: BenchmarkReport): void {
  const { skill_name, iteration, run_summary, eval_results } = report;

  console.log("\n" + "=".repeat(84));
  console.log(`  SKILL EVALUATION BENCHMARK: ${skill_name} (Iteration ${iteration})`);
  if (report.metadata) {
    console.log(
      `  Runs/Config: ${report.metadata.runs_per_configuration} | Total Runs: ${report.metadata.total_runs} | Model: ${report.metadata.model || "default"}`,
    );
  }
  console.log("=".repeat(84));

  const hasWithout = Boolean(run_summary.without_skill);

  // Table header
  if (hasWithout) {
    console.log(
      `${"Eval ID".padEnd(36)} ${"With Skill".padEnd(12)} ${"Without".padEnd(12)} ${"Delta".padEnd(8)} ${"Time".padEnd(8)}`,
    );
    console.log("-".repeat(84));
  } else {
    console.log(
      `${"Eval ID".padEnd(46)} ${"Status".padEnd(12)} ${"Pass Rate".padEnd(12)} ${"Time".padEnd(8)}`,
    );
    console.log("-".repeat(84));
  }

  for (const res of eval_results) {
    const timeStr = `${res.with_skill.time_seconds}s`;
    if (hasWithout && res.without_skill) {
      const withStatus = res.with_skill.passed ? "✓ PASS" : "✗ FAIL";
      const withoutStatus = res.without_skill.passed ? "✓ PASS" : "✗ FAIL";
      const deltaStr =
        res.delta_pass_rate !== undefined
          ? `${res.delta_pass_rate >= 0 ? "+" : ""}${Math.round(res.delta_pass_rate * 100)}%`
          : "-";

      console.log(
        `${res.id.padEnd(36)} ${withStatus.padEnd(12)} ${withoutStatus.padEnd(12)} ${deltaStr.padEnd(8)} ${timeStr.padEnd(8)}`,
      );
    } else {
      const status = res.with_skill.passed ? "✓ PASS" : "✗ FAIL";
      const rateStr = `${Math.round(res.with_skill.pass_rate * 100)}%`;
      console.log(
        `${res.id.padEnd(46)} ${status.padEnd(12)} ${rateStr.padEnd(12)} ${timeStr.padEnd(8)}`,
      );
    }
  }

  console.log("-".repeat(84));
  console.log("Benchmark Summary:");
  if (report.metadata) {
    console.log(
      `  • Runs per Config:         ${report.metadata.runs_per_configuration} (Total runs: ${report.metadata.total_runs})`,
    );
  }
  console.log(
    `  • With Skill Pass Rate:    ${Math.round(run_summary.with_skill.pass_rate.mean * 100)}% (mean: ${run_summary.with_skill.pass_rate.mean}, stddev: ${run_summary.with_skill.pass_rate.stddev})`,
  );
  console.log(`  • With Skill Avg Latency:  ${run_summary.with_skill.time_seconds.mean}s`);
  console.log(`  • With Skill Avg Tokens:   ${Math.round(run_summary.with_skill.tokens.mean)}`);
  if (run_summary.with_skill.files_read && run_summary.with_skill.turns) {
    console.log(
      `  • With Skill Files Read:   ${run_summary.with_skill.files_read.mean} avg (max ${run_summary.with_skill.files_read.max}), ${run_summary.with_skill.turns.mean} avg turns`,
    );
  }

  if (run_summary.without_skill && run_summary.delta) {
    console.log(
      `  • Without Skill Pass Rate: ${Math.round(run_summary.without_skill.pass_rate.mean * 100)}% (mean: ${run_summary.without_skill.pass_rate.mean}, stddev: ${run_summary.without_skill.pass_rate.stddev})`,
    );
    console.log(
      `  • Value-Add Delta:         ${run_summary.delta.pass_rate >= 0 ? "+" : ""}${Math.round(run_summary.delta.pass_rate * 100)}% pass rate delta`,
    );
  }
  console.log("=".repeat(84) + "\n");
}
