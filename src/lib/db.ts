import Database from "@tauri-apps/plugin-sql";
import { addDays, toDateKey, toTimestamp } from "./date";
import { decodeRecurrence, encodeRecurrence, occursOn, type Recurrence } from "./recurrence";

// Same URL as DB_URL in src-tauri/src/lib.rs, which is what triggers the migrations.
// The file lives in %APPDATA%\dev.jkdev.daily\daily.db
const DB_URL = "sqlite:daily.db";

let dbPromise: Promise<Database> | null = null;
export function getDb(): Promise<Database> {
  dbPromise ??= Database.load(DB_URL);
  return dbPromise;
}

export interface TodayTask {
  instanceId: number;
  taskId: number;
  title: string;
  recurrence: Recurrence;
  completedAt: string | null;
}

export interface DaySummary {
  date: string;
  total: number;
  done: number;
}

export interface LogEntry {
  title: string;
  completedAt: string;
}

/** Create today's instances for every recurring task that falls on this day. Idempotent. */
export async function ensureDay(date: Date): Promise<void> {
  const conn = await getDb();
  const key = toDateKey(date);
  const rows = await conn.select<{ id: number; recurrence: string }[]>(
    "SELECT id, recurrence FROM tasks WHERE archived = 0 AND recurrence IS NOT NULL AND created_on <= $1",
    [key],
  );
  for (const row of rows) {
    if (occursOn(decodeRecurrence(row.recurrence), date)) {
      await conn.execute("INSERT OR IGNORE INTO task_instances (task_id, date) VALUES ($1, $2)", [row.id, key]);
    }
  }
}

/** All task instances for a day (YYYY-MM-DD), in the user's drag order. */
export async function listDay(dateKey: string): Promise<TodayTask[]> {
  const conn = await getDb();
  const rows = await conn.select<
    { instance_id: number; task_id: number; title: string; recurrence: string | null; completed_at: string | null }[]
  >(
    `SELECT i.id AS instance_id, t.id AS task_id, t.title, t.recurrence, i.completed_at
       FROM task_instances i JOIN tasks t ON t.id = i.task_id
      WHERE i.date = $1
      ORDER BY t.sort_order, i.id`,
    [dateKey],
  );
  return rows.map((r) => ({
    instanceId: r.instance_id,
    taskId: r.task_id,
    title: r.title,
    recurrence: decodeRecurrence(r.recurrence),
    completedAt: r.completed_at,
  }));
}

export async function addTask(title: string, recurrence: Recurrence, date: Date): Promise<void> {
  const conn = await getDb();
  const key = toDateKey(date);
  const res = await conn.execute(
    `INSERT INTO tasks (title, recurrence, created_on, sort_order)
     VALUES ($1, $2, $3, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM tasks))`,
    [title, encodeRecurrence(recurrence), key],
  );
  const taskId = res.lastInsertId;
  if (taskId === undefined) throw new Error("Insert did not return an id");
  if (recurrence.kind === "once" || occursOn(recurrence, date)) {
    await conn.execute("INSERT OR IGNORE INTO task_instances (task_id, date) VALUES ($1, $2)", [taskId, key]);
  }
}

/**
 * Rename a task and/or change how it repeats. Today's copy stays on today's list
 * either way; the new schedule applies from tomorrow.
 */
export async function updateTask(taskId: number, title: string, recurrence: Recurrence): Promise<void> {
  const conn = await getDb();
  await conn.execute("UPDATE tasks SET title = $1, recurrence = $2 WHERE id = $3", [
    title,
    encodeRecurrence(recurrence),
    taskId,
  ]);
}

/** Persist a new order. taskIds is the full visible list, top to bottom. */
export async function reorderTasks(taskIds: number[]): Promise<void> {
  const conn = await getDb();
  for (const [index, id] of taskIds.entries()) {
    await conn.execute("UPDATE tasks SET sort_order = $1 WHERE id = $2", [index + 1, id]);
  }
}

export async function setDone(instanceId: number, done: boolean): Promise<void> {
  const conn = await getDb();
  await conn.execute("UPDATE task_instances SET completed_at = $1 WHERE id = $2", [
    done ? toTimestamp(new Date()) : null,
    instanceId,
  ]);
}

/**
 * Remove a task from today. Recurring tasks are archived (so past days stay in the
 * heatmap); one-offs are deleted outright.
 */
export async function removeTask(task: TodayTask): Promise<void> {
  const conn = await getDb();
  await conn.execute("DELETE FROM task_instances WHERE id = $1", [task.instanceId]);
  if (task.recurrence.kind === "once") {
    await conn.execute("DELETE FROM tasks WHERE id = $1", [task.taskId]);
  } else {
    await conn.execute("UPDATE tasks SET archived = 1 WHERE id = $1", [task.taskId]);
  }
}

export async function daySummaries(from: Date): Promise<DaySummary[]> {
  const conn = await getDb();
  return conn.select<DaySummary[]>(
    `SELECT date,
            COUNT(*) AS total,
            SUM(CASE WHEN completed_at IS NOT NULL THEN 1 ELSE 0 END) AS done
       FROM task_instances
      WHERE date >= $1
      GROUP BY date`,
    [toDateKey(from)],
  );
}

export async function recentLog(limit = 5): Promise<LogEntry[]> {
  const conn = await getDb();
  const rows = await conn.select<{ title: string; completed_at: string }[]>(
    `SELECT t.title, i.completed_at
       FROM task_instances i JOIN tasks t ON t.id = i.task_id
      WHERE i.completed_at IS NOT NULL
      ORDER BY i.completed_at DESC
      LIMIT $1`,
    [limit],
  );
  return rows.map((r) => ({ title: r.title, completedAt: r.completed_at }));
}

/** Consecutive days (ending today, or yesterday if today has nothing done yet) with ≥1 task done. */
export function streak(summaries: DaySummary[], today: Date): number {
  const doneDays = new Set(summaries.filter((s) => s.done > 0).map((s) => s.date));
  let cursor = doneDays.has(toDateKey(today)) ? today : addDays(today, -1);
  let count = 0;
  while (doneDays.has(toDateKey(cursor))) {
    count++;
    cursor = addDays(cursor, -1);
  }
  return count;
}

/** Write a consistent copy of the whole database to `path` (works while it's open). */
export async function backupTo(path: string): Promise<void> {
  const conn = await getDb();
  await conn.execute("VACUUM INTO $1", [path]);
}

/** Close the connection so the file can be replaced (restore). The next query reopens it. */
export async function closeDb(): Promise<void> {
  if (!dbPromise) return;
  const conn = await dbPromise;
  dbPromise = null;
  await conn.close();
}
