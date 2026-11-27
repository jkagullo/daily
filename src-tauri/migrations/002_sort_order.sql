-- Order lives on the task (not the day's instance) so a recurring task keeps
-- its position every day after you drag it.
ALTER TABLE tasks ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
UPDATE tasks SET sort_order = id;
