# 3D Viewer Reload Fix

## Problem
The 3D viewer was reloading every time you switched to another chat in Cursor.

## Root Cause
This was likely caused by Vite's Hot Module Reload (HMR) detecting file system changes when Cursor saves chat history or other files, causing the React component to remount and the viewer to fully reinitialize.

## Solutions Implemented

### 1. Vite Configuration Updates (`vite.config.ts`)
- Added HMR configuration to be less aggressive
- Added `watch.ignored` patterns to ignore non-source files that might trigger reloads:
  - Markdown files (`.md`)
  - Text files (`.txt`)
  - Log files (`.log`)
  - Script files (`.bat`, `.ps1`, `.cmd`)
  - Temporary directories (`temp/`, `files-upload/`)

### 2. Stable Component Key (`src/App.tsx`)
- Added a stable `key="viewer-canvas-stable"` to the `ViewerCanvas` component
- This prevents React from unnecessarily remounting the component when parent re-renders

### 3. HMR State Preservation (`src/viewer/ViewerCanvas.tsx`)
- Added HMR detection to preserve the viewer instance across hot reloads
- When HMR is detected, the viewer instance is stored and reused instead of being disposed
- This prevents the full cleanup/reinitialization cycle during development

### 4. Viewer Instance Reuse Logic
- Enhanced the initialization check to detect and reuse existing valid viewer instances
- Prevents unnecessary reinitialization if the viewer is already running

## How It Works

1. **File Change Detection**: Vite now ignores non-source file changes that don't affect the application
2. **HMR Preservation**: When HMR triggers, the viewer instance is preserved instead of being disposed
3. **Stable Key**: The stable key prevents React from treating the component as "new" on parent re-renders
4. **Instance Reuse**: The viewer checks if it's already initialized and reuses the existing instance

## Testing

To verify the fix works:
1. Open the 3D viewer in your browser
2. Load a model
3. Switch to another chat in Cursor
4. Switch back - the viewer should **NOT** reload

## If Issues Persist

If the viewer still reloads:
1. Check the browser console for `[ViewerCanvas]` log messages
2. Look for "HMR detected" messages to confirm HMR is working
3. Check if Cursor is causing full page reloads (not just component remounts)
4. Consider adding state persistence to localStorage if needed

## Files Modified

- `vite.config.ts` - Added HMR and watch configuration
- `src/App.tsx` - Added stable key to ViewerCanvas
- `src/viewer/ViewerCanvas.tsx` - Added HMR preservation logic

















































