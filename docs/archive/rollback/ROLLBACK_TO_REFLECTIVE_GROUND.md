# Rollback to Version with Reflective Ground

## Date: 2025-11-13
## Action: Rolled back ground masking changes

### Changes Made:

**Reverted:**
- ✅ Removed masked HDR texture creation (lower hemisphere masking)
- ✅ Now using original HDR texture directly (includes reflective ground)
- ✅ Updated background persistence logic to use original HDR texture

**Kept:**
- ✅ Background persistence fixes (still needed to prevent `scene.background = null` issue)
- ✅ MaskedHDRTexture utility file (available but not used)
- ✅ Enhanced logging for debugging

### Current Behavior:

1. **Path tracer uses original HDR texture** (full HDR, including lower hemisphere with ground)
2. **Reflective ground will appear** in path tracer renders (as before)
3. **Background persistence** still works (prevents ground projection from resetting background to null)

### Files Modified:

1. **`src/viewer/pathTracer/PathTracerDemo.ts`**:
   - Removed masked texture creation in `setupEnvironment()`
   - Now uses `originalHDRTexture` directly
   - Updated background restoration to use original HDR texture
   - Updated logging to reflect changes

### To Re-enable Ground Masking:

If you want to restore ground masking in the future:
1. Uncomment the masked texture creation code in `setupEnvironment()`
2. Change `hdrTextureForPathTracer = originalHDRTexture` back to `hdrTextureForPathTracer = this.maskedHDRTexture || originalHDRTexture`
3. Update background restoration to use `this.maskedHDRTexture`

### Status:

✅ Rollback complete - Path tracer now shows reflective ground from HDR (as originally intended)















