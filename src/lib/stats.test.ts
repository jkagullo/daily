import { describe, expect, it } from "vitest";
import { addDays, toDateKey } from "./date";
import type { DaySummary } from "./db";
import { buildCells, heatLevel, heatmapStart } from "./heatmap";
import { reminderMoment, shouldNudge } from "./schedule";
import { startOfWeek, streak, weekComparison } from "./stats";

const FRI = new Date(2026, 10, 27); // Friday, Nov 27 2026
const sum = (daysAgo: number, done: number, total = 4): DaySummary => ({
  date: toDateKey(addDays(FRI, -daysAgo)),
  done,
  total,
});

describe("streak", () => {
  it("counts back from today when today has progress", () => {
    expect(streak([sum(0, 1), sum(1, 2), sum(2, 4), sum(4, 1)], FRI)).toBe(3);
  });

  it("doesn't break just because today isn't started yet", () => {
    expect(streak([sum(0, 0), sum(1, 2), sum(2, 1)], FRI)).toBe(2);
  });

  it("is 0 when yesterday was missed too", () => {
    expect(streak([sum(2, 3), sum(3, 3)], FRI)).toBe(0);
  });

  it("treats a day with tasks but none done as a break", () => {
    expect(streak([sum(0, 1), sum(1, 0), sum(2, 4)], FRI)).toBe(1);
  });
});

describe("weekComparison (weeks start Sunday)", () => {
  it("finds the Sunday of the week", () => {
    expect(toDateKey(startOfWeek(FRI))).toBe("2026-11-22");
    expect(toDateKey(startOfWeek(new Date(2026, 10, 22)))).toBe("2026-11-22");
  });

  it("sums this week up to today and all of last week", () => {
    const data = [
      sum(0, 2, 4), // Fri (this week)
      sum(5, 4, 4), // Sun Nov 22 (this week)
      sum(6, 1, 4), // Sat Nov 21 (last week)
      sum(12, 3, 4), // Sun Nov 15 (last week)
      sum(13, 4, 4), // Sat Nov 14 (two weeks ago: ignored)
    ];
    const { thisWeek, lastWeek } = weekComparison(data, FRI);
    expect(thisWeek).toEqual({ done: 6, total: 8, pct: 75 });
    expect(lastWeek).toEqual({ done: 4, total: 8, pct: 50 });
  });

  it("reports null % for a week with nothing planned", () => {
    expect(weekComparison([], FRI).lastWeek).toEqual({ done: 0, total: 0, pct: null });
  });
});

describe("heatmap", () => {
  it("maps completion to 0–4 levels", () => {
    expect(heatLevel(undefined)).toBe(0);
    expect(heatLevel({ date: "x", done: 0, total: 5 })).toBe(0);
    expect(heatLevel({ date: "x", done: 1, total: 10 })).toBe(1);
    expect(heatLevel({ date: "x", done: 2, total: 4 })).toBe(2);
    expect(heatLevel({ date: "x", done: 3, total: 4 })).toBe(3);
    expect(heatLevel({ date: "x", done: 4, total: 4 })).toBe(4);
  });

  it("starts on a Sunday and ends in the week containing today", () => {
    const start = heatmapStart(FRI, 20);
    expect(start.getDay()).toBe(0);
    const cells = buildCells(FRI, [], 20);
    expect(cells).toHaveLength(140);
    expect(cells[0].key).toBe(toDateKey(start));
    expect(cells.find((c) => c.key === "2026-11-27")?.future).toBe(false);
    expect(cells.filter((c) => c.future).map((c) => c.key)).toEqual(["2026-11-28"]);
  });
});

describe("reminder schedule", () => {
  it("is due at the set time on the same day", () => {
    const { dayKey, at } = reminderMoment({ reminderTime: "21:00", dayStartHour: 0 }, new Date(2026, 10, 27, 10, 0));
    expect(dayKey).toBe("2026-11-27");
    expect(at).toEqual(new Date(2026, 10, 27, 21, 0));
  });

  it("puts an after-midnight reminder on the next calendar date for night owls", () => {
    // Day starts at 4am, reminder at 1am: at 11pm Friday it's due 1am Saturday.
    const { dayKey, at } = reminderMoment({ reminderTime: "01:00", dayStartHour: 4 }, new Date(2026, 10, 27, 23, 0));
    expect(dayKey).toBe("2026-11-27");
    expect(at).toEqual(new Date(2026, 10, 28, 1, 0));
  });

  it("at 2am (still 'Friday') the same Friday reminder applies", () => {
    const { dayKey } = reminderMoment({ reminderTime: "01:00", dayStartHour: 4 }, new Date(2026, 10, 28, 2, 0));
    expect(dayKey).toBe("2026-11-27");
  });

  it("only nudges below the threshold, and never with nothing planned", () => {
    expect(shouldNudge(1, 4, 50)).toBe(true);
    expect(shouldNudge(2, 4, 50)).toBe(false);
    expect(shouldNudge(0, 0, 50)).toBe(false);
    expect(shouldNudge(3, 4, 100)).toBe(true);
  });
});
