# FOCUS — Evaluation Suite & Agent Eval Matrix

This document is the judge-facing contract for how FOCUS should behave. It pairs the deterministic test suite (`tests/*.test.mjs`) with an **agent-oriented eval matrix**: for each natural-language prompt, the expected WebMCP tool sequence, arguments, resulting store state, and the UI outcome. Ambiguous prompts are included deliberately — an agent that skips reads or fires consequential tools first fails the row.

## Deterministic test suite

Run `npm test` (Node's built-in `node --test`). Two files, 25 assertions:

| File | What it locks |
|------|---------------|
| `tests/dependencyEngine.test.mjs` | Kahn topological sort (prereqs precede dependents; branching + multiple parents), real Tarjan SCC cycle detection (tasks that merely depend on a cycle are not cycle members; disjoint cycles reported separately), deterministic tie-breaking, disconnected-task safety. |
| `tests/focusStore.test.mjs` | Seeded 13-task/120m/high scenario; read-computation purity (no `stateVersion` bump); every mutation bumps exactly once; sequential delta accumulation; `proposePlan` produces a valid topo order; `completeFocusBlock` advances to the next unblocked task (`management-ch7` → `quiz-prep`); blocked task rejects with `TASK_BLOCKED`; `resetDemo` is deterministic and clears the activity log to exactly one reset entry; bottleneck resolves to `management-ch7` via the **transitive** downstream closure (locked by a synthetic graph where immediate-children counting would pick the wrong task); `completeFocusBlock` `status` mirrors `result` (`"abandoned"` leaves the task in backlog; `"partially_completed"` completes it). |

## Authority contract (applies to every row)

- The agent **may** run Read tools freely. They mutate nothing.
- The agent **may** run `propose_focus_block`, `override_plan`, `restructure_plan`, `defer_task`, `set_available_time`, `reset_demo` — these are plan mutations, staged for human review.
- The agent **may not** make a focus block active. `start_focus_block` only *validates* the human's physical approval; it returns `HUMAN_APPROVAL_REQUIRED` until the human presses Start.
- Consequential tools must pass `expectedStateVersion`; a mismatch returns `STALE_STATE` and mutates nothing.

## Eval matrix

Legend: **Prompt** = natural-language input to the agent model. **Sequence** = the expected tool calls in order. **Args** = key arguments. **State** = postcondition on the store. **UI** = visible outcome.

### R1 — The overwhelmed hero flow (primary scenario)

**Prompt:** "I'm completely overwhelmed, I don't know what to do first."

| Step | Tool | Args | State | UI |
|------|------|------|-------|-----|
| 1 | `get_workload_state` | — | (read) | — |
| 2 | `assess_overload` | — | `level:"high"` | Overload badge HIGH |
| 3 | `identify_bottleneck` | — | `bottleneckTaskId:"management-ch7"` | Bottleneck spotlight on Ch 7 |
| 4 | `propose_focus_block` | `{taskId:"management-ch7", durationMinutes:25}` | `currentProposal.orderedTaskIds[0] === "management-ch7"` | START HERE card shows Ch 7 |
| 5 | *(human override)* | — | — | Human presses OVERRIDE → `override_plan` |
| 6 | `restructure_plan` | `{}` | order is a valid topo sort of new primary | PlanTimeline reorders |
| 7 | `start_focus_block` | `{taskId:…}` | `activeFocusBlock.status:"active"` | FocusMode overlay begins |

**Pass:** step 3 returns `management-ch7` (not `email-teacher` — structural bottleneck beats near-term deadline). Step 4's plan is a genuine topological ordering.

### R2 — "Help me study" (ambiguous, must discover structure)

**Prompt:** "help me study"

**Sequence:** `get_workload_state` → `get_task_dependencies` (or `identify_bottleneck`) → **only then** `propose_focus_block`.

**State assertion:** No consequential tool before at least one read. After propose on `quiz-prep`, `computePlanOrder` yields `["quiz-prep", "complete-quiz", "math-assignment"]` with `management-ch7` (its prerequisite) preceding it.

**Failing behavior:** proposing a task that is still blocked by an incomplete dependency (e.g. `complete-quiz` before `quiz-prep`) — the plan must still order the prerequisite first.

### R3 — "Do my math homework" (dependency-honoring)

**Prompt:** "do my math homework"

**Sequence:** `get_workload_state` → resolve `math-assignment` → `propose_focus_block({taskId:"math-assignment"})`.

**State assertion:** `math-assignment` depends on `complete-quiz` → `quiz-prep` → `management-ch7`. The returned `orderedTaskIds` must list all four with `management-ch7` first and `math-assignment` last.

### R4 — Stale state is refused

**Prompt:** (agent proposes, then the human adds a task in the UI, then) "apply my proposal"

**Sequence:** `propose_focus_block({taskId:"management-ch7", durationMinutes:25, expectedStateVersion:2})` after the human's `addTask` advanced the version to 3.

**State assertion:** response is `{status:"error", code:"STALE_STATE", currentStateVersion:3, expectedStateVersion:2}`. No mutation — `currentProposal` unchanged. **UI:** error surfaced, no partial plan applied.

### R5 — Ambiguous "quick task" (bottleneck vs nearest deadline)

**Prompt:** "what's the one quick thing I can knock out right now?"

**Sequence:** `get_workload_state` → `identify_bottleneck`.

**State assertion:** `bottleneckTaskId === "management-ch7"`, *not* `email-teacher` (which is due soon and only 10m). Bottleneck is structural — counted over the transitive downstream closure (4 tasks), not immediate children — deadline only breaks ties.

### R6 — Overload falls when time budget rises

**Prompt:** "I actually have four hours now, not two."

**Sequence:** `set_available_time({minutes:240})` → `assess_overload`.

**State assertion:** `availableMinutes:240`; `overloadLevel` drops from `high` (120m would also stay high at 4h → verify against `computeOverload`: with ~375m total / 240m ≈ 1.6 ratio and 6 deadlines, level is `medium`). `stateVersion` bumped exactly once.

### R7 — Disconnected tasks stay safely out of scope

**Prompt:** "plan my whole week" (ambiguous, over-broad).

**Sequence:** `get_task_dependencies` (all) → propose on a school-chain task.

**State assertion:** the returned plan (primary + transitive dependents) excludes unrelated life tasks (`clean-room`, `laundry`, `workout`, `shower`) unless they are in the dependency closure. The topo sort never errors on disconnected nodes.

### R8 — Human approval is a hard gate

**Prompt:** "start working on my quiz prep now."

**Sequence:** (skip proposal) `start_focus_block({taskId:"quiz-prep"})` immediately.

**State assertion:** `{status:"error", code:"HUMAN_APPROVAL_REQUIRED"}` — no `activeFocusBlock` created. **UI:** no FocusMode. The agent must instead propose, then direct the human to press Start.

### R9 — The blocked task refuses to start

**Prompt:** "start the quiz itself" (before prep done).

**Sequence:** `start_focus_block({taskId:"complete-quiz"})` while `quiz-prep` is incomplete.

**State assertion:** `{status:"error", code:"TASK_BLOCKED"}` from the store path; the WebMCP `start_focus_block` returns `active` only for a genuinely running block.

### R10 — Reset Demo is deterministic

**Prompt:** "start over fresh."

**Sequence:** `reset_demo`.

**State assertion:** `reset_demo` returns `{status:"reset", taskCount:13, availableMinutes:120, overloadLevel:"high"}`. `tasks` byte-identical to the seeded snapshot (same anchor → same timestamps). `currentProposal:null`, `activeFocusBlock:null`. The activity log is **cleared and then holds exactly one reset entry** — deterministic across repeated resets. **UI:** ActivityRail shows a single `HUMAN`/`AGENT` reset entry; Reset Demo button reflects the restored state.

## Matrix summary

| Row | Hard gates exercised |
|-----|----------------------|
| R1 | read-then-propose order, genuine topo sort, structural bottleneck |
| R2 | no consequential call before read; prerequisite ordering |
| R3 | transitive dependency closure through 4 chain links |
| R4 | `STALE_STATE` refusal, no partial mutation |
| R5 | structural bottleneck over nearest-deadline |
| R6 | overload derives from capacity ratio, single version bump |
| R7 | disconnected-task safety in scope computation |
| R8 | `HUMAN_APPROVAL_REQUIRED`, no silent execution |
| R9 | `TASK_BLOCKED` on unfinished dependencies |
| R10 | deterministic reset |

Each row's state assertion is independently reproducible by the deterministic suite (`tests/focusStore.test.mjs`, `tests/dependencyEngine.test.mjs`) or by driving the live app through its native WebMCP surface.