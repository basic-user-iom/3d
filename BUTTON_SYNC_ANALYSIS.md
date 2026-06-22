# Button Sync Issue Analysis

## Current Implementation

### Button Structure
1. **Start/Stop Button** (lines 1167-1183):
   - Shows "Start" when `!tracerIsRunning`
   - Shows "Stop" when `tracerIsRunning`
   - Uses `tracerIsRunning` (which is `uiTracerRunning`)

2. **Pause/Resume Button** (lines 1185-1190):
   - Shows "Pause" when `!isPaused`
   - Shows "Resume" when `isPaused`
   - Disabled when `!tracerIsRunning`

### The Problem

**Issue**: When tracer is paused:
- `isPaused = true`
- `uiTracerRunning = false` (set in handlePause line 699)
- This causes Start/Stop button to show "Start" instead of "Resume"
- User sees both "Start" and "Resume" buttons, which is confusing

**Root Cause**:
- `handlePause` sets `setUiTracerRunning(false)` when pausing (line 699)
- This makes `tracerIsRunning` false, so Start/Stop button shows "Start"
- But the tracer is actually still running (just paused), so "Start" is incorrect

### State Logic Issues

1. **Paused State**:
   - Tracer is running (`pathTracerRef.current.isRunning() === true`)
   - But `uiTracerRunning = false`
   - This desync causes Start button to show

2. **Resume State**:
   - When resuming, `setUiTracerRunning(true)` is called (line 703)
   - But if state is already out of sync, this might not work correctly

## Solution: Unified Start/Resume/Pause Button

### Option 1: Single Button with Multiple States
Combine Start/Stop and Pause/Resume into one button:
- **"Start"** - When not running
- **"Resume"** - When paused (running but paused)
- **"Pause"** - When running and not paused
- **"Stop"** - Keep separate, or add as secondary action

### Option 2: Fix State Sync
Keep separate buttons but fix the state synchronization:
- When paused, keep `uiTracerRunning = true` (tracer is still running, just paused)
- Only set `uiTracerRunning = false` when actually stopped
- Update button logic to check both `tracerIsRunning` AND `isPaused`

## Recommended Fix

**Best Practice**: Use a single primary button that handles Start/Resume/Pause, with Stop as a separate secondary button.

**Button States**:
1. Not running → "Start"
2. Running, not paused → "Pause"  
3. Running, paused → "Resume"
4. Stop → Always available as separate button

This matches common media player patterns and is more intuitive.


























