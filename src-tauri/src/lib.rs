#[cfg(windows)]
mod wallpaper;

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter,
    Manager,
};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg(windows)]
#[tauri::command]
fn enable_wallpaper_mode(window: tauri::Window) -> Result<(), String> {
    let hwnd = window.hwnd().map_err(|e| e.to_string())?;
    wallpaper::set_as_wallpaper(hwnd.0 as isize).map_err(|e| e.to_string())
}

#[cfg(not(windows))]
#[tauri::command]
fn enable_wallpaper_mode(_window: tauri::Window) -> Result<(), String> {
    Err("Wallpaper mode is only supported on Windows".to_string())
}

#[cfg(windows)]
#[tauri::command]
fn disable_wallpaper_mode(window: tauri::Window) -> Result<(), String> {
    let hwnd = window.hwnd().map_err(|e| e.to_string())?;
    wallpaper::restore_window(hwnd.0 as isize).map_err(|e| e.to_string())
}

#[cfg(not(windows))]
#[tauri::command]
fn disable_wallpaper_mode(_window: tauri::Window) -> Result<(), String> {
    Err("Wallpaper mode is only supported on Windows".to_string())
}

#[cfg(windows)]
#[tauri::command]
fn is_wallpaper_mode() -> bool {
    wallpaper::is_wallpaper_mode()
}

#[cfg(not(windows))]
#[tauri::command]
fn is_wallpaper_mode() -> bool {
    false
}

#[cfg(windows)]
#[tauri::command]
fn get_monitors() -> Vec<wallpaper::MonitorInfo> {
    wallpaper::get_all_monitors()
}

#[cfg(not(windows))]
#[tauri::command]
fn get_monitors() -> Vec<serde_json::Value> {
    vec![]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            // Create tray menu
            let show_item = MenuItem::with_id(app, "show", "Show Controls", true, None::<&str>)?;
            let hide_item = MenuItem::with_id(app, "hide", "Hide Controls", true, None::<&str>)?;
            let exit_item = MenuItem::with_id(app, "exit", "Exit", true, None::<&str>)?;

            let menu = Menu::with_items(app, &[&show_item, &hide_item, &exit_item])?;

            // Create tray icon
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .tooltip("Wallpaper")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            #[cfg(windows)]
                            {
                                if wallpaper::is_wallpaper_mode() {
                                    let hwnd = window.hwnd().unwrap();
                                    let _ = wallpaper::restore_window(hwnd.0 as isize);
                                }
                            }
                            let _ = window.show();
                            let _ = window.set_focus();
                            let _ = window.emit("wallpaper-mode-changed", false);
                        }
                    }
                    "hide" => {
                        if let Some(window) = app.get_webview_window("main") {
                            #[cfg(windows)]
                            {
                                let hwnd = window.hwnd().unwrap();
                                let _ = wallpaper::set_as_wallpaper(hwnd.0 as isize);
                                let _ = window.emit("wallpaper-mode-changed", true);
                            }
                        }
                    }
                    "exit" => {
                        #[cfg(windows)]
                        {
                            if let Some(window) = app.get_webview_window("main") {
                                if wallpaper::is_wallpaper_mode() {
                                    let hwnd = window.hwnd().unwrap();
                                    let _ = wallpaper::restore_window(hwnd.0 as isize);
                                }
                            }
                        }
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            enable_wallpaper_mode,
            disable_wallpaper_mode,
            is_wallpaper_mode,
            get_monitors,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
