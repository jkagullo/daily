// Heatmap grid math, shared by the panel and the PNG export.
import { addDays, toDateKey } from "./date";
import type { DaySummary } from "./db";

export const HEATMAP_WEEKS = 20;

/** 0 = nothing done, 1–4 = share of that day's tasks completed (quarters, rounded up). */
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

/** weeks × 7 cells, column-major (Sun→Sat), with days after today marked future. */
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
