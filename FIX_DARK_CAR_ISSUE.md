# Fix Dark Car Issue - Quick Guide

## 🔍 Problem Identified

The car appears very dark because:
1. **Post-processing is disabled** (`postProcessingEnabled: false` by default)
2. **HDR is disabled** (`hdrEnabled: false` by default)
3. **Materials are MeshStandardMaterial** - requires proper lighting/environment

## ✅ Solution: Enable Post-Processing

### Option 1: Enable via UI (Recommended)

1. **Open Rendering Quality Panel:**
   - Look for the "Rendering Quality" panel in the UI
   - Find the "Post-Processing" toggle/checkbox

2. **Enable Post-Processing:**
   - Check/toggle "Post-Processing Enabled"
   - This will enable tone mapping and exposure control

3. **Optional - Enable HDR:**
   - Open HDR panel
   - Enable HDR and load an HDR environment map
   - This provides ambient lighting and reflections

### Option 2: Enable Programmatically

You can enable post-processing by running this in the browser console:

```javascript
// Enable post-processing
useAppStore.getState().setPostProcessingEnabled(true)

// Optional: Enable HDR
useAppStore.getState().setHdrEnabled(true)
```

## 📊 Expected Results

**Before:**
- Car appears very dark (almost black silhouette)
- No tone mapping or exposure control
- No HDR environment lighting

**After:**
- Car should be properly lit and visible
- Tone mapping applied (colors look correct)
- Exposure control working
- HDR provides ambient lighting (if enabled)

## 🎯 Quick Fix

**Immediate fix - run in browser console:**
```javascript
// Enable post-processing immediately
const store = useAppStore.getState()
store.setPostProcessingEnabled(true)
console.log('✅ Post-processing enabled!')
```

---

**Status:** Post-processing needs to be enabled for proper lighting!

























