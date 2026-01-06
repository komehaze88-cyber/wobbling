import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";

const WALLPAPER_MODE_CHANGED_EVENT = "wallpaper-mode-changed";

export function useWallpaperMode() {
  const [isWallpaperMode, setIsWallpaperMode] = useState(false);

  const refreshWallpaperMode = useCallback(async () => {
    if (!isTauri()) return;

    try {
      const mode = await invoke<boolean>("is_wallpaper_mode");
      setIsWallpaperMode(mode);
    } catch (error) {
      console.error("Failed to get wallpaper mode:", error);
    }
  }, []);

  useEffect(() => {
    refreshWallpaperMode();
  }, [refreshWallpaperMode]);

  useEffect(() => {
    if (!isTauri()) return;

    const unlisten = listen<boolean>(WALLPAPER_MODE_CHANGED_EVENT, (event) => {
      setIsWallpaperMode(event.payload);
    });

    return () => {
      unlisten.then((fn) => fn()).catch(() => {});
    };
  }, []);

  const setWallpaperMode = useCallback(async (enabled: boolean) => {
    if (!isTauri()) {
      setIsWallpaperMode(enabled);
      return;
    }

    try {
      if (enabled) {
        await invoke("enable_wallpaper_mode");
      } else {
        await invoke("disable_wallpaper_mode");
      }
      setIsWallpaperMode(enabled);
    } catch (error) {
      console.error("Failed to set wallpaper mode:", error);
    }
  }, []);

  const toggleWallpaperMode = useCallback(
    () => setWallpaperMode(!isWallpaperMode),
    [isWallpaperMode, setWallpaperMode]
  );

  return { isWallpaperMode, setWallpaperMode, toggleWallpaperMode };
}

