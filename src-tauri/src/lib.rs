use std::path::PathBuf;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use tauri::image::Image;
use tauri::ipc::{InvokeBody, Request};
use tauri::menu::{CheckMenuItem, Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, State, WebviewWindow, WindowEvent, Wry};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_positioner::{Position, WindowExt};
use tauri_plugin_sql::{Migration, MigrationKind};

/// Must match DB_URL in src/lib/db.ts. tauri-plugin-sql keeps it in the app config dir.
const DB_URL: &str = "sqlite:daily.db";
const DB_FILE: &str = "daily.db";
const TRAY_ID: &str = "tray";
/// Tray base image. The bot leaves the bottom 2/16 rows empty for the progress bar.
const TRAY_BASE: &[u8] = include_bytes!("../icons/32x32.png");
const DEFAULT_ACCENT: [u8; 3] = [0x1d, 0x9e, 0x75];

/// Panel behaviour shared between the tray handler, window events and commands.
#[derive(Default)]
struct PanelState {
    /// Pinned = stay visible when the panel loses focus.
    pinned: AtomicBool,
    /// Set while a native dialog is open, since it steals focus from the panel.
    dialog_open: AtomicBool,
    /// When the panel last auto-hid on blur. Clicking the tray icon blurs the
    /// panel *before* the click event arrives, so without this the click would
    /// immediately re-open the panel it just closed.
    last_blur_hide: Mutex<Option<Instant>>,
    /// Tray menu checkbox, kept so the settings screen can keep it in sync.
    autostart_item: Mutex<Option<CheckMenuItem<Wry>>>,
}

fn show_panel(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        // Positioner only knows where the tray is after the first tray event;
        // before that (first launch), fall back to the screen centre.
        if win.move_window(Position::TrayCenter).is_err() {
            let _ = win.center();
        }
        let _ = win.show();
        let _ = win.set_focus();
    }
}

fn toggle_panel(app: &AppHandle) {
    let Some(win) = app.get_webview_window("main") else { return };
    if win.is_visible().unwrap_or(false) {
        let _ = win.hide();
        return;
    }
    let state = app.state::<PanelState>();
    let just_hidden = state
        .last_blur_hide
        .lock()
        .ok()
        .and_then(|t| *t)
        .is_some_and(|t| t.elapsed() < Duration::from_millis(250));
    if !just_hidden {
        show_panel(app);
    }
}

fn panel(app: &AppHandle) -> Result<WebviewWindow, String> {
    app.get_webview_window("main").ok_or_else(|| "panel window missing".to_string())
}

/// Run a blocking native dialog without the panel auto-hiding underneath it.
fn with_dialog<R>(app: &AppHandle, f: impl FnOnce(&WebviewWindow) -> R) -> Result<R, String> {
    let win = panel(app)?;
    let state = app.state::<PanelState>();
    state.dialog_open.store(true, Ordering::Relaxed);
    let out = f(&win);
    state.dialog_open.store(false, Ordering::Relaxed);
    let _ = win.set_focus();
    Ok(out)
}

fn db_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_config_dir().map_err(|e| e.to_string())?.join(DB_FILE))
}

/// Paint a progress bar along the bottom rows of the tray image.
fn progress_icon(done: u32, total: u32, color: [u8; 3]) -> tauri::Result<Image<'static>> {
    let base = Image::from_bytes(TRAY_BASE)?;
    let (w, h) = (base.width(), base.height());
    let mut rgba = base.rgba().to_vec();
    if total > 0 {
        let bar_h = (h / 8).max(2);
        let filled = (u64::from(w) * u64::from(done.min(total)) / u64::from(total)) as u32;
        for y in (h - bar_h)..h {
            for x in 0..w {
                let i = ((y * w + x) * 4) as usize;
                let px: [u8; 4] = if x < filled {
                    [color[0], color[1], color[2], 0xff]
                } else {
                    [0x9c, 0x9a, 0x93, 0x99] // translucent grey track
                };
                rgba[i..i + 4].copy_from_slice(&px);
            }
        }
    }
    Ok(Image::new_owned(rgba, w, h))
}

/// Used on first launch so new users see the panel without hunting for the tray icon.
#[tauri::command]
fn open_panel(app: AppHandle) {
    show_panel(&app);
}

#[tauri::command]
fn set_pinned(state: State<'_, PanelState>, pinned: bool) {
    state.pinned.store(pinned, Ordering::Relaxed);
}

#[tauri::command]
fn set_progress(app: AppHandle, done: u32, total: u32, color: Option<[u8; 3]>) -> Result<(), String> {
    let Some(tray) = app.tray_by_id(TRAY_ID) else { return Ok(()) };
    let icon = progress_icon(done, total, color.unwrap_or(DEFAULT_ACCENT)).map_err(|e| e.to_string())?;
    tray.set_icon(Some(icon)).map_err(|e| e.to_string())?;
    let tip = match (done * 100).checked_div(total) {
        Some(pct) => format!("Daily: {done} of {total} done ({pct}%)"),
        None => "Daily: nothing planned".to_string(),
    };
    tray.set_tooltip(Some(tip)).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_autostart(app: AppHandle) -> bool {
    app.autolaunch().is_enabled().unwrap_or(false)
}

#[tauri::command]
fn set_autostart(app: AppHandle, enabled: bool) -> Result<bool, String> {
    let launcher = app.autolaunch();
    if enabled {
        launcher.enable().map_err(|e| e.to_string())?;
    } else {
        launcher.disable().map_err(|e| e.to_string())?;
    }
    let now = launcher.is_enabled().unwrap_or(false);
    if let Ok(item) = app.state::<PanelState>().autostart_item.lock()
        && let Some(item) = item.as_ref()
    {
        let _ = item.set_checked(now);
    }
    Ok(now)
}

/// Receives raw PNG bytes from the panel, asks where to save, writes the file.
/// Returns false if the user cancelled. The save path never passes through JS.
#[tauri::command]
async fn export_png(app: AppHandle, request: Request<'_>) -> Result<bool, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected raw PNG bytes".into());
    };
    let file_name = request
        .headers()
        .get("x-file-name")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("my-tasks.png")
        .to_string();
    let picked = with_dialog(&app, |win| {
        app.dialog()
            .file()
            .set_parent(win) // owned by the panel, so it stays above the always-on-top window
            .set_title("Save heatmap")
            .set_file_name(&file_name)
            .add_filter("PNG image", &["png"])
            .blocking_save_file()
    })?;
    let Some(path) = picked else { return Ok(false) };
    let path = path.into_path().map_err(|e| e.to_string())?;
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(true)
}

/// Ask where to save a backup. The panel then runs `VACUUM INTO <path>`, which
/// writes a consistent copy even while the database is open.
#[tauri::command]
async fn pick_backup_path(app: AppHandle, file_name: String) -> Result<Option<String>, String> {
    let picked = with_dialog(&app, |win| {
        app.dialog()
            .file()
            .set_parent(win)
            .set_title("Back up Daily data")
            .set_file_name(&file_name)
            .add_filter("Daily backup", &["db"])
            .blocking_save_file()
    })?;
    let Some(path) = picked else { return Ok(None) };
    let path = path.into_path().map_err(|e| e.to_string())?;
    // VACUUM INTO refuses to overwrite; the dialog already confirmed replacing it.
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(Some(path.to_string_lossy().into_owned()))
}

/// Pick a backup file, check it's really a SQLite file, and confirm. Returns the
/// path; the panel closes its DB connection and then calls `finish_restore`.
#[tauri::command]
async fn pick_restore_file(app: AppHandle) -> Result<Option<String>, String> {
    let picked = with_dialog(&app, |win| {
        app.dialog()
            .file()
            .set_parent(win)
            .set_title("Restore Daily data")
            .add_filter("Daily backup", &["db"])
            .blocking_pick_file()
    })?;
    let Some(path) = picked else { return Ok(None) };
    let path = path.into_path().map_err(|e| e.to_string())?;

    let mut header = [0u8; 16];
    std::fs::File::open(&path)
        .and_then(|mut f| std::io::Read::read_exact(&mut f, &mut header))
        .map_err(|_| "That file isn't a Daily backup.".to_string())?;
    if &header != b"SQLite format 3\0" {
        return Err("That file isn't a Daily backup.".into());
    }

    let confirmed = with_dialog(&app, |win| {
        app.dialog()
            .message("This replaces all your current tasks and history with the backup. This can't be undone.")
            .title("Restore backup?")
            .kind(MessageDialogKind::Warning)
            .buttons(MessageDialogButtons::OkCancelCustom("Restore".into(), "Cancel".into()))
            .parent(win)
            .blocking_show()
    })?;
    Ok(confirmed.then(|| path.to_string_lossy().into_owned()))
}

/// Copy the backup over the live database. The panel must have closed its
/// connection first; it reopens afterwards, which also runs any newer migrations.
#[tauri::command]
fn finish_restore(app: AppHandle, path: String) -> Result<(), String> {
    let dest = db_path(&app)?;
    for suffix in ["-wal", "-shm"] {
        let side = dest.with_file_name(format!("{DB_FILE}{suffix}"));
        if side.exists() {
            std::fs::remove_file(&side).map_err(|e| e.to_string())?;
        }
    }
    std::fs::copy(&path, &dest).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "init",
            sql: include_str!("../migrations/001_init.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "task sort order",
            sql: include_str!("../migrations/002_sort_order.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "settings",
            sql: include_str!("../migrations/003_settings.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        // Must be first: a second launch (e.g. autostart + manual) just shows the panel.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_panel(app)))
        .plugin(tauri_plugin_positioner::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DB_URL, migrations)
                .build(),
        )
        .manage(PanelState::default())
        .invoke_handler(tauri::generate_handler![
            open_panel,
            set_pinned,
            set_progress,
            get_autostart,
            set_autostart,
            export_png,
            pick_backup_path,
            pick_restore_file,
            finish_restore,
        ])
        .setup(|app| {
            let autostart_on = app.autolaunch().is_enabled().unwrap_or(false);
            let show = MenuItem::with_id(app, "show", "Show today", true, None::<&str>)?;
            let autostart =
                CheckMenuItem::with_id(app, "autostart", "Start with Windows", true, autostart_on, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &autostart, &quit])?;
            if let Ok(mut slot) = app.state::<PanelState>().autostart_item.lock() {
                *slot = Some(autostart.clone());
            }

            TrayIconBuilder::with_id(TRAY_ID)
                .icon(progress_icon(0, 0, DEFAULT_ACCENT)?)
                .tooltip("Daily")
                .menu(&menu)
                .show_menu_on_left_click(false) // left = panel, right = menu
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "show" => show_panel(app),
                    "autostart" => {
                        let enable = !app.autolaunch().is_enabled().unwrap_or(false);
                        let _ = set_autostart(app.clone(), enable);
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    // Lets the positioner know where the tray icon is on screen.
                    tauri_plugin_positioner::on_tray_event(tray.app_handle(), &event);
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_panel(tray.app_handle());
                    }
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| match event {
            // Closing just hides; the app lives in the tray until "Quit".
            WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                let _ = window.hide();
            }
            WindowEvent::Focused(false) => {
                let state = window.state::<PanelState>();
                if !state.pinned.load(Ordering::Relaxed) && !state.dialog_open.load(Ordering::Relaxed) {
                    let _ = window.hide();
                    if let Ok(mut t) = state.last_blur_hide.lock() {
                        *t = Some(Instant::now());
                    }
                }
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("error while running Daily");
}
