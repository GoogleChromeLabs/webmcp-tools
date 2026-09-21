import { useState } from 'react';
import useFocusStore from '../../store/focusStore.js';

// The FOCUS CENTER — the one element that answers "what do I do next, and why."
// It is the strongest hierarchy on the page: the graph recedes behind it, and
// this card carries the next action, its cost, what it unlocks, and the
// START / CHANGE PLAN controls.
export default function FocusCenter({ task }) {
  const [showOverride, setShowOverride] = useState(false);
  const [overrideTaskId, setOverrideTaskId] = useState('');
  const [planUpdated, setPlanUpdated] = useState(false);
  const [startError, setStartError] = useState('');

  const tasks = useFocusStore(s => s.tasks);
  const currentProposal = useFocusStore(s => s.currentProposal);
  const activeFocusBlock = useFocusStore(s => s.activeFocusBlock);
  const overridePrimary = useFocusStore(s => s.overridePrimary);
  const startFocusBlock = useFocusStore(s => s.startFocusBlock);

  if (!task) return null;

  // A block just finished → the same card becomes "NEXT UP" for the next task.
  const justCompleted = activeFocusBlock &&
    (activeFocusBlock.status === 'completed' || activeFocusBlock.status === 'partially_completed');
  const eyebrow = justCompleted ? 'NEXT UP' : (planUpdated ? 'NEXT ACTION' : 'START HERE');
  const startLabel = justCompleted ? 'START NEXT' : (planUpdated ? 'APPROVE PLAN' : 'START');

  const primary = currentProposal?.primaryTaskId || task.id;
  const handleStart = () => {
    setStartError('');
    const proposedDuration = currentProposal?.durationMinutes;
    const fallback = tasks.find((t) => t.id === primary)?.estimatedMinutes || 25;
    const result = startFocusBlock(primary, proposedDuration ?? fallback);
    if (result?.status === "error") {
      const msg =
        result.code === "TASK_BLOCKED"
          ? `Can't start — still blocked by ${result.blocked?.join(", ")}`
          : result.code === "TASK_NOT_ACTIVE"
            ? "Can't start — task is no longer active"
            : result.message || "Can't start focus block";
      setStartError(msg);
    }
  };

  const handleOverride = () => {
    if (!overrideTaskId || overrideTaskId === task.id) return;
    overridePrimary(overrideTaskId);
    setPlanUpdated(true);
    setShowOverride(false);
    setOverrideTaskId('');
  };

  const activeTasks = tasks.filter(t => t.status === 'backlog' && t.id !== task.id);
  const unlocks = tasks.filter(t => t.dependencies.includes(task.id));
  const capacity = currentProposal?.capacity || null;

  const dueAt = task.dueAt
    ? new Date(task.dueAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : null;

  return (
    <div className="focus-center">
      {planUpdated && (
        <div className="focus-center-banner">PLAN UPDATED → {task.title} first</div>
      )}

      <div className="focus-center-eyebrow">
        <span className="reticle-dot" aria-hidden="true"></span>
        {eyebrow}
      </div>

      <h2 className="focus-center-title">{task.title}</h2>

      <div className="focus-center-meta">
        <span className="focus-center-duration">{task.estimatedMinutes} min</span>
        {dueAt && <span className="focus-center-deadline">Due {dueAt}</span>}
      </div>

      <div className="focus-center-why">
        {task.priority === 'critical' && (
          <p className="focus-center-reason">Critical — highest urgency</p>
        )}
        {unlocks.length > 0 && (
          <p className="focus-center-reason">
            <span className="focus-center-reason-key">Unlocks</span>{' '}
            {unlocks.map(u => u.title).join(' · ')}
          </p>
        )}
        {capacity && capacity.fitsCount > 0 && (
          <p className="focus-center-reason focus-center-capacity">
            {capacity.fitsCount} of {capacity.fitsCount + capacity.overflowCount} tasks fit today
            {' '}({capacity.fitsMinutes}m of {capacity.totalMinutes}m)
            {capacity.overflowCount > 0 ? ` — ${capacity.overflowCount} don't` : ''}
          </p>
        )}
      </div>

      {startError && (
        <p className="field-error" role="alert" style={{ marginTop: '12px' }}>
          {startError}
        </p>
      )}

      <div className="focus-center-actions">
        <button className="btn btn-secondary" onClick={() => setShowOverride(!showOverride)}>
          CHANGE PLAN
        </button>
        <button className="btn btn-primary" onClick={handleStart}>
          {startLabel}
        </button>
      </div>

      {showOverride && (
        <div className="override-picker">
          <p className="override-picker-label">Choose a new next task:</p>
          <div className="override-options">
            {activeTasks.map(t => (
              <button
                key={t.id}
                className={`override-option ${overrideTaskId === t.id ? 'selected' : ''}`}
                onClick={() => setOverrideTaskId(t.id)}
              >
                <span className="override-option-title">{t.title}</span>
                <span className="override-option-time">{t.estimatedMinutes}m</span>
              </button>
            ))}
          </div>
          <div className="override-confirm">
            <button className="btn btn-primary" disabled={!overrideTaskId} onClick={handleOverride}>
              CONFIRM
            </button>
            <button className="btn btn-secondary" onClick={() => setShowOverride(false)}>CANCEL</button>
          </div>
        </div>
      )}
    </div>
  );
}
