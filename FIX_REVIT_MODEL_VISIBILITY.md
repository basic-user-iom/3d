# Fix: Revit Models Not Visible in 3D Viewer

## Problem
Revit models loaded from the sync server were not appearing in the 3D viewer, even though they were being loaded successfully.

## Root Cause
The Streets GL overlay feature was hiding all models when enabled. When `streetsGLIframeOverlay` is `true`, the code sets `obj.visible = false` for all models with `userData.isModel` or `userData.isImportedModel`.

## Solution Applied

### 1. Auto-Disable Streets GL Overlay for Revit
**File:** `src/components/RevitConnectionPanel.tsx`

- When connecting to Revit sync server, automatically disable Streets GL overlay
- Ensures models are visible in the main viewer

### 2. Mark Revit Models
**Files:** 
- `src/viewer/useViewer.ts`
- `src/viewer/loaders/ifcLoader.ts`

- Detect Revit models by URL pattern (`/api/revit/download` or `revit`)
- Mark with `userData.isRevitModel = true`
- Mark with `userData.excludeFromStreetsGLHiding = true`

### 3. Protect Revit Models from Hiding
**File:** `src/viewer/ViewerCanvas.tsx`

- Modified Streets GL overlay logic to skip Revit models
- Revit models remain visible even when Streets GL overlay is enabled

### 4. Force Visibility After Load
**File:** `src/viewer/useViewer.ts`

- After adding model to scene, force visibility for Revit models
- Traverse all children and ensure they're visible

## Changes Made

### RevitConnectionPanel.tsx
```typescript
// Disable Streets GL overlay when using Revit sync
const { setStreetsGLIframeOverlay } = useAppStore.getState()
setStreetsGLIframeOverlay(false)

// Mark models as Revit models when loading
model.scene.traverse((obj: any) => {
  obj.visible = true
  obj.userData.isRevitModel = true
  obj.userData.excludeFromStreetsGLHiding = true
})
```

### useViewer.ts
```typescript
// Detect Revit models
const isRevitModel = url.includes('/api/revit/download') || url.includes('revit')

// Don't hide Revit models even if Streets GL overlay is enabled
if (store.streetsGLIframeOverlay && !isRevitModel) {
  model.scene.visible = false
} else if (isRevitModel) {
  model.scene.visible = true
  model.scene.userData.isRevitModel = true
}

// Force visibility after adding to scene
if (isRevitModel) {
  model.scene.visible = true
  model.scene.traverse((child) => {
    child.visible = true
  })
}
```

### ViewerCanvas.tsx
```typescript
// Skip Revit models when hiding models for Streets GL overlay
if (obj.userData.isRevitModel || obj.userData.excludeFromStreetsGLHiding) {
  obj.visible = true
  return // Don't hide Revit models
}
```

### ifcLoader.ts
```typescript
// Mark IFC models from Revit
if (typeof data === 'string' && (data.includes('/api/revit/download') || data.includes('revit'))) {
  group.userData.isRevitModel = true
  group.userData.excludeFromStreetsGLHiding = true
}
```

## Testing

After these changes:

1. **Connect to Revit:**
   - Click "Connect" in Revit Live Link panel
   - Streets GL overlay should be automatically disabled
   - Console should show: `[RevitConnection] Disabled Streets GL overlay for Revit models`

2. **Load Revit Model:**
   - When model loads, console should show:
     - `[ModelLoad] Revit model marked as always visible`
     - `[ModelLoad] Forced Revit model visibility after adding to scene`
   - Model should appear in 3D viewer

3. **Verify Visibility:**
   - Model should be visible even if Streets GL overlay is manually enabled
   - Model should not disappear when Streets GL overlay is toggled

## What This Fixes

✅ **Revit models are always visible** - Even if Streets GL overlay is enabled
✅ **Auto-disable Streets GL** - When connecting to Revit, overlay is disabled automatically
✅ **Protected from hiding** - Revit models won't be hidden by Streets GL overlay logic
✅ **Force visibility** - Models are explicitly set to visible after loading

## Next Steps

1. **Refresh the web app** to pick up the changes
2. **Connect to Revit** - Click "Connect" in Revit Live Link panel
3. **Export from Revit** - Click "Direct Link" in Revit
4. **Check 3D viewer** - Model should now be visible!
