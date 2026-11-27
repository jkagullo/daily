// Recurrence is stored as a short string in tasks.recurrence (see migrations/001_init.sql).

export type Recurrence =
  | { kind: "once" }
  | { kind: "daily" }
  | { kind: "weekdays" }
  | { kind: "days"; days: number[] }; // 0 = Sunday

export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function encodeRecurrence(r: Recurrence): string | null {
  switch (r.kind) {
    case "once":
      return null;
    case "daily":
      return "daily";
    case "weekdays":
      return "weekdays";
    case "days":
      return `days:${[...r.days].sort((a, b) => a - b).join(",")}`;
  }
}

export function decodeRecurrence(raw: string | null): Recurrence {
  if (raw === null) return { kind: "once" };
  if (raw === "daily") return { kind: "daily" };
  if (raw === "weekdays") return { kind: "weekdays" };
  if (raw.startsWith("days:")) {
    const days = raw
      .slice(5)
      .split(",")
      .map(Number)
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
    return { kind: "days", days };
  }
  return { kind: "once" };
}

export function occursOn(r: Recurrence, date: Date): boolean {
  const dow = date.getDay();
  switch (r.kind) {
    case "once":
      return false; // one-offs get their instance at creation time only
    case "daily":
      return true;
    case "weekdays":
      return dow >= 1 && dow <= 5;
    case "days":
      return r.days.includes(dow);
  }
}

export function describeRecurrence(r: Recurrence): string | null {
  switch (r.kind) {
    case "once":
      return null;
    case "daily":
      return "Daily";
    case "weekdays":
      return "Weekdays";
    case "days":
      return r.days.length === 7 ? "Daily" : r.days.map((d) => DAY_LABELS[d]).join(", ");
  }
}
