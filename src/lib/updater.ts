import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";

export type UpdateState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "none" }
  | { kind: "available"; update: Update }
  | { kind: "installing"; percent: number | null }
  | { kind: "error"; message: string };

/**
 * Ask GitHub Releases (latest.json) whether there's a newer version. The updater
 * verifies the download's signature against the public key in tauri.conf.json,
 * so only builds signed by our release workflow can install.
 */
export async function checkForUpdate(): Promise<Update | null> {
  return check();
}

/** Download, verify, install (NSIS passive mode), then restart into the new version. */
export async function installUpdate(update: Update, onProgress: (percent: number | null) => void): Promise<void> {
  let total = 0;
  let received = 0;
  await update.downloadAndInstall((event) => {
    if (event.event === "Started") {
      total = event.data.contentLength ?? 0;
      onProgress(total ? 0 : null);
    } else if (event.event === "Progress") {
      received += event.data.chunkLength;
      onProgress(total ? Math.min(100, Math.round((received / total) * 100)) : null);
    }
  });
  await relaunch(); // on Windows the installer usually restarts us first
}
