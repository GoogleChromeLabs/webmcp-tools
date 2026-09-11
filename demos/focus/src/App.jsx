import { useState, useEffect } from "react";
import TaskList from "./components/TaskList/TaskList.jsx";
import FocusCenter from "./components/FocusCenter/FocusCenter.jsx";
import PlanTimeline from "./components/PlanTimeline/PlanTimeline.jsx";
import FocusMode from "./components/FocusMode/FocusMode.jsx";
import ActivityRail from "./components/ActivityRail/ActivityRail.jsx";
import useFocusStore, { computePlanOrder } from "./store/focusStore.js";

const TIME_PRESETS = [
  { label: "30m", minutes: 30 },
  { label: "60m", minutes: 60 },
  { label: "90m", minutes: 90 },
  { label: "2h", minutes: 120 },
];

function App() {
  const overloadLevel = useFocusStore((s) => s.overloadLevel);
  const availableMinutes = useFocusStore((s) => s.availableMinutes);
  const defaultAvailableMinutes = useFocusStore((s) => s.defaultAvailableMinutes);
  const bottleneckTaskId = useFocusStore((s) => s.bottleneckTaskId);
  const currentProposal = useFocusStore((s) => s.currentProposal);
  const activeFocusBlock = useFocusStore((s) => s.activeFocusBlock);
  const tasks = useFocusStore((s) => s.tasks);
  const setAvailableMinutes = useFocusStore((s) => s.setAvailableMinutes);
  const setDefaultMinutes = useFocusStore((s) => s.setDefaultMinutes);
  const resetDemo = useFocusStore((s) => s.resetDemo);

  const displayTaskId = currentProposal ? currentProposal.primaryTaskId : bottleneckTaskId;
  const displayTask = displayTaskId ? tasks.find((t) => t.id === displayTaskId) : null;

  const activeCount = tasks.filter((t) => t.status === "backlog").length;
  const isFocusing = activeFocusBlock?.status === "active";
  const allDone = activeCount === 0 && !isFocusing;

  const [customOpen, setCustomOpen] = useState(false);
  const [customMinutes, setCustomMinutes] = useState("");
  const [timeFeedback, setTimeFeedback] = useState("");

  const handlePreset = (minutes) => {
    setCustomOpen(false);
    setCustomMinutes("");
    setAvailableMinutes(minutes);
    setTimeFeedback(`Time set to ${minutes}m`);
    setTimeout(() => setTimeFeedback(""), 2000);
  };
  const handleCustom = () => {
    const m = parseInt(customMinutes, 10);
    if (m > 0) {
      setAvailableMinutes(m);
      setTimeFeedback(`Time set to ${m}m`);
      setTimeout(() => setTimeFeedback(""), 2000);
    }
    setCustomOpen(false);
  };
  const handleSetDefault = () => {
    setDefaultMinutes(availableMinutes);
    setTimeFeedback(`Default saved: ${availableMinutes}m`);
    setTimeout(() => setTimeFeedback(""), 2200);
  };

  const isCustomActive = !TIME_PRESETS.some((p) => p.minutes === availableMinutes);

  // Auto-identify the bottleneck on first load and re-identify when the current
  // bottleneck leaves the backlog (completed/deferred/removed). Without this,
  // completing the bottleneck would leave a stale ID and the guard
  // `!bottleneckTaskId` would never re-run, so the Focus Center could keep
  // recommending a completed task or show "No next task" while backlog remains.
  useEffect(() => {
    if (currentProposal) return;
    const hasBacklog = tasks.some((t) => t.status === "backlog");
    if (!hasBacklog) return;
    const bottleneckTask = bottleneckTaskId ? tasks.find((t) => t.id === bottleneckTaskId) : null;
    const isStale = bottleneckTaskId && (!bottleneckTask || bottleneckTask.status !== "backlog");
    if (!bottleneckTaskId || isStale) {
      useFocusStore.getState().identifyBottleneck();
    }
  }, [currentProposal, bottleneckTaskId, tasks]);

  // Auto-propose a focus block from the bottleneck so Start Here works
  // without an AI agent. The proposal carries the downstream chain and
  // duration, so the Focus Center, timeline, and capacity are populated
  // immediately. The agent's propose_focus_block still works if it runs,
  // but the UI no longer depends on it.
  useEffect(() => {
    if (currentProposal) return;
    if (!bottleneckTaskId) return;
    if (isFocusing) return;
    const task = tasks.find((t) => t.id === bottleneckTaskId);
    if (!task || task.status !== "backlog") return;
    const isBlocked = (task.dependencies || []).some((depId) => {
      const dep = tasks.find((x) => x.id === depId);
      return dep && dep.status !== "completed";
    });
    if (isBlocked) return;
    // Plan order = genuine topological sort of the bottleneck + its dependents.
    const chain = computePlanOrder(tasks, bottleneckTaskId);
    useFocusStore.getState().proposePlan(
      {
        id: "proposal-1",
        primaryTaskId: bottleneckTaskId,
        orderedTaskIds: chain,
        rationale: ["FOCUS recommendation — structural bottleneck (override or replace any time)"],
        confidence: 0.85,
        requiresApproval: false,
        durationMinutes: task.estimatedMinutes || 25,
      },
      "human",
      {
        // Distinguish this built-in preview from an agent proposal in the
        // activity trace — the agent is still the intended driver.
        logText: `FOCUS recommendation ready — start with "${bottleneckTaskId}" (agent can override via propose_focus_block)`,
      }
    );
  }, [bottleneckTaskId, currentProposal, tasks, isFocusing]);

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>

      <header className="top-bar">
        <div className="top-bar-left">
          <h1 className="logo">FOCUS</h1>
          <span className="reticle-dot" aria-hidden="true"></span>
          <span className="top-bar-separator" aria-hidden="true"></span>
          <span className="today-label">TODAY</span>
          <span className="avail-sep" aria-hidden="true">
            ·
          </span>
          <span className="available-time" aria-live="polite" aria-atomic="true">
            <span className="avail-num">
              <span className="avail-value">{availableMinutes}</span>m
            </span>{" "}
            available
            {defaultAvailableMinutes !== availableMinutes && (
              <span className="avail-default-hint"> · default {defaultAvailableMinutes}m</span>
            )}
          </span>

          <div className="time-select" role="group" aria-label="Available time">
            {TIME_PRESETS.map((p) => (
              <button
                key={p.minutes}
                className={`time-preset ${!customOpen && availableMinutes === p.minutes ? "is-active" : ""}`}
                onClick={() => handlePreset(p.minutes)}
                aria-pressed={availableMinutes === p.minutes}
                aria-label={`Set available time to ${p.label}`}
              >
                {p.label}
              </button>
            ))}
            <button
              className={`time-preset ${customOpen || isCustomActive ? "is-active" : ""}`}
              onClick={() => setCustomOpen(!customOpen)}
              aria-expanded={customOpen}
              aria-pressed={isCustomActive}
            >
              custom
            </button>
            {customOpen && (
              <span className="time-select-custom">
                <label className="sr-only" htmlFor="custom-mins">
                  Custom minutes
                </label>
                <input
                  id="custom-mins"
                  type="number"
                  min="15"
                  step="15"
                  placeholder="min"
                  autoFocus
                  value={customMinutes}
                  onChange={(e) => setCustomMinutes(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCustom();
                    if (e.key === "Escape") setCustomOpen(false);
                  }}
                />
                <button className="btn btn-text time-select-set" onClick={handleCustom}>
                  Set
                </button>
              </span>
            )}
            <button className="btn btn-text time-default-btn" onClick={handleSetDefault} title="Save current time as default">
              Set default
            </button>
            {isCustomActive && <span className="time-custom-badge">{availableMinutes}m</span>}
          </div>

          <span className="time-feedback" role="status" aria-live="polite">
            {timeFeedback}
          </span>
        </div>

        <div className="top-bar-right">
          <button className="btn btn-text reset-demo-btn" onClick={() => resetDemo()} title="Restore the seeded demo scenario">
            Reset demo
          </button>
          <span className={`overload-signal ${overloadLevel === "high" ? "is-high" : ""}`} aria-live="polite">
            <span className="overload-lamp" aria-hidden="true"></span>
            OVERLOAD {overloadLevel.toUpperCase()}
          </span>
        </div>
      </header>

      <main id="main" className="main-content">
        <div className="task-pane">
          <TaskList />
          {/* Quiet execution sequence lives under the list on mobile, beside it on desktop via the right rail */}
          <div className="mobile-timeline">
            <PlanTimeline />
          </div>
        </div>

        <aside className="focus-pane" aria-label="Focus and plan">
          {allDone ? (
            <div className="all-clear">
              <span className="reticle-dot" aria-hidden="true"></span>
              <h2 className="all-clear-title">All clear</h2>
              <p className="all-clear-sub">Every task is done. Step away.</p>
            </div>
          ) : displayTask && !isFocusing ? (
            <FocusCenter task={displayTask} />
          ) : isFocusing ? (
            <div className="focus-pane-placeholder">
              <p className="focus-pane-placeholder-title">Focusing</p>
              <p className="focus-pane-placeholder-sub">Complete the block to return to the list.</p>
            </div>
          ) : (
            <div className="focus-pane-placeholder">
              <p className="focus-pane-placeholder-title">No next task</p>
              <p className="focus-pane-placeholder-sub">Add a task to get a recommendation.</p>
            </div>
          )}

          <div className="desktop-timeline">
            <PlanTimeline />
          </div>
          <ActivityRail />
        </aside>
      </main>

      <FocusMode />
    </div>
  );
}

export default App;
