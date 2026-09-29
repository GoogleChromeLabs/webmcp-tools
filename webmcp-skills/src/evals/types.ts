/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Single evaluation test case conforming to agentskills.io standard.
 */
export interface EvalCase {
  id: string;
  prompt: string;
  expected_output: string;
  files?: string[];
  assertions: string[];
  suite?: string;
}

/**
 * Modular evaluation suite file structure.
 */
export interface EvalSuite {
  skill_name: string;
  suite?: string;
  description?: string;
  evals: EvalCase[];
}

/**
 * Discovered skill definition and associated evals.
 */
export interface Skill {
  name: string;
  dir: string;
  skillPath: string;
  systemInstruction: string;
  evals: EvalCase[];
  suites: string[];
}

/**
 * Timing and token metrics for a single run.
 */
export interface Timing {
  total_tokens: number;
  duration_ms: number;
  prompt_tokens?: number;
  candidate_tokens?: number;
}

/**
 * Single assertion evaluation result with concrete evidence.
 */
export interface AssertionResult {
  text: string;
  passed: boolean;
  evidence: string;
}

/**
 * Summary of assertion pass/fail counts and rate.
 */
export interface GradingSummary {
  passed: number;
  failed: number;
  total: number;
  pass_rate: number;
}

/**
 * Full grading result matching grading.json format.
 */
export interface GradingOutput {
  assertion_results: AssertionResult[];
  summary: GradingSummary;
}

/**
 * Execution result for one evaluation run under a specific configuration.
 */
export interface SingleRunResult {
  eval_id: string;
  config: "with_skill" | "without_skill";
  run_number?: number;
  output: string;
  timing: Timing;
  grading: GradingOutput;
}

/**
 * Statistical summary for a numerical metric (mean, stddev, min, max).
 */
export interface MetricStats {
  mean: number;
  stddev: number;
  min: number;
  max: number;
}

/**
 * Aggregated statistics for a run configuration.
 */
export interface ConfigStats {
  pass_rate: MetricStats;
  time_seconds: MetricStats;
  tokens: MetricStats;
}

/**
 * Delta comparison between with_skill and without_skill configurations.
 */
export interface DeltaStats {
  pass_rate: number;
  time_seconds: number;
  tokens: number;
}

/**
 * Aggregated run summary matching agentskills.io benchmark.json.
 */
export interface BenchmarkSummary {
  with_skill: ConfigStats;
  without_skill?: ConfigStats;
  delta?: DeltaStats;
}

/**
 * Per-eval summary in benchmark.json.
 */
export interface EvalBenchmarkResult {
  id: string;
  with_skill: {
    passed: boolean;
    pass_rate: number;
    time_seconds: number;
    tokens: number;
  };
  without_skill?: {
    passed: boolean;
    pass_rate: number;
    time_seconds: number;
    tokens: number;
  };
  delta_pass_rate?: number;
}

/**
 * Metadata for benchmark execution matching agentskills.io schema.
 */
export interface BenchmarkMetadata {
  skill_name: string;
  skill_path?: string;
  iteration: number;
  model?: string;
  executor_model?: string;
  grader_model?: string;
  timestamp: string;
  evals_run: string[];
  runs_per_configuration: number;
  total_runs: number;
}

/**
 * Root benchmark.json structure.
 */
export interface BenchmarkReport {
  metadata?: BenchmarkMetadata;
  skill_name: string;
  iteration: number;
  timestamp: string;
  run_summary: BenchmarkSummary;
  eval_results: EvalBenchmarkResult[];
}

/**
 * Human review feedback matching feedback.json.
 */
export type FeedbackMap = Record<string, string>;
