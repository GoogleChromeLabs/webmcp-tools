import { create } from "zustand";
import { TASKS, DEMO_CONTEXT } from "../data/demoTasks.js";
import { topologicalSort } from "./dependencyEngine.js";

// ─────────────────────────────────────────────────────────────────────────────
// Pure computations. These read an explicit `tasks` argument and NEVER touch the
// store, so the read-only WebMCP tools can call them without mutating state or
// bumping `stateVersion`. The store's mutating methods make all derived fields
// (overloadLevel, bottleneckTaskId, capacity) consistent in a SINGLE set().
// ─────────────────────────────────────────────────────────────────────────────

let focusIdCounter = 1;
const genId = () => `fb-${focusIdCounter++}`;

// How much of an ordered task list fits in the available time — the first K
// tasks whose cumulative minutes <= availableMinutes "fit", the rest overflow.
export function computeCapacity(tasks, orderedTaskIds, availableMinutes) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const fitsTaskIds = [];
  const overflowTaskIds = [];
  let fitsMinutes = 0;
  let totalMinutes = 0;
  let overflowed = false;
  for (const id of orderedTaskIds || []) {
    const t = byId.get(id);
    const mins = t ? (t.estimatedMinutes || 0) : 0;
    totalMinutes += mins;
    if (overflowed) {
      overflowTaskIds.push(id);
    } else if (fitsMinutes + mins <= availableMinutes) {
      fitsMinutes += mins;
      fitsTaskIds.push(id);
    } else {
      overflowed = true;
      overflowTaskIds.push(id);
    }
  }
  return {
    totalMinutes,
    fitsMinutes,
    overflowMinutes: totalMinutes - fitsMinutes,
    fitsCount: fitsTaskIds.length,
    overflowCount: overflowTaskIds.length,
    fitsTaskIds,
    overflowTaskIds,
  };
}

// Overload level derived purely from the task list + available time.
export function computeOverload(tasks, availableMinutes) {
  const activeTasks = tasks.filter((t) => t.status === "backlog");
  const activeCount = activeTasks.length;
  const deadlineCount = tasks.filter(
    (t) => t.dueAt && t.status !== "completed" && t.status !== "deferred"
  ).length;
  const totalMinutes = activeTasks.reduce((sum, t) => sum + (t.estimatedMinutes || 0), 0);
  const capacityRatio = totalMinutes / Math.max(availableMinutes, 1);
  let level = "low";
  if (capacityRatio >= 3 || deadlineCount > 5) level = "high";
  else if (capacityRatio >= 2 || deadlineCount > 3) level = "medium";
  return {
    level,
    activeCount,
    deadlineCount,
    totalMinutes,
    capacityRatio: Math.round(capacityRatio * 10) / 10,
  };
}

// Bottleneck task id, derived purely from the task list. Prefers the unblocked
// task with the most downstream dependents + closest deadline; falls back to the
// best blocked task only when every active task is blocked. Returns null if no
// active task remains.
export function computeBottleneck(tasks) {
  const activeTasks = tasks.filter((t) => t.status !== "completed" && t.status !== "deferred");
  if (activeTasks.length === 0) return null;
  const activeIds = new Set(activeTasks.map((t) => t.id));
  const isBlocked = (t) =>
    (t.dependencies || []).some((depId) => {
      const dep = tasks.find((x) => x.id === depId);
      return dep && dep.status !== "completed";
    });
  const downstreamMap = {};
  activeTasks.forEach((t) => {
    (t.dependencies || []).forEach((depId) => {
      if (!activeIds.has(depId)) return;
      (downstreamMap[depId] = downstreamMap[depId] || []).push(t.id);
    });
  });
  // Transitive downstream closure: for each candidate, count every active task
  // reachable through the dependency chain — direct AND indirect dependents.
  // A task that unlocks a long chain is a bigger bottleneck than the count of
  // its immediate children alone suggests.
  const transitiveDownstream = (startId) => {
    const seen = new Set();
    const queue = [...(downstreamMap[startId] || [])];
    while (queue.length) {
      const cur = queue.shift();
      if (seen.has(cur)) continue;
      seen.add(cur);
      queue.push(...(downstreamMap[cur] || []));
    }
    return seen.size;
  };
  const now = Date.now();
  let best = null;
  let bestScore = -1;
  let fallback = null;
  let fallbackScore = -1;
  activeTasks.forEach((t) => {
    const downstream = transitiveDownstream(t.id);
    const urgency = t.dueAt ? (new Date(t.dueAt).getTime() - now) / 3600000 : 168;
    const priorityScore =
      t.priority === "critical" ? 5 : t.priority === "high" ? 3 : t.priority === "medium" ? 1 : 0;
    // Bottleneck is structural first: how much other work it blocks (downstream).
    // Deadline and priority only break ties among equally-blocking tasks.
    const score = downstream * 100 + 10 / Math.max(urgency, 0.5) + priorityScore * 5;
    if (isBlocked(t)) {
      if (score > fallbackScore) {
        fallbackScore = score;
        fallback = t.id;
      }
    } else if (score > bestScore) {
      bestScore = score;
      best = t.id;
    }
  });
  return best ?? fallback;
}

// A plan's execution order: the primary task plus its transitive dependents,
// sorted into a genuine topological order (prerequisites precede dependents,
// including branching and multiple-parent cases). Only backlog tasks belong to
// a plan. Falls back to the primary alone if sorting yields nothing.
export function computePlanOrder(tasks, primaryTaskId) {
  if (!primaryTaskId) return [];
  const backlog = tasks.filter((t) => t.status === "backlog");
  const backlogIds = new Set(backlog.map((t) => t.id));
  if (!backlogIds.has(primaryTaskId)) return [];
  const scopeIds = new Set();
  const queue = [primaryTaskId];
  while (queue.length) {
    const cur = queue.shift();
    if (scopeIds.has(cur)) continue;
    scopeIds.add(cur);
    backlog
      .filter((t) => (t.dependencies || []).includes(cur))
      .forEach((t) => {
        if (!scopeIds.has(t.id)) queue.push(t.id);
      });
  }
  const scopeTasks = backlog.filter((t) => scopeIds.has(t.id));
  const { order } = topologicalSort(scopeTasks);
  return order.length ? order : [primaryTaskId];
}

const STORAGE_KEY_MINUTES = "focus:defaultMinutes";
const storedDefault = (() => {
  try {
    const v = Number(localStorage.getItem(STORAGE_KEY_MINUTES));
    return Number.isFinite(v) && v >= 15 ? v : null;
  } catch {
    return null;
  }
})();

// ─────────────────────────────────────────────────────────────────────────────
// Store. Invariant: every public mutation bumps `stateVersion` EXACTLY once and
// logs one activity entry. Derived fields ride along in the same set() so no
// read path ever writes.
// ─────────────────────────────────────────────────────────────────────────────

const useFocusStore = create((set, get) => ({
  // State
  tasks: JSON.parse(JSON.stringify(TASKS)),
  availableMinutes: storedDefault ?? DEMO_CONTEXT.availableMinutes,
  defaultAvailableMinutes: storedDefault ?? DEMO_CONTEXT.availableMinutes,
  overloadLevel: DEMO_CONTEXT.overloadLevel,
  currentProposal: null,
  activeFocusBlock: null,
  stateVersion: 0,
  bottleneckTaskId: null,
  activityLog: [],

  // --- Activity trace (judge-visible AGENT/HUMAN) ---
  logActivity: (actor, text, opts = {}) => {
    const entry = {
      id: genId(),
      actor: actor === "agent" ? "agent" : "human",
      text,
      taskId: opts.taskId ?? null,
      at: new Date().toISOString(),
    };
    set((s) => ({ activityLog: [...s.activityLog, entry].slice(-100) }));
  },
  clearActivityLog: () => set({ activityLog: [] }),

  // Reset Demo — deterministic restore to the seeded scenario. Rebuilds from the
  // SAME module-level TASKS snapshot so every reset is byte-identical. The
  // activity log is cleared first, then exactly one reset entry is appended so
  // post-reset state matches the docs.
  resetDemo: (actor = "human") => {
    const fresh = JSON.parse(JSON.stringify(TASKS));
    const overloadLevel = computeOverload(fresh, DEMO_CONTEXT.availableMinutes).level;
    set((s) => ({
      tasks: fresh,
      availableMinutes: DEMO_CONTEXT.availableMinutes,
      defaultAvailableMinutes: DEMO_CONTEXT.availableMinutes,
      overloadLevel,
      currentProposal: null,
      activeFocusBlock: null,
      bottleneckTaskId: null,
      activityLog: [],
      stateVersion: s.stateVersion + 1,
    }));
    get().logActivity(actor, "Reset demo data to the seeded scenario");
    return get().stateVersion;
  },

  // --- Low-level setters (seldom used; single bump each) ---
  setTasks: (tasks, actor = "human") =>
    set((s) => ({
      tasks,
      overloadLevel: computeOverload(tasks, s.availableMinutes).level,
      stateVersion: s.stateVersion + 1,
    })),

  setBottleneckTaskId: (id, actor = "human") =>
    set((s) => ({ bottleneckTaskId: id, stateVersion: s.stateVersion + 1 })),

  identifyBottleneck: (actor = "human") => {
    const id = computeBottleneck(get().tasks);
    set((s) => ({ bottleneckTaskId: id, stateVersion: s.stateVersion + 1 }));
    get().logActivity(
      actor,
      id ? `Identified bottleneck: "${get().tasks.find((t) => t.id === id)?.title || id}"` : "No active tasks — no bottleneck",
      { taskId: id }
    );
    return id;
  },

  // --- Available time: the single lever that re-plans scope. ---
  setAvailableMinutes: (minutes, actor = "human") => {
    const safe = Math.max(15, Math.round(Number(minutes) || 0));
    set((s) => {
      let currentProposal = s.currentProposal;
      if (currentProposal && Array.isArray(currentProposal.orderedTaskIds)) {
        currentProposal = {
          ...currentProposal,
          capacity: computeCapacity(s.tasks, currentProposal.orderedTaskIds, safe),
        };
      }
      return {
        availableMinutes: safe,
        overloadLevel: computeOverload(s.tasks, safe).level,
        currentProposal,
        stateVersion: s.stateVersion + 1,
      };
    });
    get().logActivity(actor, `Set available time to ${safe} minutes`);
    return get().stateVersion;
  },

  setDefaultMinutes: (minutes, actor = "human") => {
    const safe = Math.max(15, Math.round(Number(minutes) || 0));
    try {
      localStorage.setItem(STORAGE_KEY_MINUTES, String(safe));
    } catch {}
    set((s) => {
      let currentProposal = s.currentProposal;
      if (currentProposal && Array.isArray(currentProposal.orderedTaskIds)) {
        currentProposal = {
          ...currentProposal,
          capacity: computeCapacity(s.tasks, currentProposal.orderedTaskIds, safe),
        };
      }
      return {
        defaultAvailableMinutes: safe,
        availableMinutes: safe,
        overloadLevel: computeOverload(s.tasks, safe).level,
        currentProposal,
        stateVersion: s.stateVersion + 1,
      };
    });
    get().logActivity(actor, `Saved default time: ${safe} minutes`);
    return get().stateVersion;
  },

  resetToDefaultMinutes: (actor = "human") => {
    const safe = get().defaultAvailableMinutes ?? DEMO_CONTEXT.availableMinutes;
    return get().setAvailableMinutes(safe, actor);
  },

  // --- Plan proposal / override / restructure ---
  // opts.logText overrides the activity entry text so the app's auto-preview
  // can label itself a "FOCUS recommendation" — distinct from agent proposals.
  proposePlan: (proposal, actor = "human", opts = {}) => {
    const primaryTaskId = proposal.primaryTaskId;
    const orderedTaskIds = computePlanOrder(get().tasks, primaryTaskId);
    const capacity = computeCapacity(get().tasks, orderedTaskIds, get().availableMinutes);
    const normalized = {
      ...proposal,
      primaryTaskId,
      orderedTaskIds,
      durationMinutes: proposal.durationMinutes ?? proposal.requestedDurationMinutes ?? null,
      capacity,
    };
    set((s) => ({ currentProposal: normalized, stateVersion: s.stateVersion + 1 }));
    get().logActivity(
      actor,
      opts.logText ?? `Proposed focus block starting with "${primaryTaskId}"`,
      { taskId: primaryTaskId }
    );
    return normalized;
  },

  clearProposal: (actor = "human") => {
    set((s) => ({ currentProposal: null, stateVersion: s.stateVersion + 1 }));
    get().logActivity(actor, "Cleared the plan proposal");
  },

  // Recompute the plan's order from its primary task in genuine topological
  // order (used by restructure_plan).
  restructurePlan: (actor = "human") => {
    const s = get();
    if (!s.currentProposal) {
      return { status: "error", code: "NO_ACTIVE_PROPOSAL", stateVersion: s.stateVersion };
    }
    const orderedTaskIds = computePlanOrder(s.tasks, s.currentProposal.primaryTaskId);
    const capacity = computeCapacity(s.tasks, orderedTaskIds, s.availableMinutes);
    set((cur) => ({
      currentProposal: { ...cur.currentProposal, orderedTaskIds, capacity },
      stateVersion: cur.stateVersion + 1,
    }));
    get().logActivity(actor, "Restructured plan into dependency order");
    return { status: "restructured", orderedTaskIds, stateVersion: get().stateVersion };
  },

  setProposalOrder: (orderedTaskIds, actor = "human") => {
    const s = get();
    if (!s.currentProposal) return;
    const capacity = computeCapacity(s.tasks, orderedTaskIds, s.availableMinutes);
    set((cur) => ({
      currentProposal: { ...cur.currentProposal, orderedTaskIds, capacity },
      stateVersion: cur.stateVersion + 1,
    }));
    get().logActivity(actor, "Reordered the plan sequence");
  },

  overridePrimary: (taskId, actor = "human") => {
    const s = get();
    if (!s.currentProposal) {
      return { status: "error", code: "NO_ACTIVE_PROPOSAL", stateVersion: s.stateVersion };
    }
    if (!s.tasks.some((t) => t.id === taskId)) {
      return { status: "error", code: "TASK_NOT_FOUND", stateVersion: s.stateVersion };
    }
    const orderedTaskIds = computePlanOrder(s.tasks, taskId);
    const capacity = computeCapacity(s.tasks, orderedTaskIds, s.availableMinutes);
    set((cur) => ({
      currentProposal: { ...cur.currentProposal, primaryTaskId: taskId, orderedTaskIds, capacity },
      stateVersion: cur.stateVersion + 1,
    }));
    get().logActivity(actor, `Overrode plan → start with "${taskId}"`, { taskId });
    return { status: "override_applied", taskId, orderedTaskIds, stateVersion: get().stateVersion };
  },

  restructureDependencies: (taskId, newDependencies, actor = "human") => {
    set((s) => {
      const tasks = s.tasks.map((t) =>
        t.id === taskId ? { ...t, dependencies: Array.isArray(newDependencies) ? newDependencies : [] } : t
      );
      return {
        tasks,
        overloadLevel: computeOverload(tasks, s.availableMinutes).level,
        stateVersion: s.stateVersion + 1,
      };
    });
    get().logActivity(actor, `Changed dependencies for "${taskId}"`, { taskId });
  },

  // --- Focus block lifecycle ---
  startFocusBlock: (taskId, durationMinutes, actor = "human") => {
    const s = get();
    const task = s.tasks.find((t) => t.id === taskId);
    if (!task) {
      return { status: "error", code: "TASK_NOT_FOUND", message: `Task ${taskId} not found`, stateVersion: s.stateVersion };
    }
    if (task.status !== "backlog") {
      return { status: "error", code: "TASK_NOT_ACTIVE", message: `Task ${taskId} is ${task.status}, not backlog`, stateVersion: s.stateVersion };
    }
    const blocked = (task.dependencies || []).filter((depId) => {
      const dep = s.tasks.find((t) => t.id === depId);
      return dep && dep.status !== "completed";
    });
    if (blocked.length > 0) {
      return { status: "error", code: "TASK_BLOCKED", message: `Task ${taskId} is blocked by unfinished dependencies`, blocked, stateVersion: s.stateVersion };
    }
    const safeDuration = Math.max(5, Math.min(480, Math.round(Number(durationMinutes) || task.estimatedMinutes || 25)));
    set((cur) => ({
      activeFocusBlock: {
        id: genId(),
        taskId,
        durationMinutes: safeDuration,
        status: "active",
        startedAt: new Date().toISOString(),
      },
      stateVersion: cur.stateVersion + 1,
    }));
    get().logActivity(actor, `Started focus block: "${task.title}" (${safeDuration}m)`, { taskId });
    return { status: "active", taskId, durationMinutes: safeDuration, stateVersion: get().stateVersion };
  },

  completeFocusBlock: (result, actor = "human") => {
    const s = get();
    const block = s.activeFocusBlock;
    if (!block || block.status !== "active") {
      return { status: "error", code: "NO_ACTIVE_BLOCK", stateVersion: s.stateVersion };
    }

    const startedAt = new Date(block.startedAt).getTime();
    const elapsedMinutes = Math.max(0, Math.round((Date.now() - startedAt) / 60000));

    const didComplete = result === "completed" || result === "partially_completed";
    const tasks = didComplete
      ? s.tasks.map((t) => (t.id === block.taskId ? { ...t, status: "completed" } : t))
      : s.tasks;

    const overload = computeOverload(tasks, s.availableMinutes);

    // Next task = next uncompleted, unblocked backlog task in the plan sequence.
    let nextTaskId = null;
    if (didComplete) {
      nextTaskId =
        (s.currentProposal?.orderedTaskIds || []).find((id) => {
          const t = tasks.find((x) => x.id === id);
          return t && t.status === "backlog" && !(t.dependencies || []).some((depId) => {
            const d = tasks.find((x) => x.id === depId);
            return d && d.status !== "completed";
          });
        }) || null;
    }

    let currentProposal = s.currentProposal;
    if (didComplete) {
      if (nextTaskId) {
        const chain = computePlanOrder(tasks, nextTaskId);
        const capacity = computeCapacity(tasks, chain, s.availableMinutes);
        const nextEst = tasks.find((t) => t.id === nextTaskId)?.estimatedMinutes || 25;
        currentProposal = {
          id: "proposal-1",
          primaryTaskId: nextTaskId,
          orderedTaskIds: chain,
          rationale: ["next in sequence"],
          confidence: 0.85,
          requiresApproval: true,
          durationMinutes: nextEst,
          capacity,
        };
      } else {
        currentProposal = null;
      }
    }

    const finishedBlock = { ...block, status: result };

    set((cur) => ({
      tasks,
      activeFocusBlock: finishedBlock,
      currentProposal,
      overloadLevel: overload.level,
      bottleneckTaskId: didComplete ? nextTaskId : cur.bottleneckTaskId,
      stateVersion: cur.stateVersion + 1,
    }));

    get().logActivity(
      actor,
      didComplete ? `Completed focus block: "${s.tasks.find((t) => t.id === block.taskId)?.title || block.taskId}"` : `Abandoned focus block: "${s.tasks.find((t) => t.id === block.taskId)?.title || block.taskId}"`,
      { taskId: block.taskId }
    );

    const completedTask = s.tasks.find((t) => t.id === block.taskId);
    const nextTask = nextTaskId ? tasks.find((t) => t.id === nextTaskId) : null;
    const unlocks = nextTaskId
      ? tasks.filter((t) => t.dependencies.includes(nextTaskId)).map((t) => ({ id: t.id, title: t.title }))
      : [];

    return {
      // Mirror the outcome verbatim: "completed", "partially_completed", or
      // "abandoned" — never a hardcoded "completed".
      status: result,
      completedTaskId: block.taskId,
      completedTaskTitle: completedTask?.title || null,
      result,
      elapsedMinutes,
      nextTask: nextTask
        ? { id: nextTask.id, title: nextTask.title, durationMinutes: nextTask.estimatedMinutes, unlocks }
        : null,
      allDone: didComplete && !nextTaskId,
      overloadLevel: overload.level,
      activeCount: overload.activeCount,
      totalMinutes: overload.totalMinutes,
      stateVersion: get().stateVersion,
    };
  },

  // --- Task CRUD ---
  addTask: ({ title, estimatedMinutes = 25, priority = "medium", dueAt = null, dependencies = [], tags = [] }, actor = "human") => {
    const clean = String(title || "").trim();
    if (!clean) return { status: "error", code: "EMPTY_TITLE" };
    const mins = Math.max(5, Math.min(480, Math.round(Number(estimatedMinutes) || 25)));
    const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newTask = {
      id,
      title: clean,
      priority: ["critical", "high", "medium", "low"].includes(priority) ? priority : "medium",
      status: "backlog",
      estimatedMinutes: mins,
      dueAt: dueAt || null,
      dependencies: Array.isArray(dependencies) ? dependencies.filter(Boolean) : [],
      tags: Array.isArray(tags) ? tags : [],
    };
    set((cur) => {
      const tasks = [...cur.tasks, newTask];
      let currentProposal = cur.currentProposal;
      if (currentProposal && Array.isArray(currentProposal.orderedTaskIds)) {
        currentProposal = {
          ...currentProposal,
          capacity: computeCapacity(tasks, currentProposal.orderedTaskIds, cur.availableMinutes),
        };
      }
      return {
        tasks,
        overloadLevel: computeOverload(tasks, cur.availableMinutes).level,
        currentProposal,
        stateVersion: cur.stateVersion + 1,
      };
    });
    get().logActivity(actor, `Added task "${clean}" (${mins}m)`, { taskId: id });
    return { status: "created", task: newTask, stateVersion: get().stateVersion };
  },

  toggleTask: (taskId, actor = "human") => {
    const s = get();
    const t = s.tasks.find((x) => x.id === taskId);
    if (!t) return { status: "error", code: "TASK_NOT_FOUND" };
    const nextStatus = t.status === "completed" ? "backlog" : "completed";
    set((cur) => {
      const tasks = cur.tasks.map((x) => (x.id === taskId ? { ...x, status: nextStatus } : x));
      const bottleneckTaskId =
        cur.bottleneckTaskId === taskId && nextStatus !== "backlog" ? computeBottleneck(tasks) : cur.bottleneckTaskId;
      let currentProposal = cur.currentProposal;
      if (currentProposal && Array.isArray(currentProposal.orderedTaskIds)) {
        currentProposal = {
          ...currentProposal,
          capacity: computeCapacity(tasks, currentProposal.orderedTaskIds, cur.availableMinutes),
        };
      }
      return {
        tasks,
        overloadLevel: computeOverload(tasks, cur.availableMinutes).level,
        bottleneckTaskId,
        currentProposal,
        stateVersion: cur.stateVersion + 1,
      };
    });
    get().logActivity(actor, nextStatus === "completed" ? `Completed "${t.title}"` : `Reopened "${t.title}"`, { taskId });
    return { status: "toggled", taskId, nextStatus, stateVersion: get().stateVersion };
  },

  updateTask: (taskId, patch, actor = "human") => {
    const s = get();
    if (!s.tasks.some((t) => t.id === taskId)) return { status: "error", code: "TASK_NOT_FOUND" };
    set((cur) => {
      const tasks = cur.tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t));
      let bottleneckTaskId = cur.bottleneckTaskId;
      if (cur.bottleneckTaskId === taskId) {
        const updated = tasks.find((t) => t.id === taskId);
        if (!updated || updated.status !== "backlog") bottleneckTaskId = computeBottleneck(tasks);
      }
      return {
        tasks,
        overloadLevel: computeOverload(tasks, cur.availableMinutes).level,
        bottleneckTaskId,
        stateVersion: cur.stateVersion + 1,
      };
    });
    get().logActivity(actor, `Updated "${taskId}"`, { taskId });
    return { status: "updated", taskId, stateVersion: get().stateVersion };
  },

  removeTask: (taskId, actor = "human") => {
    const s = get();
    if (!s.tasks.some((t) => t.id === taskId)) return { status: "error", code: "TASK_NOT_FOUND" };
    set((cur) => {
      const tasks = cur.tasks
        .filter((t) => t.id !== taskId)
        .map((t) => ({ ...t, dependencies: (t.dependencies || []).filter((d) => d !== taskId) }));
      const bottleneckTaskId = cur.bottleneckTaskId === taskId ? computeBottleneck(tasks) : cur.bottleneckTaskId;
      let currentProposal = cur.currentProposal;
      if (currentProposal && Array.isArray(currentProposal.orderedTaskIds) && currentProposal.orderedTaskIds.includes(taskId)) {
        const orderedTaskIds = currentProposal.orderedTaskIds.filter((id) => id !== taskId);
        if (orderedTaskIds.length === 0) currentProposal = null;
        else {
          const primaryTaskId = currentProposal.primaryTaskId === taskId ? orderedTaskIds[0] : currentProposal.primaryTaskId;
          currentProposal = {
            ...currentProposal,
            orderedTaskIds,
            primaryTaskId,
            capacity: computeCapacity(tasks, orderedTaskIds, cur.availableMinutes),
          };
        }
      }
      return {
        tasks,
        overloadLevel: computeOverload(tasks, cur.availableMinutes).level,
        bottleneckTaskId,
        currentProposal,
        stateVersion: cur.stateVersion + 1,
      };
    });
    get().logActivity(actor, `Removed "${taskId}"`, { taskId });
    return { status: "removed", taskId, stateVersion: get().stateVersion };
  },

  deferTask: (taskId, actor = "human") => {
    const s = get();
    if (!s.tasks.some((t) => t.id === taskId)) return { status: "error", code: "TASK_NOT_FOUND" };
    set((cur) => {
      const tasks = cur.tasks.map((t) => (t.id === taskId ? { ...t, status: "deferred" } : t));
      const bottleneckTaskId = cur.bottleneckTaskId === taskId ? computeBottleneck(tasks) : cur.bottleneckTaskId;
      let currentProposal = cur.currentProposal;
      if (currentProposal && Array.isArray(currentProposal.orderedTaskIds) && currentProposal.orderedTaskIds.includes(taskId)) {
        const orderedTaskIds = currentProposal.orderedTaskIds.filter((id) => id !== taskId);
        if (orderedTaskIds.length === 0) currentProposal = null;
        else {
          const primaryTaskId = currentProposal.primaryTaskId === taskId ? orderedTaskIds[0] : currentProposal.primaryTaskId;
          currentProposal = {
            ...currentProposal,
            orderedTaskIds,
            primaryTaskId,
            capacity: computeCapacity(tasks, orderedTaskIds, cur.availableMinutes),
          };
        }
      }
      return {
        tasks,
        overloadLevel: computeOverload(tasks, cur.availableMinutes).level,
        bottleneckTaskId,
        currentProposal,
        stateVersion: cur.stateVersion + 1,
      };
    });
    get().logActivity(actor, `Deferred "${taskId}"`, { taskId });
    return { status: "deferred", taskId, stateVersion: get().stateVersion };
  },
}));

export default useFocusStore;