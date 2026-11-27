import { describe, expect, it } from "vitest";
import { decodeRecurrence, describeRecurrence, encodeRecurrence, occursOn, type Recurrence } from "./recurrence";

// 2026-11-23 is a Monday; the week runs Mon 23 … Sun 29.
const day = (d: number) => new Date(2026, 10, d);
const MON = day(23), WED = day(25), FRI = day(27), SAT = day(28), SUN = day(29);

describe("encode / decode", () => {
  const cases: [Recurrence, string | null][] = [
    [{ kind: "once" }, null],
    [{ kind: "daily" }, "daily"],
    [{ kind: "weekdays" }, "weekdays"],
    [{ kind: "days", days: [1, 3, 5] }, "days:1,3,5"],
  ];

  it.each(cases)("round-trips %j", (r, raw) => {
    expect(encodeRecurrence(r)).toBe(raw);
    expect(decodeRecurrence(raw)).toEqual(r);
  });

  it("sorts custom days so the stored value is stable", () => {
    expect(encodeRecurrence({ kind: "days", days: [5, 1, 3] })).toBe("days:1,3,5");
  });

  it("drops invalid days and treats unknown values as one-off", () => {
    expect(decodeRecurrence("days:1,9,x,3")).toEqual({ kind: "days", days: [1, 3] });
    expect(decodeRecurrence("hourly")).toEqual({ kind: "once" });
  });
});

describe("occursOn", () => {
  it("never auto-schedules one-off tasks", () => {
    expect(occursOn({ kind: "once" }, MON)).toBe(false);
  });

  it("daily is every day", () => {
    for (const d of [MON, SAT, SUN]) expect(occursOn({ kind: "daily" }, d)).toBe(true);
  });

  it("weekdays skips the weekend", () => {
    expect(occursOn({ kind: "weekdays" }, MON)).toBe(true);
    expect(occursOn({ kind: "weekdays" }, FRI)).toBe(true);
    expect(occursOn({ kind: "weekdays" }, SAT)).toBe(false);
    expect(occursOn({ kind: "weekdays" }, SUN)).toBe(false);
  });

  it("custom days only hit the chosen days (Mon/Wed/Fri)", () => {
    const mwf: Recurrence = { kind: "days", days: [1, 3, 5] };
    expect([MON, day(24), WED, day(26), FRI, SAT, SUN].map((d) => occursOn(mwf, d))).toEqual([
      true, false, true, false, true, false, false,
    ]);
  });
});

describe("describeRecurrence", () => {
  it("labels each kind", () => {
    expect(describeRecurrence({ kind: "once" })).toBeNull();
    expect(describeRecurrence({ kind: "weekdays" })).toBe("Weekdays");
    expect(describeRecurrence({ kind: "days", days: [1, 3, 5] })).toBe("Mon, Wed, Fri");
    expect(describeRecurrence({ kind: "days", days: [0, 1, 2, 3, 4, 5, 6] })).toBe("Daily");
  });
});
