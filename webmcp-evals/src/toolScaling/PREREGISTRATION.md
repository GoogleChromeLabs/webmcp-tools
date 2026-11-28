# Pre-Registered Protocol: WebMCP Tool-Count Scaling Study (#422)

**Date Frozen:** 2026-11-28  
**Target Issue:** `GoogleChromeLabs/webmcp-tools#422`  
**Pinned Repo Commit:** `f3faa835f3fdeab42e41b055209d6954b192f653`  
**Scope:** Single-step evaluation of website WebMCP tool catalogues against a Gemini model (`FunctionCallingMode.AUTO`), using an isolated runner that avoids touching `PR #659` and `PR #665` files.

## 1. Experimental Matrix (MVP v2.4)

- **Stage 1 Micro-Pilot (Technical Acceptance Only):** `N ∈ {1, 5, 40, 100, 128, 150}`, 1 query each (`6` calls) + `20` `countTokens` quota probe calls.
- **Stage 2 Natural Scaling Arm:** `N ∈ {1, 5, 10, 20, 40, 50, 100}`.
  - `N = 1`: 1 shared cell (`none` distractor).
  - `N ∈ {5, 10, 20, 40, 50, 100}`: 2 distractor types (`orthogonal` vs. `domain-adjacent`).
  - Total cells: `1 + (6 × 2) = 13` cells.
  - Intents per cell: `20` fixed human-reviewed intents (`16` positive + `4` abstention `expectedCall: null`).
  - Independent distractor draws per cell: `3` seeded draws (`60` trials/cell).
  - Natural scaling calls: `13 × 20 × 3 = 780` calls.
- **Stage 2 Verbosity Control (`N = 20`):**
  - Reuses the concise `N = 20` natural-scaling baseline (`orthogonal` and `domain-adjacent`), adding `2 × 20 × 3 = 120` verbose-schema calls.
- **Total MVP Generation Budget:** `780 + 120 = 900` generation calls (before bounded retries).

## 2. Pre-Registered Definition of an "Accuracy Cliff"

To prevent post-hoc threshold tuning after viewing results, an **accuracy cliff** is declared for a distractor arm only if **either**:

1. **CI-Separated Drop:** Top-1 exact selection accuracy at `N` drops by **>= 10 percentage points** relative to `N = 1`, AND their **95% Wilson confidence intervals do not overlap**; **OR**
2. **Monotonic Step Degradation:** Top-1 exact selection accuracy drops across **at least two consecutive `N` steps** totaling **>= 10 percentage points** below `N = 1` with non-overlapping 95% Wilson CIs at the upper `N`.

If neither condition is met up to `N = 100`, the study **explicitly reports a null accuracy-cliff finding** alongside measured token, cost, and latency scaling.

## 3. Explicit Limitations (Always Reported)

- **Single-Step Only:** Multi-turn tool chaining is out of scope for v1 (`webmcp-tools#197` tracks multi-turn eval support).
- **Model Scope:** Primary study uses one pinned Gemini Flash model (`modelVersion` logged per call); optional Flash-Lite replication is secondary.
- **Indicative Latency:** Free-tier client-observed `p50`/`p95` latency reflects shared queueing and network jitter, not server-side TTFT.
- **Heuristic Reference:** Lighthouse `> 40` tools warning (`GoogleChrome/lighthouse#17221`) and Chrome's `30/150/500/1500` character guidelines are evaluated as heuristics/recommendations, not API hard limits.
