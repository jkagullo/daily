import { useEffect, useState } from "react";
import { listDay, type TodayTask } from "../lib/db";

interface Props {
  dateKey: string;
  onClose: () => void;
  /** Changes whenever the panel refreshes, so the list re-reads after a toggle. */
  stamp?: unknown;
}

/** What was on a past day's list, and what got done. Opened by clicking a heatmap square. */
export function DayDetail({ dateKey, onClose, stamp }: Props) {
  const [tasks, setTasks] = useState<TodayTask[] | null>(null);

  useEffect(() => {
    let alive = true;
    listDay(dateKey)
      .then((t) => alive && setTasks(t))
      .catch(() => alive && setTasks([]));
    return () => {
      alive = false;
    };
  }, [dateKey, stamp]);

  // Parse as local midnight, not UTC.
  const [y, m, d] = dateKey.split("-").map(Number);
  const label = new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const done = tasks?.filter((t) => t.completedAt !== null).length ?? 0;

  return (
    <div className="day-detail">
      <div className="day-detail-head">
        <span>
          {label}
          {tasks && tasks.length > 0 && (
            <span className="muted">
              {" "}
              · {done}/{tasks.length} done
            </span>
          )}
        </span>
        <button className="icon-btn" onClick={onClose} aria-label="Close day details">
          ×
        </button>
      </div>
      {tasks === null ? null : tasks.length === 0 ? (
        <p className="muted small">No tasks that day.</p>
      ) : (
        <ul className="day-tasks">
          {tasks.map((t) => (
            <li key={t.instanceId} className={t.completedAt ? "hit" : "miss"}>
              <span aria-hidden="true">{t.completedAt ? "✓" : "–"}</span>
              <span className="title">{t.title}</span>
              {t.completedAt && <time>{t.completedAt.slice(11, 16)}</time>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
