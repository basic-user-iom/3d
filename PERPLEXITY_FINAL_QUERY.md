# Perplexity Query: Three.js Shadow System Architecture - Critical Issues Need Guidance

## Problem Statement

We have a Three.js React application with three shadow systems that can be switched between:
1. **Standard Shadows** - Three.js directional light shadows
2. **HDR System** - HDR environment with standard shadows  
3. **Weather GL (CSM)** - Cascaded Shadow Maps

After comprehensive code analysis and test implementation, we've identified **5 critical issues** causing shadow inconsistencies when switching between systems.

## Critical Issues Requiring Guidance

### Issue 1: Double Light Position Restoration (Race Condition)
**Problem:** Light positions are restored in two places:
1. Atomically in `ShadowSystemCoordinator.switchSystem()` (lines 110-119)
2. Again in `requestAnimationFrame` callback in `ViewerCanvas.tsx` (lines 10759-10866)

**Impact:** Light positions may be incorrect after transition, causing shadows to appear in wrong positions.

**Code:**
```typescript
// Location 1: ShadowSystemCoordinator.ts:110-119
if (restoreLightPositions && lightPositions.size > 0) {
  lightPositions.forEach((savedState, light) => {
    light.position.copy(savedState.position) // First restoration
    light.target.position.copy(savedState.targetPosition)
    light.intensity = savedState.intensity
    light.castShadow = savedState.castShadow
    light.visible = savedState.visible
  })
}

// Location 2: ViewerCanvas.tsx:10759-10866 (in requestAnimationFrame)
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    lights.forEach(light => {
      // Additional restoration - may conflict with atomic restoration
      viewerRef.current.shadowManager?.registerStandardLight(light)
      light.castShadow = true
      light.visible = true
      // ... more restoration
    })
  })
})
```

**Question:** What's the best pattern to ensure light positions are restored exactly once, atomically, without race conditions? Should we remove the requestAnimationFrame restoration entirely, or use a flag to prevent double restoration?

### Issue 2: Shadow Camera Bounds Calculated Before CSM Lights Removed
**Problem:** When disabling Weather GL (CSM):
1. CSM destroyed before switch (line 10740-10744) ✅
2. System switched to standard (line 10749)
3. Shadow camera bounds updated in `requestAnimationFrame` (line 10827)
4. BUT: CSM lights may still be in scene during bounds calculation

Even though we exclude CSM lights from bounding box calculation (shadowManager.ts:29-40), there's a timing window where:
- CSM.destroy() is called but lights not yet removed from scene
- Shadow camera bounds calculated with CSM lights still present
- Bounds calculated incorrectly, causing shadows to only appear in specific positions

**Code:**
```typescript
// ViewerCanvas.tsx:10740 - Destroy CSM
if (viewerRef.current.csmShadowSystem) {
  viewerRef.current.csmShadowSystem.destroy() // Async cleanup
  viewerRef.current.csmShadowSystem = undefined
}

// ViewerCanvas.tsx:10827 - Update bounds (may run before CSM lights removed)
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    viewerRef.current.updateShadowCameraBounds() // ❌ CSM lights may still be in scene
  })
})
```

**Question:** How to ensure shadow camera bounds are calculated only after CSM lights are completely removed? Should CSM.destroy() return a Promise? Should we wait for scene to stabilize? What's the proper synchronization pattern?

### Issue 3: HDR Disable Doesn't Restore CSM
**Problem:** When HDR is disabled and CSM was active before HDR:
- Code detects CSM should be restored (line 7915-7918)
- BUT: Only logs a message, doesn't actually restore CSM (line 7937-7939)
- CSM restoration relies on `enableStandaloneWeather` effect, which may not trigger

**Code:**
```typescript
// ViewerCanvas.tsx:7915-7926
if (savedShadowSystem) {
  targetShadowSystem = savedShadowSystem // May be 'csm'
} else {
  const isCSMActive = shadowManager?.isSystemActive('csm')
  targetShadowSystem = isCSMActive ? 'csm' : 'standard'
}

// ViewerCanvas.tsx:7929-7939
if (shadowCoordinator2 && targetShadowSystem) {
  shadowCoordinator2.switchSystem(targetShadowSystem, undefined, {
    preserveMaterials: true,
    preserveShadowPlane: true,
    preserveLightStates: true
  })
} else if (targetShadowSystem === 'csm') {
  // ❌ PROBLEM: Only logs, doesn't restore CSM!
  console.log('[ViewerCanvas] ✅ CSM shadows active - CSM system will manage shadows')
  // Missing: Actual CSM restoration with proper config
}
```

**Question:** How to properly restore CSM after HDR disable? Should we:
- Save CSM config before HDR and restore it?
- Recreate CSM with saved config?
- Use the weather effect to trigger CSM creation?
- What's the most reliable pattern?

### Issue 4: Double CSM Destruction
**Problem:** CSM is destroyed in two places:
1. Manually in `ViewerCanvas.tsx` before switch (line 10740-10744)
2. Automatically in `ShadowManager.disableCurrentSystem()` (line 448-452)

**Code:**
```typescript
// ViewerCanvas.tsx:10740 - Manual destruction
if (viewerRef.current.csmShadowSystem) {
  viewerRef.current.csmShadowSystem.destroy()
  viewerRef.current.csmShadowSystem = undefined
}

// shadowManager.ts:448 - Automatic destruction
private disableCurrentSystem(): void {
  if (this.currentSystem === 'csm') {
    if (this.csmSystem) {
      this.csmSystem.destroy() // ❌ May destroy already-destroyed system
      this.csmSystem = null
    }
  }
}
```

**Question:** What's the best pattern for resource cleanup when switching systems? Should:
- Cleanup be centralized in ShadowManager only?
- Manual cleanup check if already destroyed?
- Use a cleanup coordinator pattern?
- How to prevent double destruction errors?

### Issue 5: Lights Not Found After Weather GL Exit
**Problem:** After disabling Weather GL:
- `directionalLights` Map may be empty
- Scene traversal fallback may miss lights if they're hidden
- Console shows: `⚠️ No directional lights found to register with ShadowManager`

**Code:**
```typescript
// ViewerCanvas.tsx:10835-10860
let lights: THREE.DirectionalLight[] = []
if (currentViewer.directionalLights && currentViewer.directionalLights.size > 0) {
  lights = Array.from(currentViewer.directionalLights.values()) // ❌ May be empty
} else {
  // Fallback: scene traversal
  scene.traverse((obj) => {
    if (obj instanceof THREE.DirectionalLight && obj.userData.isSun !== undefined) {
      if (!obj.userData.isCSMLight && !obj.userData.isStandaloneWeatherLight) {
        lights.push(obj) // ❌ May miss hidden lights
      }
    }
  })
}
```

**Question:** How to ensure lights are always findable after system switches? Should we:
- Maintain a separate light registry that never gets cleared?
- Never hide lights, only disable shadows?
- Use WeakMap for light tracking?
- Mark lights with persistent identifiers?

## Architecture Questions

### 1. State Management Pattern
What's the best architectural pattern for managing multiple shadow systems?
- State machine pattern?
- Command pattern for transitions?
- Observer pattern for state changes?
- Transition queue to prevent overlapping switches?

### 2. Resource Cleanup Coordination
How to properly coordinate resource cleanup (CSM destruction, light state) when switching systems?
- Synchronous before switch?
- Asynchronous with proper waiting?
- Coordinated through a cleanup manager?
- Promise-based cleanup?

### 3. Async Operation Handling
How to handle async operations (CSM destruction, shadow map regeneration) during system switches?
- Use promises/async-await?
- Use event emitters?
- Use requestAnimationFrame with proper sequencing?
- Use a transition state machine?

### 4. Shadow Camera Bounds Synchronization
How to ensure shadow camera bounds are calculated correctly after CSM disable?
- Wait for CSM destruction to complete (Promise)?
- Use callback from destroy method?
- Calculate bounds only after scene is stable?
- Use a bounds calculation queue?

## Test Results Summary

| Test Scenario | Status | Critical Issues |
|--------------|--------|----------------|
| Standard → Weather GL → Standard | ⚠️ PARTIAL | 2 |
| Standard → HDR → Standard | ⚠️ PARTIAL | 2 |
| Weather GL → HDR → Weather GL | ❌ FAIL | 3 |
| Rapid Switching | ❌ FAIL | 4 |

**Total Critical Issues:** 5
**Total Warnings:** 8

## Request for Specific Solutions

Please provide:
1. **Concrete code patterns** to fix each of the 5 critical issues
2. **Architectural recommendations** for the shadow system manager
3. **Synchronization strategies** for async operations
4. **Resource cleanup patterns** to prevent conflicts
5. **State preservation patterns** for reliable restoration
6. **Three.js best practices** for shadow system transitions

We need actionable, implementable solutions that work with our existing Three.js + React + TypeScript codebase.





















