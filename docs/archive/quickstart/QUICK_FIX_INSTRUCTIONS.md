# Quick Fix Instructions - Ground Shadows

**Issue:** Shadows not appearing on ground with HDR ground projection + path tracer.

**Status:** ✅ Code fix applied - **Path tracer needs to be restarted**

---

## Immediate Steps

### 1. **Restart Path Tracer** ⚠️ **CRITICAL**
The path tracer was initialized with the old config. You must restart it:

1. **Stop** the path tracer (click "Stop" button)
2. **Wait 1-2 seconds** for cleanup
3. **Start** the path tracer again (click "Start" button)

This will reinitialize with the new config that includes GroundedSkybox.

---

### 2. **Adjust Ground Height** (VERY IMPORTANT)

**Current:** Ground Height = 15.0 (way too high!)  
**The GroundedSkybox is positioned at Y = height - 0.01, so if height is 15.0, the ground is at Y=14.99**

**Problem:** The car is probably at Y=0 or lower, so it's far below the ground surface.

**Solution:**
1. In Lighting Panel, find "Ground Height" slider
2. **Lower it to 0.0 or 0.5** (match car's Y position)
3. The ground plane will move down to match the car

**Alternative:** Move the car up instead:
- Open Transform Panel
- Select car model
- Increase Y position to match Ground Height (e.g., Y = 15.0 if Ground Height is 15.0)

---

### 3. **Check Console Logs**

After restarting path tracer, look for these logs:

✅ **Expected logs (success):**
```
[PathTracerDemo] 🔄 Converting GroundedSkybox material to PBR for path tracer shadow support: {...}
[PathTracerDemo] ✅ Converted GroundedSkybox material to PBR for path tracer: {
  receiveShadow: true,
  visible: true,
  ...
}
[PathTracerDemo] 📝 Converted GroundedSkybox materials to PBR for path tracer shadow support: 1
```

❌ **If you see this (still excluded):**
```
[PathTracerDemo] 🔍 Excluding GroundedSkybox from path tracing: {...}
```

This means ground projection isn't detected as enabled. Check:
- Is "Ground Projection" checkbox checked in Lighting Panel?
- Is HDR loaded?

---

## Changes Made

1. ✅ **Updated PathTracerDemoPanel:** Now checks `hdrGroundProjectionEnabled` and sets `excludeGroundedSkybox: false` when enabled
2. ✅ **Increased opacity:** Changed from 0.9 to 0.95 for stronger shadows
3. ✅ **Enabled depthWrite:** Changed from `false` to `true` for proper shadow computation

---

## Why Shadows Still Don't Appear

1. **Path tracer not restarted:** Old config still active (excludeGroundedSkybox = true)
2. **Ground Height too high:** Ground at Y=14.99, car at Y=0 → car is below ground
3. **Insufficient samples:** Shadows may need 20-50+ samples to be visible

---

## Quick Test

1. ✅ Stop path tracer
2. ✅ Adjust Ground Height to **0.0**
3. ✅ Start path tracer
4. ✅ Check console for conversion logs
5. ✅ Wait for 30-50 samples
6. ✅ Verify shadows appear

---

## Still Not Working?

Check console for:
- GroundedSkybox detection logs
- Material conversion logs  
- Any error messages

Then check:
- Ground Projection checkbox is checked ✅
- HDR is loaded ✅
- Ground Height matches car position ✅
- Path tracer restarted ✅













