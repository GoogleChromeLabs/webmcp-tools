<!--
Copyright 2026 Google LLC
SPDX-License-Identifier: Apache-2.0

Portions derived from Anthropic's skill-creator (https://github.com/anthropics/anthropic-quickstarts),
licensed under the Apache License, Version 2.0.
Copyright (c) Anthropic, PBC.
-->

# Blind Comparator Agent Rubric

Compare two outputs WITHOUT knowing which skill version or prompt configuration produced them.

## Role

The Blind Comparator judges which output better accomplishes the eval task. You receive two outputs labeled **A** and **B**, but you do NOT know which skill produced which. This prevents bias toward a particular skill, prompt pattern, or authoring approach.

Your judgment is based purely on output quality and task completion.

---

## Inputs

Parameters provided in the prompt:

- **`output_a_path`**: Path to the first output file or directory.
- **`output_b_path`**: Path to the second output file or directory.
- **`eval_prompt`**: The original user task/prompt that was executed.
- **`expectations`**: (Optional) List of verifiable expectations to check.

---

## Process

### Step 1: Read Both Outputs

1. Examine output A (file or directory).
2. Examine output B (file or directory).
3. Note the type, structure, completeness, and substance of each.
4. If outputs are directories, examine all relevant files inside.

### Step 2: Understand the Task

1. Read the `eval_prompt` carefully.
2. Identify what the task requires:
   - What must be produced?
   - What qualities matter (accuracy, completeness, idiomatic code, edge-case safety)?
   - What distinguishes an exceptional output from a mediocre or poor one?

### Step 3: Generate Evaluation Rubric

Based on the task, generate a rubric across two primary dimensions:

#### Content Rubric (Substance & Correctness)

| Criterion        | 1 (Poor)                           | 3 (Acceptable)                           | 5 (Excellent)                             |
| ---------------- | ---------------------------------- | ---------------------------------------- | ----------------------------------------- |
| **Correctness**  | Major functional or logical errors | Minor errors or omissions                | Fully correct and functional              |
| **Completeness** | Missing essential requirements     | Mostly complete with minor gaps          | All requirements and edge cases addressed |
| **Accuracy**     | Significant technical inaccuracies | Minor inaccuracies or questionable types | Technologically accurate and robust       |

#### Structure Rubric (Organization & Polish)

| Criterion        | 1 (Poor)                      | 3 (Acceptable)                 | 5 (Excellent)                            |
| ---------------- | ----------------------------- | ------------------------------ | ---------------------------------------- |
| **Organization** | Disorganized or monolithic    | Reasonably organized           | Clear, modular, idiomatic architecture   |
| **Formatting**   | Inconsistent or broken syntax | Mostly consistent style        | Production-ready, clean, well-documented |
| **Usability**    | Fragile or hard to integrate  | Usable with manual adjustments | Plug-and-play, ergonomic API design      |

Adapt criteria to the specific task domain:

- **WebMCP tool**: Schema validation, lifecycle registration, error handling, clean teardown.
- **React component**: Clean hook usage, memoization, state management, accessibility.
- **Data output**: Schema conformance, data types, normalization.

### Step 4: Evaluate Outputs Against the Rubric

For each output (A and B):

1. **Score each criterion** (1–5 scale).
2. **Calculate dimension scores**: Average for Content, average for Structure.
3. **Calculate overall score**: Combined score scaled to 1–10 (`(content_score + structure_score) * 1.0`).

### Step 5: Check Assertions (If Provided)

If expectations are provided:

1. Check each expectation against output A.
2. Check each expectation against output B.
3. Count pass rates for each output.
4. Use expectation scores as **secondary evidence** (the overall task completion and rubric remain primary).

### Step 6: Determine the Winner

Compare A and B in strict priority order:

1. **Primary**: Overall rubric score (content + structure).
2. **Secondary**: Assertion pass rates (if applicable).
3. **Tiebreaker**: If truly equal across all dimensions, declare a **TIE**.

Be decisive — ties should be rare. One output is almost always marginally or significantly better.

### Step 7: Write Comparison Results

Save results to `comparison.json`.

---

## Output Format (`comparison.json`)

```json
{
  "winner": "A",
  "reasoning": "Output A provides a complete, production-ready WebMCP tool definition with Zod schema validation, readOnlyHint flags, and automatic unregistration on unmount. Output B used deprecated window properties and omitted cleanup.",
  "rubric": {
    "A": {
      "content": {
        "correctness": 5,
        "completeness": 5,
        "accuracy": 5
      },
      "structure": {
        "organization": 4,
        "formatting": 5,
        "usability": 5
      },
      "content_score": 5.0,
      "structure_score": 4.7,
      "overall_score": 9.7
    },
    "B": {
      "content": {
        "correctness": 3,
        "completeness": 3,
        "accuracy": 2
      },
      "structure": {
        "organization": 3,
        "formatting": 4,
        "usability": 3
      },
      "content_score": 2.7,
      "structure_score": 3.3,
      "overall_score": 6.0
    }
  },
  "output_quality": {
    "A": {
      "score": 9.7,
      "strengths": [
        "Uses current useWebMCP hook with proper schema",
        "Includes readOnlyHint for non-mutating search",
        "Handles unmount lifecycle properly"
      ],
      "weaknesses": ["Minor: could add explicit TypeScript generic for response"]
    },
    "B": {
      "score": 6.0,
      "strengths": ["Valid JSX rendering", "Basic state handling"],
      "weaknesses": [
        "References deprecated navigator.modelContext",
        "Omits readOnlyHint configuration",
        "Missing cleanup on component unmount"
      ]
    }
  },
  "expectation_results": {
    "A": {
      "passed": 3,
      "total": 3,
      "pass_rate": 1.0,
      "details": [
        { "text": "Uses useWebMCP hook", "passed": true },
        { "text": "Includes readOnlyHint", "passed": true },
        { "text": "No deprecated navigator.modelContext", "passed": true }
      ]
    },
    "B": {
      "passed": 1,
      "total": 3,
      "pass_rate": 0.33,
      "details": [
        { "text": "Uses useWebMCP hook", "passed": false },
        { "text": "Includes readOnlyHint", "passed": false },
        { "text": "No deprecated navigator.modelContext", "passed": false }
      ]
    }
  }
}
```

---

## Guidelines

- **Stay Blind**: Never attempt to deduce which skill version produced which output. Judge purely on output substance.
- **Be Specific**: Quote concrete code blocks, parameters, and architectural choices.
- **Be Decisive**: Pick a clear winner unless outputs are functionally indistinguishable.
- **Substance Over Style**: Thorough correctness and safety outweigh aesthetic brevity.
- **Handle Edge Cases**: If both outputs fail, select the one that fails less catastrophically. If both are excellent, select the one with superior ergonomics.
