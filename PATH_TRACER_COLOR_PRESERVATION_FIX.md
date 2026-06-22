# Path Tracer Color Preservation Fix - Immediate Color Loss

## Issue
When the user clicks the path tracer button to open the panel, colors (especially blue background) disappear immediately, even before starting the path tracer.

## Root Cause
The `initialize()` method is called when the path tracer panel opens (not when Start is clicked). During initialization:
1. `setupEnvironment()` is called (line 1821)
2. `setupEnvironment()` replaces `scene.background` with `gradientMap` (line 1084)
3. The original blue background color is lost before it can be saved
4. The original background is only saved in `start()`, which happens later

## Fix Applied

### 1. Save Original Background During initialize()
- Save `originalBackground` BEFORE calling `setupEnvironment()` in `initialize()`
- If background is a `THREE.Color`, preserve it and restore after `setupEnvironment()`
- This prevents the blue color from being replaced with gradient during initialization

### 2. Preserve Background in start()
- Check if `originalBackground` was already saved during `initialize()`
- If yes, use the saved value
- If no, save it now
- Always preserve the original color background for path tracer

## Code Changes

**File**: `src/viewer/pathTracer/PathTracerDemo.ts`

**Location 1**: `initialize()` method - Before `setupEnvironment()` call
- Save original background before calling `setupEnvironment()`
- If it's a Color, restore it after `setupEnvironment()` to preserve blue color

**Location 2**: `start()` method - Background preservation
- Check if background was already saved during `initialize()`
- If not, save it now
- Always preserve original color background

## Expected Behavior

1. User clicks path tracer button → Panel opens
2. `initialize()` is called → Original background is saved BEFORE `setupEnvironment()`
3. `setupEnvironment()` is called → If background was a Color, it's restored after
4. Blue color is preserved throughout initialization
5. When `start()` is called → Original background is already saved, so it's preserved

## Testing

To verify the fix:
1. Set blue sky background in standard mode
2. Click path tracer button to open panel
3. Verify blue color is still visible (not replaced with gradient)
4. Click Start button
5. Verify blue color remains visible during path tracing














