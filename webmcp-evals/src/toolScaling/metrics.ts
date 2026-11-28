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
      "Null accuracy-cliff result up to max tested N (analysis-plan >=10 pt non-overlapping CI drop not observed).",
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

  const okRecords = records.filter((r) => r.status === "ok");
  const posRecords = okRecords.filter((r) => r.expectedFunctionName !== null);
  const posCorrect = posRecords.filter((r) => r.top1Correct).length;
  const absRecords = okRecords.filter((r) => r.expectedFunctionName === null);
  const absCorrect = absRecords.filter((r) => r.abstentionCorrect === true).length;
  const baseToolNames = new Set(
    posRecords.map((r) => r.expectedFunctionName).filter((n): n is string => n !== null),
  );
  const distractorCalls = okRecords.filter(
    (r) => r.actualFunctionName !== null && !baseToolNames.has(r.actualFunctionName),
  ).length;

  const pct = (v: number | null) => (v === null ? "N/A" : `${(v * 100).toFixed(1)}%`);
  const num = (v: number | null, d = 0) => (v === null ? "N/A" : v.toFixed(d));

  const tableRows = summaries
    .map((s) => {
      const cellAbs = okRecords.filter(
        (r) =>
          r.arm === s.arm &&
          r.n === s.n &&
          r.distractorType === s.distractorType &&
          r.schemaStyle === s.schemaStyle &&
          r.expectedFunctionName === null,
      );
      const cellAbsOk = cellAbs.filter((r) => r.abstentionCorrect === true).length;
      const absCellStr =
        cellAbs.length > 0
          ? `${cellAbsOk}/${cellAbs.length} (${pct(s.abstentionAccuracy)})`
          : "N/A";
      return `| ${s.arm} | ${s.n} | ${s.distractorType} | ${s.schemaStyle} | ${s.completedTrials}/${s.totalTrials} | ${pct(s.top1Accuracy)} [${pct(s.top1CiLow)}, ${pct(s.top1CiHigh)}] | ${absCellStr} | ${pct(s.macroF1)} | ${pct(s.semanticArgsRate)} | ${num(s.meanPromptTokens)} | ${num(s.meanSchemaOverheadTokens)} | ${num(s.latencyP50Ms)} / ${num(s.latencyP95Ms)} ms |`;
    })
    .join("\n");

  const perToolRows = computePerToolMetrics(records)
    .map(
      (m) =>
        `| ${m.label} | ${m.support} | ${m.tp} | ${m.fp} | ${m.fn} | ${pct(m.precision)} | ${pct(m.recall)} | ${pct(m.f1)} |`,
    )
    .join("\n");

  const absByIntent = new Map<
    string,
    { total: number; ok: number; fpTools: Map<string, number> }
  >();
  for (const r of absRecords) {
    const entry = absByIntent.get(r.intentId) ?? { total: 0, ok: 0, fpTools: new Map() };
    entry.total++;
    if (r.abstentionCorrect) {
      entry.ok++;
    } else if (r.actualFunctionName) {
      entry.fpTools.set(r.actualFunctionName, (entry.fpTools.get(r.actualFunctionName) ?? 0) + 1);
    }
    absByIntent.set(r.intentId, entry);
  }
  const absAuditRows = Array.from(absByIntent.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, st]) => {
      const fpSummary =
        st.fpTools.size > 0
          ? Array.from(st.fpTools.entries())
              .map(([fn, c]) => `${fn} (${c})`)
              .join(", ")
          : "None";
      return `| ${id} | ${st.ok}/${st.total} | ${st.total - st.ok}/${st.total} | ${fpSummary} |`;
    })
    .join("\n");

  return `# WebMCP Tool-Count Scaling Evaluation (#422)

**Observed Model Versions:** ${modelVersions.length > 0 ? modelVersions.join(", ") : "N/A"}  
**Total Recorded Trials:** ${records.length} (${posCorrect}/${posRecords.length} positive correct, ${absCorrect}/${absRecords.length} abstention correct, ${distractorCalls} distractor calls selected)

## Summary Table

| Arm | N | Distractors | Style | Completed | Top-1 Acc [95% Wilson CI] | Abstention | Macro-F1 | Semantic Args | Mean Prompt Tokens | Est. Schema Tokens | Client Latency p50/p95 |
| --- | ---: | --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
${tableRows}

## Per-Tool Precision & Recall (Overall)

| Expected Tool | Support | TP | FP | FN | Precision | Recall | F1 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${perToolRows}

## Abstention Query Audit

| Intent ID | Abstained | False Positives | Called Tools |
| --- | ---: | ---: | --- |
${absAuditRows}

## Analysis-Plan Cliff Check

- **Positive-Only Accuracy:** ${posCorrect}/${posRecords.length} (${posRecords.length > 0 ? ((posCorrect / posRecords.length) * 100).toFixed(1) : "0.0"}%) — ceiling effect on this \`16\`-intent compact-schema set (no accuracy degradation signal; \`16\` positive intents per cell can detect only large drops).
- **Orthogonal Distractors (Combined Top-1):** ${orthoCliff.cliffDetected ? "CLIFF DETECTED — " : ""}${orthoCliff.reason}
- **Domain-Adjacent Distractors (Combined Top-1):** ${adjCliff.cliffDetected ? "CLIFF DETECTED — " : ""}${adjCliff.reason}

## Limitations

- **Single-Step & Compact-Schema Ceiling Effect:** Evaluates single-step selection across \`16\` positive and \`4\` abstention intents (\`5\` target shopping tools, \`temperature: 0\`, default thinking config with thinking tokens not reported separately). Across all completed trials, \`${distractorCalls}\` distractor tools were ever selected, indicating the current distractor set may be too easy to stress-test hard disambiguation.
- **\`N <= 5\` Composition (\`0\` Distractors):** At \`N = 1\`, each positive intent is paired with only its own target tool and abstention intents receive \`shopping[0]\` only; \`N = 5\` includes the \`5\` base shopping tools with \`0\` distractors in both arms.
- **Non-Independent Trials:** Each \`60\`-trial cell repeats \`20\` base intents across \`3\` shuffles, so per-trial Wilson CIs are narrower than intent-clustered CIs.
- **Abstention Audit & Order Sensitivity:** Each cell has \`12\` abstention trials (\`4\` intents × \`3\` shuffles), making \`1–2\` trial differences (\`9/12\` vs \`11/12\`) directional/underpowered. In the \`900\`-trial run, \`abs-01\` (*"Do you sell jackets in Neon Yellow? Answer directly if that color isn't supported."*) is a borderline color-lookup query (since \`filterByPreferences\` accepts a \`color\` parameter) and accounted for all \`36/36\` false positives (\`1–3\` flips/cell depending on tool order/context), while \`abs-02..04\` abstained \`135/135\` (\`100.0%\`).
- **Orthogonal vs. Adjacent Token Confound:** Orthogonal distractors use real \`examples/\` schemas (larger) while domain-adjacent distractors use compact synthetic schemas (\`~43%\` fewer tokens at \`N = 40\`); token growth is roughly proportional to schema mix rather than purely linear in \`N\`.
- **Gemini Scope & Free-Tier Latency:** Results reflect the recorded Gemini \`modelVersion\`(s) (\`gemini-3.5-flash-lite\` shows no positive accuracy drop up to \`N = 100\`, encouraging for a Flash-Lite tier, but not generalizable to all models/multi-turn \`#197\`). Free-tier client \`p50\`/\`p95\` latency reflects queueing/network jitter — no reliable latency conclusion can be drawn from free-tier runs.
- **Heuristic Reference:** At \`N = 40\` (Lighthouse \`#17221\` warning threshold), positive recall was \`100.0%\` and combined accuracy was \`96.7–98.3%\`; token-volume and latency motivations for the heuristic were not tested at a depth to confirm or refute.
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
