# Path Tracer Exit Issues - Complete Code Analysis

## Issues Reported
1. **Glass disappears on exit** - Material properties like `transmission`, `ior`, `thickness` are not being saved/restored
2. **HDR background is removed on exit** - Background restoration timing/coordination issues
3. **Gizmo removal during rendering is not active** - Optimized code may be too aggressive, missing gizmos

## Issue 1: Glass Material Properties Not Saved/Restored

### Current Code (Lines 2248-2252)
```typescript
const originalMaterialProps = originalMaterial instanceof THREE.Material ? {
  opacity: (originalMaterial as any).opacity,
  transparent: (originalMaterial as any).transparent,
  color: (originalMaterial as any).color ? (originalMaterial as any).color.clone() : undefined,
  depthWrite: (originalMaterial as any).depthWrite,
} : undefined
```

**Problem**: Only saves basic properties. Missing glass-specific properties:
- `transmission` (for glass/transparent materials)
- `ior` (Index of Refraction)
- `thickness` (for glass materials)
- `roughness` (for glass materials)
- `metalness` (for glass materials)
- `emissive`, `emissiveIntensity`
- `envMapIntensity`

### Restoration Code (Lines 4174-4226)
```typescript
if (originalMaterialProps) {
  // Restore opacity
  if ('opacity' in originalMaterial && originalMaterialProps.opacity !== undefined) {
    (originalMaterial as any).opacity = originalMaterialProps.opacity
  }
  // Restore transparent flag
  if ('transparent' in originalMaterial && originalMaterialProps.transparent !== undefined) {
    (originalMaterial as any).transparent = originalMaterialProps.transparent
  }
  // Restore color
  if (originalMaterialProps.color && 'color' in originalMaterial) {
    // ... color restoration code
  }
  // Restore depthWrite
  if ('depthWrite' in originalMaterial && originalMaterialProps.depthWrite !== undefined) {
    (originalMaterial as any).depthWrite = originalMaterialProps.depthWrite
  }
  originalMaterial.needsUpdate = true
}
```

**Problem**: Only restores basic properties. Glass properties are lost.

## Issue 2: HDR Background Removal

### Background Restoration Code (Lines 4793-4838)
```typescript
// CRITICAL: Restore scene background AFTER all HDR operations complete
setTimeout(() => {
  if (this.originalBackground instanceof THREE.Color) {
    const restoredColor = new THREE.Color(this.originalBackground.r, this.originalBackground.g, this.originalBackground.b)
    this.scene.background = restoredColor
    this.renderer.setClearColor(restoredColor, 1.0)
  } else if (this.originalBackground instanceof THREE.Texture) {
    this.scene.background = this.originalBackground
    this.renderer.setClearColor(0x000000, 0)
  } else if (this.originalBackground) {
    this.scene.background = this.originalBackground
  } else {
    const defaultSkyColor = new THREE.Color(0x87ceeb)
    this.scene.background = defaultSkyColor
    this.renderer.setClearColor(defaultSkyColor, 1.0)
  }
  
  setTimeout(() => {
    ;(window as any).__pathTracerJustStopped = false
    ;(window as any).__pathTracerStopTime = undefined
  }, 150)
}, 50)
```

**Problem**: 
1. HDR system might override background after restoration
2. When HDR is enabled, `originalBackground` might be `null` (because HDR replaces it), but we need to restore HDR background texture
3. Timing issues - HDR system might run after our restoration

### HDR State Restoration (Lines 4706-4791)
```typescript
const hdrSystem = (window as any).__hdrSystem
if (hdrSystem) {
  const currentStore = (window as any).__appStore?.getState?.()
  const currentHdrEnabled = currentStore?.hdrEnabled ?? false
  
  if (originalHdrState.hdrEnabled) {
    if (currentHdrEnabled) {
      // HDR is already enabled - just restore settings
      // ... restore ground projection, background visibility
    } else {
      // HDR was enabled but got disabled - re-enable it
      if (originalHdrState.hdrUrl && typeof hdrSystem.applyHDR === 'function') {
        hdrSystem.applyHDR(originalHdrState.hdrUrl, hdrIntensity).then(() => {
          this.scene.environment = this.originalEnvironment
        })
      }
    }
  }
}
```

**Problem**: 
1. Doesn't explicitly restore HDR background texture
2. `updateBackgroundVisibility()` might not restore the actual texture
3. Background restoration happens in setTimeout, might conflict with HDR restoration

## Issue 3: Gizmo Removal Not Active During Rendering

### Current Optimized Code (Lines 171-211)
```typescript
// OPTIMIZED: Only do full gizmo check every 60 frames
this._gizmoCheckFrameCounter++
const shouldDoFullCheck = this._gizmoCheckFrameCounter - this._lastFullGizmoCheck >= 60

if (shouldDoFullCheck) {
  // Full check: traverse scene and hide all gizmos
  this.hideAllHelpersAndGizmos()
  this._lastFullGizmoCheck = this._gizmoCheckFrameCounter
} else {
  // Lightweight check: just hide already-known gizmos
  if (this._originalHelperStates && this._originalHelperStates.length > 0) {
    this._originalHelperStates.forEach(({ obj }) => {
      if (obj && obj.visible) {
        obj.visible = false
      }
    })
  }
}

// Transform controls check (lightweight)
const viewer = (window as any).__viewer
if (viewer?.transformControls) {
  const transformControls = viewer.transformControls
  if (transformControls.enabled !== false) {
    transformControls.enabled = false
  }
  if (transformControls.object) {
    transformControls.detach()
  }
  if (transformControls.visible) {
    transformControls.visible = false
  }
}
```

**Problem**:
1. If `_originalHelperStates` is empty or cleared, lightweight check does nothing
2. New gizmos created between full checks won't be caught
3. Transform controls children (axes, boxes) might not be hidden if they're recreated
4. 60-frame interval might be too long for fast gizmo recreation

## Recommended Fixes

### Fix 1: Save/Restore All Material Properties
- Save `transmission`, `ior`, `thickness`, `roughness`, `metalness`, `emissive`, `emissiveIntensity`, `envMapIntensity`
- Restore all saved properties during stop()

### Fix 2: Proper HDR Background Restoration
- Save HDR background texture reference during initialization
- Restore HDR background texture explicitly after HDR system operations
- Coordinate timing between HDR restoration and background restoration

### Fix 3: More Aggressive Gizmo Removal
- Reduce full check interval from 60 to 10-20 frames
- Always check transform controls children on every frame
- Add fallback to detect new gizmos by name/type even during lightweight checks
- Ensure `_originalHelperStates` is populated during initialization

















