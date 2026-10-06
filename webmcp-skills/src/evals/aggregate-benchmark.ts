/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  BenchmarkReport,
  BenchmarkSummary,
  ConfigStats,
  DeltaStats,
  EvalBenchmarkResult,
  MetricStats,
  SingleRunResult,
} from "./types.js";

/**
 * Calculates mean, stddev, min, and max for a list of numerical values.
 */
export function calculateStats(values: number[]): MetricStats {
  if (!values || values.length === 0) {
    return { mean: 0, stddev: 0, min: 0, max: 0 };
  }

  const n = values.length;
  const mean = values.reduce((sum, v) => sum + v, 0) / n;

  let stddev = 0;
  if (n > 1) {
    const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (n - 1);
    stddev = Math.sqrt(variance);
  }

  return {
    mean: Number(mean.toFixed(4)),
    stddev: Number(stddev.toFixed(4)),
    min: Number(Math.min(...values).toFixed(4)),
    max: Number(Math.max(...values).toFixed(4)),
  };
}

/**
 * Computes ConfigStats (pass_rate, time_seconds, tokens) for a list of runs.
 */
export function computeConfigStats(runs: SingleRunResult[]): ConfigStats {
  const passRates = runs.map((r) => r.grading.summary.pass_rate);
  const durationsSec = runs.map((r) => r.timing.duration_ms / 1000);
  const tokenCounts = runs.map((r) => r.timing.total_tokens);
  const hasLoopMetrics = runs.length > 0 && runs.every((r) => typeof r.turns === "number");

  return {
    pass_rate: calculateStats(passRates),
    time_seconds: calculateStats(durationsSec),
    tokens: calculateStats(tokenCounts),
    ...(hasLoopMetrics
      ? {
          turns: calculateStats(runs.map((r) => r.turns as number)),
          files_read: calculateStats(runs.map((r) => r.files_read?.length ?? 0)),
        }
      : {}),
  };
}

/**
 * Computes mean turns and files read for a set of runs, omitted for legacy runs.
 */
function loopMetricMeans(runs: SingleRunResult[]): { turns?: number; files_read?: number } {
  if (runs.length === 0 || !runs.every((r) => typeof r.turns === "number")) {
    return {};
  }
  const mean = (values: number[]) =>
    Number((values.reduce((sum, v) => sum + v, 0) / values.length).toFixed(2));
  return {
    turns: mean(runs.map((r) => r.turns as number)),
    files_read: mean(runs.map((r) => r.files_read?.length ?? 0)),
  };
}

/**
 * Computes DeltaStats between with_skill and without_skill configurations.
 */
export function computeDelta(withSkill: ConfigStats, withoutSkill: ConfigStats): DeltaStats {
  return {
    pass_rate: Number((withSkill.pass_rate.mean - withoutSkill.pass_rate.mean).toFixed(4)),
    time_seconds: Number((withSkill.time_seconds.mean - withoutSkill.time_seconds.mean).toFixed(4)),
    tokens: Math.round(withSkill.tokens.mean - withoutSkill.tokens.mean),
  };
}

export interface BuildBenchmarkOptions {
  model?: string;
  executorModel?: string;
  graderModel?: string;
  skillPath?: string;
  runsPerConfiguration?: number;
}

/**
 * Aggregates all runs into a BenchmarkReport adhering to agentskills.io standard.
 */
export function buildBenchmarkReport(
  skillName: string,
  iteration: number,
  runs: SingleRunResult[],
  options: BuildBenchmarkOptions = {},
): BenchmarkReport {
  const withSkillRuns = runs.filter((r) => r.config === "with_skill");
  const withoutSkillRuns = runs.filter((r) => r.config === "without_skill");

  const withSkillStats = computeConfigStats(withSkillRuns);
  const withoutSkillStats =
    withoutSkillRuns.length > 0 ? computeConfigStats(withoutSkillRuns) : undefined;
  const delta = withoutSkillStats ? computeDelta(withSkillStats, withoutSkillStats) : undefined;

  const runSummary: BenchmarkSummary = {
    with_skill: withSkillStats,
    without_skill: withoutSkillStats,
    delta,
  };

  // Group by eval_id for per-eval breakdown
  const evalIds = Array.from(new Set(runs.map((r) => r.eval_id)));
  const evalResults: EvalBenchmarkResult[] = [];

  for (const id of evalIds) {
    const targetWithRuns = withSkillRuns.filter((r) => r.eval_id === id);
    const targetWithoutRuns = withoutSkillRuns.filter((r) => r.eval_id === id);

    if (targetWithRuns.length > 0) {
      const withSummary = {
        passed: targetWithRuns.every((r) => r.grading.summary.failed === 0),
        pass_rate: Number(
          (
            targetWithRuns.reduce((sum, r) => sum + r.grading.summary.pass_rate, 0) /
            targetWithRuns.length
          ).toFixed(4),
        ),
        time_seconds: Number(
          (
            targetWithRuns.reduce((sum, r) => sum + r.timing.duration_ms, 0) /
            (targetWithRuns.length * 1000)
          ).toFixed(2),
        ),
        tokens: Math.round(
          targetWithRuns.reduce((sum, r) => sum + r.timing.total_tokens, 0) / targetWithRuns.length,
        ),
        ...loopMetricMeans(targetWithRuns),
      };

      let withoutSummary: EvalBenchmarkResult["without_skill"] = undefined;
      let deltaPassRate: number | undefined = undefined;

      if (targetWithoutRuns.length > 0) {
        withoutSummary = {
          passed: targetWithoutRuns.every((r) => r.grading.summary.failed === 0),
          pass_rate: Number(
            (
              targetWithoutRuns.reduce((sum, r) => sum + r.grading.summary.pass_rate, 0) /
              targetWithoutRuns.length
            ).toFixed(4),
          ),
          time_seconds: Number(
            (
              targetWithoutRuns.reduce((sum, r) => sum + r.timing.duration_ms, 0) /
              (targetWithoutRuns.length * 1000)
            ).toFixed(2),
          ),
          tokens: Math.round(
            targetWithoutRuns.reduce((sum, r) => sum + r.timing.total_tokens, 0) /
              targetWithoutRuns.length,
          ),
          ...loopMetricMeans(targetWithoutRuns),
        };
        deltaPassRate = Number((withSummary.pass_rate - withoutSummary.pass_rate).toFixed(4));
      }

      evalResults.push({
        id,
        with_skill: withSummary,
        without_skill: withoutSummary,
        delta_pass_rate: deltaPassRate,
      });
    }
  }

  const runsPerConfig =
    typeof options.runsPerConfiguration === "number" && options.runsPerConfiguration > 0
      ? options.runsPerConfiguration
      : evalIds.length > 0 && withSkillRuns.length > 0
        ? Math.max(1, Math.round(withSkillRuns.length / evalIds.length))
        : 1;

  const timestamp = new Date().toISOString();
  const defaultModel = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  const resolvedModel = options.model || defaultModel;

  return {
    metadata: {
      skill_name: skillName,
      skill_path: options.skillPath,
      iteration,
      model: resolvedModel,
      executor_model: options.executorModel || resolvedModel,
      grader_model: options.graderModel || resolvedModel,
      timestamp,
      evals_run: evalIds,
      runs_per_configuration: runsPerConfig,
      total_runs: runs.length,
    },
    skill_name: skillName,
    iteration,
    timestamp,
    run_summary: runSummary,
    eval_results: evalResults,
  };
}
