/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { CellSummary, DistractorType, SchemaStyle, TrialExecutionRecord } from "./types.js";

const DEFAULT_CONTEXT_WINDOW_TOKENS = 1_048_576;

/**
 * Computes a 95% Wilson score confidence interval for a binomial proportion.
 */
export function wilsonInterval(successes: number, total: number): { low: number; high: number } {
  if (total <= 0) return { low: 0, high: 0 };
  const z = 1.959963984540054;
  const p = successes / total;
  const denom = 1 + (z * z) / total;
  const center = (p + (z * z) / (2 * total)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) / denom;
  return {
    low: Math.max(0, center - margin),
    high: Math.min(1, center + margin),
  };
}

export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

export function mean(values: readonly (number | null | undefined)[]): number | null {
  const nums = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export interface PerToolMetric {
  label: string;
  support: number;
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
  f1: number;
}

/**
 * Computes per-tool precision, recall, and F1 across all expected target tool
 * labels (including `__NONE__` for abstention cases).
 */
export function computePerToolMetrics(records: readonly TrialExecutionRecord[]): PerToolMetric[] {
  const okRecords = records.filter((r) => r.status === "ok");
  const labels = Array.from(
    new Set(okRecords.map((r) => r.expectedFunctionName ?? "__NONE__")),
  ).sort();
  return labels.map((label) => {
    let support = 0;
    let tp = 0;
    let fp = 0;
    let fn = 0;
    for (const r of okRecords) {
      const exp = r.expectedFunctionName ?? "__NONE__";
      const act = r.actualFunctionName ?? "__NONE__";
      if (exp === label) support++;
      if (exp === label && act === label) tp++;
      else if (exp !== label && act === label) fp++;
      else if (exp === label && act !== label) fn++;
    }
    const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
    const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
    const f1 = 2 * tp + fp + fn === 0 ? 0 : (2 * tp) / (2 * tp + fp + fn);
    return { label, support, tp, fp, fn, precision, recall, f1 };
  });
}

/**
 * Computes Macro-F1 across all expected target tool labels (including `__NONE__`
 * for abstention cases) using single-step top-1 predictions.
 */
export function computeMacroF1(records: readonly TrialExecutionRecord[]): number {
  const perTool = computePerToolMetrics(records);
  if (perTool.length === 0) return 0;
  return perTool.reduce((sum, m) => sum + m.f1, 0) / perTool.length;
}

export function summarizeCell(
  arm: string,
  n: number,
  distractorType: DistractorType,
  schemaStyle: SchemaStyle,
  records: readonly TrialExecutionRecord[],
  contextWindowTokens = DEFAULT_CONTEXT_WINDOW_TOKENS,
): CellSummary {
  const okRecords = records.filter((r) => r.status === "ok");
  const completedTrials = okRecords.length;
  const apiErrors = records.length - completedTrials;

  const top1Hits = okRecords.filter((r) => r.top1Correct).length;
  const ci = wilsonInterval(top1Hits, completedTrials);

  const abstentionCases = okRecords.filter((r) => r.expectedFunctionName === null);
  const abstentionCorrectCount = abstentionCases.filter((r) => r.abstentionCorrect === true).length;
  const falsePositiveCount = abstentionCases.filter((r) => r.falsePositiveCall).length;

  const positiveCases = okRecords.filter((r) => r.expectedFunctionName !== null);
  const schemaValidCount = positiveCases.filter((r) => r.schemaValid).length;
  const semanticValidCount = positiveCases.filter((r) => r.semanticArgsCorrect).length;

  const meanPromptTokens = mean(okRecords.map((r) => r.usage.promptTokenCount));
  const meanSchemaOverheadTokens = mean(okRecords.map((r) => r.schemaOverheadTokens));

  return {
    arm,
    n,
    distractorType,
    schemaStyle,
    totalTrials: records.length,
    completedTrials,
    apiErrors,
    top1Accuracy: completedTrials > 0 ? top1Hits / completedTrials : 0,
    top1CiLow: ci.low,
    top1CiHigh: ci.high,
    abstentionAccuracy:
      abstentionCases.length > 0 ? abstentionCorrectCount / abstentionCases.length : null,
    falsePositiveRate:
      abstentionCases.length > 0 ? falsePositiveCount / abstentionCases.length : null,
    macroF1: computeMacroF1(okRecords),
    schemaValidityRate: positiveCases.length > 0 ? schemaValidCount / positiveCases.length : 0,
    semanticArgsRate: positiveCases.length > 0 ? semanticValidCount / positiveCases.length : 0,
    meanPromptTokens,
    meanToolUsePromptTokens: mean(okRecords.map((r) => r.usage.toolUsePromptTokenCount)),
    meanCandidatesTokens: mean(okRecords.map((r) => r.usage.candidatesTokenCount)),
    meanThoughtsTokens: mean(okRecords.map((r) => r.usage.thoughtsTokenCount)),
    meanTotalTokens: mean(okRecords.map((r) => r.usage.totalTokenCount)),
    meanSchemaOverheadTokens,
    contextSaturationPct:
      meanPromptTokens !== null ? (meanPromptTokens / contextWindowTokens) * 100 : null,
    latencyP50Ms: percentile(
      okRecords.map((r) => r.latencyMs),
      50,
    ),
    latencyP95Ms: percentile(
      okRecords.map((r) => r.latencyMs),
      95,
    ),
  };
}

export function groupAndSummarize(
  records: readonly TrialExecutionRecord[],
  contextWindowTokens = DEFAULT_CONTEXT_WINDOW_TOKENS,
): CellSummary[] {
  const groups = new Map<string, TrialExecutionRecord[]>();
  for (const r of records) {
    const key = `${r.arm}|${r.n}|${r.distractorType}|${r.schemaStyle}`;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }
  const summaries: CellSummary[] = [];
  for (const [key, list] of groups.entries()) {
    const [arm, nStr, distractorType, schemaStyle] = key.split("|");
    summaries.push(
      summarizeCell(
        arm,
        Number(nStr),
        distractorType as DistractorType,
        schemaStyle as SchemaStyle,
        list,
        contextWindowTokens,
      ),
    );
  }
  return summaries.sort(
    (a, b) =>
      a.arm.localeCompare(b.arm) || a.n - b.n || a.distractorType.localeCompare(b.distractorType),
  );
}

/** Evaluates pre-registered cliff criteria against the N = 1 baseline. */
export function evaluatePreRegisteredCliff(
  summaries: readonly CellSummary[],
  distractorType: DistractorType,
): { cliffDetected: boolean; reason: string } {
  const baseline = summaries.find((s) => s.arm === "natural-scaling" && s.n === 1);
  if (!baseline || baseline.completedTrials === 0) {
    return { cliffDetected: false, reason: "Missing N=1 baseline." };
  }
  const armCells = summaries
    .filter((s) => s.arm === "natural-scaling" && s.distractorType === distractorType && s.n > 1)
    .sort((a, b) => a.n - b.n);

  for (const cell of armCells) {
    const drop = baseline.top1Accuracy - cell.top1Accuracy;
    const nonOverlappingCi = cell.top1CiHigh < baseline.top1CiLow;
    if (drop >= 0.1 && nonOverlappingCi) {
      return {
        cliffDetected: true,
        reason: `N=${cell.n} dropped ${(drop * 100).toFixed(1)} pts below N=1 with non-overlapping 95% Wilson CIs.`,
      };
    }
  }
  return {
    cliffDetected: false,
    reason:
      "Null accuracy-cliff result up to max tested N (pre-registered >=10 pt non-overlapping CI drop not observed).",
  };
}

export function renderSummaryCsv(summaries: readonly CellSummary[]): string {
  const headers = [
    "arm",
    "n",
    "distractor_type",
    "schema_style",
    "total_trials",
    "completed_trials",
    "api_errors",
    "top1_accuracy",
    "top1_ci_low",
    "top1_ci_high",
    "abstention_accuracy",
    "false_positive_rate",
    "macro_f1",
    "schema_validity_rate",
    "semantic_args_rate",
    "mean_prompt_tokens",
    "mean_tool_use_prompt_tokens",
    "mean_candidates_tokens",
    "mean_thoughts_tokens",
    "mean_total_tokens",
    "mean_schema_overhead_tokens",
    "context_saturation_pct",
    "latency_p50_ms",
    "latency_p95_ms",
  ];
  const fmt = (v: number | null | undefined, digits = 4) =>
    v === null || v === undefined ? "" : v.toFixed(digits);
  const rows = summaries.map((s) =>
    [
      s.arm,
      s.n,
      s.distractorType,
      s.schemaStyle,
      s.totalTrials,
      s.completedTrials,
      s.apiErrors,
      fmt(s.top1Accuracy),
      fmt(s.top1CiLow),
      fmt(s.top1CiHigh),
      fmt(s.abstentionAccuracy),
      fmt(s.falsePositiveRate),
      fmt(s.macroF1),
      fmt(s.schemaValidityRate),
      fmt(s.semanticArgsRate),
      fmt(s.meanPromptTokens, 1),
      fmt(s.meanToolUsePromptTokens, 1),
      fmt(s.meanCandidatesTokens, 1),
      fmt(s.meanThoughtsTokens, 1),
      fmt(s.meanTotalTokens, 1),
      fmt(s.meanSchemaOverheadTokens, 1),
      fmt(s.contextSaturationPct, 4),
      fmt(s.latencyP50Ms, 1),
      fmt(s.latencyP95Ms, 1),
    ].join(","),
  );
  return [headers.join(","), ...rows].join("\n") + "\n";
}

export function renderMarkdownReport(
  records: readonly TrialExecutionRecord[],
  summaries: readonly CellSummary[],
): string {
  const modelVersions = Array.from(new Set(records.map((r) => r.modelVersion).filter(Boolean)));
  const orthoCliff = evaluatePreRegisteredCliff(summaries, "orthogonal");
  const adjCliff = evaluatePreRegisteredCliff(summaries, "domain-adjacent");

  const pct = (v: number | null) => (v === null ? "N/A" : `${(v * 100).toFixed(1)}%`);
  const num = (v: number | null, d = 0) => (v === null ? "N/A" : v.toFixed(d));

  const tableRows = summaries
    .map(
      (s) =>
        `| ${s.arm} | ${s.n} | ${s.distractorType} | ${s.schemaStyle} | ${s.completedTrials}/${s.totalTrials} | ${pct(s.top1Accuracy)} [${pct(s.top1CiLow)}, ${pct(s.top1CiHigh)}] | ${pct(s.abstentionAccuracy)} | ${pct(s.macroF1)} | ${pct(s.semanticArgsRate)} | ${num(s.meanPromptTokens)} | ${num(s.meanSchemaOverheadTokens)} | ${num(s.latencyP50Ms)} / ${num(s.latencyP95Ms)} ms |`,
    )
    .join("\n");

  const perToolRows = computePerToolMetrics(records)
    .map(
      (m) =>
        `| ${m.label} | ${m.support} | ${m.tp} | ${m.fp} | ${m.fn} | ${pct(m.precision)} | ${pct(m.recall)} | ${pct(m.f1)} |`,
    )
    .join("\n");

  return `# WebMCP Tool-Count Scaling Evaluation (#422)

**Observed Model Versions:** ${modelVersions.length > 0 ? modelVersions.join(", ") : "N/A"}  
**Total Recorded Trials:** ${records.length}

## Summary Table

| Arm | N | Distractors | Style | Completed | Top-1 Acc [95% Wilson CI] | Abstention | Macro-F1 | Semantic Args | Mean Prompt Tokens | Est. Schema Tokens | Client Latency p50/p95 |
| --- | ---: | --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
${tableRows}

## Per-Tool Precision & Recall (Overall)

| Expected Tool | Support | TP | FP | FN | Precision | Recall | F1 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${perToolRows}

## Pre-Registered Cliff Check

- **Orthogonal Distractors:** ${orthoCliff.cliffDetected ? "CLIFF DETECTED — " : ""}${orthoCliff.reason}
- **Domain-Adjacent Distractors:** ${adjCliff.cliffDetected ? "CLIFF DETECTED — " : ""}${adjCliff.reason}

## Limitations

- **Single-Step Only:** Multi-turn tool chaining is not evaluated here (multi-turn eval support is tracked separately in \`webmcp-tools#197\`).
- **Gemini-Only Scope:** Results reflect the recorded Gemini \`modelVersion\`(s) and should not be generalized across unrelated providers without replication.
- **Indicative Client Latency:** Free-tier client-observed \`p50\`/\`p95\` latency includes shared queueing and network jitter, not server-side TTFT.
- **Heuristic Reference:** Lighthouse's \`> 40\` tools warning (\`GoogleChrome/lighthouse#17221\`) and Chrome's \`30/150/500/1500\` character guidelines are treated as heuristics/recommendations, not API hard limits.
`;
}

export function renderPerToolCsv(records: readonly TrialExecutionRecord[]): string {
  const headers = ["label", "support", "tp", "fp", "fn", "precision", "recall", "f1"];
  const rows = computePerToolMetrics(records).map((m) =>
    [
      m.label,
      m.support,
      m.tp,
      m.fp,
      m.fn,
      m.precision.toFixed(4),
      m.recall.toFixed(4),
      m.f1.toFixed(4),
    ].join(","),
  );
  return [headers.join(","), ...rows].join("\n") + "\n";
}

export function writeOutputs(
  outDir: string,
  records: readonly TrialExecutionRecord[],
  summaries: readonly CellSummary[],
): { csvPath: string; perToolCsvPath: string; reportPath: string } {
  const csvPath = `${outDir}/summary.csv`;
  const perToolCsvPath = `${outDir}/per_tool_metrics.csv`;
  const reportPath = `${outDir}/report.md`;
  mkdirSync(dirname(csvPath), { recursive: true });
  writeFileSync(csvPath, renderSummaryCsv(summaries), "utf-8");
  writeFileSync(perToolCsvPath, renderPerToolCsv(records), "utf-8");
  writeFileSync(reportPath, renderMarkdownReport(records, summaries), "utf-8");
  return { csvPath, perToolCsvPath, reportPath };
}
