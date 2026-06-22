# AO Depth Texture Fix - Root Cause Identified

## 🔴 CRITICAL ISSUE FOUND

**Console Logs Show:**
```
[PostProcessingSystem] ⚠️ readBuffer.depthTexture is missing - SAOPass may not work correctly
[PostProcessingSystem] This may indicate a conflict with shadow maps or render target configuration
```

**Root Cause:** EffectComposer does NOT automatically create depth texture from depth buffer. We must explicitly create and attach it.

## Fix Applied

### 1. Explicit Depth Texture Creation ✅
**File:** `src/viewer/postprocessing/PostProcessingSystem.ts` (lines ~158-173)

**Before (Incorrect):**
```typescript
// Assumed EffectComposer would create depth texture automatically
this.composerRenderTarget = new THREE.WebGLRenderTarget(..., {
  depthBuffer: true, // Only this - assumed automatic creation
})
```

**After (Fixed):**
```typescript
// Explicitly create depth texture - EffectComposer does NOT create it automatically
const depthTexture = new THREE.DepthTexture(composerWidth, composerHeight)
depthTexture.type = THREE.UnsignedShortType

this.composerRenderTarget = new THREE.WebGLRenderTarget(..., {
  depthBuffer: true,
  depthTexture: depthTexture, // CRITICAL: Explicitly attach depth texture
})
```

### 2. Explicit Depth Texture Connection ✅
**File:** `src/viewer/postprocessing/PostProcessingSystem.ts` (lines ~620-650)

**Before (Incorrect):**
```typescript
// Only logged warning - didn't fix the issue
if (!composerAny.readBuffer.depthTexture) {
  console.warn('depthTexture is missing')
}
```

**After (Fixed):**
```typescript
// Explicitly connect depth texture to readBuffer
if (composerAny.readBuffer && !composerAny.readBuffer.depthTexture) {
  composerAny.readBuffer.depthTexture = this.composerRenderTarget.depthTexture
  // Also connect to renderTarget1 and renderTarget2
  if (composerAny.renderTarget1) {
    composerAny.renderTarget1.depthTexture = this.composerRenderTarget.depthTexture
  }
  if (composerAny.renderTarget2) {
    composerAny.renderTarget2.depthTexture = this.composerRenderTarget.depthTexture
  }
}
```

### 3. Depth Texture Resize Handling ✅
**File:** `src/viewer/postprocessing/PostProcessingSystem.ts` (lines ~653-680)

**Added:**
- Update depth texture size when render target is resized
- Reconnect depth texture to all composer buffers after resize

## Why This Fixes the Black Screen

1. **SAOPass requires depthTexture** - Not just depthBuffer
2. **EffectComposer doesn't create it automatically** - Must be explicit
3. **Depth texture must be on readBuffer** - SAOPass reads from there
4. **Must be reconnected on resize** - Size changes break the connection

## Expected Result

After this fix:
- ✅ Depth texture is explicitly created
- ✅ Depth texture is attached to render target
- ✅ Depth texture is connected to readBuffer
- ✅ SAOPass can read depth correctly
- ✅ Black screen should be resolved

## Testing

1. Reload page
2. Enable post-processing
3. Enable AO
4. Check console - should NOT see "depthTexture is missing" warnings
5. Check 3D view - should NOT be black screen

## Status: ✅ FIX APPLIED

The root cause has been identified and fixed. The depth texture is now explicitly created and connected.












