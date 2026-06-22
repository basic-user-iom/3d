# HDR Ground Projection + Path Tracer Test

**Goal:** Test 360° HDR ground projection with path tracer to verify shadows appear on the ground.

**HDR File:** `D:\ai-cursor\3d-test-software\files-upload\skidpan_8k.hdr`  
**Relative URL:** `/files-upload/skidpan_8k.hdr`

---

## Test Steps

### 1. Load HDR Environment

1. **Open Lighting Panel** ✅ (Already open)
2. **Click "Load HDR URL" button**
3. **In the prompt dialog, enter:** `/files-upload/skidpan_8k.hdr`
4. **Click OK**
5. **Verify HDR loads:** Check console for HDR loading messages

### 2. Enable Ground Projection

1. **Find "Ground Projection" checkbox** (should be visible after HDR loads)
2. **Check the checkbox** to enable Ground Projection
3. **Verify:** Ground projection should create a visible ground plane with projected HDR texture

### 3. Adjust Ground Projection Settings (if needed)

- **Ground Height:** Adjust slider (default: 0, range: -10 to 10)
  - For car model, may need to raise to ~0.5 or 1.0 to match car position
- **Ground Radius:** Adjust slider (default: 100, range: 10 to 500)
  - Larger radius = more ground visible

### 4. Move Car Up (If Below Ground Surface)

**Option A: Use Transform Panel**
1. **Open Transform Panel** (click "Transform" button in Modeling section)
2. **Select the car model** (click on it in 3D view, or use Objects Panel)
3. **Adjust Y position:** Increase Y position by 0.5-2.0 units
4. **Verify:** Car should now be above or on the ground surface

**Option B: Use Objects Panel**
1. **Open Objects Panel**
2. **Find the car model/root object**
3. **Adjust Position Y value**

### 5. Enable "Keep Ground During Path Trace"

1. **In Lighting Panel, find "Keep Ground During Path Trace" checkbox**
2. **Ensure it's checked** ✅ (Should already be checked by default)
3. **This keeps the HDR ground visible for path tracer shadow projection**

### 6. Start Path Tracer

1. **Click "✨ Path Trace" button** in Rendering section
2. **Click "Start" button** in Path Tracer panel
3. **Wait for initial render** (generating BVH... then samples start accumulating)

### 7. Verify Shadows on Ground

**What to look for:**
- ✅ **Shadows appear on the projected ground plane** (from HDR environment)
- ✅ **Shadows match the lighting direction** from the HDR environment
- ✅ **Shadows are properly positioned** under the car
- ✅ **No artifacts or issues** with ground projection + shadows

**If shadows don't appear:**
- Check that Ground Projection is enabled
- Check that "Keep Ground During Path Trace" is enabled
- Verify HDR is loaded and enabled
- Check console for errors
- Try adjusting Ground Height to match car position
- Verify car is above ground surface (not intersecting)

---

## Expected Results

✅ **HDR loads successfully**  
✅ **Ground projection creates visible ground plane**  
✅ **Path tracer renders car with proper lighting**  
✅ **Shadows appear on the ground plane**  
✅ **Shadows are correctly positioned and oriented**

---

## Console Checks

**Look for these logs:**
```
[HDRSystem] Loading HDR from URL: /files-upload/skidpan_8k.hdr
[HDRSystem] HDR loaded successfully
[GroundProjection] GroundedSkybox added to scene
[PathTracerDemo] Starting path tracer
```

**Error logs to watch for:**
- HDR loading errors
- Ground projection setup errors
- Path tracer initialization errors
- Shadow calculation errors

---

## Troubleshooting

### Shadows Not Appearing

1. **Check Ground Projection is enabled**
2. **Check "Keep Ground During Path Trace" is enabled**
3. **Verify HDR is loaded** (not just default environment)
4. **Check car position** (should be above ground, not intersecting)
5. **Adjust Ground Height** to match car's Y position
6. **Check console** for errors

### Ground Projection Not Visible

1. **Verify HDR is loaded**
2. **Check Ground Projection checkbox is enabled**
3. **Adjust Ground Height** (try values around 0)
4. **Adjust Ground Radius** (try larger values like 200-300)
5. **Check "Show HDR Background" is enabled** (for sky visibility)

### Car Below Ground

1. **Open Transform Panel**
2. **Select car model**
3. **Increase Y position** by 0.5-2.0 units
4. **Verify car is now visible above ground**

---

## Test Configuration

**Path Tracer Settings:**
- **Resolution Scale:** 0.75 (default)
- **Bounces:** 4 (default)
- **Min Samples:** 0 (default)
- **Tiles:** 4 (default)

**HDR Settings:**
- **Intensity:** 1.0 (default)
- **Rotation (Azimuth):** 0° (default)
- **Tilt (Elevation):** 0° (default)
- **Show Background:** Enabled
- **Ground Projection:** Enabled

**Ground Projection Settings:**
- **Height:** Adjust to match car position (typically 0-1.0)
- **Radius:** 100-200 (adjust for desired ground coverage)

---

## Notes

- **Ground Projection** uses Three.js `GroundedSkybox` which projects the HDR environment onto a ground plane
- **Path Tracer** should render shadows onto this projected ground
- **"Keep Ground During Path Trace"** ensures the ground plane remains visible for shadow projection
- **Shadow plane** (from standard viewer) should be hidden during path tracing (already implemented)

---

**Status:** ⏳ **Ready for Manual Testing**













