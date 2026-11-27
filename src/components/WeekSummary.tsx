import type { DaySummary } from "../lib/db";
import { weekComparison } from "../lib/stats";

/** "This week 78% ↑14 · Last week 64%" */
export function WeekSummary({ summaries, today }: { summaries: DaySummary[]; today: Date }) {
  const { thisWeek, lastWeek } = weekComparison(summaries, today);
  const fmt = (pct: number | null) => (pct === null ? "–" : `${pct}%`);
  const diff = thisWeek.pct !== null && lastWeek.pct !== null ? thisWeek.pct - lastWeek.pct : null;

  return (
    <div className="week">
      <span>
        This week <strong>{fmt(thisWeek.pct)}</strong>
        {diff !== null && diff !== 0 && (
          <span className={diff > 0 ? "delta up" : "delta down"} title="Compared with last week">
            {diff > 0 ? "↑" : "↓"}
            {Math.abs(diff)}
          </span>
        )}
      </span>
      <span className="muted-sep">·</span>
      <span>
        Last week <strong>{fmt(lastWeek.pct)}</strong>
      </span>
    </div>
  );
}
