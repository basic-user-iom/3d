# Shadow System Architecture Analysis & Recommendations

## Current Issues Identified

### 1. **Dual Shadow System Conflict**
- **Problem**: Both CSM shadows AND standard Three.js shadows are active simultaneously
- **Evidence**: 
  - Console shows: `[ViewerCanvas] Created default directional light with shadows enabled`
  - CSM is initialized with its own lights
  - Standard Three.js sun light has `castShadow = false` but is still visible and providing light
  - This creates confusion about which shadow system is active

### 2. **Shadow Map Creation Issues**
- **Problem**: Shadow maps are created lazily by Three.js, but CSM uniforms may not be updated when maps become available
- **Evidence**:
  - Console shows: `map=will be created` for all CSM lights
  - `updateShadowMapUniforms` is called, but may not catch all cases
  - Shadow maps might be created but uniforms not updated in time

### 3. **Shadow Plane Material Conflicts**
- **Problem**: Shadow plane material is modified by multiple systems:
  - Initial creation: `DoubleSide`, `transparent: true`, `opacity: 0.8`
  - CSM setup: Forces `opacity: 1.0`, `transparent: false`
  - Shadow intensity effect: Can recreate material with `DoubleSide`
  - This creates a conflict where material properties are constantly changing

### 4. **Shadow Camera Coverage Warnings**
- **Problem**: Console shows warnings about shadow camera coverage being too large
- **Evidence**:
  - `Shadow camera coverage: 1196.3 x 1196.3 units` (Light 2)
  - `Shadow camera coverage: 2484.5 x 2484.5 units` (Light 3)
  - `Shadow camera coverage: 7162.0 x 7162.0 units` (Light 4)
- **Impact**: Large coverage means low shadow resolution, shadows may be too blurry or not visible

## Root Cause Analysis

### Primary Issue: **Architectural Confusion**
The system tries to support THREE different shadow modes:
1. **Standard Three.js Shadows** (default, when no weather system)
2. **CSM Shadows** (when standalone weather enabled)
3. **Streets GL Shadows** (when Streets GL overlay enabled)

But the code doesn't cleanly separate these modes, leading to:
- Both systems active at once
- Material setup conflicts
- Shadow map size mismatches
- Uniform update timing issues

## Recommended Architecture

### Option 1: **Unified Shadow Manager** (Recommended)
Create a single `ShadowManager` class that:
- **Manages ONE shadow system at a time** (never both)
- **Handles transitions** between shadow systems cleanly
- **Provides consistent API** regardless of which system is active
- **Manages shadow plane** separately from shadow systems

**Benefits**:
- No conflicts between systems
- Clear ownership of shadow resources
- Easier to debug and maintain
- Better performance (only one system active)

**Implementation**:
```typescript
class ShadowManager {
  private currentSystem: 'standard' | 'csm' | 'streetsgl' | null = null
  private standardLights: THREE.DirectionalLight[] = []
  private csmSystem: CSMShadowSystem | null = null
  
  setShadowSystem(type: 'standard' | 'csm' | 'streetsgl'): void {
    // 1. Disable current system
    this.disableCurrentSystem()
    
    // 2. Enable new system
    this.enableSystem(type)
    
    // 3. Update shadow plane for new system
    this.updateShadowPlane(type)
  }
  
  private disableCurrentSystem(): void {
    // Cleanly disable whatever is active
  }
  
  private enableSystem(type: 'standard' | 'csm' | 'streetsgl'): void {
    // Enable only the requested system
  }
  
  private updateShadowPlane(type: 'standard' | 'csm' | 'streetsgl'): void {
    // Configure shadow plane for the active system
  }
}
```

### Option 2: **Simplified CSM-Only Approach**
Remove standard Three.js shadows entirely, always use CSM:
- **When CSM disabled**: Use CSM with minimal quality (1 cascade, 1024px)
- **When CSM enabled**: Use CSM with full quality (3 cascades, 4096-8192px)
- **Benefits**: Single code path, no conflicts, consistent behavior

### Option 3: **Keep Current Architecture but Fix Conflicts**
Fix the current issues without major refactoring:
1. **Ensure only one shadow system is active** at a time
2. **Fix shadow map uniform updates** to be more aggressive
3. **Separate shadow plane configuration** from shadow system setup
4. **Fix shadow camera coverage** to be scene-appropriate

## Immediate Fixes Needed

### Fix 1: Disable Standard Shadows When CSM Active
**File**: `src/viewer/ViewerCanvas.tsx`
**Issue**: Standard Three.js sun light is still visible and providing light when CSM is active
**Fix**: Set `light.visible = false` and `light.intensity = 0` when CSM is active

### Fix 2: Ensure Shadow Maps Are Created
**File**: `src/viewer/effects/StreetsGLCSM.ts`
**Issue**: Shadow maps are created lazily, uniforms may not update
**Fix**: Force shadow map creation by rendering shadow pass explicitly, or wait for first render before setting up materials

### Fix 3: Fix Shadow Camera Coverage
**File**: `src/viewer/effects/CSMShadowSystem.ts`
**Issue**: Shadow cameras have very large coverage, causing low resolution
**Fix**: Calculate proper cascade splits based on scene size, not fixed values

### Fix 4: Separate Shadow Plane Configuration
**File**: `src/viewer/ViewerCanvas.tsx`
**Issue**: Shadow plane material is modified by multiple systems
**Fix**: Create a dedicated `configureShadowPlane()` function that runs independently of shadow system setup

## Testing Checklist

- [ ] Standard Three.js shadows work (no weather system)
- [ ] CSM shadows work (standalone weather enabled)
- [ ] Shadows appear on shadow plane in both modes
- [ ] No conflicts when switching between modes
- [ ] Shadow quality is appropriate for scene size
- [ ] Shadow maps are created and uniforms updated
- [ ] No console warnings about shadow camera coverage
- [ ] Shadow plane material properties are correct

## Recommendation

**Start with Option 3** (fix current architecture) because:
1. Less disruptive to existing code
2. Faster to implement
3. Can be done incrementally
4. If issues persist, can migrate to Option 1 later

**If Option 3 doesn't work**, migrate to **Option 1** (Unified Shadow Manager) for a cleaner architecture.






