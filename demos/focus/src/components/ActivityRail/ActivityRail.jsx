import useFocusStore from "../../store/focusStore.js";

const MAX_EVENTS = 12;

// The judge-visible activity trace. Reads the store's structured activityLog —
// every entry carries an actor ("agent" | "human") — and renders a reverse-
// chronological feed with an actor chip, most recent first. No derivation from
// version numbers, no dev-only "v{n}" noise.
export default function ActivityRail({ style }) {
  const activityLog = useFocusStore((s) => s.activityLog);

  if (!activityLog || activityLog.length === 0) return null;

  const visible = [...activityLog].slice(-MAX_EVENTS).reverse();

  return (
    <div className="activity-rail" style={style}>
      <div className="activity-rail-label">Activity — agent + human</div>
      <div className="activity-list">
        {visible.map((e) => (
          <div key={e.id} className={`activity-item actor-${e.actor}`}>
            <span className={`activity-actor ${e.actor}`}>{e.actor.toUpperCase()}</span>
            <span className="activity-detail">{e.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}