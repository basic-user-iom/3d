# Perplexity Query: Three.js Shadow System State Management Best Practices

## Problem Statement

We're building a Three.js application (v0.162) with multiple shadow systems that can be dynamically switched:
- **Standard Shadows**: Traditional Three.js directional light shadows
- **CSM (Cascaded Shadow Maps)**: Custom CSM implementation for Weather GL
- **HDR System**: Can be combined with either shadow system

**Core Challenge**: Ensuring light positions and shadow state are correctly preserved and restored when switching between systems.

## Current Implementation

### Architecture

We have a multi-layer architecture:
1. **ShadowManager**: Manages active shadow system (standard/csm)
2. **ShadowSystemCoordinator**: Coordinates state preservation during switches
3. **ShadowMaterialStateManager**: Preserves material shadow properties
4. **ShadowPlaneManager**: Manages shadow plane visibility/state

### Light Position Persistence

**Current Approach - Using userData:**
```typescript
// Before enabling Weather GL (CSM)
light.userData._originalPosition = light.position.clone()
light.userData._originalTargetPosition = light.target.position.clone()
light.userData._originalIntensity = light.intensity
light.userData._originalCastShadow = light.castShadow
light.userData._originalVisible = light.visible
light.userData._originalPositionSaved = true

// After exiting Weather GL - restore via coordinator
shadowCoordinator.switchSystem('standard', undefined, {
  restoreLightPositions: true // Atomic restoration
})
```

**Current Status:**
- ✅ Light positions are being saved correctly
- ✅ Light positions are being restored atomically
- ✅ Using same light instance from Map
- ✅ userData persists correctly (verified in logs)

### System Switch Flow

```typescript
// 1. Destroy CSM system FIRST (before switch)
if (csmSystem.isEnabled()) {
  csmSystem.destroy() // Removes CSM lights from scene
}

// 2. Switch system via coordinator
shadowCoordinator.switchSystem('standard', undefined, {
  preserveMaterials: true,
  preserveShadowPlane: true,
  preserveLightStates: true,
  restoreLightPositions: true
})

// 3. Wait for async operations
setTimeout(() => {
  // 4. Update shadow camera bounds (after CSM cleanup)
  updateShadowCameraBounds()
}, 50)
```

## Questions for Perplexity

### 1. State Persistence Pattern

**Question:** What's the recommended pattern in Three.js for persisting object state (like light positions) across scene operations and system switches?

**Current approach:** Using `light.userData._originalPosition` to store saved state.

**Alternatives we're considering:**
- **Option A**: Continue using `userData` (current)
- **Option B**: Separate `Map<DirectionalLight, SavedState>` registry
- **Option C**: WeakMap for automatic cleanup
- **Option D**: External state manager class

**What are the pros/cons? Are there Three.js-specific gotchas with userData?**

### 2. Shadow System Architecture

**Question:** Is our multi-layer architecture (ShadowManager, ShadowSystemCoordinator, ShadowMaterialStateManager, ShadowPlaneManager) appropriate, or is it over-engineered?

**Current structure:**
- ShadowManager: Active system management
- ShadowSystemCoordinator: State preservation coordination
- ShadowMaterialStateManager: Material state preservation
- ShadowPlaneManager: Shadow plane management

**Should we:**
- Simplify to fewer classes?
- Use a state machine pattern?
- Use a different architectural pattern?

### 3. Async Operation Coordination

**Question:** How to properly coordinate async operations (CSM destruction, shadow map regeneration, shadow camera bounds updates) during system switches?

**Current approach:**
- `setTimeout` delays (50ms, 100ms)
- Double `requestAnimationFrame` for sequencing
- Wait for CSM destruction before calculating bounds

**Is there a better pattern?**
- Should we use Promises/async-await?
- Event emitters?
- Three.js-specific patterns?

### 4. Light Instance Guarantees

**Question:** In Three.js, can a light object instance change even if stored in a Map? How to guarantee we're always working with the same instance?

**Current approach:**
- Store lights in `Map<string, DirectionalLight>`
- Prioritize Map lights when finding lights after switch
- Use object identity checks (`===`)

**Should we:**
- Track by UUID instead?
- Use WeakMap?
- Add more rigorous identity checks?

### 5. CSM Integration Best Practices

**Question:** Are there CSM-specific considerations for light state management and shadow system switching?

**Current implementation:**
- CSM lights marked with `userData.isCSMLight`
- CSM lights excluded from shadow camera bounds calculation
- CSM destroyed before standard shadow switch

**Is this correct? Are there CSM-specific cleanup requirements?**

## Technical Details

### Three.js Version
- Three.js 0.162
- React 18
- TypeScript
- Custom CSM implementation (StreetsGLCSM)

### Current Issues Fixed
1. ✅ Light positions not restored after Weather GL exit
2. ✅ Shadow camera bounds calculated before CSM cleanup
3. ✅ Double light position restoration
4. ✅ CSM not restored after HDR disable
5. ✅ Double CSM destruction
6. ✅ Lights not found after Weather GL exit

### Test Framework
We have a comprehensive test framework that captures:
- Complete state before/after each transition
- Light position restoration verification
- Shadow camera state
- System consistency checks

## Request for Guidance

Please provide:

1. **Best Practices**: Recommended patterns for state persistence in Three.js
2. **Architecture Review**: Is our current architecture appropriate?
3. **Async Coordination**: Best patterns for coordinating async Three.js operations
4. **Instance Management**: How to guarantee same object instances
5. **CSM Considerations**: Any CSM-specific best practices
6. **Potential Issues**: What edge cases should we watch for?
7. **Performance**: Any performance considerations?

## Code Context

**Light Position Saving:**
```typescript
// Before Weather GL
if (!light.userData._originalPositionSaved) {
  light.userData._originalPosition = light.position.clone()
  light.userData._originalTargetPosition = light.target.position.clone()
  light.userData._originalIntensity = light.intensity
  light.userData._originalCastShadow = light.castShadow
  light.userData._originalVisible = light.visible
  light.userData._originalPositionSaved = true
}
```

**Light Position Restoration:**
```typescript
// ShadowSystemCoordinator
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

**Light Finding (After Weather GL Exit):**
```typescript
// Prioritize Map lights (have saved data)
let lights: THREE.DirectionalLight[] = []
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
// Fallback to scene traversal if Map is empty
```

---

**Thank you for your guidance on Three.js shadow system state management best practices!**





















