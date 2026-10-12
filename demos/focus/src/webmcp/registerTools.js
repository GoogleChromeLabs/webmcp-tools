// Register FOCUS's WebMCP tools. Loads AFTER the polyfill (main.jsx imports the
// polyfill before this module), which adds `document.modelContext`.
//
// Tool discipline (see focusStore.js):
//   * Read-only tools (readOnlyHint: true) call PURE computations and never
//     mutate state or bump stateVersion.
//   * Consequential tools call store mutations tagged actor="agent" so the
//     judge-visible activity trace attributes them correctly.
import useFocusStore, {
  computeOverload,
  computeBottleneck,
  computePlanOrder,
} from "../store/focusStore.js";

const ctx = document.modelContext;

function staleError(s) {
  return {
    status: "error",
    code: "STALE_STATE",
    message: "The workload has changed since your last read. Please re-assess before proposing changes.",
    currentStateVersion: s.stateVersion,
  };
}

function text(payload) {
  return { content: [{ type: "text", text: JSON.stringify(payload) }] };
}

if (!ctx) {
  console.warn("FOCUS: WebMCP context not available");
} else {
  // ── READ ──────────────────────────────────────────────────────────────────
  ctx.registerTool({
    name: "get_workload_state",
    description:
      "Returns the user's current workload: all tasks (title, priority, status, estimated minutes, due date, dependencies, tags), available focused-work minutes, overload level, total active minutes, the active proposal, any running focus block, and the state version for stale-state detection.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    execute: async () => {
      const s = useFocusStore.getState();
      return text({
        tasks: s.tasks,
        availableMinutes: s.availableMinutes,
        overloadLevel: s.overloadLevel,
        totalActiveMinutes: s.tasks.filter((t) => t.status === "backlog").reduce((sum, t) => sum + (t.estimatedMinutes || 0), 0),
        currentProposal: s.currentProposal ?? null,
        activeFocusBlock: s.activeFocusBlock ?? null,
        bottleneckTaskId: s.bottleneckTaskId ?? null,
        stateVersion: s.stateVersion,
      });
    },
  });

  ctx.registerTool({
    name: "get_task_dependencies",
    description:
      "Returns dependency relationships: for a specific task, what it depends on and what it blocks; or for all tasks, the full dependency graph (upstream and downstream edges).",
    inputSchema: {
      type: "object",
      properties: { taskId: { type: "string", description: "Optional task ID. Returns all if omitted." } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    execute: async (args) => {
      const s = useFocusStore.getState();
      if (args?.taskId) {
        const task = s.tasks.find((t) => t.id === args.taskId);
        if (!task) return text({ error: "Task not found" });
        return text({
          taskId: args.taskId,
          title: task.title,
          dependsOn: task.dependencies,
          blockedTasks: s.tasks.filter((t) => (t.dependencies || []).includes(args.taskId)).map((t) => t.id),
          stateVersion: s.stateVersion,
        });
      }
      const relationships = s.tasks.map((t) => ({
        taskId: t.id,
        title: t.title,
        dependsOn: t.dependencies,
        blockedTasks: s.tasks.filter((dt) => (dt.dependencies || []).includes(t.id)).map((dt) => dt.id),
      }));
      return text({ relationships, stateVersion: s.stateVersion });
    },
  });

  ctx.registerTool({
    name: "get_available_time",
    description: "Returns the user's available focused-work time for today (minutes) and current state version.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    execute: async () => {
      const s = useFocusStore.getState();
      return text({
        availableMinutes: s.availableMinutes,
        defaultAvailableMinutes: s.defaultAvailableMinutes,
        windows: [{ start: "now", durationMinutes: s.availableMinutes }],
        stateVersion: s.stateVersion,
      });
    },
  });

  ctx.registerTool({
    name: "assess_overload",
    description:
      "Assesses the current overload: task count, deadline count, total active minutes vs available time, and a derived overload level (low/medium/high). Pure read — does not change state.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    execute: async () => {
      const s = useFocusStore.getState();
      const assessment = computeOverload(s.tasks, s.availableMinutes);
      return text({
        level: assessment.level,
        taskCount: assessment.activeCount,
        deadlineCount: assessment.deadlineCount,
        availableMinutes: s.availableMinutes,
        totalMinutes: assessment.totalMinutes,
        capacityRatio: assessment.capacityRatio,
        bottleneckTaskId: s.bottleneckTaskId,
        stateVersion: s.stateVersion,
      });
    },
  });

  ctx.registerTool({
    name: "identify_bottleneck",
    description:
      "Identifies the bottleneck: the unblocked task with the most downstream dependents and nearest deadline. Returns the task plus its transitive downstream chain. Pure read — does not change state.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    execute: async () => {
      const s = useFocusStore.getState();
      const id = computeBottleneck(s.tasks);
      const task = id ? s.tasks.find((t) => t.id === id) : null;
      return text({
        bottleneckTaskId: id,
        task,
        downstreamChain: id ? computePlanOrder(s.tasks, id).slice(1) : [],
        stateVersion: s.stateVersion,
      });
    },
  });

  // ── CONSEQUENTIAL ─────────────────────────────────────────────────────────
  ctx.registerTool({
    name: "set_available_time",
    description:
      "Sets the user's available focused-work time (minutes) and re-derives overload plus the fit/overflow split on any active proposal. Returns the resulting overload and capacity.",
    inputSchema: {
      type: "object",
      properties: {
        minutes: { type: "number", description: "Available focused-work minutes (e.g. 30, 60, 90, 120)." },
        expectedStateVersion: { type: "number", description: "Expected current state version for stale-state detection." },
      },
      required: ["minutes"],
      additionalProperties: false,
    },
    execute: async (args) => {
      const s = useFocusStore.getState();
      if (args?.expectedStateVersion !== undefined && s.stateVersion !== args.expectedStateVersion) {
        return text({ ...staleError(s), expectedStateVersion: args.expectedStateVersion });
      }
      useFocusStore.getState().setAvailableMinutes(args.minutes, "agent");
      const st = useFocusStore.getState();
      return text({
        status: "updated",
        availableMinutes: st.availableMinutes,
        overloadLevel: st.overloadLevel,
        capacity: st.currentProposal?.capacity || null,
        stateVersion: st.stateVersion,
      });
    },
  });

  ctx.registerTool({
    name: "propose_focus_block",
    description:
      "Proposes a focus block starting from a given task. The plan is a genuine topological ordering of that task plus its transitive dependents (prerequisites before dependents). Human must approve before execution starts.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "The task to start the focus block with." },
        durationMinutes: { type: "number", description: "Duration of the focus block in minutes." },
        reason: { type: "string", description: "Optional rationale for this proposal." },
        expectedStateVersion: { type: "number", description: "Expected current state version for stale-state detection." },
      },
      required: ["taskId", "durationMinutes"],
      additionalProperties: false,
    },
    execute: async (args) => {
      const s = useFocusStore.getState();
      if (args?.expectedStateVersion !== undefined && s.stateVersion !== args.expectedStateVersion) {
        return text({ ...staleError(s), expectedStateVersion: args.expectedStateVersion });
      }
      const task = s.tasks.find((t) => t.id === args.taskId);
      if (!task) {
        return text({ status: "error", code: "TASK_NOT_FOUND", message: `Task ${args.taskId} not found`, stateVersion: s.stateVersion });
      }
      const orderedTaskIds = computePlanOrder(s.tasks, args.taskId);
      const proposal = {
        id: "proposal-1",
        primaryTaskId: args.taskId,
        orderedTaskIds,
        rationale: [args.reason || "highest priority"],
        confidence: 0.85,
        requiresApproval: true,
        durationMinutes: args.durationMinutes,
      };
      useFocusStore.getState().proposePlan(proposal, "agent");
      const updated = useFocusStore.getState().currentProposal;
      return text({ status: "proposed", proposal: updated, stateVersion: useFocusStore.getState().stateVersion });
    },
  });

  ctx.registerTool({
    name: "override_plan",
    description:
      "Human override: set a different active task as the plan's primary task. Re-derives the execution order from the new primary. Returns the previous and new primary.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "ID of the task to set as primary." },
        reason: { type: "string", description: "Why this override." },
        expectedStateVersion: { type: "number", description: "Expected current state version for stale-state detection." },
      },
      required: ["taskId"],
      additionalProperties: false,
    },
    execute: async (args) => {
      const s = useFocusStore.getState();
      if (args?.expectedStateVersion !== undefined && s.stateVersion !== args.expectedStateVersion) {
        return text({ ...staleError(s), expectedStateVersion: args.expectedStateVersion });
      }
      if (!s.currentProposal) {
        return text({ status: "error", code: "NO_ACTIVE_PROPOSAL", message: "No active proposal to override", stateVersion: s.stateVersion });
      }
      if (!s.tasks.some((t) => t.id === args.taskId)) {
        return text({ status: "error", code: "TASK_NOT_FOUND", message: `Task ${args.taskId} not found`, stateVersion: s.stateVersion });
      }
      const previousPrimaryTask = s.currentProposal.primaryTaskId;
      useFocusStore.getState().overridePrimary(args.taskId, "agent");
      const updated = useFocusStore.getState().currentProposal;
      return text({
        status: "override_applied",
        previousPrimaryTask,
        newPrimaryTask: args.taskId,
        orderedTaskIds: updated.orderedTaskIds,
        stateVersion: useFocusStore.getState().stateVersion,
      });
    },
  });

  ctx.registerTool({
    name: "restructure_plan",
    description:
      "Re-derives the current plan's execution order as a genuine topological sort of the primary task plus its dependents, so prerequisites always precede dependents (branching and multiple parents included).",
    inputSchema: {
      type: "object",
      properties: { expectedStateVersion: { type: "number", description: "Expected current state version for stale-state detection." } },
      additionalProperties: false,
    },
    execute: async (args) => {
      const s = useFocusStore.getState();
      if (args?.expectedStateVersion !== undefined && s.stateVersion !== args.expectedStateVersion) {
        return text({ ...staleError(s), expectedStateVersion: args.expectedStateVersion });
      }
      if (!s.currentProposal) {
        return text({ status: "error", code: "NO_ACTIVE_PROPOSAL", message: "No active proposal to restructure", stateVersion: s.stateVersion });
      }
      const oldOrder = [...s.currentProposal.orderedTaskIds];
      const out = useFocusStore.getState().restructurePlan("agent");
      return text({ status: out.status, previousOrder: oldOrder, newOrder: out.orderedTaskIds, stateVersion: useFocusStore.getState().stateVersion });
    },
  });

  ctx.registerTool({
    name: "defer_task",
    description: "Defers a task, moving it out of the active backlog. Deferred tasks are recoverable from the Done list.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "ID of the task to defer." },
        expectedStateVersion: { type: "number", description: "Expected current state version for stale-state detection." },
      },
      required: ["taskId"],
      additionalProperties: false,
    },
    execute: async (args) => {
      const s = useFocusStore.getState();
      if (args?.expectedStateVersion !== undefined && s.stateVersion !== args.expectedStateVersion) {
        return text({ ...staleError(s), expectedStateVersion: args.expectedStateVersion });
      }
      if (!s.tasks.some((t) => t.id === args.taskId)) {
        return text({ status: "error", code: "TASK_NOT_FOUND", message: `Task ${args.taskId} not found`, stateVersion: s.stateVersion });
      }
      useFocusStore.getState().deferTask(args.taskId, "agent");
      return text({ status: "deferred", taskId: args.taskId, stateVersion: useFocusStore.getState().stateVersion });
    },
  });

  ctx.registerTool({
    name: "start_focus_block",
    description:
      "Validates that the human has approved and started a focus block. A focus block only becomes active after the human presses the Start/Approve button in the UI — this tool reflects that approval rather than starting unilaterally.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "Task ID to validate (optional)." },
        durationMinutes: { type: "number", description: "Optional duration override." },
        expectedStateVersion: { type: "number", description: "Expected current state version for stale-state detection." },
      },
      additionalProperties: false,
    },
    execute: async (args) => {
      const s = useFocusStore.getState();
      if (args?.expectedStateVersion !== undefined && s.stateVersion !== args.expectedStateVersion) {
        return text({ ...staleError(s), expectedStateVersion: args.expectedStateVersion });
      }
      if (!s.activeFocusBlock || s.activeFocusBlock.status !== "active") {
        return text({
          status: "error",
          code: "HUMAN_APPROVAL_REQUIRED",
          message: "Human must approve via the Start button in the UI before a focus block can start",
          stateVersion: s.stateVersion,
        });
      }
      if (args?.taskId && args.taskId !== s.activeFocusBlock.taskId) {
        return text({
          status: "error",
          code: "TASK_MISMATCH",
          message: `Task ID does not match the active focus block (${s.activeFocusBlock.taskId})`,
          stateVersion: s.stateVersion,
        });
      }
      return text({
        status: "active",
        taskId: s.activeFocusBlock.taskId,
        durationMinutes: s.activeFocusBlock.durationMinutes,
        startedAt: s.activeFocusBlock.startedAt,
        stateVersion: s.stateVersion,
      });
    },
  });

  ctx.registerTool({
    name: "complete_focus_block",
    description:
      "Completes or abandons the current focus block. On completion, marks the task done and advances the plan to the next unblocked task, returning structured next-task info.",
    inputSchema: {
      type: "object",
      properties: {
        result: { type: "string", enum: ["completed", "partially_completed", "abandoned"], description: "How the block ended." },
        expectedStateVersion: { type: "number", description: "Expected current state version for stale-state detection." },
      },
      required: ["result"],
      additionalProperties: false,
    },
    execute: async (args) => {
      const s = useFocusStore.getState();
      if (args?.expectedStateVersion !== undefined && s.stateVersion !== args.expectedStateVersion) {
        return text({ ...staleError(s), expectedStateVersion: args.expectedStateVersion });
      }
      if (!s.activeFocusBlock) {
        return text({ status: "error", code: "NO_ACTIVE_BLOCK", message: "No active focus block to complete", stateVersion: s.stateVersion });
      }
      const outcome = useFocusStore.getState().completeFocusBlock(args.result, "agent");
      return text(outcome);
    },
  });

  ctx.registerTool({
    name: "reset_demo",
    description:
      "Resets the demo to the seeded scenario (13 tasks, 120 available minutes, no proposal, no active block, plus a cleared activity log). Deterministic — the same state every time.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    execute: async () => {
      const stateVersion = useFocusStore.getState().resetDemo("agent");
      const s = useFocusStore.getState();
      return text({
        status: "reset",
        taskCount: s.tasks.length,
        availableMinutes: s.availableMinutes,
        overloadLevel: s.overloadLevel,
        stateVersion,
      });
    },
  });

  ctx.getTools().then((tools) => console.log("FOCUS WebMCP tools registered:", tools.map((t) => t.name)));
}