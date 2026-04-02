use std::sync::atomic::Ordering;

use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

use crate::models::{ExtensionBridgeInfo, ExtensionDownloadRequest};
use crate::state::{
    EXTENSION_BRIDGE_ERROR, EXTENSION_BRIDGE_HOST, EXTENSION_BRIDGE_PORT, EXTENSION_BRIDGE_READY,
    PENDING_EXTENSION_REQUESTS, set_extension_bridge_error,
};

fn extension_bridge_endpoint() -> String {
    format!("http://{}:{}", EXTENSION_BRIDGE_HOST, EXTENSION_BRIDGE_PORT)
}

fn build_extension_bridge_info() -> ExtensionBridgeInfo {
    let error = EXTENSION_BRIDGE_ERROR
        .lock()
        .ok()
        .and_then(|state| state.clone());

    ExtensionBridgeInfo {
        endpoint: extension_bridge_endpoint(),
        host: EXTENSION_BRIDGE_HOST.to_string(),
        port: EXTENSION_BRIDGE_PORT,
        ready: EXTENSION_BRIDGE_READY.load(Ordering::Relaxed),
        error,
    }
}

fn find_header_terminator(buffer: &[u8]) -> Option<usize> {
    buffer
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .map(|index| index + 4)
}

async fn write_bridge_response(
    stream: &mut TcpStream,
    status: &str,
    body: &str,
) -> Result<(), String> {
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: content-type\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\n\r\n{body}",
        body.as_bytes().len()
    );

    stream
        .write_all(response.as_bytes())
        .await
        .map_err(|e| e.to_string())
}

async fn handle_extension_bridge_connection(
    mut stream: TcpStream,
    app: AppHandle,
) -> Result<(), String> {
    let mut buffer = Vec::with_capacity(4096);
    let mut header_end = None;

    loop {
        let mut chunk = [0u8; 2048];
        let read = stream.read(&mut chunk).await.map_err(|e| e.to_string())?;
        if read == 0 {
            break;
        }

        buffer.extend_from_slice(&chunk[..read]);
        if buffer.len() > 64 * 1024 {
            return write_bridge_response(
                &mut stream,
                "413 Payload Too Large",
                r#"{"ok":false,"error":"Request too large"}"#,
            )
            .await;
        }

        if let Some(end) = find_header_terminator(&buffer) {
            header_end = Some(end);
            break;
        }
    }

    let header_end = match header_end {
        Some(value) => value,
        None => {
            return write_bridge_response(
                &mut stream,
                "400 Bad Request",
                r#"{"ok":false,"error":"Malformed request"}"#,
            )
            .await;
        }
    };

    let header_text = String::from_utf8_lossy(&buffer[..header_end]).to_string();
    let mut lines = header_text.split("\r\n");
    let request_line = lines.next().unwrap_or_default().to_string();
    let mut request_parts = request_line.split_whitespace();
    let method = request_parts.next().unwrap_or_default().to_string();
    let path = request_parts.next().unwrap_or_default().to_string();

    let mut content_length = 0usize;
    for line in lines {
        if let Some((name, value)) = line.split_once(':') {
            if name.eq_ignore_ascii_case("content-length") {
                content_length = value.trim().parse::<usize>().unwrap_or(0);
            }
        }
    }

    while buffer.len() < header_end + content_length {
        let mut chunk = [0u8; 2048];
        let read = stream.read(&mut chunk).await.map_err(|e| e.to_string())?;
        if read == 0 {
            break;
        }
        buffer.extend_from_slice(&chunk[..read]);
    }

    let body = if content_length == 0 || buffer.len() < header_end + content_length {
        &[][..]
    } else {
        &buffer[header_end..header_end + content_length]
    };

    match (method.as_str(), path.as_str()) {
        ("OPTIONS", _) => {
            write_bridge_response(&mut stream, "204 No Content", "").await?;
        }
        ("GET", "/health") => {
            let body = serde_json::json!({
                "ok": true,
                "app": "dlp-gui",
                "bridge": build_extension_bridge_info(),
            })
            .to_string();
            write_bridge_response(&mut stream, "200 OK", &body).await?;
        }
        ("POST", "/download") => {
            let request: ExtensionDownloadRequest = serde_json::from_slice(body)
                .map_err(|e| format!("Invalid extension payload: {}", e))?;

            let trimmed_url = request.url.trim();
            if !(trimmed_url.starts_with("http://") || trimmed_url.starts_with("https://")) {
                write_bridge_response(
                    &mut stream,
                    "400 Bad Request",
                    r#"{"ok":false,"error":"Only http and https URLs are supported"}"#,
                )
                .await?;
                return Ok(());
            }

            let normalized_request = ExtensionDownloadRequest {
                url: trimmed_url.to_string(),
                ..request
            };

            if let Ok(mut queue) = PENDING_EXTENSION_REQUESTS.lock() {
                queue.push(normalized_request.clone());
            }

            let _ = app.emit("extension-download-request", normalized_request.clone());

            let body = serde_json::json!({
                "ok": true,
                "status": "queued",
                "request_id": normalized_request.request_id,
            })
            .to_string();
            write_bridge_response(&mut stream, "202 Accepted", &body).await?;
        }
        _ => {
            write_bridge_response(
                &mut stream,
                "404 Not Found",
                r#"{"ok":false,"error":"Unknown bridge route"}"#,
            )
            .await?;
        }
    }

    Ok(())
}

pub fn start_extension_bridge(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let bind_addr = format!("{}:{}", EXTENSION_BRIDGE_HOST, EXTENSION_BRIDGE_PORT);
        match TcpListener::bind(&bind_addr).await {
            Ok(listener) => {
                EXTENSION_BRIDGE_READY.store(true, Ordering::Relaxed);
                set_extension_bridge_error(None);
                println!("[bridge] Chrome extension bridge listening on {}", bind_addr);

                loop {
                    match listener.accept().await {
                        Ok((stream, _)) => {
                            let app_handle = app.clone();
                            tauri::async_runtime::spawn(async move {
                                if let Err(err) =
                                    handle_extension_bridge_connection(stream, app_handle).await
                                {
                                    println!("[bridge] Request failed: {}", err);
                                }
                            });
                        }
                        Err(err) => {
                            println!("[bridge] Accept failed: {}", err);
                        }
                    }
                }
            }
            Err(err) => {
                let message =
                    format!("Failed to bind extension bridge on {}: {}", bind_addr, err);
                EXTENSION_BRIDGE_READY.store(false, Ordering::Relaxed);
                set_extension_bridge_error(Some(message.clone()));
                println!("[bridge] {}", message);
            }
        }
    });
}

#[tauri::command]
pub fn get_extension_bridge_info() -> ExtensionBridgeInfo {
    build_extension_bridge_info()
}

#[tauri::command]
pub fn take_extension_download_requests() -> Vec<ExtensionDownloadRequest> {
    match PENDING_EXTENSION_REQUESTS.lock() {
        Ok(mut queue) => std::mem::take(&mut *queue),
        Err(_) => Vec::new(),
    }
}
