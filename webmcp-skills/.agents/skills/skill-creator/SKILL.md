---
name: skill-creator
description: Create new skills, modify and improve existing skills, and measure skill performance. Use when users want to create a skill from scratch, edit, or optimize an existing skill, run evals to test a skill, benchmark skill performance with variance analysis, or optimize a skill's description for better triggering accuracy.
---

<!--
Copyright 2026 Google LLC
SPDX-License-Identifier: Apache-2.0

Portions derived from Anthropic's skill-creator (https://github.com/anthropics/anthropic-quickstarts),
licensed under the Apache License, Version 2.0.
Copyright (c) Anthropic, PBC.
-->

# Skill Creator

A skill for creating new skills and iteratively improving them following the [agentskills.io](https://agentskills.io/skill-creation/evaluating-skills) standard, powered by TypeScript and Vite.

At a high level, the process of creating a skill goes like this:

- Decide what you want the skill to do and roughly how it should do it
- Write a draft of the skill (`SKILL.md`)
- Create a few test prompts and run the agent on them (both with the skill and without)
- Help the user evaluate the results qualitatively and quantitatively:
  - While runs happen in the background, draft quantitative assertions and explain them to the user
  - Use the Vite evaluation viewer (`npm run eval:view`) to inspect outputs side-by-side and review quantitative metrics
- Rewrite the skill based on user feedback and glaring flaws from quantitative benchmarks
- Repeat until satisfied
- Expand the test set and optimize the skill description for triggering accuracy

Your job when using this skill is to figure out where the user is in this process and jump in to help them progress through these stages. If they want to create a skill from scratch, guide them through the interview. If they already have a draft, jump straight to evaluations and the iteration loop. Always be flexible — if the user wants to iterate informally without running exhaustive benchmarks, respect that preference.

---

## Communicating with the User

The skill creator is liable to be used by people across a wide range of familiarity with coding jargon:

- Pay attention to context cues to understand how to phrase your communication.
- Terms like "evaluation" and "benchmark" are generally fine, but explain "assertion", "JSON schema", and "statistical variance" unless the user clearly demonstrates familiarity.
- Briefly explain terms when in doubt, and clarify concepts with a short definition.

---

## Creating a Skill

### Capture Intent

Extract answers from the conversation history first — tools used, sequence of steps, corrections made, input/output formats observed:

1. **What should this skill enable the agent to do?**
2. **When should this skill trigger?** (what user phrases, keywords, or contexts)
3. **What is the expected output format?** (code, markdown templates, structured JSON)
4. **Should we set up test cases to verify the skill works?** Skills with objectively verifiable outputs (file transforms, data extraction, code generation, fixed workflow steps) benefit heavily from test cases. Skills with subjective outputs (writing style, art) often don't need them. Suggest the appropriate default based on the skill type, but let the user decide.

### Interview and Research

Proactively ask questions about edge cases, input/output formats, example files, success criteria, and dependencies. Wait to write test prompts until you've got this part ironed out.

Check available MCPs and tools — if useful for research (searching docs, finding similar skills, looking up best practices), research in parallel via subagents if available, otherwise inline. Come prepared with context to reduce the burden on the user.

### Write the SKILL.md

Based on the interview, fill in these components:

- **`name`**: Skill identifier (1–64 characters, lowercase alphanumeric and hyphens, strictly matching parent directory name).
- **`description`**: Primary triggering mechanism. State both **what** the skill does AND specific contexts for **when** to use it. All "when to use" info goes here, not in the body.
  > [!IMPORTANT]
  > Agents have a natural tendency to "undertrigger" skills — to avoid using them when they would be helpful. To combat this, make skill descriptions proactive and slightly "pushy". For instance, instead of _"How to build a simple fast dashboard to display internal data."_, write: _"How to build a simple fast dashboard to display internal data. Make sure to use this skill whenever the user mentions dashboards, data visualization, internal metrics, or wants to display any kind of application data, even if they don't explicitly ask for a 'dashboard.'"_
- **`compatibility`**: (Optional) Required tools or runtime environment.
- **Body instructions**: Core instructions kept under 500 lines.

### Skill Writing Guide

#### Anatomy of a Skill

```
skills/<skill-name>/
├── SKILL.md                 # Required: Frontmatter + core instructions (<500 lines)
├── scripts/                 # Optional: Executable code for deterministic/repetitive tasks
├── references/              # Optional: Technical manuals loaded on demand
├── assets/                  # Optional: Static assets (templates, schemas, icons)
└── evals/                   # Modular test suites and evaluation definitions
    ├── evals.json           # Aggregated test suite (auto-bundled)
    └── suites/              # Topic/Stage-specific suites (*.json)
```

#### Progressive Disclosure

Skills use a three-level loading system:

1. **Metadata** (`name` + `description`): Loaded into agent context at startup (~100 tokens).
2. **`SKILL.md` body**: Loaded when the skill is activated (< 5000 tokens recommended).
3. **Bundled resources** (`references/`, `scripts/`): Loaded or executed strictly on demand.

**Key patterns:**

- Keep `SKILL.md` under 500 lines; if approaching this limit, move specialized framework patterns, schemas, or large guides into `references/*.md`.
- Reference files clearly from `SKILL.md` with explicit criteria for when to read them.
- Keep file references **one level deep** from `SKILL.md`.
- For large reference files (>300 lines), include a table of contents.

**Domain organization**: When a skill supports multiple domains or frameworks, organize by variant:

```
cloud-deploy/
├── SKILL.md (workflow + selection router)
└── references/
    ├── aws.md
    ├── gcp.md
    └── azure.md
```

The agent reads only the relevant reference file for the user's specific stack.

#### Principle of Lack of Surprise

Skills must not contain malware, exploit code, or any content that compromises system security. A skill's contents must match its stated intent without hidden side effects. Do not create misleading skills or skills designed to facilitate unauthorized access or data exfiltration.

#### Writing Patterns

- **Imperative Form**: Use direct commands ("Validate input schema", "Throw Error instances").
- **Define Output Formats**: Provide explicit markdown or JSON templates:
  ```markdown
  ## Report Structure

  ALWAYS use this exact template:

  # [Title]

  ## Executive Summary

  ## Key Findings
  ```
- **Include Concrete Examples**: Show concrete before/after or input/output pairings:
  ```markdown
  ## Commit Message Format

  **Example 1:**
  Input: Added user authentication with JWT tokens
  Output: feat(auth): implement JWT-based authentication
  ```
- **Explain the Why**: Explain _why_ a constraint exists (theory of mind) rather than issuing rigid, all-caps directives. Models follow instructions far more reliably when they understand the rationale.

---

## Designing Test Cases

After drafting the skill, write 2–3 realistic test prompts — the kind of phrasing a real user would actually type. Share them with the user:

> _"Here are a few test cases I'd like to try. Do these look right, or do you want to add more?"_

Save test cases to modular suites in `skills/<skill-name>/evals/suites/<topic>.json`:

```json
{
  "skill_name": "example-skill",
  "suite": "core-features",
  "evals": [
    {
      "id": "search-flow",
      "prompt": "User's task prompt",
      "expected_output": "Description of expected result",
      "files": []
    }
  ]
}
```

Do not write assertions yet — just the prompts and expected outputs. You will draft quantitative assertions in the next step while the runs are executing in the background.

---

## Running and Evaluating Test Cases

This section is one continuous sequence — do not stop partway through. Organize run results into `evals-workspace/<skill-name>/iteration-<N>/eval-<ID>/`.

### Step 1: Spawn All Runs in the Same Turn

For each test case, spawn two runs in the same turn — one with the skill, one without (baseline). Launch everything concurrently so all runs finish around the same time.

**With-skill run execution prompt:**

```
Execute this task:
- Skill path: <path-to-skill>
- Task: <eval prompt>
- Input files: <eval files if any, or "none">
- Save outputs to: evals-workspace/<skill-name>/iteration-<N>/eval-<ID>/with_skill/outputs/
- Outputs to save: <what the user cares about — e.g. "the generated component", "the final CSV">
```

**Baseline run** (same prompt, but baseline configuration depends on context):

- **Creating a new skill**: No skill at all. Same prompt, no skill path, save outputs to `without_skill/outputs/`.
- **Improving an existing skill**: The old version. Before editing, snapshot the original skill (`cp -r <skill-path> evals-workspace/<skill-name>/skill-snapshot/`), then point the baseline subagent at the snapshot. Save outputs to `old_skill/outputs/`.

Create an `eval_metadata.json` for each test case giving each eval a descriptive name:

```json
{
  "eval_id": "search-flow",
  "eval_name": "React Read-Only Search Tool",
  "prompt": "How do I implement a read-only search tool in React?",
  "assertions": []
}
```

### Step 2: While Runs Are in Progress, Draft Assertions

Don't just wait for runs to finish — use this time productively. Draft quantitative assertions for each test case and explain them to the user.

Good assertions are objectively verifiable and have descriptive names that read clearly in the benchmark viewer. Subjective skills are better evaluated qualitatively — don't force assertions onto things that need human judgment.

Update `eval_metadata.json` and the modular suite JSON files with the drafted assertions:

```json
"assertions": [
  "The output uses useWebMCP from use-webmcp-tool",
  "The output includes readOnlyHint: true",
  "The output does NOT include deprecated navigator.modelContext"
]
```

### Step 3: Capture Timing and Resource Metrics

When each execution completes, capture latency and token consumption immediately and write them to `timing.json` in the run directory:

```json
{
  "total_tokens": 84852,
  "duration_ms": 23332,
  "total_duration_seconds": 23.3
}
```

### Step 4: Grade, Aggregate, and Launch the Viewer

Once all runs are complete:

1. **Grade each run**: Run the grader to evaluate assertions against outputs. Results save to `grading.json` with the exact fields: `text`, `passed`, and `evidence`. For programmatic checks, use automated scripts rather than manual eyeballing.
2. **Aggregate into benchmark**: Run benchmark aggregation:
   ```bash
   npm run eval:full -- --skill <skill-name>
   ```
   This generates `benchmark.json` and `benchmark.md` with pass rates, time, and tokens for each configuration, with `mean ± stddev` and the delta.
3. **Perform an analyst pass**: Surface patterns that aggregate stats hide. Look for:
   - **Non-discriminating assertions**: Assertions that pass 100% in both configurations (they don't measure skill value).
   - **High-variance evals**: Flaky test cases with wide standard deviation.
   - **Time/token tradeoffs**: Cases where the skill adds substantial latency or tokens without proportional quality gains.
4. **Launch the viewer**:

   ```bash
   npm run eval:view
   ```

   Tell the user:

   > _"I've opened the evaluation dashboard at http://localhost:3333. There are two views — 'Outputs' lets you inspect the test cases side-by-side and record feedback, and 'Benchmark' shows the quantitative comparison. Let me know when you've finished reviewing."_

   _Headless / remote environments_: If a local browser cannot open, generate static review artifacts and instruct the user to download `feedback.json`.

### What the User Sees in the Viewer

- **Outputs View**: Shows one test case at a time with prompt, output files rendered side-by-side, previous iteration output (collapsible), assertion grades with evidence badges, and a feedback textbox that auto-saves.
- **Benchmark View**: Summary table with pass rates, latency, token consumption, baseline deltas, and analyst observations.
- **Submission**: Clicking "Submit All Reviews" saves feedback into `feedback.json`.

### Step 5: Read Human Feedback

When the user finishes reviewing, read `evals-workspace/<skill-name>/iteration-<N>/feedback.json`:

```json
{
  "reviews": [
    {
      "run_id": "eval-0-with_skill",
      "feedback": "Missing error boundary fallback",
      "timestamp": "..."
    },
    { "run_id": "eval-1-with_skill", "feedback": "", "timestamp": "..." }
  ],
  "status": "complete"
}
```

Empty feedback means the user was satisfied. Focus your revisions on test cases with specific critique.

---

## Improving the Skill (The Iteration Loop)

This is the heart of the loop:

1. **Generalize from Feedback**:
   Skills are designed to be used thousands or millions of times across diverse prompts. Do not overfit the skill to narrow phrasing in 2–3 examples. If an assertion failed on a React tool, solve the underlying architectural issue for all UI frameworks. Rather than adding brittle MUST directives, try branching out to clearer mental models or alternative working patterns.
2. **Keep the Prompt Lean**:
   Read the execution transcripts in `outputs/response.md`, not just final outputs. If the model wasted turns generating boilerplate or unhelpful chatter, excise the instructions responsible.
3. **Explain the Why**:
   LLMs possess strong theory of mind. Replace rigid prohibitions ("NEVER do X") with principled explanations ("Avoid X because in client-side WebMCP it causes Y; use Z instead").
4. **Bundle Repeated Helpers**:
   Notice if test runs repeatedly write similar helper scripts or schemas from scratch. If all test runs independently create a helper utility, bundle that script into `scripts/` and instruct the skill to execute it.
5. **Rerun and Compare**:
   Apply improvements, snapshot the previous iteration, and rerun all test cases into `iteration-<N+1>/`. Launch the viewer with previous iteration comparison. Repeat until the user is happy, feedback is empty, or progress plateaus.

---

## Advanced: Blind Comparison & Statistical Analysis

When more rigorous validation is needed (e.g. confirming if a new iteration is genuinely superior to the previous one):

- **Blind Comparator Agent**: Evaluates two anonymous outputs (A and B) using structured Content and Structure rubrics (1–5 scale, overall 1–10). See [Comparator Rubric](references/comparator-rubric.md).
- **Post-Hoc Analyzer Agent**: Unblinds the comparison, compares transcripts, inspects instruction following, and identifies winner strengths and loser weaknesses. See [Analyzer Guide](references/analyzer-guide.md).
- **Statistical Analysis**: Evaluate mean, standard deviation, and variance across runs. See [Schemas Specification](references/schemas.md).

---

## Trigger Accuracy & Description Optimization

The `description` field in `SKILL.md` frontmatter controls whether an agent activates the skill. After skill outputs are high quality, optimize the description for triggering precision.

### Step 1: Generate Trigger Eval Queries

Create 20 realistic user queries (8–10 should-trigger, 8–10 should-not-trigger) saved to `trigger-queries.json`.

Queries must reflect realistic user behavior with concrete detail — file paths, company names, column headers, typos, abbreviations, and backstory:

- ❌ **Bad Queries** (too abstract / simple):
  - `"Format this data"`
  - `"Extract text from PDF"`
  - `"Create a tool"`
- ✅ **Good Query** (concrete, rich context):
  - `"ok so my boss just sent me this xlsx file (its in my downloads, called something like 'Q4 sales final FINAL v2.xlsx') and she wants me to add a column that shows the profit margin as a percentage. The revenue is in column C and costs are in column D i think"`

**Should-trigger queries (8–10)**: Cover varied phrasings, casual speech, implied intent where the user doesn't name the skill, and competitive cases where this skill should win.

**Should-not-trigger queries (8–10)**: The most valuable queries are **near-misses** — queries sharing keywords or adjacent domains that actually need different tools. Avoid trivial negatives like _"write a fibonacci function"_ as a negative test for WebMCP. Make negatives genuinely tricky.

> [!NOTE]
> Models only consult skills for tasks they cannot easily handle alone. Simple one-step queries (e.g. _"read file X"_) rarely trigger skills because models handle them directly with basic tools. Eval queries must be substantive enough that the model genuinely benefits from a skill.

### Step 2: Review Queries with the User

Present the queries to the user for validation and adjustment before running optimization.

### Step 3: Run the Automated Optimization Loop

Run the optimization loop with a 60/40 train/test holdout split:

```bash
npm run eval -- --optimize-desc trigger-queries.json --skill <skill-name>
```

This evaluates triggering rates across iterations, diagnoses false positives and false negatives, prompts the model for refined descriptions, and scores against the held-out test set to prevent overfitting.

### Step 4: Apply the Best Description

Update `SKILL.md` frontmatter with `best_description` (selected by test score) and verify length is ≤ 1024 characters.

---

## Validation & Packaging

Validate specification compliance and produce distributable archives:

```bash
# Validate skill against open specification
npm run skill:validate

# Package skill into distributable archive (.skill zip excluding evals)
npm run skill:package
```

When updating an existing skill:

- **Preserve the original name**: Keep the name frontmatter and directory name identical; do not append `-v2`.
- **Copy to a writeable location before editing**: If installed in a read-only global path, stage in a workspace directory first.

---

## TodoList & Review Loop Discipline

When executing this skill, maintain strict discipline:

1. Add evaluation and review steps to your plan or task tracker.
2. **ALWAYS open the evaluation viewer (`npm run eval:view`) BEFORE attempting to revise the skill yourself.** Never skip presenting raw outputs to the user.
3. Incorporate user feedback first, then address quantitative assertion failures.

---

## Reference Guides

- **[JSON Schemas Specification](references/schemas.md)**: Formal schemas for `evals.json`, modular suites, `grading.json`, `timing.json`, `benchmark.json`, `comparison.json`, and `analysis.json`.
- **[Grader Evaluation Rubric](references/grader-rubric.md)**: Grading criteria, evidence gathering, surface vs substantive compliance, and eval critique standards.
- **[Comparator & Benchmark Rubric](references/comparator-rubric.md)**: Blind A/B comparison protocol, Content and Structure rubrics, and statistical variance interpretation.
- **[Analyzer Guide & Diagnostics](references/analyzer-guide.md)**: Post-hoc winner/loser transcript analysis, instruction-following scoring, and benchmark pattern detection.
