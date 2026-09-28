<!--
Copyright 2026 Google LLC
SPDX-License-Identifier: Apache-2.0

Portions derived from Anthropic's skill-creator (https://github.com/anthropics/anthropic-quickstarts),
licensed under the Apache License, Version 2.0.
Copyright (c) Anthropic, PBC.
-->

# JSON Schemas Specification

This document defines the formal JSON schemas used across the skill-creator evaluation engine, test suites, benchmark aggregator, and Vite evaluation viewer.

---

## 1. `evals.json` & Modular Suites

Defines test cases for a skill. In this repository, test cases are authored in modular suites at `skills/<skill-name>/evals/suites/<topic>.json` and auto-bundled into `skills/<skill-name>/evals/evals.json`.

```json
{
  "skill_name": "example-skill",
  "suite": "core-features",
  "evals": [
    {
      "id": "react-search-tool",
      "prompt": "How do I implement a read-only search tool in React?",
      "expected_output": "A React component using useWebMCP with readOnlyHint: true.",
      "files": ["evals/fixtures/schema.ts"],
      "assertions": [
        "The output uses useWebMCP from use-webmcp-tool",
        "The output includes readOnlyHint: true",
        "The output does NOT include deprecated navigator.modelContext"
      ]
    }
  ]
}
```

### Fields:

- `skill_name`: String matching the skill's directory name and frontmatter `name`.
- `suite`: (Optional in bundled `evals.json`, required in `suites/*.json`) Identifier for the modular topic or stage.
- `evals[].id`: Unique string or integer identifier.
- `evals[].prompt`: The user task or prompt to execute.
- `evals[].expected_output`: Human-readable summary of expected results.
- `evals[].files`: Optional array of input fixture file paths relative to skill directory.
- `evals[].assertions`: Array of verifiable statements evaluated by the grader.

---

## 2. `history.json`

Tracks version progression across iterations in the iteration loop. Located at the workspace root.

```json
{
  "started_at": "2026-03-20T14:30:00Z",
  "skill_name": "build-webmcp-tools",
  "current_best": "v2",
  "iterations": [
    {
      "version": "v0",
      "parent": null,
      "expectation_pass_rate": 0.45,
      "grading_result": "baseline",
      "is_current_best": false
    },
    {
      "version": "v1",
      "parent": "v0",
      "expectation_pass_rate": 0.78,
      "grading_result": "won",
      "is_current_best": false
    },
    {
      "version": "v2",
      "parent": "v1",
      "expectation_pass_rate": 0.94,
      "grading_result": "won",
      "is_current_best": true
    }
  ]
}
```

### Fields:

- `started_at`: ISO 8601 timestamp when improvement cycle started.
- `skill_name`: Name of the skill.
- `current_best`: Version string representing current top performer.
- `iterations[].version`: Identifier (`v0`, `v1`, `v2`...).
- `iterations[].parent`: Predecessor version identifier or `null`.
- `iterations[].expectation_pass_rate`: Aggregate pass rate (0.0 to 1.0).
- `iterations[].grading_result`: `"baseline"`, `"won"`, `"lost"`, or `"tie"`.
- `iterations[].is_current_best`: Boolean flag.

---

## 3. `grading.json`

Output from the Grader agent or automated grading runner. Located at `<run-dir>/grading.json`.

```json
{
  "expectations": [
    {
      "text": "The output uses useWebMCP from use-webmcp-tool",
      "passed": true,
      "evidence": "Found: import { useWebMCP } from 'use-webmcp-tool'; in src/SearchTool.tsx line 2"
    },
    {
      "text": "The output includes readOnlyHint: true",
      "passed": true,
      "evidence": "Found readOnlyHint: true in tool configuration object on line 14"
    },
    {
      "text": "The output includes an unmount cleanup handler",
      "passed": false,
      "evidence": "Tool registered directly in body without cleanup return in useEffect"
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
      "view_file": 4,
      "write_to_file": 1
    },
    "total_tool_calls": 5,
    "total_steps": 3,
    "errors_encountered": 0,
    "output_chars": 4200,
    "transcript_chars": 2100
  },
  "timing": {
    "executor_duration_seconds": 12.4,
    "grader_duration_seconds": 2.1,
    "total_duration_seconds": 14.5
  },
  "claims": [
    {
      "claim": "Tool unregisters on component teardown",
      "type": "process",
      "verified": false,
      "evidence": "No unregister call found in code"
    }
  ],
  "user_notes_summary": {
    "uncertainties": [],
    "needs_review": ["Verify React 19 compatibility"],
    "workarounds": []
  },
  "eval_feedback": {
    "suggestions": [
      {
        "assertion": "The output uses useWebMCP from use-webmcp-tool",
        "reason": "An empty file with just the import statement passes; verify invocation syntax."
      }
    ],
    "overall": "Assertions check presence but not runtime lifecycle behavior."
  }
}
```

### Fields:

- `expectations[]`: Array of graded assertions with `text`, `passed`, and `evidence`. **The viewer strictly requires these exact keys.**
- `summary`: Aggregate counts (`passed`, `failed`, `total`, `pass_rate`).
- `execution_metrics`: Tool call counts and character volumes.
- `timing`: Wall clock timing.
- `claims`: Extracted and verified implicit claims.
- `user_notes_summary`: Issues and workarounds flagged by the executor.
- `eval_feedback`: Suggestions to improve the assertions.

---

## 4. `metrics.json`

Output from the execution runner. Located at `<run-dir>/outputs/metrics.json`.

```json
{
  "tool_calls": {
    "view_file": 4,
    "write_to_file": 2,
    "run_command": 1
  },
  "total_tool_calls": 7,
  "total_steps": 4,
  "files_created": ["src/SearchTool.tsx"],
  "errors_encountered": 0,
  "output_chars": 4820,
  "transcript_chars": 2400
}
```

---

## 5. `timing.json`

Wall clock timing and token consumption for an execution run. Located at `<run-dir>/timing.json`.

```json
{
  "total_tokens": 14250,
  "duration_ms": 12400,
  "total_duration_seconds": 12.4,
  "executor_start": "2026-03-20T14:32:00Z",
  "executor_end": "2026-03-20T14:32:12Z",
  "executor_duration_seconds": 12.4,
  "grader_start": "2026-03-20T14:32:13Z",
  "grader_end": "2026-03-20T14:32:15Z",
  "grader_duration_seconds": 2.1
}
```

---

## 6. `benchmark.json`

Aggregated output produced by `npm run eval:full`. Located at `evals-workspace/<skill-name>/iteration-<N>/benchmark.json`.

```json
{
  "metadata": {
    "skill_name": "build-webmcp-tools",
    "skill_path": "skills/build-webmcp-tools",
    "executor_model": "gemini-2.5-pro",
    "grader_model": "gemini-2.5-pro",
    "timestamp": "2026-03-20T14:35:00Z",
    "evals_run": ["search-flow", "cart-mutation", "dynamic-tools"],
    "runs_per_configuration": 1
  },
  "runs": [
    {
      "eval_id": "search-flow",
      "eval_name": "React Read-Only Search Tool",
      "configuration": "with_skill",
      "run_number": 1,
      "result": {
        "pass_rate": 1.0,
        "passed": 3,
        "failed": 0,
        "total": 3,
        "time_seconds": 12.4,
        "tokens": 14250,
        "tool_calls": 5,
        "errors": 0
      },
      "expectations": [
        {
          "text": "The output uses useWebMCP from use-webmcp-tool",
          "passed": true,
          "evidence": "Found import on line 1"
        }
      ],
      "notes": []
    }
  ],
  "run_summary": {
    "with_skill": {
      "pass_rate": { "mean": 0.94, "stddev": 0.05, "min": 0.88, "max": 1.0 },
      "time_seconds": { "mean": 14.2, "stddev": 2.1, "min": 11.5, "max": 17.0 },
      "tokens": { "mean": 13800, "stddev": 850, "min": 12500, "max": 15100 }
    },
    "without_skill": {
      "pass_rate": { "mean": 0.38, "stddev": 0.12, "min": 0.25, "max": 0.5 },
      "time_seconds": { "mean": 10.1, "stddev": 1.5, "min": 8.5, "max": 12.0 },
      "tokens": { "mean": 8200, "stddev": 400, "min": 7800, "max": 8900 }
    },
    "delta": {
      "pass_rate": "+0.56",
      "time_seconds": "+4.1",
      "tokens": "+5600"
    }
  },
  "notes": [
    "Assertion 'The output includes readOnlyHint: true' passes 100% with skill and 0% without skill",
    "Without-skill runs consistently fail on client-side lifecycle cleanup"
  ]
}
```

> [!IMPORTANT]
> The Vite evaluation viewer depends on exact field naming: `configuration` must be `"with_skill"` or `"without_skill"`, and individual run metrics must be nested inside `result`.

---

## 7. `comparison.json`

Output from the Blind Comparator agent. Located at `<run-dir>/comparison.json`.

```json
{
  "winner": "A",
  "reasoning": "Output A properly registers the tool with Zod schema and handles component unmount cleanup.",
  "rubric": {
    "A": {
      "content": { "correctness": 5, "completeness": 5, "accuracy": 5 },
      "structure": { "organization": 4, "formatting": 5, "usability": 5 },
      "content_score": 5.0,
      "structure_score": 4.7,
      "overall_score": 9.7
    },
    "B": {
      "content": { "correctness": 3, "completeness": 3, "accuracy": 2 },
      "structure": { "organization": 3, "formatting": 4, "usability": 3 },
      "content_score": 2.7,
      "structure_score": 3.3,
      "overall_score": 6.0
    }
  },
  "output_quality": {
    "A": {
      "score": 9.7,
      "strengths": ["Uses standard useWebMCP hook", "Includes readOnlyHint"],
      "weaknesses": []
    },
    "B": {
      "score": 6.0,
      "strengths": ["Clean JSX"],
      "weaknesses": ["Uses deprecated navigator.modelContext"]
    }
  }
}
```

---

## 8. `analysis.json`

Output from the Post-Hoc Analyzer agent. Located at `<run-dir>/analysis.json`.

```json
{
  "comparison_summary": {
    "winner": "A",
    "winner_skill": "skills/build-webmcp-tools",
    "loser_skill": "evals-workspace/build-webmcp-tools/skill-snapshot",
    "comparator_reasoning": "Winner used useWebMCP hook with proper schema and readOnlyHint"
  },
  "winner_strengths": [
    "Clear guidance to use useWebMCP hook from use-webmcp-tool",
    "Included readOnlyHint: true requirement"
  ],
  "loser_weaknesses": [
    "Vague instructions led to manual window event listeners",
    "Missing cleanup on unmount"
  ],
  "instruction_following": {
    "winner": { "score": 9, "issues": [] },
    "loser": { "score": 5, "issues": ["Used deprecated DOM APIs"] }
  },
  "improvement_suggestions": [
    {
      "priority": "high",
      "category": "instructions",
      "suggestion": "Instruct models to always specify readOnlyHint: true for read-only actions",
      "expected_impact": "Eliminates missing metadata in generated tools"
    }
  ]
}
```

---

## 9. `feedback.json`

Recorded in the Vite evaluation viewer when a user submits human review notes. Located at `evals-workspace/<skill-name>/iteration-<N>/feedback.json`.

```json
{
  "reviews": [
    {
      "run_id": "eval-0-with_skill",
      "feedback": "Great implementation, but add a fallback for React 18 compatibility.",
      "timestamp": "2026-03-20T14:40:00Z"
    },
    {
      "run_id": "eval-1-with_skill",
      "feedback": "",
      "timestamp": "2026-03-20T14:40:00Z"
    }
  ],
  "status": "complete"
}
```

---

## 10. `trigger-queries.json`

Test set for optimizing the skill description frontmatter for triggering accuracy.

```json
[
  {
    "query": "ok so my boss wants me to add a client-side search tool in our Next.js store so AI agents can query products directly in the browser tab",
    "should_trigger": true
  },
  {
    "query": "write a python script to connect to postgres over stdio MCP",
    "should_trigger": false
  }
]
```
