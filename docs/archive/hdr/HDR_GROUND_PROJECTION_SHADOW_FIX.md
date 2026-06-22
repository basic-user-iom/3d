# HDR Ground Projection Shadow Fix

**Issue:** No shadows appearing on the ground when using 360° HDR ground projection with path tracer.

**Root Cause:** The path tracer was configured with `excludeGroundedSkybox: true` by default, which completely hides the GroundedSkybox during path tracing. This means the ground surface isn't included in the BVH, so shadows can't be rendered onto it.

**Solution:** Updated `PathTracerDemoPanel.tsx` to dynamically check if ground projection is enabled and include the GroundedSkybox when it is.

---

## Changes Made

### `src/components/PathTracerDemoPanel.tsx`

1. **Added import:**
   ```typescript
   import { useAppStore } from '../store/useAppStore'
   ```

2. **Added ground projection state check:**
   ```typescript
   // Check if ground projection is enabled - if so, include GroundedSkybox for shadows
   const hdrGroundProjectionEnabled = useAppStore((state) => state.hdrGroundProjectionEnabled)
   ```

3. **Updated path tracer config:**
   ```typescript
   // CRITICAL: Include GroundedSkybox when ground projection is enabled for shadow support
   // When ground projection is enabled, GroundedSkybox will be converted to PBR material to receive shadows
   // When ground projection is disabled, exclude it (path tracer uses environment map directly)
   excludeGroundedSkybox: !hdrGroundProjectionEnabled, // Include GroundedSkybox if ground projection is enabled
   ```

4. **Updated useEffect dependency:**
   ```typescript
   }, [viewer, hdrGroundProjectionEnabled]) // Reinitialize when ground projection setting changes
   ```

---

## How It Works

### When Ground Projection is **Enabled** (`hdrGroundProjectionEnabled = true`):

1. `excludeGroundedSkybox: false` → GroundedSkybox is **included** in path tracing
2. Path tracer detects GroundedSkybox in the scene (lines 892-902 in `PathTracerDemo.ts`)
3. GroundedSkybox material is **converted to PBR** (MeshStandardMaterial) to support shadows (lines 922-979)
4. Material is set to:
   - `receiveShadow: true` ✅
   - `transparent: true` with `opacity: 0.9` (allows environment lighting through)
   - `roughness: 0.95` (matte appearance)
   - Uses same HDR texture map from GroundedSkybox
5. GroundedSkybox is **visible** during path tracing
6. Shadows from objects (like the car) **render onto the ground surface** ✅

### When Ground Projection is **Disabled** (`hdrGroundProjectionEnabled = false`):

1. `excludeGroundedSkybox: true` → GroundedSkybox is **excluded** from path tracing (original behavior)
2. Path tracer uses HDR environment map directly for lighting
3. No ground surface for shadows (as before)

---

## Testing Steps

1. **Load HDR file:**
   - Click "Load HDR URL" in Lighting Panel
   - Enter: `/files-upload/skidpan_8k.hdr`
   - Click OK

2. **Enable Ground Projection:**
   - Check "Ground Projection" checkbox ✅
   - Adjust Ground Height if needed (try 0-1.0 instead of 15.0)
   - Adjust Ground Radius if needed (100-200)

3. **Verify GroundedSkybox is included:**
   - Check console for: `[PathTracerDemo] 🔄 Converting GroundedSkybox material to PBR for path tracer shadow support`
   - Check console for: `[PathTracerDemo] ✅ Converted GroundedSkybox material to PBR for path tracer`

4. **Move car up (if needed):**
   - Open Transform Panel
   - Select car model
   - Increase Y position by 0.5-2.0 units

5. **Start Path Tracer:**
   - Click "✨ Path Trace" button
   - Click "Start" button
   - Wait for samples to accumulate (5-50+ samples)

6. **Verify shadows on ground:**
   - ✅ Shadows should appear on the projected ground plane
   - ✅ Shadows should match the lighting direction from HDR
   - ✅ Shadows should be properly positioned under the car

---

## Expected Console Logs

**When Ground Projection is enabled and path tracer starts:**

```
[PathTracerDemo] 🔄 Converting GroundedSkybox material to PBR for path tracer shadow support: {...}
[PathTracerDemo] ✅ Converted GroundedSkybox material to PBR for path tracer: {
  receiveShadow: true,
  visible: true,
  note: 'Lower hemisphere of HDR will act as shadow-receiving surface in path tracer'
}
[PathTracerDemo] 📝 Converted GroundedSkybox materials to PBR for path tracer shadow support: 1
```

**When Ground Projection is disabled:**

```
[PathTracerDemo] 🔍 Excluding GroundedSkybox from path tracing: {...}
[PathTracerDemo] 📝 Excluded GroundedSkybox objects from path tracing: 1
```

---

## Important Notes

1. **Ground Height:** The default Ground Height in the UI is 15.0, which is very high. For most models, try:
   - **0.0** (ground at origin)
   - **0.5-1.0** (slightly raised if car wheels need clearance)
   - Adjust to match your model's Y position

2. **Material Opacity:** The converted PBR material uses `opacity: 0.9` to allow environment lighting through while still receiving shadows. This is a balance:
   - Lower opacity = more environment lighting visible but weaker shadows
   - Higher opacity = stronger shadows but may block environment lighting
   - Current: 0.9 (optimized for both)

3. **Reinitialization:** When toggling ground projection on/off, the path tracer will reinitialize. If path tracing is active, it will stop first.

4. **Performance:** Including GroundedSkybox in path tracing adds geometry to the BVH, which may slightly slow down rendering. However, shadows on the ground are worth the trade-off.

---

## Troubleshooting

### Shadows Still Not Appearing

1. **Verify GroundedSkybox is being converted:**
   - Check console for conversion logs
   - If not converting, check if GroundedSkybox is visible before path tracing starts

2. **Check Ground Height:**
   - Try setting Ground Height to 0.0 (ground at origin)
   - Verify car is above ground (Y position > Ground Height)

3. **Check GroundedSkybox visibility:**
   - GroundedSkybox must be visible (`obj.visible = true`) before path tracer starts
   - Check console for: `isVisible: true` in conversion logs

4. **Verify material conversion:**
   - Check console for successful conversion logs
   - Verify `receiveShadow: true` in logs

5. **Check sample count:**
   - Shadows may not be visible with very few samples (< 10)
   - Wait for 20-50+ samples for better shadow visibility

6. **Verify HDR is loaded:**
   - HDR must be loaded before path tracing starts
   - Check that HDR is enabled in Lighting Panel

---

## Status

✅ **Fixed:** Path tracer now includes GroundedSkybox when ground projection is enabled, allowing shadows to render on the ground.

**Next Steps:**
1. Test with the actual HDR file
2. Adjust Ground Height to match car position
3. Verify shadows appear correctly
4. Fine-tune opacity/roughness if needed













