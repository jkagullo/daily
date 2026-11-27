// When the evening reminder is due. Kept free of Tauri imports so it's unit-tested.
import { logicalNow, toDateKey } from "./date";

export interface ReminderSchedule {
  /** "HH:MM", 24h local */
  reminderTime: string;
  dayStartHour: number;
}

/**
 * The reminder moment for the day `now` belongs to, plus that day's key.
 * With the day starting at 4am, a 1am reminder means 1am of the *next* calendar
 * date, because that's still the same logical day.
 */
export function reminderMoment(s: ReminderSchedule, now: Date): { dayKey: string; at: Date } {
  const day = logicalNow(s.dayStartHour, now);
  const [hh, mm] = s.reminderTime.split(":").map(Number);
  const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hh, mm);
  if (hh < s.dayStartHour) at.setDate(at.getDate() + 1);
  return { dayKey: toDateKey(day), at };
}

/** Should we nudge? Only once the time has passed, and only below the threshold. */
export function shouldNudge(done: number, total: number, thresholdPct: number): boolean {
  return total > 0 && (done / total) * 100 < thresholdPct;
}
