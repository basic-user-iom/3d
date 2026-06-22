# Shadow System Comprehensive Review & Fix Plan

## Executive Summary

The shadow system has **multiple conflicts** between three different shadow implementations:
1. **Standard Three.js Shadows** (default)
2. **CSM (Cascaded Shadow Maps)** (when Dynamic Sky enabled)
3. **Streets GL Shadows** (when Streets GL overlay enabled)

## Identified Conflicts

### 1. **Dual Shadow System Conflict** ⚠️ CRITICAL
**Problem**: Both CSM shadows AND standard Three.js shadows can be active simultaneously.

**Evidence**:
- Standard Three.js sun light has `castShadow = false` but is still visible and providing light (line 9129-9133)
- CSM creates its own directional lights (3 cascades = 3 lights)
- Both systems try to provide lighting, causing double illumination
- Console shows: `[ViewerCanvas] Created default directional light with shadows enabled`

**Location**: `src/viewer/ViewerCanvas.tsx:9123-9136`

**Current Code**:
```typescript
// Disable shadow casting (CSM handles shadows)
light.castShadow = false
// Keep light visible for scene illumination (CSM lights also provide illumination)
// But we can reduce intensity slightly to avoid double lighting
light.visible = true
light.intensity = 0.5 // Reduce intensity since CSM lights also provide illumination
```

**Issue**: The standard sun light is still visible and providing 50% intensity, while CSM lights also provide 100% intensity = **150% total lighting**.

### 2. **Shadow Plane Material Conflicts** ⚠️ CRITICAL
**Problem**: Shadow plane material is modified by multiple systems, causing conflicts.

**Evidence**:
- Initial creation: `DoubleSide`, `transparent: true`, `opacity: 0.8` (line 2318-2323)
- CSM setup: Forces `opacity: 1.0`, `transparent: false` (line 8962-9006)
- Shadow intensity effect: Can recreate material with `DoubleSide` (line 5628-5704)
- Material properties constantly changing between systems

**Location**: Multiple locations:
- `src/viewer/ViewerCanvas.tsx:2316-2333` (initial creation)
- `src/viewer/ViewerCanvas.tsx:5616-5709` (shadow intensity effect)
- `src/viewer/ViewerCanvas.tsx:8962-9006` (CSM setup)

**Issue**: Material is recreated/modified by different systems, causing:
- Shader recompilation overhead
- Visual glitches (material flickering)
- CSM setup may fail if material is in use

### 3. **Light Management Issues** ⚠️ HIGH
**Problem**: Standard Three.js lights aren't properly disabled when CSM is active.

**Evidence**:
- Only sun lights (`userData.isSun`) are partially disabled (line 9126-9135)
- Other directional lights remain active
- CSM lights are added to scene, but Three.js lights aren't fully disabled
- Multiple light sources active simultaneously

**Location**: `src/viewer/ViewerCanvas.tsx:9123-9136`

**Issue**: 
- Multiple directional lights active = performance impact
- Confusion about which lights are providing shadows
- Double lighting in some cases

### 4. **Shadow Map Uniform Updates** ⚠️ MEDIUM
**Problem**: Shadow maps are created lazily by Three.js, but CSM uniforms may not be updated when maps become available.

**Evidence**:
- Console shows: `map=will be created` for all CSM lights
- `updateShadowMapUniforms` is called (line 598), but may not catch all cases
- Shadow maps might be created but uniforms not updated in time
- Dummy textures may persist

**Location**: 
- `src/viewer/effects/StreetsGLCSM.ts:788-878` (updateShadowMapUniforms)
- `src/viewer/effects/CSMShadowSystem.ts:595-599` (update call)

**Issue**: 
- Shadows may not appear initially
- Dummy textures may be used instead of real shadow maps
- Uniform updates may be missed if called too early

### 5. **Shadow Camera Coverage Warnings** ⚠️ MEDIUM
**Problem**: Console shows warnings about shadow camera coverage being too large.

**Evidence**:
- `Shadow camera coverage: 1196.3 x 1196.3 units` (Light 2)
- `Shadow camera coverage: 2484.5 x 2484.5 units` (Light 3)
- `Shadow camera coverage: 7162.0 x 7162.0 units` (Light 4)

**Location**: `src/viewer/ViewerCanvas.tsx:1977-2200` (updateShadowCameraBounds)

**Issue**: 
- Large coverage = low shadow resolution
- Shadows may be too blurry or not visible
- Performance impact from large shadow cameras

## Root Cause Analysis

### Primary Issue: **Architectural Confusion**
The system tries to support THREE different shadow modes but doesn't cleanly separate them:

1. **Standard Three.js Shadows** (default, when no weather system)
2. **CSM Shadows** (when standalone weather enabled)
3. **Streets GL Shadows** (when Streets GL overlay enabled)

**Problems**:
- Both systems active at once
- Material setup conflicts
- Shadow map size mismatches
- Uniform update timing issues
- Light management confusion

## Best Practices from Three.js Documentation

### 1. **Single Shadow System**
- Only ONE shadow system should be active at a time
- When CSM is active, standard shadows should be completely disabled
- Lights should be properly managed (visible/intensity/castShadow)

### 2. **Material Setup**
- Materials should be set up ONCE per shadow system
- Avoid recreating materials when switching systems
- Use material flags to track which system set up the material

### 3. **Shadow Map Management**
- Shadow maps should be created eagerly (not lazily) when possible
- Uniforms should be updated after shadow maps are created
- Use proper texture disposal when switching systems

### 4. **Light Management**
- When CSM is active, disable ALL standard directional lights
- Store original state for restoration
- Only CSM lights should be active

## Fix Plan

### Fix 1: Properly Disable Standard Lights When CSM Active ✅
**File**: `src/viewer/ViewerCanvas.tsx:9123-9136`

**Changes**:
- Completely disable standard sun light when CSM is active (visible = false, intensity = 0)
- Store original state for restoration
- Only CSM lights should provide lighting

### Fix 2: Separate Shadow Plane Configuration ✅
**File**: `src/viewer/ViewerCanvas.tsx` (multiple locations)

**Changes**:
- Create dedicated `configureShadowPlane()` function
- Shadow plane configuration should be independent of shadow system
- Material should only be set up once per shadow system
- Avoid material recreation conflicts

### Fix 3: Improve Shadow Map Uniform Updates ✅
**File**: `src/viewer/effects/StreetsGLCSM.ts:788-878`

**Changes**:
- More aggressive uniform updates
- Check for shadow map creation every frame (not just occasionally)
- Log when dummy textures are replaced
- Ensure all materials get updated uniforms

### Fix 4: Fix Shadow Camera Coverage ✅
**File**: `src/viewer/ViewerCanvas.tsx:1977-2200`

**Changes**:
- Calculate proper cascade splits based on scene size
- Cap shadow camera coverage to reasonable maximum
- Use adaptive sizing based on scene bounds

## Implementation Priority

1. **Fix 1** (Light Management) - **HIGHEST PRIORITY** - Fixes double lighting
2. **Fix 2** (Shadow Plane) - **HIGH PRIORITY** - Fixes material conflicts
3. **Fix 3** (Uniform Updates) - **MEDIUM PRIORITY** - Improves shadow reliability
4. **Fix 4** (Camera Coverage) - **MEDIUM PRIORITY** - Improves shadow quality

## Testing Checklist

- [ ] Standard Three.js shadows work (no weather system)
- [ ] CSM shadows work (standalone weather enabled)
- [ ] Shadows appear on shadow plane in both modes
- [ ] No conflicts when switching between modes
- [ ] Shadow quality is appropriate for scene size
- [ ] Shadow maps are created and uniforms updated
- [ ] No console warnings about shadow camera coverage
- [ ] Shadow plane material properties are correct
- [ ] No double lighting (only one light system active)
- [ ] Performance is acceptable (no excessive shadow cameras)

## References

- Three.js Shadow Maps: https://threejs.org/docs/#api/en/lights/shadows/ShadowMap
- CSM Best Practices: https://learnopengl.com/Advanced-Lighting/Shadows/CSM
- Streets GL CSM Implementation: `src/viewer/effects/StreetsGLCSM.ts`





