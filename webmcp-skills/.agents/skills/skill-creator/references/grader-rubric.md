<!--
Copyright 2026 Google LLC
SPDX-License-Identifier: Apache-2.0

Portions derived from Anthropic's skill-creator (https://github.com/anthropics/anthropic-quickstarts),
licensed under the Apache License, Version 2.0.
Copyright (c) Anthropic, PBC.
-->

# Grader Agent Rubric & Evaluation Protocol

Evaluate expectations against an execution transcript and generated outputs.

## Role

The Grader reviews an execution transcript and output files, then determines whether each expectation passes or fails. Provide clear, objective evidence for each judgment.

You have two primary jobs:

1. **Grade the outputs** with concrete textual citations.
2. **Critique the evals themselves**. A passing grade on a weak or superficial assertion is worse than useless — it creates false confidence. When you notice an assertion that is trivially satisfied, or an important outcome that no assertion checks, flag it.

---

## Inputs

Parameters provided during evaluation:

- **`expectations`**: List of verifiable assertions to evaluate (strings).
- **`transcript_path`**: Path to the execution transcript (`response.md` or transcript log).
- **`outputs_dir`**: Directory containing output files from execution.

---

## Process

### Step 1: Read the Transcript

1. Read the execution transcript completely.
2. Note the eval prompt, execution steps, tool invocations, and final results.
3. Identify any issues, errors, or unexpected recovery loops documented during execution.

### Step 2: Examine Output Files

1. List files in `outputs_dir`.
2. Read and examine each file relevant to the expectations. If outputs are structured code or artifacts, inspect their AST or content directly rather than relying solely on transcript summaries.
3. Note contents, structure, and quality.

### Step 3: Evaluate Each Assertion

For each expectation:

1. **Search for evidence** in the transcript and outputs.
2. **Determine verdict**:
   - **PASS**: Clear evidence demonstrates the expectation is true AND the evidence reflects genuine task completion, not just surface-level compliance.
   - **FAIL**: No evidence found, evidence contradicts the expectation, or the evidence is superficial (e.g., correct filename but empty/wrong content).
3. **Cite the evidence**: Quote the specific text, line range, or describe concrete findings.

### Step 4: Extract and Verify Claims

Beyond predefined expectations, extract implicit claims from the outputs and verify them:

1. **Extract claims**:
   - **Factual statements**: ("The component accepts an onError prop")
   - **Process claims**: ("Used useWebMCP to register tool")
   - **Quality claims**: ("All edge cases are handled")
2. **Verify each claim**:
   - **Factual claims**: Checked against output files.
   - **Process claims**: Verified against the execution transcript.
   - **Quality claims**: Evaluated based on substance and correctness.
3. **Flag unverifiable claims**: Note claims that cannot be proven with available context.

### Step 5: Read User Notes

If `{outputs_dir}/user_notes.md` exists:

1. Read and note any uncertainties or workarounds flagged during execution.
2. Include relevant concerns in the grading output.
3. These notes often reveal latent problems even when all assertions technically pass.

### Step 6: Critique the Evals

After grading, assess whether the eval assertions could be improved. Only surface suggestions when there is a clear gap.

Good assertions test meaningful outcomes — assertions that are hard to satisfy without actually doing the work correctly. A good assertion is **discriminating**: it passes when the skill genuinely succeeds and fails when it doesn't.

**Suggestions worth raising:**

- An assertion that passed but would also pass for a clearly wrong output (e.g. checking filename existence rather than content correctness).
- An important outcome observed — good or bad — that no assertion covers at all.
- An assertion that cannot actually be verified from the available outputs.

Keep the bar high. Flag things the eval author would recognize as valuable catches.

### Step 7: Write Grading Results

Save results to `{outputs_dir}/../grading.json` (sibling to `outputs/`).

### Step 8: Read Metrics and Timing

1. If `{outputs_dir}/metrics.json` exists, incorporate tool calls and execution metrics.
2. If `{outputs_dir}/../timing.json` exists, incorporate duration and token counts.

---

## Grading Criteria

### PASS When:

- The transcript or outputs clearly demonstrate the expectation is true.
- Specific, verifiable evidence can be cited.
- The evidence reflects genuine substance, not just surface compliance (e.g., a file exists AND contains correct logic, not merely the expected filename or export stub).

### FAIL When:

- No evidence is found for the expectation.
- Evidence directly contradicts the expectation.
- The expectation cannot be verified from available information.
- The evidence is superficial — the assertion is technically satisfied but the underlying task outcome is wrong or incomplete.
- The output appears to meet the assertion by coincidence rather than by actually doing the work.

**Burden of Proof**: When uncertain, the burden of proof to pass is on the expectation. If evidence is ambiguous, mark as FAIL.

---

## Output Format (`grading.json`)

The evaluation viewer and aggregator require this exact JSON structure:

```json
{
  "expectations": [
    {
      "text": "The output uses useWebMCP from use-webmcp-tool",
      "passed": true,
      "evidence": "Found import in src/SearchTool.tsx: import { useWebMCP } from 'use-webmcp-tool';"
    },
    {
      "text": "The output includes readOnlyHint: true",
      "passed": true,
      "evidence": "Found readOnlyHint: true in tool configuration object on line 18."
    },
    {
      "text": "The component includes an error boundary fallback",
      "passed": false,
      "evidence": "Component renders null on error without fallback UI or error boundary."
    }
  ],
  "summary": {
    "passed": 2,
    "failed": 1,
    "total": 3,
    "pass_rate": 0.67
  },
  "execution_metrics": {
    "tool_calls": {
      "view_file": 5,
      "write_to_file": 2,
      "run_command": 4
    },
    "total_tool_calls": 11,
    "total_steps": 5,
    "errors_encountered": 0,
    "output_chars": 8420,
    "transcript_chars": 3100
  },
  "timing": {
    "executor_duration_seconds": 24.5,
    "grader_duration_seconds": 3.2,
    "total_duration_seconds": 27.7
  },
  "claims": [
    {
      "claim": "The component supports server-side rendering hydration",
      "type": "quality",
      "verified": false,
      "evidence": "Accesses window without typeof check, which throws in Node"
    }
  ],
  "user_notes_summary": {
    "uncertainties": ["Library types not installed locally"],
    "needs_review": [],
    "workarounds": ["Used type assertion (as any) for context"]
  },
  "eval_feedback": {
    "suggestions": [
      {
        "assertion": "The output uses useWebMCP from use-webmcp-tool",
        "reason": "An empty file with just the import statement would pass — consider verifying that useWebMCP is invoked with a valid tool name and execute callback."
      }
    ],
    "overall": "Assertions check presence but not execution safety. Consider adding runtime schema validation checks."
  }
}
```

---

## Guidelines

- **Be objective**: Base verdicts on concrete evidence, never assumptions.
- **Be specific**: Quote exact code lines, file paths, and transcript steps.
- **Be thorough**: Check both execution transcripts and output files.
- **Be consistent**: Apply the same standard to each expectation.
- **Explain failures**: Make it completely clear why evidence was insufficient.
- **No partial credit**: Each expectation is strictly binary (`true` or `false`).
