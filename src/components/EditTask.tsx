import { useState, type FormEvent, type KeyboardEvent } from "react";
import type { TodayTask } from "../lib/db";
import type { Recurrence } from "../lib/recurrence";
import { DayPicker, draftFrom, draftToRecurrence, RepeatSelect, type RepeatDraft } from "./RepeatPicker";

interface Props {
  task: TodayTask;
  onSave: (title: string, recurrence: Recurrence) => Promise<void>;
  onCancel: () => void;
}

export function EditTask({ task, onSave, onCancel }: Props) {
  const [title, setTitle] = useState(task.title);
  const [repeat, setRepeat] = useState<RepeatDraft>(() => draftFrom(task.recurrence));
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return setError("Title can't be empty");
    const recurrence = draftToRecurrence(repeat);
    if (typeof recurrence === "string") return setError(recurrence);
    try {
      await onSave(trimmed, recurrence);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the task");
    }
  }

  // Esc cancels the edit instead of bubbling up to the "Esc hides the panel" handler.
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onCancel();
    }
  };

  return (
    <form className="add edit" onSubmit={submit} onKeyDown={onKeyDown}>
      <div className="add-row">
        <input
          autoFocus
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setError(null);
          }}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Task title"
        />
        <RepeatSelect value={repeat} onChange={setRepeat} />
      </div>
      <DayPicker value={repeat} onChange={setRepeat} />
      {error && <p className="error">{error}</p>}
      <div className="edit-actions">
        <span className="hint">Repeat changes apply from tomorrow</span>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="primary">
          Save
        </button>
      </div>
    </form>
  );
}
