# Perplexity Query: Shadow System Inconsistencies - Weather GL, Standard, HDR Transitions

## Problem Statement
Our Three.js application has a shadow system that supports three modes:
1. **Weather GL (CSM)** - Cascaded Shadow Maps for standalone weather system
2. **Standard Shadows** - Default Three.js directional light shadows  
3. **HDR System** - High Dynamic Range environment

When switching between these modes, we experience inconsistencies:
- Shadows disappear or don't render correctly
- Light positions are not restored properly
- Shadow plane visibility is lost
- Material shadow properties (castShadow, receiveShadow, depthWrite) are not preserved
- Shadow maps are not regenerated at correct times
- Race conditions with state restoration

## System Architecture

### Components
1. **ShadowManager** - Manages shadow system type and switching
2. **ShadowSystemCoordinator** - Coordinates state preservation during transitions
3. **ShadowMaterialStateManager** - Preserves material shadow properties
4. **ShadowPlaneManager** - Manages shadow plane visibility and material
5. **CSMShadowSystem** - Implements Cascaded Shadow Maps

### Key Code Files
- `src/viewer/ViewerCanvas.tsx` - Main component with transition logic
- `src/viewer/utils/shadowManager.ts` - Shadow system manager
- `src/viewer/utils/ShadowSystemCoordinator.ts` - State coordination
- `src/viewer/utils/ShadowMaterialStateManager.ts` - Material state management
- `src/viewer/utils/ShadowPlaneManager.ts` - Shadow plane management
- `src/viewer/effects/CSMShadowSystem.ts` - CSM implementation

## Specific Issues

### Issue 1: Light Position Restoration Missing
**Location**: `ViewerCanvas.tsx:10647-10668` (Weather GL → Standard transition)

When disabling standalone weather, original light positions are saved (line 10243-10256) but restoration happens later (line 10734-10771). The transition code doesn't explicitly restore positions.

**Question**: What is the best practice for ensuring light positions are restored atomically with shadow system switching?

### Issue 2: ShadowManager Hides Lights Incorrectly
**Location**: `shadowManager.ts:451-456`

```typescript
private disableCurrentSystem(): void {
  if (this.currentSystem === 'standard') {
    this.standardLights.forEach(light => {
      light.castShadow = false
      light.visible = false // ⚠️ Hides lights completely
    })
  }
}
```

**Question**: Should lights remain visible when disabling shadows, or is hiding them correct? What's the industry best practice for managing light visibility during shadow system transitions?

### Issue 3: HDR Disable Shadow Restoration Logic
**Location**: `ViewerCanvas.tsx:7879-7921`

The code checks if CSM is active but may not handle all transition scenarios correctly:

```typescript
const isCSMActive = viewerRef.current?.shadowManager?.isSystemActive('csm') || !!viewerRef.current?.csmShadowSystem

if (isCSMActive) {
  // CSM is active - shadows are managed by CSM system
} else {
  // Standard shadows - re-enable shadows on all directional lights
  // ...
}
```

**Question**: How should we properly detect and restore the correct shadow system after HDR disable? Should we save the active shadow system before HDR is applied?

### Issue 4: Race Conditions with Async State Restoration
**Location**: Multiple locations with `setTimeout` and `requestAnimationFrame`

State restoration uses delays which may cause race conditions if users switch systems quickly:

```typescript
setTimeout(() => {
  const delayedFixResult = fixAllTransparentMaterials(scene)
}, 500)

requestAnimationFrame(() => {
  viewerRef.current?.updateShadowCameraBounds()
})
```

**Question**: What is the best pattern for ensuring atomic state transitions in Three.js? How can we prevent race conditions when switching shadow systems?

### Issue 5: Material State Not Preserved for All Transitions
**Location**: `ShadowMaterialStateManager.ts`

Material shadow properties may not be saved before all transitions, especially:
- Weather GL → HDR
- HDR → Weather GL
- Quick switching between modes

**Question**: Should we save material state before every system transition, or is there a more efficient approach? How do professional Three.js applications handle material state preservation?

### Issue 6: Shadow Plane State Management
**Location**: Multiple locations

Shadow plane visibility and material properties may not be consistently managed across all transitions.

**Question**: What is the best practice for managing shadow plane state across multiple shadow system types? Should shadow plane state be part of the shadow system state machine?

## Code Snippets for Analysis

### Weather GL → Standard Transition
```typescript
// ViewerCanvas.tsx:10647-10668
else if (!currentEnableStandaloneWeather || currentStreetsGLIframeOverlay) {
  const shadowCoordinator = (viewerRef.current as any)?.shadowCoordinator as ShadowSystemCoordinator | null
  if (shadowCoordinator) {
    shadowCoordinator.switchSystem('standard', undefined, {
      preserveMaterials: true,
      preserveShadowPlane: true,
      preserveLightStates: true
    })
  }
  
  // Destroy CSM
  if (viewerRef.current.csmShadowSystem) {
    viewerRef.current.csmShadowSystem.destroy()
    viewerRef.current.csmShadowSystem = undefined
  }
  
  // ⚠️ Missing: Light position restoration happens later (line 10734)
}
```

### HDR Disable Shadow Restoration
```typescript
// ViewerCanvas.tsx:7859-7921
// CRITICAL: Re-enable shadow system after HDR disable
if (viewerRef.current?.renderer) {
  const renderer = viewerRef.current.renderer
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.shadowMap.needsUpdate = true
}

const isCSMActive = viewerRef.current?.shadowManager?.isSystemActive('csm') || !!viewerRef.current?.csmShadowSystem

if (isCSMActive) {
  // CSM is active - shadows are managed by CSM system
} else {
  // Standard shadows - re-enable shadows on all directional lights
  directionalLights.forEach((light) => {
    if (light && light.castShadow !== undefined) {
      light.castShadow = true
      if (light.shadow) {
        light.shadow.needsUpdate = true
      }
    }
  })
}
```

### ShadowManager System Disable
```typescript
// shadowManager.ts:445-459
private disableCurrentSystem(): void {
  if (this.currentSystem === 'csm') {
    if (this.csmSystem) {
      this.csmSystem.destroy()
      this.csmSystem = null
    }
  } else if (this.currentSystem === 'standard') {
    // Disable standard shadows by setting castShadow = false on lights
    this.standardLights.forEach(light => {
      light.castShadow = false
      light.visible = false // ⚠️ Is this correct?
    })
  }
}
```

### ShadowSystemCoordinator Switch
```typescript
// ShadowSystemCoordinator.ts:54-92
switchSystem(
  targetSystem: ShadowSystemType,
  csmConfig?: any,
  options: {
    preserveMaterials?: boolean
    preserveShadowPlane?: boolean
    preserveLightStates?: boolean
  } = {}
): void {
  const currentSystem = this.shadowManager.getCurrentSystem()
  
  // Save current state before switching
  if (preserveMaterials || preserveShadowPlane || preserveLightStates) {
    const lights = Array.from(this.directionalLights.values())
    shadowMaterialStateManager.saveSystemState(currentSystem, lights, this.shadowPlane)
    
    if (preserveMaterials) {
      shadowMaterialStateManager.saveSceneState(this.scene, lights, this.shadowPlane)
    }
  }

  // Switch system
  this.shadowManager.setShadowSystem(targetSystem, csmConfig)

  // Restore states after switch
  if (preserveLightStates) {
    const lights = Array.from(this.directionalLights.values())
    shadowMaterialStateManager.restoreSystemState(targetSystem, lights, this.shadowPlane)
  }

  // Ensure shadow properties are correct for the new system
  this.ensureShadowProperties(targetSystem)
}
```

## Questions for Perplexity

1. **State Machine Pattern**: Should we implement a proper state machine for shadow system transitions? What would be the best architecture?

2. **Atomic Transitions**: How can we ensure all state changes (lights, materials, shadow plane, shadow maps) happen atomically when switching systems?

3. **Light Visibility**: Should lights remain visible when disabling shadows, or is hiding them the correct approach? What's the industry standard?

4. **State Preservation Timing**: When should we save state (before transition, during, or after)? What's the best practice?

5. **Shadow Map Regeneration**: When should shadow maps be regenerated? Should it be immediate or deferred?

6. **Race Condition Prevention**: How can we prevent race conditions when users switch systems quickly? Should we queue transitions?

7. **HDR Integration**: How should HDR system interact with shadow systems? Should shadow state be saved before HDR is applied?

8. **Material Cleanup**: How should CSM material uniforms be cleaned up when switching away from CSM? Should this be automatic?

9. **Shadow Plane Management**: Should shadow plane state be part of the shadow system state, or managed separately?

10. **Best Practices**: What are the industry best practices for managing multiple shadow systems in a single Three.js application?

## Expected Outcome

We need a comprehensive solution that:
- Ensures consistent shadow rendering across all transitions
- Properly preserves and restores all state (lights, materials, shadow plane)
- Prevents race conditions
- Follows Three.js best practices
- Is maintainable and extensible

Please provide:
1. Recommended architecture/pattern
2. Specific code fixes for identified issues
3. Best practices for state management
4. Example implementation if possible
























