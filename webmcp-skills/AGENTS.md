<!--
Copyright 2026 Google LLC
SPDX-License-Identifier: Apache-2.0
-->

# webmcp-skills — Agent Guide

## Project Overview

`webmcp-skills` is a package of AI agent skills and evaluation tooling (under `webmcp-skills/` in the `webmcp-tools` repository) designed to help developers design, role-play, evaluate, audit, and implement [WebMCP (Web Model Context Protocol)](https://github.com/webmachinelearning/webmcp) tools into their web applications.

WebMCP is an emerging standard that allows web applications to expose client-side tools directly to in-browser AI agents via `document.modelContext`.

### Key Tenet

WebMCP runs **client-side in the browser tab on `document.modelContext`**. It is **not** a backend server protocol (like MCP over `stdio` or SSE) and does not rely on fragile DOM scraping or simulated clicking.

---

## Directory Structure

```
webmcp-skills/
├── skills/
│   └── build-webmcp-tools/          # Primary skill for the end-to-end WebMCP tool lifecycle
│       ├── SKILL.md                 # Main workflow: 6-stage lifecycle, core principles, review checklist
│       ├── references/              # Specialized technical guides
│       └── evals/                   # Modular evaluations conforming to agentskills.io
│           ├── evals.json           # Aggregated test suite (auto-generated)
│           ├── trigger-queries.json # Skill discovery trigger evaluation queries
│           ├── fixtures/            # Realistic sample app fixtures for file-reading evals
│           └── suites/              # Topic/Stage-specific test suites (*.json)
├── .agents/skills/
│   └── skill-creator/               # Meta-skill for authoring, evaluating & improving skills
├── src/
│   ├── evals/                       # TypeScript evaluation runner, grader & benchmark aggregator
│   └── eval-viewer/                 # Vite-based interactive eval review dashboard
├── evals-workspace/                 # Evaluation run outputs & benchmark iterations (gitignored)
├── package.json                     # Scripts & devDependencies (Vite, Vitest, TypeScript, Oxlint)
├── BENCHMARK.md                     # Comparative multi-trial evaluation benchmark report
├── NOTICE                           # Attribution for third-party Apache-2.0 derived works
├── AGENTS.md                        # This agent guide
└── README.md                        # Package documentation
```

---

## Development & Evaluation Commands

This package uses a native **TypeScript and Vite evaluation engine** (`src/evals/`) conforming to the [Agent Skills Evaluation Standard](https://agentskills.io/skill-creation/evaluating-skills).

### 1. Environment Setup

```bash
cd webmcp-skills
npm install
# Set your Gemini API key in .env (automatically loaded by the eval runner via dotenvy)
echo "GEMINI_API_KEY=your-gemini-api-key" >> .env
```

### 2. Running Evals & Tests

```bash
# Run unit tests for the runner, loader, and grader
npm run test:unit

# Run modular evaluations for all skills (always runs with_skill vs without_skill baseline delta)
npm test

# Run full comparative benchmark across all skills (defaults to 3 runs per configuration for variance analysis)
npm run eval:full

# Filter for specific tests by ID or substring regex (always runs with & without)
npm run eval -- --filter "react"

# Custom number of runs per configuration (e.g. 5 runs for deeper statistical distribution)
npm run eval -- --runs 5

# Target a specific skill directory (always runs with & without)
npm run eval -- --skill build-webmcp-tools

# Offline dry-run / schema validation (runs without API key, runs with & without)
npm run eval:dry-run

# Re-bundle modular suites into evals/evals.json
npm run eval:bundle

# Open interactive Vite evaluation viewer to review outputs & record feedback
npm run eval:view

# Limit model calls per run in the read_file agent loop (default: 8)
npm run eval -- --max-turns 4
```

### 3. How Eval Runs Execute (Progressive Disclosure)

Each run is a short tool-calling loop, not a single prompt, so evals measure whether the agent actually loads `references/`:

- The model receives a `read_file(path)` tool and may call it (several files per turn if it likes) for up to `--max-turns` turns (default 8). The last tool results carry a notice that the read limit is reached; if the model still calls tools on the final turn, the calls are declined and it is asked once more for a text answer.
- **Readable files per configuration**:
  - `with_skill`: `SKILL.md` is the system instruction; the model may read any file under the skill directory **except `evals/`** (which holds assertions), plus the eval's `files`.
  - `without_skill`: no system instruction; the model may read **only** the eval's `files`.
- **Eval `files`**: Paths (relative to the skill directory, e.g. `evals/fixtures/recipe-app/package.json`) are listed in the prompt and readable in both configurations. Use them to give the model a realistic codebase context.
- Absolute paths, `..` traversal, and symlinks escaping the skill directory are rejected.
- Each run records `turns` and `files_read` (saved as `agent.json` next to `timing.json`, shown in the viewer, and aggregated in `benchmark.json`).

---

## Eval-Driven Skill Development Workflow

When adding capabilities, fixing issues, or refining guidance in `SKILL.md` or `references/`:

1. **Reproduce via Evals First (TDD)**:
   - Before modifying skill prompts, add a test case in the appropriate `skills/<skill-name>/evals/suites/<topic>.json`.
   - Specify `id`, `prompt`, `expected_output`, and observable `assertions`.
   - Run `npm run eval -- --filter "<test-id>"` (which runs both `with_skill` and `without_skill` by default) and verify failure or the baseline gap.
2. **Implement Skill Changes**:
   - Update `skills/<skill-name>/SKILL.md` (Core Principles, Stage workflows, Review Checklist).
   - If relevant, add or update code patterns in `references/*.md`.
3. **Verify Compliance & Measure Delta (Mandatory Pre-Commit Gate)**:
   - **Always Run Both Configurations (With & Without Skill)**: Evaluations MUST ALWAYS run both `with_skill` and `without_skill` baselines. Never run single-sided ("with-only") evaluations. Comparing against an unprompted baseline is required to calculate value-add deltas and populate the side-by-side comparison in the evaluation viewer.
   - **Measure Value-Add Delta**: Always run `npm run eval -- --filter "<test-id>"` on new or modified evaluations to verify that `with_skill` demonstrates positive value-add over `without_skill`.
   - **Regression Verification**: Always run `npm test` across all evaluations and `npm run test:unit` across unit tests to confirm zero regressions before committing or presenting code changes as complete.
   - **Re-bundle**: Run `npm run eval:bundle` whenever test suites in `evals/suites/*.json` are added or updated.
   - **Inspect & Review**: Inspect runs and log human review notes using `npm run eval:view` when investigating failures.
4. **Pull Request Submission & Benchmark Transparency**:
   - **Include Full Benchmark Table in PR**: When opening a pull request for skill updates, evaluations, or test fixes, always include the complete evaluation benchmark results table (from `npm test` or `npm run eval:full`) in the PR description, along with targeted evaluation deltas.
   - **Regression Proof for Reviewers**: Transparently publishing the full benchmark table provides reviewers with immediate evidence that the entire evaluation suite was executed and that zero regressions occurred.

---

## Skill Authoring & Architecture Guidelines

Skills in this repository follow the open standard ([agentskills.io](https://agentskills.io/home)) supported by Antigravity, Cursor, and Gemini CLI. When authoring or maintaining skills:

1. **Specification Constraints (`agentskills.io`)**:
   - **`name`**: 1–64 characters, lowercase alphanumeric and hyphens only (`a-z`, `0-9`, `-`), no leading/trailing hyphens, no consecutive hyphens (`--`). **Must strictly match the parent directory name**.
   - **`description`**: 1–1,024 characters, non-empty. Write in **third person** and clearly state **what** the skill does and **when** it should be used. Include explicit trigger keywords to guide model selection during discovery.
   - **Body budget**: Keep `SKILL.md` under 500 lines (< 5,000 tokens). Move specialized references into `references/*.md`, keeping file references **one level deep** from `SKILL.md`.
2. **Progressive Disclosure Lifecycle**:
   - **Discovery phase**: At startup, agents load only skill `name` and `description` (~100 tokens).
   - **Activation phase**: When a task matches the description (or user types `/<skill-name>`), the agent reads `SKILL.md`.
   - **Execution phase**: The agent follows the instructions, loading reference files in `references/` on demand.
3. **Instruction Design Patterns**:
   - **Defaults Over Menus**: Pick a clear default recommendation with an escape hatch, rather than presenting multiple equal options that induce model choice paralysis.
   - **Gotchas Sections**: Document non-obvious traps and environment-specific constraints (e.g. `useWebMCP` gotchas). Agents learn more from concrete gotchas than from generic advice.
   - **Decision Trees & Stage Routing**: For multi-stage workflows, include an explicit router (such as Stage 0 Router) so agents jump directly to the relevant stage without linear friction.
   - **Checklists & Self-Validation Loops**: Provide structured checklists (like Stage 6 Review Checklist) and instruct the agent to validate outputs before concluding.
   - **Prescriptive Guidance**: Use direct, imperative rules and clear guardrails that models can evaluate deterministically.
4. **Reference Code Quality**:
   - All code snippets in `references/` must reflect accurate library signatures and production-ready conventions (e.g. valid `useWebMCP` imports from `use-webmcp-tool`, proper TypeScript types, and correct lifecycle management).

---

## Agent Skills Evaluation & Benchmark Standards

To maintain high skill quality and prevent regressions:

1. **Modular Suite Organization**:
   - Store test cases in modular JSON files under `skills/<skill-name>/evals/suites/<topic>.json`.
   - Keep test cases categorized by lifecycle stage or architectural topic.
   - Automated bundling generates the standard `evals/evals.json` for external tools.
2. **Hybrid Assertion Strategy**:
   - **Deterministic assertions**: Use specific phrases like `"The output does NOT include navigator.modelContext"` or `"The output includes readOnlyHint: true"` for immediate programmatic validation.
   - **File-read assertions**: Use exactly `"The agent read references/<file>.md"` or `"The agent did NOT read references/<file>.md"` to check reference loading deterministically against the run's `files_read`. Prefer these over assertions that the output _mentions_ a reference file. For `without_skill`, read-assertions about skill files are not graded (it cannot read them, so they would be automatic failures or passes); read-assertions about the eval's own `files` are graded in both configurations.
   - **Semantic assertions**: Evaluated by the model judge requiring concrete textual citations and evidence for a PASS.
3. **Mandatory Comparative Benchmarking (`benchmark.json`)**:
   - **Always run both configurations**: Every evaluation run MUST execute both `with_skill` and `without_skill` baselines to calculate statistical deltas across pass rates, token consumption, and latency. Single-sided ("with-only") runs without baselines are prohibited; evaluations must always run with and without the skill to demonstrate value-add and populate comparative dashboard panes.
   - **Configurable Multi-Trial Benchmarks**: The runner supports `--runs <N>` (or `-r <N>`) to repeat evaluations across multiple trials per configuration. All benchmark outputs (`benchmark.json`) record execution metadata including `runs_per_configuration`, `total_runs`, and executor model to enable rigorous variance analysis and detect flaky assertions.
4. **Zero-Regression Policy**:
   - All unit tests (`npm run test:unit`) and skill evaluations (`npm test`) must pass before submitting pull requests.

---

## Context Budgets & File Size Limits

When authoring or maintaining files in this repository, agents must adhere to Antigravity and agent runtime resource constraints:

1. **Rule File Cap (`AGENTS.md`)**:
   - **Per-File Cap (24 KB / 24,000 bytes)**: Rule files (`AGENTS.md`, `GEMINI.md`) are hard-capped at 24,000 bytes. Files exceeding this limit are truncated on line boundaries.
   - **No YAML Frontmatter**: Standalone `AGENTS.md` files do not support YAML frontmatter and are loaded unconditionally across the workspace and its subdirectories.
   - **Aggregate Rules Budget (20,000 tokens)**: Always-on and global rules share a dedicated 20,000-token rules budget (`defaultRulesBudget`). If active rules exceed this budget, they are demoted from full inline text to file path pointers.
2. **Skill Prompt Budget (`SKILL.md`)**:
   - `SKILL.md` is loaded directly as the `systemInstruction` in skill evaluations (`src/evals/`) and whenever an agent activates the skill.
   - Keep `SKILL.md` lean (well under 24 KB) to avoid context bloat, slow evaluation runs, or truncation.
   - Move framework-specific walkthroughs, testing harnesses, and lengthy code snippets into `references/*.md`, referencing them via relative markdown links.
