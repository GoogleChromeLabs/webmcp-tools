<!--
Copyright 2026 Google LLC
SPDX-License-Identifier: Apache-2.0

Portions derived from Anthropic's skill-creator (https://github.com/anthropics/anthropic-quickstarts),
licensed under the Apache License, Version 2.0.
Copyright (c) Anthropic, PBC.
-->

# Post-Hoc Analyzer Agent & Benchmark Diagnostics

This guide provides the analytical protocols for both **Post-Hoc A/B Analysis** (explaining why a winning output won) and **Benchmark Diagnostics** (identifying patterns and anomalies across multi-run benchmarks).

---

# Part 1: Post-Hoc A/B Analyzer

Analyze blind comparison results to understand **why** the winner won and generate actionable, prioritized improvements for the losing skill version.

## Role

After the blind comparator determines a winner, the Post-Hoc Analyzer unblinds the results by examining both skills and their execution transcripts. The goal is to extract concrete insights: what specific instructions or bundled tools enabled the winner to succeed, and how should the loser be revised?

## Inputs

Parameters provided in the prompt:

- **`winner`**: "A" or "B" (from blind comparator).
- **`winner_skill_path`**: Path to the winning skill.
- **`winner_transcript_path`**: Path to the execution transcript for the winner.
- **`loser_skill_path`**: Path to the losing skill.
- **`loser_transcript_path`**: Path to the execution transcript for the loser.
- **`comparison_result_path`**: Path to `comparison.json`.
- **`output_path`**: Path where `analysis.json` should be saved.

## Process

### Step 1: Read Comparison Results

1. Read `comparison.json`.
2. Note the winning side, overall scores, and the comparator's core reasoning.
3. Understand what specific output qualities decided the outcome.

### Step 2: Read Both Skills

1. Read the winner's `SKILL.md` and referenced files.
2. Read the loser's `SKILL.md` and referenced files.
3. Identify structural and instructional differences:
   - Instruction clarity, specificity, and constraints.
   - Script, schema, or helper tool usage patterns.
   - Quality and breadth of concrete examples.
   - Guidance on edge cases and error handling.

### Step 3: Read Both Transcripts

1. Read the winner's transcript (`response.md` or logs).
2. Read the loser's transcript.
3. Compare execution trajectories:
   - How closely did each follow the skill's instructions?
   - What tools were invoked and in what order?
   - Where did the loser diverge from the optimal path?
   - Did either encounter runtime errors, and how did they recover?

### Step 4: Analyze Instruction Following

Evaluate for each run:

- Did the agent follow the skill's explicit workflow?
- Did the agent utilize bundled scripts and templates?
- Were there missed opportunities to leverage skill content?
- Did the agent add unnecessary, hallucinated steps?

Score instruction following from 1–10 and document specific divergences.

### Step 5: Identify Winner Strengths

Determine what caused the winner's superior output:

- Clearer step-by-step instructions?
- Pre-bundled helper scripts or schemas that eliminated improvisation?
- Richer examples covering edge cases?
- Explicit error prevention rules?

### Step 6: Identify Loser Weaknesses

Determine what hindered the loser:

- Ambiguous or vague instructions (e.g. "handle errors appropriately")?
- Missing helper utilities that forced the model to reinvent the wheel?
- Gaps in edge-case coverage?
- Heavy-handed directives that caused over-constraining or brittle output?

### Step 7: Generate Prioritized Improvement Suggestions

Produce concrete, actionable recommendations to improve the losing skill:

- **`instructions`**: Specific wording changes to `SKILL.md`.
- **`tools`**: Scripts, templates, or schemas to add to `scripts/` or `assets/`.
- **`examples`**: Input/output pairings to clarify edge cases.
- **`error_handling`**: Specific fallback guidance.
- **`structure`**: Hierarchy reorganization or progressive disclosure pointers.

### Step 8: Save `analysis.json`

```json
{
  "comparison_summary": {
    "winner": "A",
    "winner_skill": "skills/build-webmcp-tools",
    "loser_skill": "skills/build-webmcp-tools-snapshot",
    "comparator_reasoning": "Winner used useWebMCP hook with proper schema and readOnlyHint"
  },
  "winner_strengths": [
    "Explicit recommendation to use useWebMCP hook with automatic cleanup",
    "Clear guidance to specify readOnlyHint: true for search operations",
    "Provided Zod schema validation template"
  ],
  "loser_weaknesses": [
    "Vague instruction to 'register tool with document.modelContext' led to manual DOM listener hacks",
    "Omitted mention of readOnlyHint, resulting in missing metadata",
    "No cleanup guidance on unmount"
  ],
  "instruction_following": {
    "winner": {
      "score": 9,
      "issues": ["Minor: skipped optional schema description string"]
    },
    "loser": {
      "score": 5,
      "issues": [
        "Ignored WebMCP standard conventions",
        "Invented manual window event listeners instead of standard API"
      ]
    }
  },
  "improvement_suggestions": [
    {
      "priority": "high",
      "category": "instructions",
      "suggestion": "Replace 'register tool with document.modelContext' with explicit 'Use useWebMCP hook from use-webmcp-tool for React applications'",
      "expected_impact": "Prevents model from improvising manual lifecycle listeners"
    },
    {
      "priority": "high",
      "category": "tools",
      "suggestion": "Add tool-schema-template.ts to scripts/ or references/ for quick import",
      "expected_impact": "Guarantees valid Zod schema structure on first attempt"
    }
  ],
  "transcript_insights": {
    "winner_execution_pattern": "Read SKILL.md -> Selected React guide in references/ -> Used useWebMCP -> Validated output",
    "loser_execution_pattern": "Read SKILL.md -> Unclear on React integration -> Attempted window.navigator -> Rewrote 3 times"
  }
}
```

---

# Part 2: Analyzing Benchmark Results

When reviewing multi-run benchmark results (`benchmark.json`), the goal is to **surface patterns, anomalies, and statistical variance** that aggregate metrics hide.

## Role

Review all test runs and generate freeform analytical observations grounded directly in data.

## Process

### Step 1: Read Benchmark Data

Inspect `benchmark.json` metadata, runs array, and `run_summary` aggregates.

### Step 2: Analyze Per-Assertion Patterns

For each assertion across all runs:

- **Always Passes in Both Configurations**: Non-discriminating assertion. It tests something trivial that the model does anyway, not the skill's specific value-add.
- **Always Fails in Both Configurations**: Either the assertion is broken/unrealistic, or the capability is beyond the model's current ceiling.
- **Passes With Skill, Fails Without Skill**: The skill demonstrates clear, measurable value-add.
- **Fails With Skill, Passes Without Skill**: The skill is actively degrading performance (overfitting or conflicting instructions).
- **High Variance Across Runs**: Flaky assertion or non-deterministic model behavior.

### Step 3: Analyze Cross-Eval Patterns

- Are certain lifecycle stages or eval types consistently more difficult?
- Does performance cluster by domain (e.g. React passes 100%, vanilla JS flakier)?
- Are there unexpected anomalies where simple tasks fail and complex ones succeed?

### Step 4: Analyze Resource & Latency Metrics

- **Latency Tradeoff**: Does the skill add 20+ seconds of reasoning time without a commensurate boost in quality?
- **Token Consumption**: Is token usage disproportionately inflated due to verbose templates or unnecessary steps?
- **Outliers**: Were there outlier runs (e.g. 5x normal token count) caused by circular tool loops?

### Step 5: Format Benchmark Notes

Record specific, evidence-grounded observations into `notes` in `benchmark.json`:

```json
[
  "Assertion 'The output includes readOnlyHint: true' passes 100% with skill and 0% without skill (clear value add)",
  "Assertion 'Valid JavaScript syntax' passes 100% in both configurations — non-discriminating assertion",
  "Eval 'dynamic-tool-lifecycle' shows high variance (50% ± 35%) due to inconsistent cleanup teardown",
  "Skill adds 4.2s average execution time and 650 tokens, but increases overall pass rate from 38% to 94%"
]
```

## Guidelines

- **Report Data, Not Speculation**: Ground every observation in specific eval IDs, run numbers, or percentages.
- **Do Not Suggest Fixes in Notes**: Keep benchmark notes focused on diagnosing what happened; reserve recommendations for the skill iteration loop.
- **Never Rely on Means Alone**: Always inspect `stddev`, `min`, and `max` to catch bimodal distributions or masking.
