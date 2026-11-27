import { DAY_LABELS, type Recurrence } from "../lib/recurrence";

export type RepeatKind = Recurrence["kind"];

/** Form-friendly recurrence state: the selected kind plus the custom-days choice. */
export interface RepeatDraft {
  kind: RepeatKind;
  days: number[];
}

export function draftFrom(r: Recurrence): RepeatDraft {
  return { kind: r.kind, days: r.kind === "days" ? r.days : [1, 3, 5] };
}

/** Returns an error message, or the Recurrence to save. */
export function draftToRecurrence(d: RepeatDraft): Recurrence | string {
  if (d.kind === "days") return d.days.length ? { kind: "days", days: d.days } : "Pick at least one day";
  return { kind: d.kind };
}

export function RepeatSelect({ value, onChange }: { value: RepeatDraft; onChange: (d: RepeatDraft) => void }) {
  return (
    <select
      value={value.kind}
      onChange={(e) => onChange({ ...value, kind: e.target.value as RepeatKind })}
      aria-label="Repeat"
    >
      <option value="once">Once</option>
      <option value="daily">Daily</option>
      <option value="weekdays">Weekdays</option>
      <option value="days">Days…</option>
    </select>
  );
}

export function DayPicker({ value, onChange }: { value: RepeatDraft; onChange: (d: RepeatDraft) => void }) {
  if (value.kind !== "days") return null;
  const toggle = (d: number) =>
    onChange({ ...value, days: value.days.includes(d) ? value.days.filter((x) => x !== d) : [...value.days, d] });
  return (
    <div className="days">
      {DAY_LABELS.map((label, d) => (
        <button
          key={label}
          type="button"
          className={value.days.includes(d) ? "day on" : "day"}
          onClick={() => toggle(d)}
          aria-pressed={value.days.includes(d)}
          aria-label={label}
        >
          {label[0]}
        </button>
      ))}
    </div>
  );
}
