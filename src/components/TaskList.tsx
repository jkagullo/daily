import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { TodayTask } from "../lib/db";
import { describeRecurrence, type Recurrence } from "../lib/recurrence";
import { EditTask } from "./EditTask";

interface Props {
  tasks: TodayTask[];
  onToggle: (task: TodayTask) => void;
  onRemove: (task: TodayTask) => void;
  onEdit: (task: TodayTask, title: string, recurrence: Recurrence) => Promise<void>;
  onReorder: (ordered: TodayTask[]) => void;
}

/** Delay single-click toggles slightly so a double-click (edit) doesn't also toggle twice. */
const CLICK_DELAY_MS = 220;

export function TaskList({ tasks, onToggle, onRemove, onEdit, onReorder }: Props) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [dragOrder, setDragOrder] = useState<TodayTask[] | null>(null);
  const dragId = useRef<number | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const clickTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(clickTimer.current), []);

  if (tasks.length === 0) {
    return <p className="empty">Nothing planned yet. Add your first task below.</p>;
  }

  const items = dragOrder ?? tasks;

  // Drag to reorder: pointer events + pointer capture on the grip, no library needed.
  const startDrag = (e: PointerEvent<HTMLSpanElement>, task: TodayTask) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragId.current = task.instanceId;
    setDragOrder(tasks);
  };

  const moveDrag = (e: PointerEvent<HTMLSpanElement>) => {
    if (dragId.current === null || !listRef.current) return;
    const rows = Array.from(listRef.current.children);
    const over = rows.findIndex((row) => {
      const box = row.getBoundingClientRect();
      return e.clientY >= box.top && e.clientY < box.bottom;
    });
    if (over === -1) return;
    setDragOrder((cur) => {
      if (!cur) return cur;
      const from = cur.findIndex((t) => t.instanceId === dragId.current);
      if (from === -1 || from === over) return cur;
      const next = [...cur];
      const [moved] = next.splice(from, 1);
      next.splice(over, 0, moved);
      return next;
    });
  };

  const endDrag = () => {
    const order = dragOrder;
    dragId.current = null;
    setDragOrder(null);
    if (order && order.some((t, i) => t.instanceId !== tasks[i]?.instanceId)) onReorder(order);
  };

  const clickText = (task: TodayTask, clicks: number) => {
    if (clicks > 1) return;
    window.clearTimeout(clickTimer.current);
    clickTimer.current = window.setTimeout(() => onToggle(task), CLICK_DELAY_MS);
  };

  const startEdit = (task: TodayTask) => {
    window.clearTimeout(clickTimer.current);
    setEditingId(task.instanceId);
  };

  return (
    <ul className="tasks" ref={listRef}>
      {items.map((task) => {
        if (task.instanceId === editingId) {
          return (
            <li key={task.instanceId} className="task editing">
              <EditTask
                task={task}
                onCancel={() => setEditingId(null)}
                onSave={async (title, recurrence) => {
                  await onEdit(task, title, recurrence);
                  setEditingId(null);
                }}
              />
            </li>
          );
        }
        const done = task.completedAt !== null;
        const repeat = describeRecurrence(task.recurrence);
        const dragging = dragOrder !== null && task.instanceId === dragId.current;
        return (
          <li key={task.instanceId} className={`task${done ? " done" : ""}${dragging ? " dragging" : ""}`}>
            <span
              className="grip"
              aria-hidden="true"
              title="Drag to reorder"
              onPointerDown={(e) => startDrag(e, task)}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              ⋮⋮
            </span>
            <button className="check" onClick={() => onToggle(task)} aria-pressed={done} aria-label={task.title}>
              {done ? "✓" : ""}
            </button>
            <div
              className="text"
              onClick={(e) => clickText(task, e.detail)}
              onDoubleClick={() => startEdit(task)}
              title={`${task.title}\nClick to check off, double-click to edit`}
            >
              <span className="title">{task.title}</span>
              {repeat && <span className="repeat">↻ {repeat}</span>}
            </div>
            <button
              className="remove"
              onClick={() => onRemove(task)}
              aria-label={repeat ? `Stop repeating ${task.title}` : `Delete ${task.title}`}
              title={repeat ? "Stop repeating" : "Delete"}
            >
              ×
            </button>
          </li>
        );
      })}
    </ul>
  );
}
