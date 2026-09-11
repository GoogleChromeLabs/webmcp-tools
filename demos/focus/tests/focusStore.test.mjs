import test from "node:test";
import assert from "node:assert/strict";
import useFocusStore, {
  computeOverload,
  computeBottleneck,
  computeCapacity,
  computePlanOrder,
} from "../src/store/focusStore.js";
import { TASKS } from "../src/data/demoTasks.js";

const reset = () => useFocusStore.getState().resetDemo("test");

// Fresh store before each test.
test.beforeEach(reset);

test("seeded demo: 13 tasks, 120m available, high overload", () => {
  const s = useFocusStore.getState();
  assert.equal(TASKS.length, 13);
  assert.equal(s.tasks.length, 13);
  assert.equal(s.availableMinutes, 120);
  assert.equal(s.overloadLevel, "high");
  assert.equal(s.stateVersion >= 0, true);
});

test("read computations are pure — no stateVersion bump, no mutation", () => {
  const before = useFocusStore.getState();
  const v0 = before.stateVersion;
  const tasksSnapshot = JSON.stringify(before.tasks);

  computeOverload(before.tasks, before.availableMinutes);
  computeBottleneck(before.tasks);
  computeCapacity(before.tasks, before.tasks.map((t) => t.id), before.availableMinutes);
  computePlanOrder(before.tasks, before.tasks[0].id);

  const after = useFocusStore.getState();
  assert.equal(after.stateVersion, v0, "stateVersion must not change");
  assert.equal(JSON.stringify(after.tasks), tasksSnapshot, "tasks must not change");
  assert.equal(before.currentProposal, after.currentProposal);
});

test("each mutation bumps stateVersion exactly once", () => {
  const st = () => useFocusStore.getState();
  const checks = [
    { name: "setAvailableMinutes", setup: () => {}, act: () => st().setAvailableMinutes(90, "test") },
    { name: "addTask", setup: () => {}, act: () => st().addTask({ title: "x", estimatedMinutes: 10 }, "test") },
    { name: "proposePlan", setup: () => {}, act: () => st().proposePlan({ primaryTaskId: TASKS[0].id, durationMinutes: 25 }, "test") },
    { name: "overridePrimary", setup: () => st().proposePlan({ primaryTaskId: TASKS[0].id }, "test"), act: () => st().overridePrimary(TASKS[3].id, "test") },
    { name: "restructurePlan", setup: () => st().proposePlan({ primaryTaskId: TASKS[0].id }, "test"), act: () => st().restructurePlan("test") },
    { name: "deferTask", setup: () => {}, act: () => st().deferTask(TASKS[4].id, "test") },
    { name: "toggleTask", setup: () => {}, act: () => st().toggleTask(TASKS[5].id, "test") },
    { name: "updateTask", setup: () => {}, act: () => st().updateTask(TASKS[6].id, { estimatedMinutes: 20 }, "test") },
    { name: "removeTask", setup: () => {}, act: () => st().removeTask(TASKS[7].id, "test") },
    { name: "startFocusBlock", setup: () => {}, act: () => st().startFocusBlock(TASKS[0].id, 25, "test") },
    { name: "completeFocusBlock", setup: () => st().startFocusBlock(TASKS[0].id, 25, "test"), act: () => st().completeFocusBlock("completed", "test") },
  ];
  for (const c of checks) {
    reset();
    c.setup();
    const v0 = st().stateVersion;
    c.act();
    const v1 = st().stateVersion;
    assert.equal(v1 - v0, 1, `${c.name} must bump by exactly 1 (got ${v1 - v0})`);
  }
});

test("sequential mutations accumulate (relative delta)", () => {
  reset();
  const st = useFocusStore.getState();
  const v0 = st.stateVersion;
  st.addTask({ title: "a" }, "test");
  st.addTask({ title: "b" }, "test");
  st.setAvailableMinutes(60, "test");
  assert.equal(useFocusStore.getState().stateVersion - v0, 3);
});

test("proposePlan produces a valid topological order (prereqs first)", () => {
  const st = useFocusStore.getState();
  const primary = "management-ch7";
  const proposal = st.proposePlan({ primaryTaskId: primary, durationMinutes: 25 }, "test");
  const order = proposal.orderedTaskIds;
  assert.equal(order[0], primary, "primary task leads the plan");

  const byId = new Map(st.tasks.map((t) => [t.id, t]));
  const position = new Map(order.map((id, i) => [id, i]));
  for (const id of order) {
    const task = byId.get(id);
    for (const dep of task.dependencies || []) {
      if (!position.has(dep)) continue; // out of scope — fine
      assert.ok(position.get(dep) < position.get(id), `${dep} must precede ${id}`);
    }
  }
});

test("completeFocusBlock advances to the next unblocked task", () => {
  const st = useFocusStore.getState();
  st.proposePlan({ primaryTaskId: "management-ch7", durationMinutes: 25 }, "test");
  const started = st.startFocusBlock("management-ch7", 25, "test");
  assert.equal(started.status, "active");

  const outcome = st.completeFocusBlock("completed", "test");
  assert.equal(outcome.completedTaskId, "management-ch7");
  // management-ch7 unlocks quiz-prep, so the next task must be quiz-prep
  assert.equal(outcome.nextTask?.id, "quiz-prep");
});

test("blocked task cannot start", () => {
  const st = useFocusStore.getState();
  // quiz-prep depends on management-ch7 (incomplete) -> blocked
  const res = st.startFocusBlock("quiz-prep", 30, "test");
  assert.equal(res.status, "error");
  assert.equal(res.code, "TASK_BLOCKED");
});

test("resetDemo is deterministic and restores the seeded scenario", () => {
  const st = useFocusStore.getState();
  const original = JSON.stringify(useFocusStore.getState().tasks);

  st.addTask({ title: "junk" }, "test");
  st.setAvailableMinutes(30, "test");
  st.proposePlan({ primaryTaskId: TASKS[0].id }, "test");
  st.startFocusBlock(TASKS[0].id, 25, "test");

  reset();
  const s = useFocusStore.getState();
  assert.equal(s.tasks.length, 13);
  assert.equal(JSON.stringify(s.tasks), original);
  assert.equal(s.availableMinutes, 120);
  assert.equal(s.currentProposal, null);
  assert.equal(s.activeFocusBlock, null);
  assert.equal(s.bottleneckTaskId, null);
});

test("bottleneck is management-ch7 (most downstream + near deadline)", () => {
  const bottleneck = computeBottleneck(useFocusStore.getState().tasks);
  assert.equal(bottleneck, "management-ch7");
});

test("bottleneck uses transitive downstream closure, not immediate children", () => {
  // x unlocks a 3-deep chain (y -> z1 -> z2); w unlocks one task (w1) and has
  // a far-nearer deadline. Immediate-children counting scores x and w equally
  // (1 each) and the deadline tie-break picks w. Transitive closure counts
  // x's full chain (3) so x must win.
  const now = Date.now();
  const hours = (h) => new Date(now + h * 3600000).toISOString();
  const tasks = [
    { id: "x", dependencies: [], dueAt: hours(100) },
    { id: "y", dependencies: ["x"] },
    { id: "z1", dependencies: ["y"] },
    { id: "z2", dependencies: ["z1"] },
    { id: "w", dependencies: [], dueAt: hours(1) },
    { id: "w1", dependencies: ["w"] },
  ];
  assert.equal(computeBottleneck(tasks), "x");
});

test("resetDemo clears the activity log, then logs exactly one reset entry", () => {
  const st = useFocusStore.getState();
  st.addTask({ title: "noise" }, "test");
  st.logActivity("agent", "agent read the workload state");
  st.logActivity("human", "human overrode the plan");
  assert.ok(useFocusStore.getState().activityLog.length >= 3, "log should have entries before reset");

  reset();
  const s = useFocusStore.getState();
  assert.equal(s.activityLog.length, 1, "reset leaves exactly one entry");
  assert.equal(s.activityLog[0].actor, "human");
  assert.equal(s.activityLog[0].text, "Reset demo data to the seeded scenario");

  // Deterministic across repeated resets: same shape every time.
  const first = JSON.stringify(s.activityLog.map((e) => [e.actor, e.text]));
  reset();
  const s2 = useFocusStore.getState();
  assert.equal(s2.activityLog.length, 1);
  assert.equal(JSON.stringify(s2.activityLog.map((e) => [e.actor, e.text])), first);
});

test("completeFocusBlock mirrors the abandoned result — status contract", () => {
  const st = useFocusStore.getState();
  st.startFocusBlock("management-ch7", 25, "test");
  const outcome = st.completeFocusBlock("abandoned", "test");
  assert.equal(outcome.status, "abandoned", "status must mirror result, not hardcode completed");
  assert.equal(outcome.result, "abandoned");
  const task = useFocusStore.getState().tasks.find((t) => t.id === "management-ch7");
  assert.equal(task.status, "backlog", "abandoned task must NOT be marked completed");
});

test("completeFocusBlock partially_completed marks the task complete with matching status", () => {
  const st = useFocusStore.getState();
  st.startFocusBlock("management-ch7", 25, "test");
  const outcome = st.completeFocusBlock("partially_completed", "test");
  assert.equal(outcome.status, "partially_completed");
  const task = useFocusStore.getState().tasks.find((t) => t.id === "management-ch7");
  assert.equal(task.status, "completed");
});