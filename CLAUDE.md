# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Tauri v2 desktop application for animated wallpaper visualization. The frontend renders wobbling concentric circles on a canvas with interactive controls. Built with React 19, TypeScript, and Vite for the frontend; Rust for the native backend.

## Commands

### Development
```bash
npm run tauri dev     # Start Tauri app with hot-reload (runs both Vite and native window)
```

### Build
```bash
npm run tauri build   # Build production app (frontend + native bundle)
npm run build         # Build frontend only (tsc + vite build)
```

### Frontend only
```bash
npm run dev           # Start Vite dev server at localhost:1420
npm run preview       # Preview production build
```

## Architecture

**Frontend (`src/`)**
- Single-component app in `App.tsx` - canvas-based animation with React state for controls
- Animation loop uses `requestAnimationFrame` with delta-time for frame-independent motion
- Parameters (speed, wobble, frequency, radius, line width, circle count) controlled via sliders

**Backend (`src-tauri/`)**
- `main.rs` - Windows entry point, prevents console window in release builds
- `lib.rs` - Tauri app initialization and command handlers
- Tauri v2 capabilities defined in `src-tauri/capabilities/default.json`
- Uses `tauri-plugin-opener` for external link handling

**Communication**
- Frontend can invoke Rust commands via `@tauri-apps/api` (example `greet` command exists)
- Commands are registered in `lib.rs` via `invoke_handler`
