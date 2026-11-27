// All dates are stored as local-time strings so "today" matches your wall clock,
// not UTC. toISOString() would roll the day over at 8am in Manila.

const pad = (n: number) => String(n).padStart(2, "0");
const HOUR_MS = 3_600_000;

/** YYYY-MM-DD in local time */
export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** YYYY-MM-DD HH:MM:SS in local time */
export function toTimestamp(d: Date): string {
  return `${toDateKey(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

/**
 * The day you're "in". With dayStartHour = 4, 2am Saturday still counts as Friday,
 * so late-night check-offs land on the right day. Use this for anything that asks
 * "what is today", never for timestamps.
 */
export function logicalNow(dayStartHour: number, now = new Date()): Date {
  return new Date(now.getTime() - dayStartHour * HOUR_MS);
}

/** Milliseconds until the next day rollover (dayStartHour:00 local). */
export function msUntilNextDay(dayStartHour: number, now = new Date()): number {
  const next = new Date(now);
  next.setHours(dayStartHour, 0, 0, 50);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

export function formatHeader(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

/** 0–23 → "12 AM", "4 AM", … */
export function formatHour(h: number): string {
  return new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: "numeric" });
}
