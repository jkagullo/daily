-- A task is the definition. recurrence:
--   NULL            one-off (only ever gets the instance created with it)
--   'daily'         every day
--   'weekdays'      Mon-Fri
--   'days:1,3,5'    specific weekdays, 0 = Sunday
CREATE TABLE tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL,
  recurrence  TEXT,
  created_on  TEXT    NOT NULL,            -- YYYY-MM-DD (local)
  archived    INTEGER NOT NULL DEFAULT 0
);

-- An instance is "this task, on this day". It doubles as the log:
-- completed_at set = done, and the heatmap is just a GROUP BY date.
CREATE TABLE task_instances (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id       INTEGER NOT NULL REFERENCES tasks(id),
  date          TEXT    NOT NULL,          -- YYYY-MM-DD (local)
  completed_at  TEXT,                      -- YYYY-MM-DD HH:MM:SS (local)
  UNIQUE (task_id, date)
);

CREATE INDEX idx_instances_date ON task_instances(date);
