import useFocusStore from '../../store/focusStore.js';

// EXECUTION SEQUENCE — a quiet, transparent mono readout. The sequence itself
// lives on the map nodes (01/02/03 step labels + durations); this is only a
// discreet reference column. The capacity split marks what actually fits in the
// available time — so changing available time visibly re-scopes the plan.
export default function PlanTimeline() {
  const currentProposal = useFocusStore(s => s.currentProposal);
  const tasks = useFocusStore(s => s.tasks);

  if (!currentProposal) return null;

  const capacity = currentProposal.capacity;
  const fitsSet = capacity ? new Set(capacity.fitsTaskIds) : null;

  return (
    <div className="plan-timeline">
      <div className="plan-timeline-label">EXECUTION SEQUENCE</div>
      {capacity && capacity.fitsCount > 0 && (
        <div className="plan-timeline-capacity">
          {capacity.fitsCount} of {capacity.fitsCount + capacity.overflowCount} fit today
        </div>
      )}
      <div className="timeline-items">
        {currentProposal.orderedTaskIds.map((tid) => {
          const t = tasks.find(tk => tk.id === tid);
          const overflow = fitsSet && !fitsSet.has(tid);
          return (
            <div key={tid} className={`timeline-item ${overflow ? 'is-overflow' : ''}`}>
              <div className="timeline-marker">
                <div className="timeline-dot" />
              </div>
              <div className="timeline-content">
                <span className="timeline-title">{t?.title || tid}</span>
                <span className="timeline-time">{t?.estimatedMinutes || 0}m</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
