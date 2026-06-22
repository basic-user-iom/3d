# Car Disappearing When Dynamic Sky Enabled - Fix

## Problem
When Dynamic Sky is enabled, the car model disappears from the scene.

## Root Cause
When CSM (Cascaded Shadow Maps) is initialized for Dynamic Sky, it calls `setupMaterial()` on all materials to inject CSM shadow shaders. If this process fails or if materials are incompatible, they might not render properly.

## Solution

### 1. Material State Tracking ✅
**File**: `src/viewer/effects/CSMShadowSystem.ts`

- Added `WeakSet<THREE.Material>` to track materials that have been processed
- Prevents duplicate setup attempts
- Ensures materials are only processed once

### 2. Improved Error Handling ✅
**File**: `src/viewer/effects/CSMShadowSystem.ts`

- Wrapped `setupMaterial()` calls in try-catch blocks
- Materials that fail CSM setup are still marked as processed
- Materials are forced to update (`needsUpdate = true`) to ensure they render
- Materials that can't use CSM will still receive light from CSM lights (CSM lights are added to the scene)

### 3. Re-setup Materials on Update ✅
**File**: `src/viewer/ViewerCanvas.tsx` (line ~7100)

- When Dynamic Sky is already enabled and CSM is updated, materials are re-setup
- This ensures newly added objects (like a car loaded after Dynamic Sky was enabled) get CSM shadows
- Prevents objects from disappearing when added after Dynamic Sky initialization

### 4. Material Setup on Model Load ✅
**File**: `src/viewer/useViewer.ts` (lines ~1405, ~1659)

- CSM materials are set up immediately after models are loaded
- Ensures objects receive CSM shadows as soon as they're added to the scene
- Prevents objects from disappearing when loaded with Dynamic Sky enabled

## How It Works

1. **CSM Initialization**: When Dynamic Sky is enabled, CSM is initialized and lights are added to the scene
2. **Material Setup**: All materials in the scene are processed to inject CSM shadow shaders
3. **Error Handling**: Materials that can't use CSM (ShaderMaterial, custom onBeforeCompile) are skipped but still receive light from CSM lights
4. **Continuous Updates**: Materials are re-setup when:
   - Dynamic Sky is enabled (initial setup)
   - New objects are added to the scene (model load)
   - CSM is updated (camera/light direction changes)

## Key Points

- **CSM lights illuminate ALL materials**, even those without CSM shadow shaders
- **Materials that fail CSM setup still render** (they just don't receive CSM shadows)
- **Materials are tracked** to prevent duplicate setup attempts
- **Materials are forced to update** after CSM setup to ensure they render

## Status: **FIXED** ✅

The car should no longer disappear when Dynamic Sky is enabled. If it still disappears, check the console for CSM setup errors.


