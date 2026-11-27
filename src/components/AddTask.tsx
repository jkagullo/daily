import { useState, type FormEvent } from "react";
import type { Recurrence } from "../lib/recurrence";
import { DayPicker, draftToRecurrence, RepeatSelect, type RepeatDraft } from "./RepeatPicker";

interface Props {
  onAdd: (title: string, recurrence: Recurrence) => Promise<void>;
}

export function AddTask({ onAdd }: Props) {
  const [title, setTitle] = useState("");
  const [repeat, setRepeat] = useState<RepeatDraft>({ kind: "once", days: [1, 3, 5] });
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return setError("Enter a task first");
    const recurrence = draftToRecurrence(repeat);
    if (typeof recurrence === "string") return setError(recurrence);
    try {
      await onAdd(trimmed, recurrence);
      setTitle("");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the task");
    }
  }

  return (
    <form className="add" onSubmit={submit}>
      <div className="add-row">
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setError(null);
          }}
          placeholder="Add a task for today"
          aria-label="Task title"
        />
        <RepeatSelect value={repeat} onChange={setRepeat} />
        <button type="submit" aria-label="Add task">
          +
        </button>
      </div>
      <DayPicker value={repeat} onChange={setRepeat} />
      {error && <p className="error">{error}</p>}
    </form>
  );
}
