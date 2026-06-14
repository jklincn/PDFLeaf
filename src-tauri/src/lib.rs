mod export;

use tauri::{Manager, PhysicalPosition, PhysicalSize};

const INITIAL_WINDOW_WIDTH_SCALE: f64 = 0.88;
const INITIAL_WINDOW_HEIGHT_SCALE: f64 = 0.8;

fn configure_initial_window(app: &tauri::App) -> tauri::Result<()> {
    let Some(window) = app.get_webview_window("main") else {
        return Ok(());
    };

    if let Some(monitor) = window.primary_monitor()? {
        let monitor_size = monitor.size();
        let monitor_position = monitor.position();
        let window_width = (f64::from(monitor_size.width) * INITIAL_WINDOW_WIDTH_SCALE).round() as u32;
        let window_height = (f64::from(monitor_size.height) * INITIAL_WINDOW_HEIGHT_SCALE).round() as u32;
        let window_x = monitor_position.x + ((monitor_size.width - window_width) / 2) as i32;
        let window_y = monitor_position.y + ((monitor_size.height - window_height) / 2) as i32;

        window.set_size(PhysicalSize::new(window_width, window_height))?;
        window.set_position(PhysicalPosition::new(window_x, window_y))?;
    } else {
        window.center()?;
    }

    window.show()?;
    window.set_focus()?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![export::export_pdfs])
        .setup(|app| {
            configure_initial_window(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
