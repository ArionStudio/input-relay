use tauri::{AppHandle, Manager};

#[tauri::command]
fn admin_ipc_status() -> &'static str {
    "tauri-window-command-adapter"
}

#[tauri::command]
fn show_proxy_window(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main desktop window was not found".to_string())?;

    window.show().map_err(|error| error.to_string())?;
    window.unminimize().map_err(|error| error.to_string())?;
    window
        .set_always_on_top(true)
        .map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())?;

    Ok(())
}

#[tauri::command]
fn hide_proxy_window(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main desktop window was not found".to_string())?;

    window
        .set_always_on_top(false)
        .map_err(|error| error.to_string())?;
    window.hide().map_err(|error| error.to_string())?;

    Ok(())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            admin_ipc_status,
            show_proxy_window,
            hide_proxy_window
        ])
        .run(tauri::generate_context!())
        .expect("failed to run input relay desktop shell");
}
