import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AddTask } from "./components/AddTask";
import { DayDetail } from "./components/DayDetail";
import { Heatmap } from "./components/Heatmap";
import { BackIcon, CloseIcon, GearIcon, PinIcon } from "./components/icons";
import { SettingsView } from "./components/SettingsView";
import { TaskList } from "./components/TaskList";
import { WeekSummary } from "./components/WeekSummary";
import { Welcome } from "./components/Welcome";
import {
  addTask,
  backupTo,
  closeDb,
  daySummaries,
  ensureDay,
  hasAnyTasks,
  listDay,
  recentLog,
  removeTask,
  reorderTasks,
  setDone,
  updateTask,
  type DaySummary,
  type LogEntry,
  type TodayTask,
} from "./lib/db";
import { formatHeader, logicalNow, msUntilNextDay, toDateKey } from "./lib/date";
import { exportHeatmap } from "./lib/exportImage";
import { heatmapStart, HEATMAP_WEEKS } from "./lib/heatmap";
import type { Recurrence } from "./lib/recurrence";
import { startReminder } from "./lib/reminder";
import { streak } from "./lib/stats";
import { ACCENTS, DEFAULT_SETTINGS, loadSettings, saveSetting, type Settings } from "./lib/settings";
import { applyAppearance, hexToRgb } from "./lib/theme";
import { checkForUpdate, installUpdate, type UpdateState } from "./lib/updater";
import "./styles.css";

const appWindow = getCurrentWindow();

const UNDO_MS = 5000;
const countDone = (tasks: TodayTask[]) => tasks.filter((t) => t.completedAt !== null).length;
const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));

export default function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  // Ref mirror so long-lived callbacks (refresh, reminder) always read the latest settings.
  const settingsRef = useRef<Settings>(DEFAULT_SETTINGS);
  const [view, setView] = useState<"today" | "settings" | "welcome">("today");
  const [today, setToday] = useState(() => new Date());
  const [tasks, setTasks] = useState<TodayTask[]>([]);
  const [summaries, setSummaries] = useState<DaySummary[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [pinned, setPinned] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updateState, setUpdateState] = useState<UpdateState>({ kind: "idle" });

  /** `manual` = from the Settings button, so show "up to date" / errors instead of staying quiet. */
  const runUpdateCheck = useCallback(async (manual: boolean) => {
    if (manual) setUpdateState({ kind: "checking" });
    try {
      const update = await checkForUpdate();
      if (update) setUpdateState({ kind: "available", update });
      else if (manual) setUpdateState({ kind: "none" });
    } catch (err) {
      if (manual) setUpdateState({ kind: "error", message: errText(err) });
    }
  }, []);

  const startUpdate = async () => {
    if (updateState.kind !== "available") return;
    const { update } = updateState;
    setUpdateState({ kind: "installing", percent: null });
    try {
      await installUpdate(update, (percent) => setUpdateState({ kind: "installing", percent }));
    } catch (err) {
      setUpdateState({ kind: "error", message: errText(err) });
    }
  };

  // Check once per launch (like Discord), a few seconds in so startup stays snappy.
  // Settings → Updates → "Check now" covers anything in between.
  useEffect(() => {
    const id = window.setTimeout(() => void runUpdateCheck(false), 5000);
    return () => window.clearTimeout(id);
  }, [runUpdateCheck]);

  const refresh = useCallback(async () => {
    try {
      const s = settingsRef.current;
      const day = logicalNow(s.dayStartHour);
      // Only swap the Date object when the day actually changed, so memoized
      // children (heatmap) don't recompute on every focus.
      setToday((prev) => (toDateKey(prev) === toDateKey(day) ? prev : day));
      await ensureDay(day);
      const [t, sums, l] = await Promise.all([listDay(toDateKey(day)), daySummaries(heatmapStart(day)), recentLog()]);
      setTasks(t);
      setSummaries(sums);
      setLog(l);
      setError(null);
      // Tray icon progress bar + tooltip
      void invoke("set_progress", { done: countDone(t), total: t.length, color: hexToRgb(ACCENTS[s.accent]) });
    } catch (err) {
      setError(errText(err));
    }
  }, []);

  // Load settings first (they decide what "today" is), then data. Refresh again on focus.
  useEffect(() => {
    void (async () => {
      try {
        const s = await loadSettings();
        settingsRef.current = s;
        setSettings(s);
        if (!s.onboarded) {
          if (await hasAnyTasks()) {
            // Existing user from before the welcome screen existed: skip it.
            settingsRef.current = { ...s, onboarded: true };
            setSettings(settingsRef.current);
            await saveSetting("onboarded", true);
          } else {
            setView("welcome");
            await invoke("open_panel"); // new users shouldn't have to find the tray icon first
          }
        }
      } catch (err) {
        setError(errText(err));
      }
      await refresh();
    })();
    const unlisten = appWindow.onFocusChanged(({ payload: focused }) => {
      if (focused) void refresh();
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [refresh]);

  useEffect(() => applyAppearance(settings.theme, settings.accent), [settings.theme, settings.accent]);

  // Day rollover (also resets the tray progress bar).
  useEffect(() => {
    const id = setTimeout(() => void refresh(), msUntilNextDay(settings.dayStartHour));
    return () => clearTimeout(id);
  }, [today, settings.dayStartHour, refresh]);

  // Evening nudge. Reads the DB directly so it's right even if the panel is stale.
  useEffect(
    () =>
      startReminder(
        () => settingsRef.current,
        async (day) => {
          await ensureDay(day);
          const t = await listDay(toDateKey(day));
          return { done: countDone(t), total: t.length };
        },
      ),
    [],
  );

  // Esc: back out of settings, otherwise hide the panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (view === "settings") setView("today");
      else void appWindow.hide();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view]);

  const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    const next = { ...settingsRef.current, [key]: value };
    settingsRef.current = next;
    setSettings(next);
    saveSetting(key, value).catch((err: unknown) => setError(errText(err)));
    if (key === "dayStartHour" || key === "accent") void refresh();
  };

  // Undo on remove: hide the task now, delete it for real after UNDO_MS unless undone.
  const [pendingRemove, setPendingRemove] = useState<TodayTask | null>(null);
  const removeTimer = useRef<number | undefined>(undefined);
  const pendingRef = useRef<TodayTask | null>(null);

  const commitRemove = useCallback(async () => {
    window.clearTimeout(removeTimer.current);
    const task = pendingRef.current;
    pendingRef.current = null;
    setPendingRemove(null);
    if (!task) return;
    try {
      await removeTask(task);
    } catch (err) {
      setError(errText(err));
    }
    await refresh();
  }, [refresh]);

  const handleRemove = (task: TodayTask) => {
    if (pendingRef.current) void commitRemove(); // only one undo slot: finish the previous one
    pendingRef.current = task;
    setPendingRemove(task);
    removeTimer.current = window.setTimeout(() => void commitRemove(), UNDO_MS);
  };

  const undoRemove = () => {
    window.clearTimeout(removeTimer.current);
    pendingRef.current = null;
    setPendingRemove(null);
  };

  // Don't lose a pending delete if the panel unmounts (e.g. reload).
  useEffect(() => () => void commitRemove(), [commitRemove]);

  const run = async (action: () => Promise<void>) => {
    try {
      await action();
    } catch (err) {
      setError(errText(err));
    }
    await refresh();
  };

  const togglePin = async () => {
    const next = !pinned;
    await invoke("set_pinned", { pinned: next });
    setPinned(next);
  };

  const handleReorder = (ordered: TodayTask[]) => {
    setTasks(ordered); // optimistic, so the row doesn't snap back while saving
    void run(() => reorderTasks(ordered.map((t) => t.taskId)));
  };

  const handleEdit = async (task: TodayTask, title: string, recurrence: Recurrence) => {
    await updateTask(task.taskId, title, recurrence);
    await refresh();
  };

  const handleExport = async () => {
    try {
      const saved = await exportHeatmap({
        today,
        summaries,
        streak: streak(summaries, today),
        accent: ACCENTS[settings.accent],
        title: settings.exportTitle,
      });
      setExportMsg(saved ? "Saved" : null);
      if (saved) setTimeout(() => setExportMsg(null), 2000);
    } catch (err) {
      setError(errText(err));
    }
  };

  const handleBackup = async (): Promise<string | null> => {
    const path = await invoke<string | null>("pick_backup_path", {
      fileName: `daily-backup-${toDateKey(new Date())}.db`,
    });
    if (!path) return null;
    await backupTo(path);
    return "Backup saved";
  };

  const handleRestore = async (): Promise<string | null> => {
    const path = await invoke<string | null>("pick_restore_file");
    if (!path) return null;
    await closeDb(); // release the file so it can be replaced
    await invoke("finish_restore", { path });
    const s = await loadSettings(); // reopens the DB (and runs any newer migrations)
    settingsRef.current = s;
    setSettings(s);
    await refresh();
    return "Restored from backup";
  };

  const visibleTasks = pendingRemove ? tasks.filter((t) => t.instanceId !== pendingRemove.instanceId) : tasks;
  const doneCount = countDone(visibleTasks);
  const pct = visibleTasks.length ? Math.round((doneCount / visibleTasks.length) * 100) : 0;
  const streakDays = streak(summaries, today);

  const closeButton = (
    <button className="icon-btn" onClick={() => void appWindow.hide()} aria-label="Close" title="Close (Esc)">
      <CloseIcon />
    </button>
  );

  if (view === "welcome") {
    return (
      <main className="panel">
        <header className="header" data-tauri-drag-region>
          <span data-tauri-drag-region />
          <div className="header-actions">{closeButton}</div>
        </header>
        <section className="scroll">
          <Welcome
            onDone={() => {
              updateSetting("onboarded", true);
              setView("today");
              setTimeout(() => document.querySelector<HTMLInputElement>(".add input")?.focus(), 50);
            }}
          />
        </section>
      </main>
    );
  }

  if (view === "settings") {
    return (
      <main className="panel">
        <header className="header" data-tauri-drag-region>
          <div className="header-title" data-tauri-drag-region>
            <button className="icon-btn" onClick={() => setView("today")} aria-label="Back" title="Back (Esc)">
              <BackIcon />
            </button>
            <h1 data-tauri-drag-region>Settings</h1>
          </div>
          <div className="header-actions">{closeButton}</div>
        </header>
        {error && <p className="error">{error}</p>}
        <section className="scroll">
          <SettingsView
            settings={settings}
            onChange={updateSetting}
            onBackup={handleBackup}
            onRestore={handleRestore}
            update={updateState}
            onCheckUpdate={() => void runUpdateCheck(true)}
            onInstallUpdate={() => void startUpdate()}
          />
        </section>
      </main>
    );
  }

  return (
    <main className="panel">
      <header className="header" data-tauri-drag-region>
        <div data-tauri-drag-region>
          <h1 data-tauri-drag-region>{formatHeader(today)}</h1>
          <p className="muted" data-tauri-drag-region>
            {doneCount} of {visibleTasks.length} done
          </p>
        </div>
        <div className="header-actions">
          <button
            className={pinned ? "icon-btn on" : "icon-btn"}
            onClick={() => void togglePin()}
            aria-pressed={pinned}
            title={pinned ? "Pinned: stays open. Drag the header to move." : "Pin open"}
          >
            <PinIcon />
          </button>
          <button className="icon-btn" onClick={() => setView("settings")} aria-label="Settings" title="Settings">
            <GearIcon />
          </button>
          {closeButton}
        </div>
      </header>

      <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="track">
          <div className="fill" style={{ width: `${pct}%` }} />
        </div>
        <span>{pct}%</span>
      </div>

      {error && <p className="error">{error}</p>}

      {(updateState.kind === "available" || updateState.kind === "installing") && (
        <div className="update-bar" role="status">
          {updateState.kind === "available" ? (
            <>
              <span>Daily {updateState.update.version} is out</span>
              <button className="link-btn" onClick={() => void startUpdate()}>
                Update and restart
              </button>
            </>
          ) : (
            <span>Updating{updateState.percent !== null ? ` · ${updateState.percent}%` : "…"}</span>
          )}
        </div>
      )}

      <section className="scroll">
        <h2>Today</h2>
        <TaskList
          tasks={visibleTasks}
          onToggle={(t) => void run(() => setDone(t.instanceId, t.completedAt === null))}
          onRemove={handleRemove}
          onEdit={handleEdit}
          onReorder={handleReorder}
        />
        <AddTask
          onAdd={async (title, recurrence) => {
            await addTask(title, recurrence, logicalNow(settingsRef.current.dayStartHour));
            await refresh();
          }}
        />

        <h2 className="split">
          <span>Last {HEATMAP_WEEKS} weeks</span>
          <span className="split-right">
            <span>{streakDays} day streak</span>
            <button className="link-btn" onClick={() => void handleExport()} title="Save the heatmap as a PNG">
              {exportMsg ?? "Export PNG"}
            </button>
          </span>
        </h2>
        <Heatmap
          today={today}
          summaries={summaries}
          selected={selectedDay}
          onSelect={(key) => setSelectedDay((cur) => (cur === key ? null : key))}
        />
        <WeekSummary summaries={summaries} today={today} />
        {selectedDay && <DayDetail dateKey={selectedDay} stamp={summaries} onClose={() => setSelectedDay(null)} />}

        <h2>Log</h2>
        {log.length === 0 ? (
          <p className="muted small">No tasks done yet.</p>
        ) : (
          <ul className="log">
            {log.map((entry) => (
              <li key={`${entry.completedAt}-${entry.title}`}>
                <time>{entry.completedAt.slice(5, 16)}</time>
                <span>{entry.title}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {pendingRemove && (
        <div className="toast" role="status">
          <span className="toast-text">
            {pendingRemove.recurrence.kind === "once" ? "Deleted" : "Stopped repeating"} “{pendingRemove.title}”
          </span>
          <button className="link-btn" onClick={undoRemove}>
            Undo
          </button>
        </div>
      )}
    </main>
  );
}
