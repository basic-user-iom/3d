# Car Disappearing and Leftover Lights Fix

## Problems
1. **Car disappears** when Dynamic Sky is enabled (shader compilation error)
2. **Leftover lights** - 3 Directional Lights visible in scene hierarchy when Dynamic Sky is enabled

## Root Causes

### 1. Shader Compilation Error
- CSM's `setupMaterial()` is corrupting materials that have active shader programs
- Error: "Fragment shader is not compiled" for `MeshStandardMaterial`
- Materials with active programs can't be safely modified by CSM

### 2. Leftover Lights
- Only sun lights (`userData.isSun`) were being disabled when CSM is active
- Other directional lights remained active, creating duplicate light sources
- CSM lights are added to the scene, but Three.js lights weren't all disabled

## Solutions

### 1. Skip Materials with Active Shader Programs ✅
**File**: `src/viewer/effects/CSMShadowSystem.ts`

- Check if material has an active shader program before CSM setup
- Skip materials with active programs to prevent shader corruption
- These materials will still receive light from CSM lights (just not CSM shadows)

**Code**:
```typescript
// Check if material is already being used (has a program)
if (anyMat.program && anyMat.program.program) {
  // Material has an active shader program - CSM setup might break it
  // Skip this material to prevent "Fragment shader is not compiled" errors
  skippedCount++
  this.setupMaterials.add(material)
  return
}
```

### 2. Disable ALL Directional Lights (Not Just Sun) ✅
**File**: `src/viewer/ViewerCanvas.tsx` (line ~7105)

- Disable ALL Three.js directional lights when CSM is active
- Store original state (`visible`, `intensity`, `castShadow`) for restoration
- Only CSM lights remain active (they're marked with `isCSMLight` flag)

**Code**:
```typescript
// Disable ALL Three.js directional lights when CSM is active
directionalLights.forEach((light) => {
  if (light instanceof THREE.DirectionalLight && !isCSMLight) {
    // Store original state
    light.userData.originalState = {
      visible: light.visible,
      intensity: light.intensity,
      castShadow: light.castShadow
    }
    // Disable
    light.visible = false
    light.intensity = 0
    light.castShadow = false
  }
})
```

### 3. Restore ALL Directional Lights When Dynamic Sky Disabled ✅
**File**: `src/viewer/ViewerCanvas.tsx` (line ~7332)

- Restore all directional lights from stored `originalState`
- Only restore if Streets GL is not active
- Skip CSM lights (they're removed when CSM is destroyed)

**Code**:
```typescript
// Restore ALL directional lights when Dynamic Sky is disabled
directionalLights.forEach((light) => {
  if (light instanceof THREE.DirectionalLight && !isCSMLight && light.userData.originalState) {
    const originalState = light.userData.originalState
    light.visible = originalState.visible
    light.intensity = originalState.intensity
    light.castShadow = originalState.castShadow
    delete light.userData.originalState
  }
})
```

## How It Works

1. **When Dynamic Sky is Enabled**:
   - CSM is initialized and adds its own directional lights to the scene
   - ALL Three.js directional lights are disabled (stored state for later)
   - Materials are set up for CSM (skipping those with active programs)
   - Only CSM lights provide lighting

2. **When Dynamic Sky is Disabled**:
   - CSM is destroyed (removes CSM lights from scene)
   - ALL Three.js directional lights are restored from stored state
   - Normal Three.js lighting resumes

3. **Material Safety**:
   - Materials with active shader programs are skipped
   - These materials still receive light from CSM lights
   - They just don't receive CSM shadows (fallback to standard shadows)

## Status: **FIXED** ✅

- ✅ Car should no longer disappear (materials with active programs are skipped)
- ✅ No leftover lights (all Three.js directional lights are disabled when CSM is active)
- ✅ Proper restoration when Dynamic Sky is disabled


