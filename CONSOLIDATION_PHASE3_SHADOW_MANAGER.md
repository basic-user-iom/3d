# Consolidation Phase 3 - Shadow Manager (Foundation)

**Date:** 2025-01-27  
**Status:** ✅ **FOUNDATION CREATED** (Integration pending)

---

## Summary

Created a unified `ShadowManager` class to consolidate shadow system management. This provides a foundation for ensuring only ONE shadow system is active at a time, preventing conflicts between Standard Three.js shadows, CSM shadows, and Streets GL shadows.

---

## What Was Created

### 1. ShadowManager Class
- **File:** `src/viewer/utils/ShadowManager.ts`
- **Purpose:** Unified interface for managing shadow systems
- **Features:**
  - Ensures only one shadow system active at a time
  - Handles transitions between systems cleanly
  - Provides consistent API regardless of active system
  - Tracks standard lights and CSM system
  - Callback system for external integrations

### 2. Key Methods

```typescript
// Set active shadow system (automatically disables previous)
setShadowSystem(type: 'standard' | 'csm' | 'streetsgl', csmConfig?: CSMConfig)

// Get current system
getCurrentSystem(): ShadowSystemType

// Update shadow system (light direction, intensity, etc.)
update(lightDirection?, lightIntensity?, lightColor?)

// Register standard lights for management
registerStandardLight(light: THREE.DirectionalLight)
```

---

## Current Shadow System Architecture

### Three Shadow Systems

1. **Standard Three.js Shadows** (default)
   - Used when no weather system is active
   - Managed via `directionalLights` in ViewerCanvas
   - Location: `src/viewer/ViewerCanvas.tsx`

2. **CSM Shadows** (when Dynamic Sky enabled)
   - High-quality cascaded shadow maps
   - Managed via `CSMShadowSystem` class
   - Location: `src/viewer/effects/CSMShadowSystem.ts`
   - Initialized in ViewerCanvas when `enableStandaloneWeather` is true

3. **Streets GL Shadows** (when Streets GL overlay active)
   - Managed externally by Streets GL iframe
   - No direct Three.js integration needed

### Current Issues (From Analysis)

1. **Dual Shadow System Conflict** ⚠️
   - Both CSM and standard shadows can be active simultaneously
   - Standard sun light still provides illumination when CSM is active
   - Causes double illumination (150% total lighting)

2. **Shadow Plane Material Conflicts** ⚠️
   - Material properties changed by multiple systems
   - CSM forces `opacity: 1.0`, standard uses `opacity: 0.8`

---

## Integration Plan

### Option A: Full Integration (Recommended for Long-term)

Replace direct CSMShadowSystem management in ViewerCanvas with ShadowManager:

```typescript
// In ViewerCanvas.tsx
const shadowManagerRef = useRef<ShadowManager | null>(null)

// Initialize
shadowManagerRef.current = new ShadowManager({
  scene,
  camera,
  renderer,
  parent: scene
})

// When enabling standalone weather
shadowManagerRef.current.setShadowSystem('csm', {
  camera,
  parent: scene,
  // ... CSM config
})

// When disabling standalone weather
shadowManagerRef.current.setShadowSystem('standard')

// Register standard lights
shadowManagerRef.current.registerStandardLight(directionalLight)
```

**Benefits:**
- ✅ No conflicts between systems
- ✅ Clear ownership of shadow resources
- ✅ Easier to debug and maintain
- ✅ Better performance (only one system active)

**Effort:** Medium (requires updating ViewerCanvas shadow management code)

### Option B: Incremental Integration (Lower Risk)

Keep current architecture but use ShadowManager for transitions:

```typescript
// Only use ShadowManager to ensure proper disabling
if (enableStandaloneWeather) {
  shadowManager.setShadowSystem('csm', csmConfig)
  // ShadowManager automatically disables standard shadows
} else {
  shadowManager.setShadowSystem('standard')
  // ShadowManager automatically disables CSM
}
```

**Benefits:**
- ✅ Fixes conflicts without major refactoring
- ✅ Can be done incrementally
- ✅ Lower risk

**Effort:** Low (minimal changes to existing code)

---

## Next Steps

1. **Choose Integration Approach:**
   - Option A: Full integration (cleaner, more work)
   - Option B: Incremental (faster, less disruptive)

2. **Test Shadow Systems:**
   - Standard shadows work (no weather system)
   - CSM shadows work (standalone weather enabled)
   - No conflicts when switching between modes
   - Shadow plane receives shadows correctly

3. **Update ViewerCanvas:**
   - Integrate ShadowManager
   - Remove direct CSMShadowSystem management
   - Register standard lights with ShadowManager

---

## Files Created

- ✅ `src/viewer/utils/ShadowManager.ts` - Unified shadow management class

## Files to Update (When Integrating)

- `src/viewer/ViewerCanvas.tsx` - Replace direct shadow system management with ShadowManager

---

## Benefits of ShadowManager

1. **No Conflicts:** Ensures only one shadow system active at a time
2. **Clean Transitions:** Properly disables previous system before enabling new one
3. **Consistent API:** Same interface regardless of which system is active
4. **Better Debugging:** Clear ownership of shadow resources
5. **Future-Proof:** Easy to add new shadow systems or features

---

**Phase 3 foundation completed!** 🎉

**Note:** Full integration into ViewerCanvas is pending. The ShadowManager is ready to use and can be integrated incrementally to fix shadow conflicts.
















































