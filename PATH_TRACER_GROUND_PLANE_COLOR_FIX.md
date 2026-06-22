# Path Tracer Ground Plane Color Preservation Fix

## Issue
When the path tracer creates a new ground plane, it uses a hardcoded gray color (0x888888) instead of preserving the color from the existing ground plane in standard mode.

## Root Cause
The `createGroundPlane()` method was using a hardcoded color `0x888888` (gray) for all newly created ground planes, regardless of what color the existing ground plane had in standard mode.

## Fix Applied

### 1. Find Existing Ground Plane Color
Before creating a new ground plane, the code now:
- Searches for existing ground planes in the scene
- Extracts their color from their materials
- Uses that color for the new ground plane

### 2. Preserve Color in applyGroundRoughness()
The `applyGroundRoughness()` method already saves the original color in `userData.originalColor`, so existing ground planes keep their color when modified.

## Code Changes

**File**: `src/viewer/pathTracer/PathTracerDemo.ts`

**Method**: `createGroundPlane()`
- Added code to search for existing ground planes
- Extracts color from existing ground plane materials
- Uses extracted color (or default gray if none found) for new ground plane

## Expected Behavior

1. **Existing Ground Plane**: If a ground plane exists in standard mode with a specific color (e.g., white, beige, etc.)
2. **Path Tracer Creates New Plane**: When path tracer creates a new ground plane, it will use the same color as the existing one
3. **Color Preserved**: The ground plane color matches between standard mode and path tracer mode

## Testing

To verify the fix:
1. Load a model with a colored ground plane in standard mode (e.g., white, beige, etc.)
2. Open path tracer panel
3. If path tracer creates a new ground plane, verify it uses the same color as the standard mode ground plane
4. Check console for "Found existing ground plane color to preserve" message














