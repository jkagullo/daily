// Pure functions over day summaries: no DB, no DOM, so they're unit-tested.
import { addDays, toDateKey } from "./date";
import type { DaySummary } from "./db";

/** Consecutive days (ending today, or yesterday if today has nothing done yet) with ≥1 task done. */
export function streak(summaries: DaySummary[], today: Date): number {
  const doneDays = new Set(summaries.filter((s) => s.done > 0).map((s) => s.date));
  let cursor = doneDays.has(toDateKey(today)) ? today : addDays(today, -1);
  let count = 0;
  while (doneDays.has(toDateKey(cursor))) {
    count++;
    cursor = addDays(cursor, -1);
  }
  return count;
}

export interface WeekStats {
  done: number;
  total: number;
  /** 0–100, or null when nothing was planned that week */
  pct: number | null;
}

/** Sunday of the week `d` falls in (weeks start on Sunday, like the heatmap). */
export function startOfWeek(d: Date): Date {
  return addDays(d, -d.getDay());
}

function sumRange(summaries: DaySummary[], fromKey: string, toKey: string): WeekStats {
  let done = 0;
  let total = 0;
  for (const s of summaries) {
    if (s.date >= fromKey && s.date <= toKey) {
      done += s.done;
      total += s.total;
    }
  }
  return { done, total, pct: total ? Math.round((done / total) * 100) : null };
}

/**
 * This week so far vs. the whole of last week. "This week" stops at today, so
 * a Tuesday isn't compared against seven empty-looking days.
 */
export function weekComparison(summaries: DaySummary[], today: Date): { thisWeek: WeekStats; lastWeek: WeekStats } {
  const thisStart = startOfWeek(today);
  const lastStart = addDays(thisStart, -7);
  return {
    thisWeek: sumRange(summaries, toDateKey(thisStart), toDateKey(today)),
    lastWeek: sumRange(summaries, toDateKey(lastStart), toDateKey(addDays(thisStart, -1))),
  };
}
