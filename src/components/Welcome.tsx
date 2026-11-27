import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import botIcon from "../../src-tauri/icons/128x128.png";

interface Props {
  onDone: () => void;
}

/** First-run screen: what Daily is, where it lives, and an autostart opt-in. */
export function Welcome({ onDone }: Props) {
  const [autostart, setAutostart] = useState(true);
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    try {
      await invoke("set_autostart", { enabled: autostart });
    } catch {
      // Not fatal: it can be turned on later in Settings or the tray menu.
    }
    onDone();
  };

  return (
    <div className="welcome">
      <img src={botIcon} alt="" className="welcome-bot" />
      <h1>Hi, I'm Daily</h1>
      <p className="muted">A tiny list for today that lives in your tray.</p>

      <ol className="welcome-tips">
        <li>
          <strong>Click me in the tray</strong> to open your list. Click anywhere else and I tuck away.
        </li>
        <li>
          <strong>Can't find me?</strong> Click the <span className="kbd">^</span> on your taskbar and drag the little
          bot onto the taskbar so I'm always visible.
        </li>
        <li>
          <strong>Repeat tasks</strong> daily, on weekdays, or on the days you choose. Each day starts fresh.
        </li>
      </ol>

      <label className="welcome-check">
        <input type="checkbox" checked={autostart} onChange={(e) => setAutostart(e.target.checked)} />
        Start Daily when Windows starts
      </label>

      <button className="welcome-go" onClick={() => void start()} disabled={busy}>
        Add my first task
      </button>
    </div>
  );
}
