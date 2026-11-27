import { describe, expect, it } from "vitest";
import { addDays, logicalNow, msUntilNextDay, toDateKey, toTimestamp } from "./date";

// All dates are built with the local-time constructor, so these pass in any timezone.
const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi);

describe("toDateKey / toTimestamp", () => {
  it("formats local dates with zero padding", () => {
    expect(toDateKey(at(2026, 1, 5))).toBe("2026-01-05");
    expect(toTimestamp(at(2026, 11, 27, 9, 4))).toBe("2026-11-27 09:04:00");
  });

  it("uses local time, not UTC (no 8am rollover in UTC+8)", () => {
    expect(toDateKey(at(2026, 11, 27, 0, 30))).toBe("2026-11-27");
    expect(toDateKey(at(2026, 11, 27, 23, 59))).toBe("2026-11-27");
  });
});

describe("addDays", () => {
  it("crosses month and year boundaries", () => {
    expect(toDateKey(addDays(at(2026, 1, 31), 1))).toBe("2026-02-01");
    expect(toDateKey(addDays(at(2026, 12, 31), 1))).toBe("2027-01-01");
    expect(toDateKey(addDays(at(2026, 3, 1), -1))).toBe("2026-02-28");
  });

  it("does not mutate its input", () => {
    const d = at(2026, 5, 10);
    addDays(d, 3);
    expect(toDateKey(d)).toBe("2026-05-10");
  });
});

describe("logicalNow (day start hour)", () => {
  it("is the calendar day when the day starts at midnight", () => {
    expect(toDateKey(logicalNow(0, at(2026, 11, 28, 0, 30)))).toBe("2026-11-28");
  });

  it("counts early hours as the previous day for night owls", () => {
    expect(toDateKey(logicalNow(4, at(2026, 11, 28, 2, 0)))).toBe("2026-11-27");
    expect(toDateKey(logicalNow(4, at(2026, 11, 28, 3, 59)))).toBe("2026-11-27");
    expect(toDateKey(logicalNow(4, at(2026, 11, 28, 4, 0)))).toBe("2026-11-28");
  });

  it("keeps the right weekday for recurrence (2am Sat counts as Fri)", () => {
    expect(logicalNow(4, at(2026, 11, 28, 2, 0)).getDay()).toBe(5); // Friday
  });
});

describe("msUntilNextDay", () => {
  it("counts to the next midnight", () => {
    const ms = msUntilNextDay(0, at(2026, 11, 27, 23, 0));
    expect(Math.round(ms / 60_000)).toBe(60);
  });

  it("counts to today's rollover if it hasn't happened yet", () => {
    const ms = msUntilNextDay(4, at(2026, 11, 28, 2, 0));
    expect(Math.round(ms / 60_000)).toBe(120);
  });

  it("counts to tomorrow's rollover once today's has passed", () => {
    const ms = msUntilNextDay(4, at(2026, 11, 28, 5, 0));
    expect(Math.round(ms / 3_600_000)).toBe(23);
  });
});
