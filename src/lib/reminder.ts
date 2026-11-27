import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { logicalNow, toDateKey } from "./date";
import type { Settings } from "./settings";

const STORAGE_KEY = "daily.lastReminder";
const CHECK_EVERY_MS = 60_000;

interface Progress {
  done: number;
  total: number;
}

async function canNotify(): Promise<boolean> {
  if (await isPermissionGranted()) return true;
  return (await requestPermission()) === "granted";
}

/**
 * Checks once a minute instead of one long setTimeout: a long timer drifts or gets
 * skipped when the PC sleeps, a minute poll just catches up on wake. Fires at most
 * once per day (remembered in localStorage). Settings are read on every check, so
 * changes apply without restarting.
 */
export function startReminder(
  getSettings: () => Settings,
  getProgress: (day: Date) => Promise<Progress>,
): () => void {
  const check = async () => {
    const s = getSettings();
    if (!s.reminderEnabled) return;

    const now = new Date();
    const day = logicalNow(s.dayStartHour, now);
    const [hh, mm] = s.reminderTime.split(":").map(Number);
    const remindAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hh, mm);
    // e.g. day starts 4am, reminder 1am → that's 1am of the *next* calendar date
    if (hh < s.dayStartHour) remindAt.setDate(remindAt.getDate() + 1);
    if (now < remindAt) return;

    const dayKey = toDateKey(day);
    if (localStorage.getItem(STORAGE_KEY) === dayKey) return;
    localStorage.setItem(STORAGE_KEY, dayKey);

    const { done, total } = await getProgress(day);
    if (total === 0 || (done / total) * 100 >= s.reminderThreshold) return;
    if (!(await canNotify())) return;

    const left = total - done;
    sendNotification({
      title: `${Math.round((done / total) * 100)}% done today`,
      body: `${left} task${left === 1 ? "" : "s"} left. Still time to knock a couple out.`,
    });
  };

  void check();
  const id = window.setInterval(() => void check(), CHECK_EVERY_MS);
  return () => window.clearInterval(id);
}
