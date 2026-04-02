mod bridge;
mod downloads;
mod models;
mod state;
mod tray;
mod updates;

use tauri::WindowEvent;

use bridge::{get_extension_bridge_info, start_extension_bridge, take_extension_download_requests};
use downloads::{cancel_download, fetch_formats, fetch_playlist_info, open_folder, start_download};
use state::MAIN_WINDOW_LABEL;
use tray::create_tray;
use updates::{check_ytdlp_update, update_ytdlp};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            start_extension_bridge(app.handle().clone());
            create_tray(&app.handle())?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != MAIN_WINDOW_LABEL {
                return;
            }

            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            start_download,
            fetch_formats,
            fetch_playlist_info,
            cancel_download,
            check_ytdlp_update,
            update_ytdlp,
            open_folder,
            get_extension_bridge_info,
            take_extension_download_requests
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
