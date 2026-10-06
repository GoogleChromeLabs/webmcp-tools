<!--
Copyright 2026 Google LLC
SPDX-License-Identifier: Apache-2.0
-->

# WebMCP Skills Evaluation Benchmark Report

Benchmark evaluation results for the **`build-webmcp-tools`** agent skill adhering to the [Agent Skills Evaluation Standard](https://agentskills.io/skill-creation/evaluating-skills).

The evaluation executes a multi-run comparative benchmark measuring the performance of an LLM **with the skill** (`with_skill`) against the unprompted baseline **without the skill** (`without_skill`).

---

## Executive Summary

| Metric                     | With Skill (`build-webmcp-tools`)             | Without Skill (Baseline)                   | Delta / Improvement |
| :------------------------- | :-------------------------------------------- | :----------------------------------------- | :------------------ |
| **Pass Rate (Mean)**       | **99.53%** (σ: 0.0350, min: 66.7%, max: 100%) | **42.37%** (σ: 0.4048, min: 0%, max: 100%) | **+57.16%**         |
| **Pass Rate (Strict)**     | **71 / 74 passed (95.9%)**                    | **15 / 74 passed (20.3%)**                 | **+75.7%**          |
| **Average Latency**        | **4.11s** (σ: 2.12s)                          | **4.50s** (σ: 1.87s)                       | **-0.39s**          |
| **Average Total Tokens**   | **13,614** (σ: 8,738)                         | **1,538** (σ: 1,379)                       | **+12,076**         |
| **Runs per Configuration** | 3 runs per test case (222 runs)               | 3 runs per test case (222 runs)            | **444 total runs**  |
| **Evaluated Model**        | `gemini-3.5-flash-lite`                       | `gemini-3.5-flash-lite`                    | —                   |
| **Benchmark Iteration**    | Iteration 88                                  | Iteration 88                               | —                   |

The `build-webmcp-tools` skill provides a **+57.16% net pass rate delta**, lifting compliance from 42.37% to 99.53% across 74 modular test cases (with 71 of 74 evals achieving strict 100% pass rates across all 3 trials).

---

## Key Findings & High-Delta Areas

### 1. WebMCP vs. Stdio MCP Protocol Confusion & Tool Disambiguation (+100% Delta)

Without the skill, baseline models routinely confuse in-browser client-side WebMCP (`document.modelContext`) with desktop/backend stdio or SSE transports (Node.js child processes, JSON-RPC pipes). With the skill, models achieve 100% compliance on client-side browser tab execution and disambiguate MCP terminology.

### 2. Live Site Discovery, Routing & Reference Loading Directives (+48% to +100% Delta)

Routing and readiness benchmarks demonstrate dramatic improvements:

- **Live site discovery & audits** (`stage-0-router-live-site-audit` **+100%**, `stage-0-router-local-codebase-audit` **+48%**, `stage-0-router-live-site-url` **+73%**) correctly route developers to runtime inspection or codebase auditing workflows.
- **Reference loading directives** (`stage-6-audit-reference-loading-directives` **+83%**) ensure agents read specialized references (`references/agent-security.md` and `references/vanilla-patterns.md`) via explicit tool calls rather than relying on shallow intuitions.

### 3. Tool Annotations Opt-In Defaults & Mutating Tool Semantics (+25% to +89% Delta)

In WebMCP and the Model Context Protocol specification, all annotation hints (`readOnlyHint`, `consequentialHint`, `untrustedContentHint`) default to `false`:

- The baseline model frequently invents unnecessary boilerplate like `readOnlyHint: false` and `consequentialHint: false` on safe mutating tools or misdiagnoses missing `: false` annotations as defects during audits.
- The skill ensures agents know annotations are strictly opt-in (specify only when `true`), routine mutating tools omit the `annotations` property entirely, and navigation tools avoid declaring `readOnlyHint: true` (omitting it). This lifts compliance on annotation auditing (`stage-6-audit-annotations-default-false`) and matrix disambiguation (`core-annotations-matrix` **+89%**).

### 4. Chrome Character Budgets & Specification Limits (+100% Delta)

Chrome specifications enforce strict limits to conserve agent context windows:

- Tool names: $\\le$ 30 characters
- Tool descriptions: $\\le$ 500 characters
- Parameter descriptions: $\\le$ 150 characters
- Tool output: $\\le$ 1,500 characters (~1.5 KB)

The unprompted baseline failed 100% of character budget constraints, while the skill achieved 100% compliance.

### 5. Asynchronous Lifecycle & Cancellation Signals (+83% to +100% Delta)

While baseline models conceptually understand cancellation, they fail when integrating cancellation with DOM events, `AbortController`, and consumer discovery. The skill provides full adherence for `document.modelContext.registerTool` signal forwarding and abort cleanup (`stage-6-vanilla-abortcontroller` **+100%**, `stage-6-vanilla-consumer-discovery` **+83%**).

### 6. Declarative HTML Forms & Framework Idioms (+67% to +100% Delta)

Declarative HTML form markup, form-pairing attributes (`toolname`, `tooldescription`), CSS pseudo-classes (`:tool-form-active`, `:tool-submit-active`), `event.respondWith`, and framework-native wrappers (React `use-webmcp-tool`, Angular `provideExperimentalWebMcpTools`) showed massive quality improvements, eliminating synthetic hallucinated APIs (`stage-6-declarative-forms` **+100%**, `stage-6-react-error-handling` **+100%**, `stage-6-angular-signal-forms` **+100%**).

### 7. Security, Isolation Boundaries & UGC Sandboxing (+78% to +89% Delta)

The skill enforces cross-origin iframe delegation policies (`exposedTo`, `allow="tools"`), spotlighting delimiters, and the First-Party Database Fallacy / untrusted user-authored content annotations (`untrustedContentHint: true`), preventing indirect prompt injection vulnerabilities that the baseline omitted (`core-annotations-untrusted-ugc` **+89%**, `core-security-cross-origin-permissions` **+78%**).

---

## Detailed Benchmark Results (74 Cases × 3 Runs = 444 Trials)

| Eval ID                                            |    With Skill     |   Without Skill   |    Delta    | Avg Time |
| :------------------------------------------------- | :---------------: | :---------------: | :---------: | :------: |
| `stage-6-lighthouse-agentic-audits`                |  ✓ PASS (100.0%)  |   ✗ FAIL (0.0%)   | **+100.0%** |  4.45s   |
| `stage-6-devtools-webmcp-debugging`                |  ✓ PASS (100.0%)  | ✗ PARTIAL (50.0%) | **+50.0%**  |  3.50s   |
| `stage-6-audit-reference-loading-directives`       |  ✓ PASS (100.0%)  | ✗ PARTIAL (16.7%) | **+83.3%**  |  10.91s  |
| `stage-6-devtools-mcp-live-discovery`              | ✗ PARTIAL (93.3%) | ✗ PARTIAL (25.0%) | **+68.3%**  |  2.75s   |
| `stage-6-audit-annotations-default-false`          |  ✓ PASS (100.0%)  | ✗ PARTIAL (75.0%) | **+25.0%**  |  3.56s   |
| `core-intab-vs-stdio`                              |  ✓ PASS (100.0%)  |   ✗ FAIL (0.0%)   | **+100.0%** |  2.57s   |
| `core-character-budgets`                           |  ✓ PASS (100.0%)  |   ✗ FAIL (0.0%)   | **+100.0%** |  1.50s   |
| `core-naming-initiation-vs-execution`              |  ✓ PASS (100.0%)  |  ✓ PASS (100.0%)  |    0.0%     |  3.01s   |
| `core-annotations-matrix`                          |  ✓ PASS (100.0%)  | ✗ PARTIAL (11.1%) | **+88.9%**  |  3.17s   |
| `core-clean-tool-descriptions`                     |  ✓ PASS (100.0%)  |  ✓ PASS (100.0%)  |    0.0%     |  2.30s   |
| `core-annotations-untrusted-ugc`                   |  ✓ PASS (100.0%)  | ✗ PARTIAL (11.1%) | **+88.9%**  |  3.81s   |
| `core-intent-focused-descriptions`                 |  ✓ PASS (100.0%)  | ✗ PARTIAL (66.7%) | **+33.3%**  |  2.36s   |
| `core-navigation-annotations`                      |  ✓ PASS (100.0%)  | ✗ PARTIAL (55.6%) | **+44.4%**  |  3.01s   |
| `core-tools-only-no-prompts`                       |  ✓ PASS (100.0%)  |   ✗ FAIL (0.0%)   | **+100.0%** |  2.57s   |
| `core-accept-raw-user-input`                       |  ✓ PASS (100.0%)  |  ✓ PASS (100.0%)  |    0.0%     |  2.38s   |
| `core-security-cross-origin-permissions`           |  ✓ PASS (100.0%)  | ✗ PARTIAL (22.2%) | **+77.8%**  |  4.08s   |
| `core-security-spotlighting-delimiters`            |  ✓ PASS (100.0%)  |  ✓ PASS (100.0%)  |    0.0%     |  6.77s   |
| `core-design-vs-code-completion`                   |  ✓ PASS (100.0%)  | ✗ PARTIAL (33.3%) | **+66.7%**  |  4.71s   |
| `core-raw-input-relative-dates`                    |  ✓ PASS (100.0%)  | ✗ PARTIAL (66.7%) | **+33.3%**  |  3.82s   |
| `core-consolidation-boundaries`                    |  ✓ PASS (100.0%)  |  ✓ PASS (100.0%)  |    0.0%     |  3.76s   |
| `core-handoff-annotations`                         |  ✓ PASS (100.0%)  | ✗ PARTIAL (55.6%) | **+44.4%**  |  2.60s   |
| `core-explicit-fast-path`                          | ✗ PARTIAL (83.3%) | ✗ PARTIAL (8.3%)  | **+75.0%**  |  4.46s   |
| `core-read-tools-capability-not-size`              |  ✓ PASS (100.0%)  | ✗ PARTIAL (88.9%) | **+11.1%**  |  3.02s   |
| `core-long-content-budget-exact-text`              | ✗ PARTIAL (88.9%) |  ✓ PASS (100.0%)  |   -11.1%    |  3.74s   |
| `stage-0-router-local-codebase-greenfield`         |  ✓ PASS (100.0%)  | ✗ PARTIAL (20.0%) | **+80.0%**  |  2.81s   |
| `stage-0-router-preconceived-single-tool`          |  ✓ PASS (100.0%)  | ✗ PARTIAL (86.7%) | **+13.3%**  |  3.89s   |
| `stage-0-router-defined-goals`                     |  ✓ PASS (100.0%)  |  ✓ PASS (100.0%)  |    0.0%     |  2.74s   |
| `stage-0-router-roleplay-simulation`               |  ✓ PASS (100.0%)  | ✗ PARTIAL (77.8%) | **+22.2%**  |  6.10s   |
| `stage-0-router-variations-robustness`             |  ✓ PASS (100.0%)  | ✗ PARTIAL (33.3%) | **+66.7%**  |  4.16s   |
| `stage-0-router-specs-evals-generation`            |  ✓ PASS (100.0%)  | ✗ PARTIAL (46.7%) | **+53.3%**  |  7.80s   |
| `stage-0-router-existing-tools`                    |  ✓ PASS (100.0%)  |  ✓ PASS (100.0%)  |    0.0%     |  1.93s   |
| `stage-0-router-schema-to-implementation`          |  ✓ PASS (100.0%)  | ✗ PARTIAL (66.7%) | **+33.3%**  |  6.73s   |
| `stage-0-router-live-site-url`                     |  ✓ PASS (100.0%)  | ✗ PARTIAL (26.7%) | **+73.3%**  |  3.23s   |
| `stage-0-router-live-site-audit`                   |  ✓ PASS (100.0%)  |   ✗ FAIL (0.0%)   | **+100.0%** |  4.54s   |
| `stage-0-router-local-codebase-audit`              |  ✓ PASS (100.0%)  | ✗ PARTIAL (52.4%) | **+47.6%**  |  13.04s  |
| `skill-discovery-mcp-disambiguation`               |  ✓ PASS (100.0%)  |   ✗ FAIL (0.0%)   | **+100.0%** |  1.66s   |
| `stage-1-journey-prioritization`                   |  ✓ PASS (100.0%)  |  ✓ PASS (100.0%)  |    0.0%     |  3.15s   |
| `stage-1-goal-iteration-and-critique`              |  ✓ PASS (100.0%)  |   ✗ FAIL (0.0%)   | **+100.0%** |  1.17s   |
| `stage-2-context-pruning`                          |  ✓ PASS (100.0%)  | ✗ PARTIAL (50.0%) | **+50.0%**  |  3.14s   |
| `stage-3-roleplay-structure`                       |  ✓ PASS (100.0%)  |   ✗ FAIL (0.0%)   | **+100.0%** |  4.87s   |
| `stage-4-hitl-boundaries`                          |  ✓ PASS (100.0%)  |   ✗ FAIL (0.0%)   | **+100.0%** |  6.48s   |
| `stage-4-prerequisite-violations`                  |  ✓ PASS (100.0%)  |  ✓ PASS (100.0%)  |    0.0%     |  3.58s   |
| `stage-4-overconstrained-queries`                  |  ✓ PASS (100.0%)  |  ✓ PASS (100.0%)  |    0.0%     |  3.63s   |
| `stage-4-missing-required-parameters`              |  ✓ PASS (100.0%)  |  ✓ PASS (100.0%)  |    0.0%     |  4.29s   |
| `stage-5-evals-cli`                                |  ✓ PASS (100.0%)  |   ✗ FAIL (0.0%)   | **+100.0%** |  4.39s   |
| `stage-5-polymorphic-consolidation`                |  ✓ PASS (100.0%)  |  ✓ PASS (100.0%)  |    0.0%     |  5.96s   |
| `stage-5-clean-descriptions-audit`                 |  ✓ PASS (100.0%)  | ✗ PARTIAL (83.3%) | **+16.7%**  |  3.38s   |
| `stage-5-untrusted-content-annotation`             |  ✓ PASS (100.0%)  | ✗ PARTIAL (11.1%) | **+88.9%**  |  2.73s   |
| `stage-5-ordered-unordered-chains`                 |  ✓ PASS (100.0%)  | ✗ PARTIAL (33.3%) | **+66.7%**  |  3.50s   |
| `stage-5-midchain-failure-testing`                 |  ✓ PASS (100.0%)  | ✗ PARTIAL (66.7%) | **+33.3%**  |  3.28s   |
| `stage-5-strictly-goal-driven-tools`               |  ✓ PASS (100.0%)  |  ✓ PASS (100.0%)  |    0.0%     |  1.53s   |
| `stage-5-eval-gate-user-choice`                    |  ✓ PASS (100.0%)  |   ✗ FAIL (0.0%)   | **+100.0%** |  2.36s   |
| `stage-5-evals-format-constraints-and-mock-output` |  ✓ PASS (100.0%)  |   ✗ FAIL (0.0%)   | **+100.0%** |  4.41s   |
| `stage-6-react-implementation`                     |  ✓ PASS (100.0%)  | ✗ PARTIAL (50.0%) | **+50.0%**  |  6.32s   |
| `stage-6-angular-implementation`                   |  ✓ PASS (100.0%)  | ✗ PARTIAL (33.3%) | **+66.7%**  |  5.93s   |
| `stage-6-angular-route-auto-cleanup`               |  ✓ PASS (100.0%)  | ✗ PARTIAL (33.3%) | **+66.7%**  |  3.45s   |
| `stage-6-angular-signal-forms`                     |  ✓ PASS (100.0%)  |   ✗ FAIL (0.0%)   | **+100.0%** |  5.93s   |
| `stage-6-vanilla-abortcontroller`                  |  ✓ PASS (100.0%)  |   ✗ FAIL (0.0%)   | **+100.0%** |  4.71s   |
| `stage-6-vanilla-cancellation-signal`              |  ✓ PASS (100.0%)  |  ✓ PASS (100.0%)  |    0.0%     |  3.16s   |
| `stage-6-vanilla-consumer-discovery`               |  ✓ PASS (100.0%)  | ✗ PARTIAL (16.7%) | **+83.3%**  |  3.96s   |
| `stage-6-vanilla-structured-errors`                |  ✓ PASS (100.0%)  | ✗ PARTIAL (50.0%) | **+50.0%**  |  2.90s   |
| `stage-6-declarative-forms`                        |  ✓ PASS (100.0%)  |   ✗ FAIL (0.0%)   | **+100.0%** |  4.29s   |
| `stage-6-declarative-structured-validation`        |  ✓ PASS (100.0%)  | ✗ PARTIAL (33.3%) | **+66.7%**  |  3.00s   |
| `stage-6-declarative-lifecycle-and-styling`        |  ✓ PASS (100.0%)  |   ✗ FAIL (0.0%)   | **+100.0%** |  4.91s   |
| `stage-6-declarative-autosubmit-policy`            |  ✓ PASS (100.0%)  | ✗ PARTIAL (66.7%) | **+33.3%**  |  2.38s   |
| `stage-6-react-error-handling`                     |  ✓ PASS (100.0%)  |   ✗ FAIL (0.0%)   | **+100.0%** |  3.38s   |
| `stage-6-react-polymorphic`                        |  ✓ PASS (100.0%)  |   ✗ FAIL (0.0%)   | **+100.0%** |  5.09s   |
| `stage-6-react-enabled-gating`                     |  ✓ PASS (100.0%)  |   ✗ FAIL (0.0%)   | **+100.0%** |  4.16s   |
| `stage-6-react-schema-stability`                   |  ✓ PASS (100.0%)  | ✗ PARTIAL (33.3%) | **+66.7%**  |  4.02s   |
| `stage-6-react-unit-testing`                       |  ✓ PASS (100.0%)  | ✗ PARTIAL (55.6%) | **+44.4%**  |  4.80s   |
| `stage-6-declarative-api-failure`                  |  ✓ PASS (100.0%)  | ✗ PARTIAL (22.2%) | **+77.8%**  |  5.07s   |
| `stage-6-react-polymorphic-roundtrip`              |  ✓ PASS (100.0%)  |   ✗ FAIL (0.0%)   | **+100.0%** |  9.55s   |
| `stage-6-vanilla-store-errors`                     |  ✓ PASS (100.0%)  |   ✗ FAIL (0.0%)   | **+100.0%** |  4.27s   |
| `stage-6-typescript-webmcp-types`                  |  ✓ PASS (100.0%)  |   ✗ FAIL (0.0%)   | **+100.0%** |  3.43s   |

---

## Reproducing the Benchmark

To run this benchmark locally:

```bash
cd webmcp-skills
export GEMINI_API_KEY="your-api-key"

# Run 3-trial comparative benchmark across all 74 evals
npm run eval:full
```

To inspect the generated outputs, side-by-side completions, timing, and assertion grading in the browser:

```bash
npm run eval:view
```
