import { useState, useRef } from "react";
import useFocusStore, { computePlanOrder } from "../../store/focusStore.js";

const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
const PRIORITY_LABEL = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };

export default function TaskList() {
  const tasks = useFocusStore((s) => s.tasks);
  const availableMinutes = useFocusStore((s) => s.availableMinutes);
  const addTask = useFocusStore((s) => s.addTask);
  const toggleTask = useFocusStore((s) => s.toggleTask);
  const deferTask = useFocusStore((s) => s.deferTask);
  const removeTask = useFocusStore((s) => s.removeTask);
  const updateTask = useFocusStore((s) => s.updateTask);

  const [title, setTitle] = useState("");
  const [mins, setMins] = useState("25");
  const [priority, setPriority] = useState("medium");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("active"); // active | all | done
  const [feedback, setFeedback] = useState("");
  const inputRef = useRef(null);

  const currentProposal = useFocusStore((s) => s.currentProposal);
  const bottleneckTaskId = useFocusStore((s) => s.bottleneckTaskId);
  const activeTasks = tasks.filter((t) => t.status === "backlog");
  const doneCount = tasks.filter((t) => t.status === "completed").length;
  // Chain = proposal chain if exists, else bottleneck downstream (so relationships stay visible before the agent proposes)
  const chainIds = (() => {
    if (currentProposal?.orderedTaskIds?.length) return currentProposal.orderedTaskIds;
    if (!bottleneckTaskId) return [];
    return computePlanOrder(tasks, bottleneckTaskId);
  })();
  const chainIndex = new Map(chainIds.map((id, i) => [id, i]));
  const isInChain = (id) => chainIndex.has(id);
  const visible = tasks
    .filter((t) => {
      if (filter === "active") return t.status === "backlog";
      if (filter === "done") return t.status === "completed" || t.status === "deferred";
      return true;
    })
    .slice()
    .sort((a, b) => {
      const pa = PRIORITY_ORDER[a.priority] ?? 2;
      const pb = PRIORITY_ORDER[b.priority] ?? 2;
      if (pa !== pb) return pa - pb;
      const da = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
      const db = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
      return da - db;
    });

  const totalMins = activeTasks.reduce((s, t) => s + (t.estimatedMinutes || 0), 0);
  const fits = availableMinutes >= totalMins;

  const handleAdd = async (e) => {
    e?.preventDefault();
    const clean = title.trim();
    if (!clean) {
      setError("Title required");
      return;
    }
    const m = Math.max(5, Math.min(480, Math.round(Number(mins) || 25)));
    if (!Number.isFinite(m) || m < 5) {
      setError("Enter minutes 5–480");
      return;
    }
    setError("");
    setSaving(true);
    // small tick to show loading state (perceived performance)
    await new Promise((r) => setTimeout(r, 280));
    const res = addTask({ title: clean, estimatedMinutes: m, priority });
    setSaving(false);
    if (res?.status === "created") {
      setTitle("");
      setMins("25");
      setFeedback(`Added "${clean}" · ${m}m`);
      setTimeout(() => setFeedback(""), 2500);
      inputRef.current?.focus();
    }
  };

  const handleToggle = (id) => {
    const t = tasks.find((x) => x.id === id);
    toggleTask(id);
    setFeedback(t?.status === "completed" ? `Reopened "${t.title}"` : `Completed "${t?.title}"`);
    setTimeout(() => setFeedback(""), 2000);
  };

  return (
    <section className="task-list" aria-labelledby="task-list-heading">
      <div className="task-list-header">
        <div className="task-list-heading-row">
          <h2 id="task-list-heading" className="task-list-title">
            Tasks
          </h2>
          <span className="task-list-count" aria-label={`${activeTasks.length} active, ${doneCount} done`}>
            {activeTasks.length} active · {totalMins}m
            <span className={`task-list-fit ${fits ? "is-fits" : "is-over"}`} aria-live="polite">
              {fits ? " · fits today" : ` · ${totalMins - availableMinutes}m over`}
            </span>
          </span>
        </div>

        <div className="task-list-filters" role="tablist" aria-label="Filter tasks">
          {[
            ["active", "Active"],
            ["all", "All"],
            ["done", "Done"],
          ].map(([val, label]) => (
            <button
              key={val}
              role="tab"
              aria-selected={filter === val}
              className={`filter-pill ${filter === val ? "is-active" : ""}`}
              onClick={() => setFilter(val)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Add row — the fast path */}
      <form className="add-row" onSubmit={handleAdd} noValidate aria-label="Add a task">
        <label className="sr-only" htmlFor="add-title">
          Task title
        </label>
        <input
          id="add-title"
          ref={inputRef}
          className="add-input"
          type="text"
          placeholder="Add a task…"
          autoComplete="off"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (error) setError("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setTitle("");
              setError("");
              setMins("25");
            }
          }}
          aria-invalid={!!error}
          aria-describedby={error ? "add-error" : feedback ? "add-feedback" : undefined}
          disabled={saving}
        />

        <label className="sr-only" htmlFor="add-mins">
          Minutes
        </label>
        <input
          id="add-mins"
          className="add-mins"
          type="number"
          min="5"
          max="480"
          step="5"
          inputMode="numeric"
          value={mins}
          onChange={(e) => setMins(e.target.value)}
          aria-label="Estimated minutes"
          disabled={saving}
        />
        <span className="add-mins-suffix" aria-hidden="true">
          m
        </span>

        <label className="sr-only" htmlFor="add-priority">
          Priority
        </label>
        <select
          id="add-priority"
          className="add-select"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          disabled={saving}
          aria-label="Priority"
        >
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        <button type="submit" className="btn btn-primary add-btn" disabled={saving} aria-label="Add task">
          {saving ? (
            <>
              <span className="btn-spinner" aria-hidden="true" />
              Adding…
            </>
          ) : (
            "Add"
          )}
        </button>
      </form>

      {/* Inline feedback / errors — Gate 5 outcome clarity */}
      <div className="add-feedback" aria-live="polite" aria-atomic="true">
        {error && (
          <p id="add-error" className="field-error" role="alert">
            {error}
          </p>
        )}
        {!error && feedback && (
          <p id="add-feedback" className="field-success" role="status">
            {feedback}
          </p>
        )}
        {!error && !feedback && !saving && <span className="field-hint">Press Enter to add · Esc to clear</span>}
        {saving && <span className="field-hint">Saving…</span>}
      </div>

      {/* List */}
      <div className="task-rows" role="list" aria-label="Task list">
        {visible.length === 0 ? (
          <div className="task-empty" role="status">
            <p className="task-empty-title">{filter === "done" ? "Nothing done yet" : filter === "all" ? "No tasks" : "All clear"}</p>
            <p className="task-empty-sub">
              {filter === "active" ? "Add a task above or celebrate — you're caught up." : "Tasks you complete or defer will appear here."}
            </p>
          </div>
        ) : (
          visible.map((t) => {
            const isDone = t.status === "completed" || t.status === "deferred";
            const due = t.dueAt ? new Date(t.dueAt) : null;
            const dueLabel = due ? due.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null;
            const overdue = due ? due.getTime() < Date.now() && !isDone : false;
            const inChain = !isDone && isInChain(t.id);
            const step = inChain ? chainIndex.get(t.id) + 1 : null;
            const depTitles = (t.dependencies || [])
              .map((depId) => tasks.find((x) => x.id === depId)?.title || depId)
              .filter(Boolean)
              .slice(0, 2);
            const blockedBy = depTitles.length ? depTitles.join(" · ") : null;
            return (
              <div
                key={t.id}
                role="listitem"
                className={`task-row ${isDone ? "is-done" : ""} priority-${t.priority} ${inChain ? "is-chain" : ""}`}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleToggle(t.id);
                  }
                  if (e.key === "Delete" || e.key === "Backspace") {
                    // defer as soft delete (recoverable)
                    deferTask(t.id);
                  }
                }}
                aria-label={`${t.title}, ${t.estimatedMinutes} minutes, ${PRIORITY_LABEL[t.priority]}`}
              >
                <button
                  className="task-check"
                  aria-label={isDone ? `Reopen ${t.title}` : `Complete ${t.title}`}
                  aria-pressed={isDone}
                  onClick={() => handleToggle(t.id)}
                >
                  <span className="task-check-box" aria-hidden="true">
                    {isDone && (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                        <path d="M1.5 5.2L4 7.7L8.5 2.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                </button>

                {inChain && (
                  <span className="task-chain-step" aria-hidden="true">
                    {String(step).padStart(2, "0")}
                  </span>
                )}

                <div className="task-row-main">
                  <span className="task-row-title" title={t.title}>
                    {t.title}
                  </span>
                  <span className="task-row-meta">
                    <span className="task-priority" data-priority={t.priority}>
                      {PRIORITY_LABEL[t.priority]}
                    </span>
                    <span className="meta-dot" aria-hidden="true">
                      ·
                    </span>
                    <span className="task-row-mins">{t.estimatedMinutes}m</span>
                    {dueLabel && (
                      <>
                        <span className="meta-dot" aria-hidden="true">
                          ·
                        </span>
                        <span className={`task-row-due ${overdue ? "is-overdue" : ""}`}>Due {dueLabel}</span>
                      </>
                    )}
                    {inChain && (
                      <>
                        <span className="meta-dot" aria-hidden="true">
                          ·
                        </span>
                        <span className="task-row-chain">Chain → {step}/{chainIds.length}</span>
                      </>
                    )}
                    {blockedBy && (
                      <>
                        <span className="meta-dot" aria-hidden="true">
                          ·
                        </span>
                        <span className="task-row-deps" title={blockedBy}>
                          ↳ {blockedBy}
                        </span>
                      </>
                    )}
                    {!blockedBy && t.dependencies?.length > 0 && (
                      <>
                        <span className="meta-dot" aria-hidden="true">
                          ·
                        </span>
                        <span className="task-row-deps">{t.dependencies.length} blocked</span>
                      </>
                    )}
                  </span>
                </div>

                <div className="task-row-actions">
                  <button
                    className="task-action"
                    onClick={() => {
                      const v = prompt("Update minutes (5–480)", String(t.estimatedMinutes));
                      if (v === null) return;
                      const n = Math.max(5, Math.min(480, Math.round(Number(v) || 0)));
                      if (n) updateTask(t.id, { estimatedMinutes: n });
                    }}
                    aria-label={`Edit time for ${t.title}`}
                  >
                    Edit
                  </button>
                  {!isDone ? (
                    <button className="task-action" onClick={() => deferTask(t.id)} aria-label={`Defer ${t.title}`}>
                      Defer
                    </button>
                  ) : (
                    <button className="task-action is-danger" onClick={() => removeTask(t.id)} aria-label={`Remove ${t.title}`}>
                      Remove
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
