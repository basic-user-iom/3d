# Positioning Fix Summary

## Changes Made

### 1. Object Update Mechanism ✅
**File**: `src/viewer/useViewer.ts`

- Modified `syncModelToStreetsGL` to check if object already exists
- If object exists (has `userData.streetsGLObjectId`), **update** it instead of creating new one
- Store object ID in `model.userData.streetsGLObjectId` for future updates
- Use consistent ID generation to ensure same object is updated

### 2. Wait for Camera Position Before Syncing ✅
**File**: `src/viewer/useViewer.ts`

- Modified `positionModelOnGround` to **NOT sync initially** when using iframe overlay
- Wait for camera position **BEFORE** syncing to Streets GL
- Position model relative to camera, **THEN** sync with correct position
- This ensures objects are positioned correctly from the start

### 3. Reduced Distance for Better Visibility ✅
**File**: `src/viewer/useViewer.ts`

- Changed distance from **50m to 20m** in front of camera
- Car should now be more visible and closer to camera

### 4. Enhanced Update Logging ✅
**File**: `streets-gl-alt/src/app/ExternalObjectBridge.ts`

- Added detailed logging to `handleUpdateObject`
- Logs old position, new position, and update success
- Helps debug if updates are working correctly

## How It Works Now

### Before (Broken):
1. Model loaded
2. Model positioned at origin (0,0,0)
3. **Model synced to Streets GL at origin** ← Too early!
4. Camera position requested (async)
5. Camera position received
6. Model repositioned in main scene
7. Model re-synced (creates NEW object)
8. **Old object remains at origin** ← Problem!

### After (Fixed):
1. Model loaded
2. Model positioned at origin (0,0,0) - **NOT synced yet**
3. Camera position requested (async)
4. Camera position received
5. Model repositioned to 20m in front of camera
6. **Model synced to Streets GL with correct position** ← Fixed!
7. If repositioned again, **existing object is updated** ← No duplicates!

## Expected Behavior

- Objects should be visible at **20m** in front of camera
- Objects should be at correct position from the start (no origin positioning)
- No duplicate objects created
- Existing objects are updated instead of creating new ones

## Testing

After reloading the page:
1. Load a car model
2. Check console for:
   - `[ModelPosition] ✅ Camera position received`
   - `[ModelPosition] ✅ Repositioned car in front of camera`
   - `[StreetsGLSync] Adding new object to Streets GL` (first time)
   - `[GBufferPass] 🎬 Drawing object ... pos(3880909.2, 5.0, -10802260.2), dist=~20m`
3. Car should be visible in Streets GL view





