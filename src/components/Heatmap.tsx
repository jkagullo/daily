import { useMemo } from "react";
import type { DaySummary } from "../lib/db";
import { addDays, toDateKey } from "../lib/date";

export const HEATMAP_WEEKS = 20;

interface Props {
  today: Date;
  summaries: DaySummary[];
  weeks?: number;
  selected?: string | null;
  onSelect?: (dateKey: string) => void;
}

/** 0 = nothing logged, 1–4 = share of that day's tasks completed. */
export function heatLevel(s: DaySummary | undefined): number {
  if (!s || s.total === 0 || s.done === 0) return 0;
  return Math.max(1, Math.ceil((s.done / s.total) * 4));
}

/** First day shown: the Sunday (weeks-1) weeks before this week's Sunday. */
export function heatmapStart(today: Date, weeks = HEATMAP_WEEKS): Date {
  return addDays(today, -today.getDay() - (weeks - 1) * 7);
}

export interface HeatCell {
  key: string;
  date: Date;
  future: boolean;
  level: number;
  summary: DaySummary | undefined;
}

export function buildCells(today: Date, summaries: DaySummary[], weeks: number): HeatCell[] {
  const byDate = new Map(summaries.map((s) => [s.date, s]));
  const start = heatmapStart(today, weeks);
  const todayKey = toDateKey(today);
  return Array.from({ length: weeks * 7 }, (_, i) => {
    const date = addDays(start, i);
    const key = toDateKey(date);
    const summary = byDate.get(key);
    return { key, date, future: key > todayKey, level: heatLevel(summary), summary };
  });
}

export function Heatmap({ today, summaries, weeks = HEATMAP_WEEKS, selected, onSelect }: Props) {
  const cells = useMemo(() => buildCells(today, summaries, weeks), [today, summaries, weeks]);

  return (
    <div className="heatmap" aria-label={`Completion over the last ${weeks} weeks`}>
      {cells.map((c) => {
        if (c.future) return <div key={c.key} className="cell future" />;
        const label = `${c.date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}: ${
          c.summary ? `${c.summary.done}/${c.summary.total} done` : "no tasks"
        }`;
        return (
          <button
            key={c.key}
            className={`cell l${c.level}${selected === c.key ? " selected" : ""}`}
            title={label}
            aria-label={label}
            onClick={() => onSelect?.(c.key)}
          />
        );
      })}
    </div>
  );
}
