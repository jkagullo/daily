import { getDb } from "./db";

export type Theme = "system" | "light" | "dark";

export const ACCENTS = {
  green: "#1d9e75",
  blue: "#378add",
  purple: "#7f77dd",
  orange: "#d85a30",
  pink: "#d4537e",
} as const;
export type Accent = keyof typeof ACCENTS;

export interface Settings {
  reminderEnabled: boolean;
  /** "HH:MM", 24h local */
  reminderTime: string;
  /** Remind if under this % done */
  reminderThreshold: number;
  /** 0–6. Hour the day rolls over. */
  dayStartHour: number;
  theme: Theme;
  accent: Accent;
  exportTitle: string;
  /** Shown as "made with love by {name}" on exported images */
  exportName: string;
}

export const DEFAULT_SETTINGS: Settings = {
  reminderEnabled: true,
  reminderTime: "21:00",
  reminderThreshold: 50,
  dayStartHour: 0,
  theme: "system",
  accent: "green",
  exportTitle: "My tasks",
  exportName: "",
};

const isSettingsKey = (k: string): k is keyof Settings => k in DEFAULT_SETTINGS;

/** Load saved settings over the defaults. Bad or stale values are ignored, not trusted. */
export async function loadSettings(): Promise<Settings> {
  const conn = await getDb();
  const rows = await conn.select<{ key: string; value: string }[]>("SELECT key, value FROM settings");
  const out: Settings = { ...DEFAULT_SETTINGS };
  const loose = out as unknown as Record<string, unknown>;
  for (const { key, value } of rows) {
    if (!isSettingsKey(key)) continue;
    try {
      const parsed: unknown = JSON.parse(value);
      if (typeof parsed === typeof DEFAULT_SETTINGS[key]) loose[key] = parsed;
    } catch {
      // keep default
    }
  }
  if (!(out.accent in ACCENTS)) out.accent = DEFAULT_SETTINGS.accent;
  if (!["system", "light", "dark"].includes(out.theme)) out.theme = DEFAULT_SETTINGS.theme;
  return out;
}

export async function saveSetting<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
  const conn = await getDb();
  await conn.execute(
    "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, JSON.stringify(value)],
  );
}
