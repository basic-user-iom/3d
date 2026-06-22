# Perplexity Query: Comprehensive Shadow System Guidance

## Context

We're building a Three.js application with multiple shadow systems that can be switched dynamically:
- **Standard Shadows**: Traditional Three.js directional light shadows
- **Weather GL (CSM)**: Cascaded Shadow Maps using custom CSM implementation
- **HDR System**: High Dynamic Range environment (can be combined with either shadow system)

## Problem Summary

We've been fixing inconsistencies when switching between shadow systems, specifically:

1. ✅ **FIXED**: Light positions not being restored after exiting Weather GL
2. ✅ **FIXED**: Shadow camera bounds calculated before CSM lights removed
3. ✅ **FIXED**: Double light position restoration causing conflicts
4. ✅ **FIXED**: CSM not being restored after HDR disable
5. ✅ **FIXED**: Double CSM destruction errors
6. ✅ **FIXED**: Lights not found after Weather GL exit (improved light finding)

## Current Implementation

### Light Position Saving/Restoration

**Before enabling Weather GL:**
```typescript
// Save original light positions
light.userData._originalPosition = light.position.clone()
light.userData._originalTargetPosition = light.target.position.clone()
light.userData._originalIntensity = light.intensity
light.userData._originalCastShadow = light.castShadow
light.userData._originalVisible = light.visible
light.userData._originalPositionSaved = true
```

**After exiting Weather GL:**
```typescript
// Restore via ShadowSystemCoordinator
shadowCoordinator.switchSystem('standard', undefined, {
  preserveMaterials: true,
  preserveShadowPlane: true,
  preserveLightStates: true,
  restoreLightPositions: true // Atomic restoration
})
```

### Current Status

**✅ Working:**
- Light positions are now being saved correctly
- Light positions are being restored via ShadowSystemCoordinator
- Logs show: `[ShadowSystemCoordinator] ✅ Restored 1 light position(s) atomically with system switch`
- Light is found from Map (same instance)
- userData has 8 keys including saved position data

**❓ Remaining Questions:**
1. Are there any edge cases we're missing?
2. Is the current approach (userData + ShadowSystemCoordinator) the best pattern?
3. Should we use a separate registry instead of userData?

## Architecture Questions

### 1. State Persistence Pattern

**Current Approach:**
- Save state in `light.userData._originalPosition`
- Use `ShadowSystemCoordinator` to restore atomically
- Prioritize lights from `directionalLights` Map (ensures same instance)

**Questions:**
- Is `userData` the right place for this? Could it be cleared by Three.js operations?
- Should we maintain a separate `Map<Light, SavedState>` registry?
- Is there a Three.js best practice for persisting object state across scene operations?

### 2. Shadow System Switching

**Current Flow:**
1. Save light positions before switch
2. Destroy CSM system (if switching from CSM)
3. Switch system via ShadowSystemCoordinator
4. Restore light positions atomically
5. Update shadow camera bounds (with delay for CSM cleanup)
6. Verify and configure shadow properties

**Questions:**
- Is this the correct order of operations?
- Should we use promises/async-await instead of setTimeout?
- Is there a better pattern for coordinating multiple async operations?

### 3. Light Instance Management

**Current Approach:**
- Store lights in `Map<string, DirectionalLight>` (directionalLights)
- Prioritize Map lights when finding lights after system switch
- Fallback to scene traversal if Map is empty

**Questions:**
- Can light instances change even if they're in the same Map?
- Should we use WeakMap for light tracking?
- How to ensure we always get the same light instance?

### 4. CSM Integration

**Current Implementation:**
- Custom CSM system (StreetsGLCSM)
- CSM lights marked with `userData.isCSMLight`
- CSM lights excluded from shadow camera bounds calculation
- CSM destroyed before switching to standard shadows

**Questions:**
- Are there any CSM-specific considerations for light state management?
- Should CSM lights be tracked differently?
- Is the destruction order correct (CSM first, then switch)?

## Test Framework

We've created a comprehensive test runner that captures:

### Test Scenarios
1. Standard → Weather GL (CSM)
2. Weather GL → Standard
3. Standard → Weather GL (Round Trip)
4. Weather GL → Standard (Round Trip)

### Data Captured
- Light states (before/after): position, target, intensity, shadow properties, userData
- Shadow camera states: bounds, position, settings
- Shadow plane state: visibility, position, material
- System state: active system, light counts, renderer settings
- Restoration verification: position matching, state consistency

### Test Results Structure
```typescript
{
  timestamp: string
  totalTests: number
  passedTests: number
  failedTests: number
  results: TestResult[]
  summary: {
    lightPositionRestoration: { success: number; failed: number }
    shadowCameraRestoration: { success: number; failed: number }
    shadowPlaneRestoration: { success: number; failed: number }
    materialStatePreservation: { success: number; failed: number }
    systemStateConsistency: { success: number; failed: number }
  }
}
```

## Specific Questions for Perplexity

### 1. State Persistence Best Practices

**Question:** What's the recommended pattern in Three.js for persisting object state (like light positions) across scene operations, system switches, and potential object recreation?

**Options we're considering:**
- A) Continue using `userData` (current approach)
- B) Separate `Map<Object3D, SavedState>` registry
- C) WeakMap for automatic cleanup
- D) External state manager class

**What are the pros/cons of each? Are there Three.js-specific gotchas?**

### 2. Shadow System Architecture

**Question:** What's the best architectural pattern for managing multiple shadow systems (Standard, CSM) that can be switched dynamically?

**Current approach:**
- ShadowManager (manages active system)
- ShadowSystemCoordinator (coordinates state preservation)
- ShadowMaterialStateManager (preserves material state)
- ShadowPlaneManager (manages shadow plane)

**Questions:**
- Is this over-engineered or appropriate?
- Should we use a state machine pattern?
- Is there a simpler pattern that would work better?

### 3. Async Operation Coordination

**Question:** How to properly coordinate async operations (CSM destruction, shadow map regeneration, shadow camera bounds updates) during system switches?

**Current approach:**
- Use `setTimeout` delays
- Use double `requestAnimationFrame` for sequencing
- Wait for CSM destruction before calculating bounds

**Questions:**
- Should we use Promises/async-await?
- Is there a better pattern for sequencing async Three.js operations?
- How to prevent race conditions during rapid switching?

### 4. Light Instance Guarantees

**Question:** In Three.js, can a light object instance change even if it's stored in a Map? How to guarantee we're always working with the same instance?

**Current observations:**
- Lights in Map seem to maintain same instance
- But userData might be cleared in some scenarios
- Need to verify instance identity

**Questions:**
- Should we track by UUID instead of instance?
- Is there a way to ensure userData persists?
- Should we use object identity checks (===) more rigorously?

### 5. CSM Integration Best Practices

**Question:** Are there CSM-specific considerations for light state management and shadow system switching?

**Current implementation:**
- CSM lights marked with `userData.isCSMLight`
- CSM lights excluded from bounds calculation
- CSM destroyed before standard shadow switch

**Questions:**
- Is this the correct approach?
- Should CSM lights be handled differently?
- Are there CSM-specific cleanup requirements?

## Code Examples

### Current Light Position Restoration

```typescript
// ShadowSystemCoordinator.switchSystem()
if (restoreLightPositions) {
  lights.forEach(light => {
    if (light.userData._originalPositionSaved && light.userData._originalPosition) {
      lightPositions.set(light, {
        position: light.userData._originalPosition.clone(),
        targetPosition: light.userData._originalTargetPosition?.clone(),
        intensity: light.userData._originalIntensity ?? light.intensity,
        castShadow: light.userData._originalCastShadow ?? light.castShadow,
        visible: light.userData._originalVisible ?? light.visible
      })
    }
  })
}

// After system switch
if (restoreLightPositions && lightPositions.size > 0) {
  lightPositions.forEach((savedState, light) => {
    light.position.copy(savedState.position)
    light.target.position.copy(savedState.targetPosition)
    light.target.updateMatrixWorld()
    light.intensity = savedState.intensity
    light.castShadow = savedState.castShadow
    light.visible = savedState.visible
  })
}
```

### Current Light Finding Logic

```typescript
// Prioritize Map lights (have saved data)
let lights: THREE.DirectionalLight[] = []

// Source 1: directionalLights Map (PRIORITY)
if (viewerRef.current.directionalLights && viewerRef.current.directionalLights.size > 0) {
  const mapLights = Array.from(viewerRef.current.directionalLights.values())
  mapLights.forEach(light => {
    if (light instanceof THREE.DirectionalLight && 
        !light.userData.isCSMLight && 
        !light.userData.isStandaloneWeatherLight) {
      lights.push(light)
    }
  })
}

// Source 2: Scene traversal (fallback)
// Source 3: ShadowManager registry (fallback)
```

## Request for Guidance

Please provide:

1. **Best Practices**: Recommended patterns for state persistence in Three.js
2. **Architecture Review**: Is our current architecture appropriate or over-engineered?
3. **Async Coordination**: Best patterns for coordinating async Three.js operations
4. **Instance Management**: How to guarantee same object instances
5. **CSM Considerations**: Any CSM-specific best practices
6. **Potential Issues**: What edge cases should we watch for?
7. **Performance**: Any performance considerations for our approach?

## Technical Stack

- **Three.js**: 0.162
- **React**: 18
- **Vite**: 5
- **TypeScript**: Latest
- **Custom CSM**: StreetsGLCSM implementation

## Test Results Available

We have a comprehensive test framework that can capture:
- Complete state before/after each transition
- Light position restoration verification
- Shadow camera state
- System consistency checks

Test results will be available once tests are run in the browser.

---

**Thank you for your guidance!**





















