# Shadow System Analysis Report - Inconsistencies Between Weather GL, Standard, and HDR

## Executive Summary
The shadow system exhibits inconsistencies when switching between three modes:
1. **Weather GL (Standalone CSM)** - Cascaded Shadow Maps for weather system
2. **Standard Shadows** - Default Three.js directional light shadows
3. **HDR System** - High Dynamic Range environment with shadow interactions

## System Architecture

### Components Involved
1. **ShadowManager** (`src/viewer/utils/shadowManager.ts`)
   - Manages shadow system type (standard, CSM, streets-gl, pathTracer)
   - Handles system switching and light registration
   - **Issue**: May not properly coordinate with other systems

2. **ShadowSystemCoordinator** (`src/viewer/utils/ShadowSystemCoordinator.ts`)
   - Coordinates state preservation during system switches
   - Manages material and shadow plane states
   - **Issue**: May not be called consistently in all transition paths

3. **ShadowMaterialStateManager** (`src/viewer/utils/ShadowMaterialStateManager.ts`)
   - Preserves material shadow properties (castShadow, receiveShadow, depthWrite)
   - Saves/restores system states
   - **Issue**: State may not be saved before all transitions

4. **ShadowPlaneManager** (`src/viewer/utils/ShadowPlaneManager.ts`)
   - Manages shadow plane visibility and material properties
   - Protects shadow plane from HDR updates
   - **Issue**: May not be called in all transition paths

5. **CSMShadowSystem** (`src/viewer/effects/CSMShadowSystem.ts`)
   - Implements Cascaded Shadow Maps
   - Sets up materials for CSM shadows
   - **Issue**: May not properly clean up when switching away

## Identified Issues

### Issue 1: Incomplete State Preservation During Weather GL → Standard Transition
**Location**: `ViewerCanvas.tsx:10647-10668`

**Problem**:
- When disabling standalone weather, the code switches to standard shadows via `ShadowSystemCoordinator`
- However, original light positions are saved but may not be properly restored
- CSM system is destroyed, but standard lights may not be re-enabled correctly

**Code Flow**:
```typescript
// Disable standalone weather
else if (!currentEnableStandaloneWeather || currentStreetsGLIframeOverlay) {
  // Switch to standard shadows
  shadowCoordinator.switchSystem('standard', undefined, {
    preserveMaterials: true,
    preserveShadowPlane: true,
    preserveLightStates: true
  })
  
  // Destroy CSM
  if (viewerRef.current.csmShadowSystem) {
    viewerRef.current.csmShadowSystem.destroy()
    viewerRef.current.csmShadowSystem = undefined
  }
}
```

**Missing**:
- Restoration of original light positions (saved at line 10243-10256)
- Re-enabling of standard lights that were disabled when CSM was enabled
- Shadow map regeneration for standard lights

### Issue 2: HDR Disable May Not Restore Shadow System Correctly
**Location**: `ViewerCanvas.tsx:7848-7951`

**Problem**:
- When HDR is disabled, shadow system restoration logic is complex and may miss edge cases
- Code checks if CSM is active, but may not handle all transition scenarios
- Shadow maps are disposed and regenerated, but timing may be off

**Code Flow**:
```typescript
// HDR disable
hdrSystem.disableHDR()

// Re-enable shadow system
if (viewerRef.current?.renderer) {
  renderer.shadowMap.enabled = true
  // ...
}

// Check if CSM is active
const isCSMActive = viewerRef.current?.shadowManager?.isSystemActive('csm') || !!viewerRef.current?.csmShadowSystem

if (isCSMActive) {
  // CSM is active
} else {
  // Standard shadows - re-enable on lights
  // ...
}
```

**Issues**:
- May not properly detect which shadow system should be active
- Light restoration may happen before shadow system is fully ready
- Shadow plane state may not be restored correctly

### Issue 3: ShadowManager.disableCurrentSystem() May Hide Lights Incorrectly
**Location**: `shadowManager.ts:445-459`

**Problem**:
- When disabling standard shadows, lights are set to `visible = false`
- This may cause lights to disappear when switching systems
- Lights should remain visible, only shadow casting should be disabled

**Code**:
```typescript
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
      light.visible = false // ⚠️ PROBLEM: Hides lights completely
    })
  }
}
```

**Impact**:
- When switching from standard → CSM → standard, lights may remain hidden
- Scene may appear dark even though shadows should be working

### Issue 4: Shadow Plane State May Not Be Preserved Across All Transitions
**Location**: Multiple locations

**Problem**:
- Shadow plane visibility and material properties may not be consistently managed
- `ShadowPlaneManager.ensureCriticalProperties()` may not be called in all transition paths
- Shadow plane may become invisible or have incorrect material properties

**Missing Calls**:
- Weather GL → Standard: May not restore shadow plane state
- HDR → Standard: Shadow plane state restoration may be incomplete
- Standard → Weather GL: Shadow plane may not be set up for CSM correctly

### Issue 5: Material State Restoration May Be Incomplete
**Location**: `ShadowMaterialStateManager.ts`

**Problem**:
- Material shadow properties (castShadow, receiveShadow, depthWrite) may not be saved before all transitions
- State restoration may happen before materials are ready
- CSM material setup may not be properly cleaned up

**Specific Issues**:
- Transparent materials may retain CSM uniforms after switching to standard
- Material depthWrite may not be restored correctly
- CSM shadow map uniforms may not be removed from materials

### Issue 6: Race Conditions in State Restoration
**Location**: Multiple locations with `setTimeout` and `requestAnimationFrame`

**Problem**:
- State restoration uses delays (`setTimeout`, `requestAnimationFrame`) which may cause race conditions
- If user switches systems quickly, previous restoration may interfere with new state
- Shadow map regeneration may happen at wrong time

**Examples**:
```typescript
// Line 10330: Delayed transparent material fix
setTimeout(() => {
  const delayedFixResult = fixAllTransparentMaterials(scene)
}, 500)

// Line 7840: Shadow camera bounds update
requestAnimationFrame(() => {
  viewerRef.current?.updateShadowCameraBounds()
})

// Line 7926: Light position fix
requestAnimationFrame(() => {
  fixLightPositionsAndShadowCameras()
})
```

## Transition Scenarios

### Scenario 1: Standard → Weather GL (CSM)
**Current Flow**:
1. Save original light positions ✅
2. Switch to CSM via ShadowSystemCoordinator ✅
3. Setup scene materials for CSM ✅
4. Fix transparent materials ✅
5. Ensure shadow plane for CSM ✅

**Potential Issues**:
- Standard lights may not be properly disabled
- Shadow plane may not be visible initially
- Material CSM setup may happen before CSM is fully ready

### Scenario 2: Weather GL → Standard
**Current Flow**:
1. Switch to standard via ShadowSystemCoordinator ✅
2. Destroy CSM system ✅
3. (Missing: Restore original light positions)
4. (Missing: Re-enable standard lights)
5. (Missing: Regenerate shadow maps)

**Issues**:
- Original light positions are not restored
- Standard lights may remain disabled
- Shadow maps may not be regenerated

### Scenario 3: Standard → HDR
**Current Flow**:
1. HDR is applied
2. Shadow system may be disabled (needs verification)
3. Shadow plane is protected from HDR updates ✅

**Potential Issues**:
- Shadow system state may not be saved before HDR
- Shadow plane may become invisible
- Lights may be affected by HDR environment

### Scenario 4: HDR → Standard
**Current Flow**:
1. HDR is disabled
2. Renderer shadow map is re-enabled ✅
3. Shadow plane state is ensured ✅
4. Lights are restored (if standard shadows) ✅
5. Light positions are fixed ✅
6. Shadow camera bounds are updated ✅
7. Shadow maps are regenerated ✅

**Potential Issues**:
- May not correctly detect which shadow system should be active
- CSM state may not be properly restored if it was active before HDR
- Timing issues with multiple `requestAnimationFrame` calls

### Scenario 5: Weather GL → HDR
**Current Flow**:
- Not explicitly handled
- May rely on HDR disable logic

**Issues**:
- CSM state may not be saved before HDR
- Shadow plane may not be protected correctly
- CSM may not be properly restored after HDR disable

### Scenario 6: HDR → Weather GL
**Current Flow**:
- Not explicitly handled
- May rely on weather GL initialization logic

**Issues**:
- HDR state may interfere with CSM initialization
- Shadow plane may not be set up correctly
- Material states may conflict

## Code Locations for Key Functions

### Shadow System Switching
- `ViewerCanvas.tsx:10238-10361` - Weather GL initialization
- `ViewerCanvas.tsx:10647-10668` - Weather GL destruction
- `ViewerCanvas.tsx:7848-7951` - HDR disable shadow restoration
- `ShadowSystemCoordinator.ts:54-92` - System switching with state preservation
- `shadowManager.ts:324-532` - Shadow system management

### State Preservation
- `ShadowMaterialStateManager.ts:256-323` - System state save/restore
- `ShadowSystemCoordinator.ts:54-92` - Coordinated state preservation
- `ViewerCanvas.tsx:10238-10259` - Original light position saving

### Shadow Plane Management
- `ShadowPlaneManager.ts:17-249` - Shadow plane state management
- `ShadowSystemCoordinator.ts:94-188` - Shadow property enforcement
- `ViewerCanvas.tsx:7871-7875` - Shadow plane state after HDR

### Material Setup
- `CSMShadowSystem.ts` - CSM material setup
- `ViewerCanvas.tsx:10313-10350` - Material setup for CSM
- `enhanceInternalShadows.ts` - Transparent material fixes

## Recommendations for Perplexity Analysis

1. **State Machine Approach**: Implement a proper state machine for shadow system transitions
2. **Unified State Management**: Create a single source of truth for shadow system state
3. **Atomic Transitions**: Ensure all state changes happen atomically
4. **Proper Cleanup**: Ensure all resources are cleaned up before switching systems
5. **State Validation**: Add validation to ensure state is consistent after transitions
6. **Timing Fixes**: Remove race conditions by using proper synchronization
7. **Light Position Restoration**: Implement proper light position restoration
8. **Shadow Map Regeneration**: Ensure shadow maps are regenerated at correct times

## Files to Review

1. `src/viewer/ViewerCanvas.tsx` - Main component with transition logic
2. `src/viewer/utils/shadowManager.ts` - Shadow system manager
3. `src/viewer/utils/ShadowSystemCoordinator.ts` - State coordination
4. `src/viewer/utils/ShadowMaterialStateManager.ts` - Material state management
5. `src/viewer/utils/ShadowPlaneManager.ts` - Shadow plane management
6. `src/viewer/effects/CSMShadowSystem.ts` - CSM implementation
7. `src/viewer/effects/HDRSystem.ts` - HDR system (for shadow interactions)

## Test Cases Needed

1. Standard → Weather GL → Standard (round trip)
2. Standard → HDR → Standard (round trip)
3. Weather GL → HDR → Weather GL (round trip)
4. Standard → Weather GL → HDR → Standard (complex)
5. Quick switching between all three modes
6. Shadow plane visibility across all transitions
7. Light position restoration accuracy
8. Material state consistency
























