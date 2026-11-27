import { useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { formatHour } from "../lib/date";
import { ACCENTS, type Accent, type Settings, type Theme } from "../lib/settings";
import type { UpdateState } from "../lib/updater";

interface Props {
  settings: Settings;
  onChange: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  onBackup: () => Promise<string | null>;
  onRestore: () => Promise<string | null>;
  update: UpdateState;
  onCheckUpdate: () => void;
  onInstallUpdate: () => void;
}

const THRESHOLDS = [25, 50, 75, 100];
const DAY_START_HOURS = [0, 1, 2, 3, 4, 5, 6];
const THEMES: { value: Theme; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="set-row">
      <div className="set-label">
        <span>{label}</span>
        {hint && <span className="set-hint">{hint}</span>}
      </div>
      <div className="set-control">{children}</div>
    </div>
  );
}

function updateHint(u: UpdateState): string | undefined {
  switch (u.kind) {
    case "none":
      return "You're on the latest version";
    case "available":
      return `${u.update.version} is ready to install`;
    case "installing":
      return u.percent !== null ? `Downloading… ${u.percent}%` : "Installing…";
    case "error":
      return "Couldn't check right now. Try again later.";
    default:
      return "Checks for new versions a few times a day";
  }
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span aria-hidden="true" />
    </label>
  );
}

/** Text field that saves on blur / Enter instead of on every keystroke. */
function TextSetting({ value, placeholder, label, onSave }: { value: string; placeholder: string; label: string; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    const v = draft.trim();
    if (v !== value) onSave(v);
  };
  return (
    <input
      className="set-input"
      value={draft}
      placeholder={placeholder}
      aria-label={label}
      maxLength={40}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  );
}

export function SettingsView({ settings, onChange, onBackup, onRestore, update, onCheckUpdate, onInstallUpdate }: Props) {
  const [autostart, setAutostart] = useState<boolean | null>(null);
  const [version, setVersion] = useState("");
  const [dataMsg, setDataMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void invoke<boolean>("get_autostart").then(setAutostart);
    void getVersion().then(setVersion);
  }, []);

  const toggleAutostart = async (enabled: boolean) => {
    try {
      setAutostart(await invoke<boolean>("set_autostart", { enabled }));
    } catch (err) {
      setDataMsg({ text: String(err), error: true });
    }
  };

  const runData = async (action: () => Promise<string | null>) => {
    setBusy(true);
    setDataMsg(null);
    try {
      const msg = await action();
      if (msg) setDataMsg({ text: msg, error: false });
    } catch (err) {
      setDataMsg({ text: err instanceof Error ? err.message : String(err), error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings">
      <h2>Reminder</h2>
      <Row label="Evening reminder" hint="Get a nudge if you're behind">
        <Switch checked={settings.reminderEnabled} onChange={(v) => onChange("reminderEnabled", v)} label="Evening reminder" />
      </Row>
      <div className={settings.reminderEnabled ? "" : "set-disabled"}>
        <Row label="Remind at">
          <input
            type="time"
            className="set-input time"
            value={settings.reminderTime}
            disabled={!settings.reminderEnabled}
            onChange={(e) => e.target.value && onChange("reminderTime", e.target.value)}
            aria-label="Remind at"
          />
        </Row>
        <Row label="If under">
          <select
            value={settings.reminderThreshold}
            disabled={!settings.reminderEnabled}
            onChange={(e) => onChange("reminderThreshold", Number(e.target.value))}
            aria-label="Remind if under"
          >
            {THRESHOLDS.map((t) => (
              <option key={t} value={t}>
                {t === 100 ? "Not all done" : `${t}% done`}
              </option>
            ))}
          </select>
        </Row>
      </div>

      <h2>General</h2>
      <Row label="Start with Windows">
        <Switch
          checked={autostart ?? false}
          onChange={(v) => void toggleAutostart(v)}
          label="Start with Windows"
        />
      </Row>
      <Row label="Day starts at" hint="For night owls: late check-offs count for today">
        <select
          value={settings.dayStartHour}
          onChange={(e) => onChange("dayStartHour", Number(e.target.value))}
          aria-label="Day starts at"
        >
          {DAY_START_HOURS.map((h) => (
            <option key={h} value={h}>
              {h === 0 ? "Midnight" : formatHour(h)}
            </option>
          ))}
        </select>
      </Row>

      <h2>Look</h2>
      <Row label="Theme">
        <div className="segmented" role="radiogroup" aria-label="Theme">
          {THEMES.map((t) => (
            <button
              key={t.value}
              role="radio"
              aria-checked={settings.theme === t.value}
              className={settings.theme === t.value ? "on" : ""}
              onClick={() => onChange("theme", t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </Row>
      <Row label="Accent">
        <div className="swatches" role="radiogroup" aria-label="Accent color">
          {(Object.keys(ACCENTS) as Accent[]).map((a) => (
            <button
              key={a}
              role="radio"
              aria-checked={settings.accent === a}
              aria-label={a}
              title={a[0].toUpperCase() + a.slice(1)}
              className={settings.accent === a ? "swatch on" : "swatch"}
              style={{ background: ACCENTS[a] }}
              onClick={() => onChange("accent", a)}
            />
          ))}
        </div>
      </Row>

      <h2>Export image</h2>
      <Row label="Title">
        <TextSetting
          value={settings.exportTitle}
          placeholder="My tasks"
          label="Export title"
          onSave={(v) => onChange("exportTitle", v || "My tasks")}
        />
      </Row>

      <h2>Data</h2>
      <div className="set-buttons">
        <button disabled={busy} onClick={() => void runData(onBackup)}>
          Back up…
        </button>
        <button disabled={busy} onClick={() => void runData(onRestore)}>
          Restore…
        </button>
      </div>
      {dataMsg && <p className={dataMsg.error ? "error" : "set-ok"}>{dataMsg.text}</p>}
      <p className="set-hint data-hint">Everything stays on this PC. Back up before switching computers.</p>

      <h2>Updates</h2>
      <Row label={`Version ${version || "…"}`} hint={updateHint(update)}>
        {update.kind === "available" ? (
          <button className="set-btn primary" onClick={onInstallUpdate}>
            Update to {update.update.version}
          </button>
        ) : (
          <button className="set-btn" onClick={onCheckUpdate} disabled={update.kind === "checking" || update.kind === "installing"}>
            {update.kind === "checking" ? "Checking…" : "Check now"}
          </button>
        )}
      </Row>

      <p className="about">
        Daily {version && `v${version}`} · made with love by jkdev 🌼
      </p>
    </div>
  );
}
