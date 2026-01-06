#![cfg(windows)]

use serde::Serialize;
use std::sync::Mutex;
use thiserror::Error;
use windows::Win32::Foundation::*;
use windows::Win32::Graphics::Gdi::*;
use windows::Win32::UI::WindowsAndMessaging::*;

#[derive(Error, Debug)]
pub enum WallpaperError {
    #[error("Progman window not found")]
    ProgmanNotFound,
    #[error("WorkerW window not found")]
    WorkerWNotFound,
    #[error("Failed to set parent window")]
    SetParentFailed,
    #[error("Invalid window handle")]
    InvalidWindowHandle,
    #[error("Already in wallpaper mode")]
    AlreadyWallpaperMode,
    #[error("Not in wallpaper mode")]
    NotWallpaperMode,
    #[error("Windows API error: {0}")]
    WindowsApi(String),
}

type WallpaperResult<T> = std::result::Result<T, WallpaperError>;

#[derive(Default)]
struct WallpaperState {
    is_active: bool,
    original_parent: Option<isize>,
    original_style: i32,
    original_ex_style: i32,
    original_rect: Option<RECT>,
    worker_w: Option<isize>,
}

static STATE: Mutex<WallpaperState> = Mutex::new(WallpaperState {
    is_active: false,
    original_parent: None,
    original_style: 0,
    original_ex_style: 0,
    original_rect: None,
    worker_w: None,
});

#[derive(Debug, Clone, Serialize)]
pub struct MonitorInfo {
    pub index: usize,
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    pub is_primary: bool,
}

/// Find the Progman window (Program Manager)
fn find_progman() -> WallpaperResult<HWND> {
    unsafe {
        let hwnd = FindWindowW(windows::core::w!("Progman"), None)
            .map_err(|_| WallpaperError::ProgmanNotFound)?;
        if hwnd.0 as usize == 0 {
            return Err(WallpaperError::ProgmanNotFound);
        }
        Ok(hwnd)
    }
}

/// Send undocumented message 0x052C to Progman to spawn WorkerW
fn spawn_worker_w(progman: HWND) -> WallpaperResult<()> {
    unsafe {
        SendMessageTimeoutW(
            progman,
            0x052C,
            WPARAM(0xD),
            LPARAM(0x1),
            SMTO_NORMAL,
            1000,
            None,
        );
        Ok(())
    }
}

/// Find the WorkerW window that sits behind SHELLDLL_DefView
fn find_worker_w() -> WallpaperResult<HWND> {
    unsafe {
        let mut worker_w: HWND = HWND(std::ptr::null_mut());

        // Find WorkerW windows and look for one with SHELLDLL_DefView
        let mut hwnd = HWND(std::ptr::null_mut());
        loop {
            hwnd = FindWindowExW(None, Some(hwnd), windows::core::w!("WorkerW"), None)
                .unwrap_or(HWND(std::ptr::null_mut()));
            if hwnd.0 as usize == 0 {
                break;
            }

            let shell_view = FindWindowExW(Some(hwnd), None, windows::core::w!("SHELLDLL_DefView"), None)
                .unwrap_or(HWND(std::ptr::null_mut()));
            if shell_view.0 as usize != 0 {
                // Found the WorkerW with SHELLDLL_DefView, now get its sibling
                worker_w = FindWindowExW(None, Some(hwnd), windows::core::w!("WorkerW"), None)
                    .unwrap_or(HWND(std::ptr::null_mut()));
                break;
            }
        }

        if worker_w.0 as usize == 0 {
            return Err(WallpaperError::WorkerWNotFound);
        }

        Ok(worker_w)
    }
}

/// Get virtual screen dimensions (spans all monitors)
fn get_virtual_screen() -> (i32, i32, i32, i32) {
    unsafe {
        let x = GetSystemMetrics(SM_XVIRTUALSCREEN);
        let y = GetSystemMetrics(SM_YVIRTUALSCREEN);
        let width = GetSystemMetrics(SM_CXVIRTUALSCREEN);
        let height = GetSystemMetrics(SM_CYVIRTUALSCREEN);
        (x, y, width, height)
    }
}

/// Set the window as desktop wallpaper
pub fn set_as_wallpaper(hwnd: isize) -> WallpaperResult<()> {
    let mut state = STATE.lock().unwrap();

    if state.is_active {
        return Err(WallpaperError::AlreadyWallpaperMode);
    }

    let window = HWND(hwnd as *mut _);

    // Find Progman and spawn WorkerW
    let progman = find_progman()?;
    spawn_worker_w(progman)?;

    // Small delay to let WorkerW spawn
    std::thread::sleep(std::time::Duration::from_millis(100));

    let worker_w = find_worker_w()?;

    unsafe {
        // Store original parent
        let parent_result = GetParent(window);
        state.original_parent = Some(parent_result.unwrap_or(HWND(std::ptr::null_mut())).0 as isize);

        // Store original window style
        state.original_style = GetWindowLongW(window, GWL_STYLE);
        state.original_ex_style = GetWindowLongW(window, GWL_EXSTYLE);

        // Store original window rect
        let mut rect = RECT::default();
        let _ = GetWindowRect(window, &mut rect);
        state.original_rect = Some(rect);

        // Remove window decorations
        let new_style = state.original_style & !(WS_CAPTION.0 as i32)
            & !(WS_THICKFRAME.0 as i32)
            & !(WS_MINIMIZEBOX.0 as i32)
            & !(WS_MAXIMIZEBOX.0 as i32)
            & !(WS_SYSMENU.0 as i32);
        SetWindowLongW(window, GWL_STYLE, new_style);

        // Remove extended styles
        let new_ex_style = state.original_ex_style & !(WS_EX_DLGMODALFRAME.0 as i32)
            & !(WS_EX_CLIENTEDGE.0 as i32)
            & !(WS_EX_STATICEDGE.0 as i32);
        SetWindowLongW(window, GWL_EXSTYLE, new_ex_style);

        // Set WorkerW as parent
        let _ = SetParent(window, Some(worker_w));

        // Get virtual screen size (spans all monitors)
        let (vx, vy, vw, vh) = get_virtual_screen();

        // Resize window to cover all monitors
        let _ = SetWindowPos(
            window,
            Some(HWND_TOP),
            vx,
            vy,
            vw,
            vh,
            SWP_FRAMECHANGED | SWP_SHOWWINDOW,
        );

        state.worker_w = Some(worker_w.0 as isize);
        state.is_active = true;
    }

    Ok(())
}

/// Restore window to normal mode
pub fn restore_window(hwnd: isize) -> WallpaperResult<()> {
    let mut state = STATE.lock().unwrap();

    if !state.is_active {
        return Err(WallpaperError::NotWallpaperMode);
    }

    let window = HWND(hwnd as *mut _);

    unsafe {
        // Remove from WorkerW (set parent to desktop/null)
        let _ = SetParent(window, None);

        // Restore original style
        SetWindowLongW(window, GWL_STYLE, state.original_style);
        SetWindowLongW(window, GWL_EXSTYLE, state.original_ex_style);

        // Restore original position and size
        if let Some(rect) = state.original_rect {
            let _ = SetWindowPos(
                window,
                Some(HWND_TOP),
                rect.left,
                rect.top,
                rect.right - rect.left,
                rect.bottom - rect.top,
                SWP_FRAMECHANGED | SWP_SHOWWINDOW,
            );
        }
    }

    // Reset state
    state.is_active = false;
    state.original_parent = None;
    state.original_rect = None;
    state.worker_w = None;

    Ok(())
}

/// Check if currently in wallpaper mode
pub fn is_wallpaper_mode() -> bool {
    STATE.lock().unwrap().is_active
}

/// Get information about all connected monitors
pub fn get_all_monitors() -> Vec<MonitorInfo> {
    let mut monitors: Vec<MonitorInfo> = Vec::new();

    unsafe {
        // Get primary monitor info first
        let desktop = GetDesktopWindow();
        let primary = MonitorFromWindow(desktop, MONITOR_DEFAULTTOPRIMARY);
        let mut mi = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };

        if GetMonitorInfoW(primary, &mut mi).as_bool() {
            monitors.push(MonitorInfo {
                index: 0,
                x: mi.rcMonitor.left,
                y: mi.rcMonitor.top,
                width: mi.rcMonitor.right - mi.rcMonitor.left,
                height: mi.rcMonitor.bottom - mi.rcMonitor.top,
                is_primary: true,
            });
        }

        // For multi-monitor, we use the virtual screen dimensions
        let (vx, vy, vw, vh) = get_virtual_screen();

        // If virtual screen is larger than primary, we have multiple monitors
        if let Some(primary_info) = monitors.first() {
            if vw > primary_info.width || vh > primary_info.height || vx < 0 || vy < 0 {
                // Clear and add virtual screen info
                monitors.clear();
                monitors.push(MonitorInfo {
                    index: 0,
                    x: vx,
                    y: vy,
                    width: vw,
                    height: vh,
                    is_primary: true,
                });
            }
        }
    }

    monitors
}
