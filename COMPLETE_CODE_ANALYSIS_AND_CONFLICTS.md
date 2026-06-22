# Complete Code Analysis: Weather, Standard, and HDR Modes

## Critical Conflict Found: `fixLightPositionsAndShadowCameras` Overrides Restored Positions

### The Problem

**Location**: `ViewerCanvas.tsx:7690-7771` and `ViewerCanvas.tsx:8006-8012`

**Conflict**: 
1. Light positions are restored atomically via `ShadowSystemCoordinator` (line 10821)
2. **BUT THEN** `fixLightPositionsAndShadowCameras()` is called after HDR disable (line 8010)
3. This function **MODIFIES** light positions (lines 7700, 7708) which **OVERRIDES** the restored positions!

**Code Flow:**
```typescript
// Step 1: Restore positions atomically (CORRECT)
shadowCoordinator.switchSystem('standard', undefined, {
  restoreLightPositions: true // ✅ Restores positions
})

// Step 2: fixLightPositionsAndShadowCameras() OVERRIDES restored positions (CONFLICT!)
fixLightPositionsAndShadowCameras() // ❌ Modifies light.position.y and target.position.y
```

**What `fixLightPositionsAndShadowCameras` does:**
```typescript
// Line 7698-7701: MODIFIES light position
if (obj.position.y < 0) {
  obj.position.y = Math.max(obj.position.y, 10) // ❌ OVERRIDES restored position!
}

// Line 7707-7709: MODIFIES light target position
if (obj.target.position.y > obj.position.y) {
  obj.target.position.y = obj.position.y - 10 // ❌ OVERRIDES restored target!
}
```

## Complete Code Flow Analysis

### Transition 1: Standard → Weather GL (CSM)

**Location**: `ViewerCanvas.tsx:10353-10793`

**Step-by-Step:**

1. **Save Light Positions** (lines 10360-10388)
   ```typescript
   light.userData._originalPosition = savedPosition.clone()
   light.userData._originalTargetPosition = savedTargetPosition.clone()
   light.userData._originalIntensity = savedIntensity
   light.userData._originalCastShadow = savedCastShadow
   light.userData._originalVisible = savedVisible
   light.userData._originalPositionSaved = true
   ```

2. **Switch to CSM** (lines 10438-10444)
   ```typescript
   shadowCoordinator.switchSystem('csm', csmConfig, {
     preserveMaterials: true,
     preserveShadowPlane: true,
     preserveLightStates: true
     // NOTE: restoreLightPositions NOT set here (correct - we're going TO CSM, not FROM)
   })
   ```

3. **CSM System Created** (lines 10456-10499)
   - CSM lights added to scene
   - Standard lights remain in scene (but castShadow may be disabled)
   - Materials set up for CSM

**Settings Changed:**
- Shadow system: `standard` → `csm`
- CSM lights: 3 lights added to scene
- Standard lights: `castShadow` may be disabled
- Shadow plane: Set up for CSM
- Materials: Patched for CSM shadows

### Transition 2: Weather GL → Standard

**Location**: `ViewerCanvas.tsx:10796-11226`

**Step-by-Step:**

1. **Destroy CSM System** (lines 10801-10812)
   ```typescript
   if (csmSystem.isEnabled()) {
     csmSystem.destroy() // Removes CSM lights from scene
   }
   ```

2. **Switch to Standard** (lines 10817-10823)
   ```typescript
   shadowCoordinator.switchSystem('standard', undefined, {
     preserveMaterials: true,
     preserveShadowPlane: true,
     preserveLightStates: true,
     restoreLightPositions: true // ✅ Restores positions atomically
   })
   ```

3. **Configure Lights** (lines 10828-11016)
   - Find lights from Map (prioritized)
   - Register with ShadowManager
   - Set shadow properties (castShadow, visible, etc.)
   - **NOTE: Positions already restored by coordinator**

4. **Update Shadow Camera Bounds** (lines 11038-11079)
   - Wait 50ms for CSM cleanup
   - Update bounds
   - Wait 100ms and update again

**Settings Changed:**
- Shadow system: `csm` → `standard`
- CSM lights: Removed from scene
- Standard lights: `castShadow = true`, `visible = true`
- Light positions: **RESTORED** from `userData._originalPosition`
- Shadow plane: Restored to standard state
- Materials: CSM patches removed

### Transition 3: Standard/HDR → HDR Enable

**Location**: `ViewerCanvas.tsx:7779-7883`

**Step-by-Step:**

1. **Save Shadow System State** (lines 7784-7803)
   ```typescript
   shadowMaterialStateManager.saveSystemState(currentShadowSystem, lights, shadowPlane)
   shadowMaterialStateManager.saveSceneState(scene, lights, shadowPlane)
   viewerRef.current.userData._shadowSystemBeforeHDR = currentShadowSystem
   ```

2. **Apply HDR** (line 7805)
   ```typescript
   await hdrSystem.applyHDR(hdrSource, hdrIntensity)
   ```

3. **Update Shadow Camera Bounds** (lines 7875-7881)
   ```typescript
   requestAnimationFrame(() => {
     viewerRef.current?.updateShadowCameraBounds()
   })
   ```

**Settings Changed:**
- HDR environment: Applied to scene
- Shadow system: **UNCHANGED** (HDR doesn't change shadow system)
- Light positions: **UNCHANGED** (HDR doesn't modify lights)
- Shadow camera bounds: Updated (after material changes)

### Transition 4: HDR → HDR Disable

**Location**: `ViewerCanvas.tsx:7884-8040`

**Step-by-Step:**

1. **Disable HDR** (line 7886)
   ```typescript
   hdrSystem.disableHDR()
   ```

2. **Re-enable Shadow System** (lines 7898-7904)
   ```typescript
   renderer.shadowMap.enabled = true
   renderer.shadowMap.type = THREE.PCFSoftShadowMap
   ```

3. **Restore Shadow System** (lines 7916-8004)
   ```typescript
   const savedShadowSystem = viewerRef.current.userData._shadowSystemBeforeHDR
   if (shadowCoordinator2 && targetShadowSystem) {
     shadowCoordinator2.switchSystem(targetShadowSystem, undefined, {
       preserveMaterials: true,
       preserveShadowPlane: true,
       preserveLightStates: true
       // NOTE: restoreLightPositions NOT set here (HDR doesn't change light positions)
     })
   }
   ```

4. **⚠️ CONFLICT: fixLightPositionsAndShadowCameras** (lines 8006-8012)
   ```typescript
   fixLightPositionsAndShadowCameras() // ❌ MODIFIES light positions!
   ```

5. **Update Shadow Camera Bounds** (lines 8016-8037)
   ```typescript
   requestAnimationFrame(() => {
     viewerRef.current?.updateShadowCameraBounds()
     // Force shadow map regeneration
   })
   ```

**Settings Changed:**
- HDR environment: Removed
- Shadow system: Restored from saved state
- Light positions: **⚠️ MODIFIED by fixLightPositionsAndShadowCameras** (CONFLICT!)
- Shadow camera: Bounds updated, orientation fixed

## Critical Conflicts Identified

### Conflict 1: `fixLightPositionsAndShadowCameras` Overrides Restored Positions

**Problem:**
- After Weather GL → Standard: Positions restored atomically ✅
- After HDR disable: `fixLightPositionsAndShadowCameras()` is called ❌
- This function modifies `light.position.y` and `light.target.position.y`
- **This OVERRIDES the restored positions!**

**When Called:**
1. After HDR disable (line 8010)
2. After ground projection disable (line 8166)

**What It Does:**
- Forces `light.position.y >= 10` (if below 0)
- Forces `target.position.y < light.position.y` (if above)
- Recalculates shadow camera position/orientation

**Conflict:**
- If light was restored to `y = 5`, this function will change it to `y = 10`
- If light target was restored correctly, this function may modify it

### Conflict 2: Multiple Shadow Camera Bounds Updates

**Locations:**
1. After Weather GL exit: `updateShadowCameraBounds()` called twice (lines 11043, 11075)
2. After HDR disable: `updateShadowCameraBounds()` called (line 8018)
3. `fixLightPositionsAndShadowCameras` also calls it (line 7768)

**Potential Issue:**
- Multiple updates may cause race conditions
- Bounds calculated before/after different operations

### Conflict 3: Duplicate Light Finding Logic

**Locations:**
1. After Weather GL exit (lines 10832-10877) - Main restoration
2. After Weather GL exit (lines 11165-11223) - Cleanup effect
3. After HDR disable (lines 7972-7985) - Fallback

**Issue:**
- Same logic repeated in multiple places
- Cleanup effect runs after main restoration (may be redundant)

## All Settings That Change During Transitions

### Standard → Weather GL

**Light Settings:**
- Position: **SAVED** to `userData._originalPosition`
- Target: **SAVED** to `userData._originalTargetPosition`
- Intensity: **SAVED** to `userData._originalIntensity`
- castShadow: **SAVED** to `userData._originalCastShadow`
- visible: **SAVED** to `userData._originalVisible`
- **Current values: UNCHANGED** (lights remain in scene)

**Shadow System:**
- Active system: `standard` → `csm`
- CSM lights: 3 lights added
- Standard lights: May have `castShadow = false` (via ShadowManager)

**Shadow Plane:**
- Visibility: Preserved
- Material: Set up for CSM
- receiveShadow: `true`
- castShadow: `false`

**Materials:**
- CSM shader patches applied
- depthWrite: May be modified for CSM

**Renderer:**
- shadowMap.enabled: `true`
- shadowMap.type: `PCFSoftShadowMap`

### Weather GL → Standard

**Light Settings:**
- Position: **RESTORED** from `userData._originalPosition` (atomic)
- Target: **RESTORED** from `userData._originalTargetPosition` (atomic)
- Intensity: **RESTORED** from `userData._originalIntensity` (atomic)
- castShadow: **RESTORED** from `userData._originalCastShadow` (atomic)
- visible: **RESTORED** from `userData._originalVisible` (atomic)
- shadow.enabled: `true`
- shadow.needsUpdate: `true`
- shadow.map: Disposed and regenerated

**Shadow System:**
- Active system: `csm` → `standard`
- CSM lights: Removed from scene
- Standard lights: Re-enabled

**Shadow Plane:**
- Visibility: Restored from store
- Position: `y = -0.001` (enforced)
- receiveShadow: `true`
- castShadow: `false`

**Materials:**
- CSM shader patches removed
- depthWrite: Restored

**Shadow Camera:**
- Bounds: Updated (after 50ms delay)
- Position: Recalculated
- Bounds updated again (after 100ms delay)

**Renderer:**
- shadowMap.enabled: `true`
- shadowMap.type: `PCFSoftShadowMap`
- shadowMap.needsUpdate: `true`

### Standard → HDR Enable

**Light Settings:**
- Position: **UNCHANGED**
- Target: **UNCHANGED**
- Intensity: **UNCHANGED**
- castShadow: **UNCHANGED**
- visible: **UNCHANGED**

**Shadow System:**
- Active system: **UNCHANGED** (HDR doesn't change shadow system)
- State: **SAVED** to `userData._shadowSystemBeforeHDR`

**Shadow Plane:**
- Visibility: **UNCHANGED**
- Material: Protected from HDR updates

**Materials:**
- Environment map: Applied
- HDR intensity: Applied

**Shadow Camera:**
- Bounds: Updated (after material changes)

### HDR → HDR Disable

**Light Settings:**
- Position: **⚠️ MODIFIED by fixLightPositionsAndShadowCameras** (CONFLICT!)
  - If `position.y < 0`: Changed to `y = 10`
  - If `target.position.y > position.y`: Changed to `position.y - 10`
- Target: **⚠️ MODIFIED by fixLightPositionsAndShadowCameras** (CONFLICT!)
- Shadow camera: Recalculated by `fixLightPositionsAndShadowCameras`

**Shadow System:**
- Active system: **RESTORED** from `userData._shadowSystemBeforeHDR`
- State: Restored via ShadowSystemCoordinator

**Shadow Plane:**
- Visibility: Ensured via coordinator
- Material: Restored

**Materials:**
- Environment map: Removed
- HDR intensity: Removed

**Shadow Camera:**
- Bounds: Updated
- Position/Orientation: **MODIFIED by fixLightPositionsAndShadowCameras**

## Recommendations

### Fix Conflict 1: `fixLightPositionsAndShadowCameras`

**Option A: Don't call after position restoration**
```typescript
// Only call if positions weren't just restored
if (!justRestoredPositions) {
  fixLightPositionsAndShadowCameras()
}
```

**Option B: Make it respect restored positions**
```typescript
// Check if position was recently restored
if (light.userData._originalPositionSaved && 
    light.position.distanceTo(light.userData._originalPosition) < 0.001) {
  // Position was restored - don't modify it
  return
}
```

**Option C: Only fix if position is clearly wrong**
```typescript
// Only fix if position is way off (not just slightly)
if (obj.position.y < -100) { // Only fix extreme cases
  obj.position.y = 10
}
```

### Fix Conflict 2: Multiple Bounds Updates

**Consolidate updates:**
- Remove duplicate `updateShadowCameraBounds()` calls
- Use a single update after all operations complete

### Fix Conflict 3: Duplicate Light Finding

**Extract to shared function:**
- Create `findDirectionalLights()` helper
- Use in all places that need to find lights

## Complete Settings Matrix

| Setting | Standard → Weather GL | Weather GL → Standard | Standard → HDR | HDR → Standard |
|---------|---------------------|----------------------|----------------|----------------|
| Light Position | SAVED | RESTORED | UNCHANGED | ⚠️ MODIFIED |
| Light Target | SAVED | RESTORED | UNCHANGED | ⚠️ MODIFIED |
| Light Intensity | SAVED | RESTORED | UNCHANGED | UNCHANGED |
| Light castShadow | SAVED | RESTORED | UNCHANGED | UNCHANGED |
| Light visible | SAVED | RESTORED | UNCHANGED | UNCHANGED |
| Shadow System | standard → csm | csm → standard | UNCHANGED | RESTORED |
| CSM Lights | Added (3) | Removed | UNCHANGED | UNCHANGED |
| Shadow Plane | Set up for CSM | Restored | Protected | Restored |
| Materials | CSM patches | Patches removed | HDR applied | HDR removed |
| Shadow Camera | UNCHANGED | Updated (2x) | Updated | Updated + Fixed |
| Renderer Shadows | Enabled | Enabled | Enabled | Enabled |

---

**Next Steps:**
1. Fix `fixLightPositionsAndShadowCameras` conflict
2. Consolidate duplicate code
3. Document all settings for Perplexity





















