# FOCUS — Cognitive Command Center

> Turn overwhelm into one clear next action.

FOCUS is a WebMCP-native executive-function command center for moments of cognitive overload. It lets an AI agent inspect your live workload, propose a plan, accept human corrections, recompute the plan, and enter focused execution — all through typed, intent-level tools exposed directly by the application.

---

## Why WebMCP is the right fit

Cognitive overload is fundamentally a *state* problem. The user's tasks, deadlines, dependencies, and available time exist as a structured graph inside the application. A chatbot sitting beside a to-do list can't inspect this graph — it has no access to the dependency relationships, the bottleneck analysis, or the proposal state. WebMCP is the only bridge that gives the agent typed, structured access to this live application state.

Every tool FOCUS exposes is an *intent-level action* — not a UI primitive. The agent doesn't click buttons or fill forms. It calls `identify_bottleneck()` and receives the exact task that blocks the most downstream work, computed over the **transitive** closure of the dependency graph (direct and indirect dependents, not just immediate children). It calls `override_plan()` and the application recomputes the entire dependency chain.

## How it creates a better experience

Traditional productivity tools assume the user can already decide what to do next. That assumption breaks under overload. FOCUS changes the interaction from *user decides, uses tool to execute* to *agent proposes, human overrides, agent recomputes, human approves, execution begins*.

This is what human-agent collaboration actually looks like. The agent does the analysis and proposes. The human commands. No consequential action happens without consent.

## What people and agents can now do together

Before WebMCP, this workflow would have required brittle DOM scraping, serialized UI state, or a custom backend bridge. The agent couldn't inspect the dependency graph, couldn't detect staleness, couldn't receive structured error responses when its state was out of date.

Now an agent and human can negotiate a plan together in a tight loop:

1. Agent reads the live workload through `get_workload_state`
2. Agent assesses overload and identifies the bottleneck through `assess_overload` + `identify_bottleneck`
3. Agent proposes a focus block through `propose_focus_block`
4. Human overrides through `override_plan` — the agent recomputes dependencies via `restructure_plan`
5. Human physically approves in the UI — the agent then confirms via `start_focus_block`
6. Agent records the outcome through `complete_focus_block`
7. Any time, either side runs `reset_demo` to restore the seeded scenario deterministically — the activity log is cleared, then exactly one reset entry is appended

## Tool Surface & Data Schema

FOCUS registers **13 WebMCP tools** in two operation classes. Every read tool is marked `readOnlyHint: true` and backed by a *pure computation* — it never touches the store, mutates state, or bumps `stateVersion`. Every consequential tool accepts `expectedStateVersion` for stale-state detection, returns `stateVersion` in its response, and is attributed to the `agent` actor in the judge-visible activity trace.

### Read Tools (agent executes freely — never mutate state)

| Tool | Returns | Input Schema |
|------|---------|-------------|
| `get_workload_state` | `{ tasks[], availableMinutes, overloadLevel, totalActiveMinutes, currentProposal?, activeFocusBlock?, bottleneckTaskId?, stateVersion }` | `{}` |
| `get_task_dependencies` | `{ taskId, title, dependsOn, blockedTasks, stateVersion }` or `{ relationships[], stateVersion }` | `{ taskId? }` |
| `get_available_time` | `{ availableMinutes, defaultAvailableMinutes, windows[], stateVersion }` | `{}` |
| `assess_overload` | `{ level, taskCount, deadlineCount, availableMinutes, totalMinutes, capacityRatio, bottleneckTaskId, stateVersion }` | `{}` |
| `identify_bottleneck` | `{ bottleneckTaskId, task, downstreamChain[], stateVersion }` | `{}` |

### Consequential Tools (mutate state, attributed to the agent)

| Tool | Returns | Input Schema |
|------|---------|-------------|
| `set_available_time` | `{ status: "updated", availableMinutes, overloadLevel, capacity, stateVersion }` | `{ minutes: number, expectedStateVersion? }` |
| `propose_focus_block` | `{ status: "proposed", proposal, stateVersion }` | `{ taskId: string, durationMinutes: number, reason?, expectedStateVersion? }` |
| `override_plan` | `{ status: "override_applied", previousPrimaryTask, newPrimaryTask, orderedTaskIds[], stateVersion }` | `{ taskId: string, reason?, expectedStateVersion? }` |
| `restructure_plan` | `{ status: "restructured", previousOrder[], newOrder[], stateVersion }` | `{ expectedStateVersion? }` |
| `defer_task` | `{ status: "deferred", taskId, stateVersion }` | `{ taskId: string, expectedStateVersion? }` |
| `start_focus_block` | `{ status: "active", taskId, durationMinutes, startedAt, stateVersion }` or an error (below) | `{ taskId?, durationMinutes?, expectedStateVersion? }` |
| `complete_focus_block` | `{ status: result, completedTaskId, completedTaskTitle, result, elapsedMinutes, nextTask?, allDone, overloadLevel, activeCount, totalMinutes, stateVersion }` — `status` mirrors `result` verbatim: `"completed"`, `"partially_completed"`, or `"abandoned"` | `{ result: "completed"|"partially_completed"|"abandoned", expectedStateVersion? }` |
| `reset_demo` | `{ status: "reset", taskCount, availableMinutes, overloadLevel, stateVersion }` | `{}` |

### Error Response Schema

```json
{
  "status": "error",
  "code": "STALE_STATE",
  "message": "The workload has changed since your last read. Please re-assess before proposing changes.",
  "currentStateVersion": 5,
  "expectedStateVersion": 3
}
```

Error codes: `STALE_STATE` (state version mismatch), `TASK_NOT_FOUND` (unknown taskId), `NO_ACTIVE_PROPOSAL` (nothing to override/restructure), `NO_ACTIVE_BLOCK` (no running block to complete), `HUMAN_APPROVAL_REQUIRED` (the human hasn't pressed Start in the UI), `TASK_MISMATCH` (taskId ≠ active block), `TASK_NOT_ACTIVE` (task isn't in backlog), `TASK_BLOCKED` (unfinished dependencies), `EMPTY_TITLE` (blank task title).

## The plan is a real topological sort

The plan emitted by `propose_focus_block` is not a heuristic sequence. `computePlanOrder(taskId)` takes the primary task plus its **transitive dependents** (backlog only) and runs them through Kahn's algorithm in `dependencyEngine.js` — so prerequisites always precede dependents, branching and multiple parents are handled, and disconnected tasks are correctly left out of scope. Cycle detection is explicit — a real (iterative) Tarjan SCC pass finds strongly connected components, where a cycle is any SCC with more than one node or a single self-looped node; tasks that merely *depend on* a cycle are not reported as cycle members. Tie-breaking is deterministic (due date → priority → id). This is what makes `override_plan` + `restructure_plan` meaningful: the graph genuinely reorders rather than reshuffling a flat list.

## How WebMCP is implemented

FOCUS loads the WebMCP polyfill (`public/webmcp-polyfill.js`, copied from the shared polyfill at `webmcp-tools/demos/shared/webmcp-polyfill.js` for Vite compatibility) via a `<script>` tag in `index.html`, which also carries the `WebModelContextAccess` origin trial token. On page load, `main.jsx` imports `registerTools.js`, which calls `document.modelContext.registerTool()` for each of the 13 tools.

The application is built with **React 19 + Vite + Zustand 5**. The zustand store is a module-level singleton, imported statically (not dynamic import):

```js
import useFocusStore, { computeOverload, computeBottleneck, computePlanOrder } from "../store/focusStore.js";
const s = useFocusStore.getState();
```

Read tools call the pure module functions (`computeOverload`, `computeBottleneck`, `computePlanOrder`, `computeCapacity`) directly — those functions take an explicit `tasks` argument and never touch the store. Consequential tools call the store's mutating methods, each of which performs a **single `set()`** — bumping `stateVersion` exactly once — and then a separate non-bumping `logActivity()` for the AGENT/HUMAN trace.

### The authority boundary

The agent **analyzes and proposes**; the human **overrides, approves, and executes**. `start_focus_block` does not start a block unilaterally — it only *validates* that the human pressed Start in the UI, returning `active` when the block is genuinely running and `HUMAN_APPROVAL_REQUIRED` otherwise. No consequential plan is silently executed.

### The judge-visible activity trace

Every mutation logs into `activityLog` with an explicit `actor` — `agent` or `human` — shown reverse-chronologically in the **ActivityRail**. This is a product-quality, judge-visible record of the collaboration, not a developer console. The app's built-in pre-load preview (which fills the START HERE card before any agent connects) is labeled a **FOCUS recommendation** in the trace — explicitly distinct from an **agent proposal** via `propose_focus_block`. The agent remains the intended driver; the built-in preview exists so the UI demonstrates the full negotiation loop with or without one.

## State Schema

The zustand store holds:

```typescript
interface Task {
  id: string; title: string; priority: "critical"|"high"|"medium"|"low";
  status: "backlog"|"completed"|"deferred";
  estimatedMinutes: number; dueAt?: string; dependencies: string[];
  tags: string[];
}

interface PlanProposal {
  id: string; primaryTaskId: string; orderedTaskIds: string[];
  rationale: string[]; confidence: number; requiresApproval: boolean;
  durationMinutes: number; capacity: Capacity;
}

interface FocusBlock {
  id: string; taskId: string; durationMinutes: number;
  status: "active"|"completed"|"partially_completed"|"abandoned";
  startedAt?: string;
}

interface ActivityEntry {
  id: string; actor: "agent"|"human"; text: string;
  taskId: string|null; at: string;
}
```

## Seeded demo scenario

Deterministic and **never stale**: 13 tasks, ~375m of work against 120m available (deliberately overloaded). Deadlines are *relative* to a single load-time anchor (`demoTasks.js`'s `buildDemoTasks(now)`) — "due soon", "later today", "tonight", "tomorrow", "in 2–3 days", "no deadline" — so the scenario reads identically no matter when it is opened. The dependency graph has multiple chains and one obvious bottleneck: `management-ch7`, which transitively unlocks four downstream tasks (`quiz-prep`, `complete-quiz`, `pack-backpack`, `math-assignment`). **Reset Demo restores this exact state byte-for-byte** (same anchor, so identical timestamps).

## Architecture

```
focus/
├── public/
│   ├── webmcp-polyfill.js             # WebMCP polyfill (window.modelContext)
│   └── favicon.svg
├── src/
│   ├── App.jsx                        # Root layout — composes all components
│   ├── main.jsx                       # Entry — imports registerTools after polyfill
│   ├── components/
│   │   ├── TaskList/                  # Task rows, add/edit/defer, chain steps
│   │   ├── FocusCenter/               # Bottleneck spotlight + START HERE card
│   │   ├── PlanTimeline/              # Ordered sequence, before/after restructure
│   │   ├── FocusMode/                 # Full-screen focus overlay + timer
│   │   └── ActivityRail/              # Judge-visible AGENT/HUMAN activity trace
│   ├── data/
│   │   └── demoTasks.js               # 13 seeded tasks, relative deadlines
│   ├── store/
│   │   ├── focusStore.js              # Zustand store + pure compute functions
│   │   └── dependencyEngine.js        # Kahn topo sort + Tarjan cycle detection
│   └── webmcp/
│       ├── registerTools.js           # All 13 WebMCP tool registrations
│       ├── agentProxy.js              # Vite dev loopback proxy (chat-completions)
│       ├── companionBridge.js         # Main-window bridge for the companion
│       ├── companion.js               # Separate-window agentic-loop test bench
│       └── companion.css
├── tests/
│   ├── focusStore.test.mjs            # Store purity, version bump, topo order
│   └── dependencyEngine.test.mjs      # Topo sort + cycle detection
├── index.html
├── package.json
└── vite.config.js
```

## Running

```bash
cd webmcp-tools/demos/focus
npm install
npm run dev       # Vite dev server
npm test          # node --test (store + dependency engine, 25 tests)
npm run build     # production build
```

Requires a Chromium-based browser with WebMCP support (Chrome 149+ with origin trial `WebModelContextAccess` enabled via `--enable-features=WebModelContextAccess` or `chrome://flags/#web-model-context-access`).

---

*Built for the 2026 WebMCP Hackathon.*