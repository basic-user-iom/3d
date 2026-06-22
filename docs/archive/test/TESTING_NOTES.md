# Testing Notes - HDR Ground Masking

## Current Status
- ✅ Code changes complete
- ⚠️ Need to test in browser with HDR loaded

## What to Test:
1. **Load HDR file** - Wait for it to fully load
2. **Open Path Tracer panel** - Click "Path Trace" in toolbar
3. **Start path tracer** - Click "Start" button
4. **Check console logs** for:
   - `[PathTracerDemo] 🔧 Creating masked HDR texture...`
   - `[PathTracerDemo] ✅ Created masked HDR texture (lower hemisphere masked to black)`
   - `[MaskedHDRTexture] Analyzing HDR texture:`
   - `[MaskedHDRTexture] Created black-masked HDR texture:`

## Expected Result:
- Path tracer should show HDR sky/background (upper hemisphere)
- **NO** reflective ground surface from HDR (lower hemisphere masked to black)
- Ground should appear as a simple flat surface (if any)
- Shadows from scene lights should still appear (these are separate from HDR ground)

## If Issues:
- Check console for errors when creating masked texture
- Verify HDR texture has `image.data` array (required for masking)
- Check if path tracer started before HDR loaded (may need to restart path tracer)

## Image Analysis:
From the provided screenshot:
- ✅ Ground doesn't show environmental reflections (good - masking working)
- ❌ Render is black/white/dithered (may indicate path tracer not using HDR, or very early samples)
- ✅ Shadows visible (expected - these are from scene lights, not HDR)

**Action**: Need to verify path tracer is using masked HDR texture (check console logs)















