use std::collections::HashMap;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

use tauri_plugin_shell::process::CommandChild;

use crate::models::ExtensionDownloadRequest;

pub const EXTENSION_BRIDGE_HOST: &str = "127.0.0.1";
pub const EXTENSION_BRIDGE_PORT: u16 = 46321;
pub const MAIN_WINDOW_LABEL: &str = "main";
pub const TRAY_OPEN_ID: &str = "tray-open";
pub const TRAY_QUIT_ID: &str = "tray-quit";

pub static EXTENSION_BRIDGE_READY: AtomicBool = AtomicBool::new(false);

lazy_static::lazy_static! {
    pub static ref ACTIVE_DOWNLOADS: Arc<Mutex<HashMap<String, CommandChild>>> =
        Arc::new(Mutex::new(HashMap::new()));
    pub static ref EXTENSION_BRIDGE_ERROR: Arc<Mutex<Option<String>>> =
        Arc::new(Mutex::new(None));
    pub static ref PENDING_EXTENSION_REQUESTS: Arc<Mutex<Vec<ExtensionDownloadRequest>>> =
        Arc::new(Mutex::new(Vec::new()));
}

pub fn set_extension_bridge_error(error: Option<String>) {
    if let Ok(mut state) = EXTENSION_BRIDGE_ERROR.lock() {
        *state = error;
    }
}
