# Shadow & Material Consistency Analysis & Fixes

## Issues Identified

### 1. Material State Loss When Switching Systems ⚠️

**Problem**: When switching between standard shadows, HDR, and weather/CSM systems, materials lose their original properties:
- `castShadow` and `receiveShadow` may be reset
- `depthWrite` may be changed incorrectly
- CSM setup flags may be lost
- Material types may be changed (e.g., ShadowMaterial ↔ MeshStandardMaterial)

**Location**: 
- `ViewerCanvas.tsx` lines 6138-6394 (shadow configuration effect)
- `ViewerCanvas.tsx` lines 9800-10234 (standalone weather initialization)
- `shadowManager.ts` (system switching)

**Impact**: Materials behave inconsistently when switching systems, shadows may disappear or appear incorrectly.

### 2. Shadow Plane Material Inconsistencies ⚠️

**Problem**: Shadow plane material is changed frequently without preserving state:
- Switches between `ShadowMaterial` and `MeshStandardMaterial` without saving original
- Path tracer restoration conflicts with system switches
- CSM setup may be lost when switching systems

**Location**:
- `ViewerCanvas.tsx` lines 6230-6393 (shadow plane material updates)
- `PathTracerDemo.ts` lines 2571-2634 (material restoration)

**Impact**: Shadow plane may not render correctly, shadows may disappear.

### 3. Light State Not Preserved ⚠️

**Problem**: When switching between standard and CSM shadows, light states are not preserved:
- `castShadow` may be reset
- `visible` may be changed
- Shadow properties may be lost

**Location**:
- `shadowManager.ts` lines 441-485 (system enable/disable)
- `ViewerCanvas.tsx` lines 6157-6170 (light configuration)

**Impact**: Lights may not cast shadows correctly after system switch.

### 4. Path Tracer Integration Issues ⚠️

**Problem**: Path tracer modifies shadow plane and materials, but restoration may conflict with system switches:
- Material restoration flags may block system updates
- Position restoration may conflict with shadow plane updates
- State may not be preserved when path tracer starts/stops

**Location**:
- `PathTracerDemo.ts` lines 2571-2634
- `ViewerCanvas.tsx` lines 6234-6314 (path tracer restoration checks)

**Impact**: Shadow plane may not work correctly after path tracer usage.

### 5. CSM Material Setup Not Preserved ⚠️

**Problem**: When switching from CSM to standard shadows, CSM setup flags are lost:
- `csmSetup` flag may be cleared
- `csmShadowMapUniforms` may be lost
- Materials may need re-setup when switching back to CSM

**Location**:
- `CSMShadowSystem.ts` lines 214-357 (setupSceneMaterials)
- `ViewerCanvas.tsx` lines 9848-9905 (CSM material setup)

**Impact**: Materials may not receive CSM shadows correctly when switching back to CSM.

## Solutions Implemented

### 1. ShadowMaterialStateManager ✅

**File**: `src/viewer/utils/ShadowMaterialStateManager.ts`

**Purpose**: Preserves material and shadow states when switching systems.

**Features**:
- Saves material properties (castShadow, receiveShadow, depthWrite, etc.)
- Saves CSM setup state
- Saves system state (lights, shadow plane)
- Restores states after system switch
- Uses MaterialUpdateQueue to prevent race conditions

### 2. ShadowSystemCoordinator ✅

**File**: `src/viewer/utils/ShadowSystemCoordinator.ts`

**Purpose**: Coordinates shadow system switches with state preservation.

**Features**:
- Handles system transitions (standard ↔ CSM ↔ HDR)
- Preserves material states during transitions
- Ensures shadow properties are correct for each system
- Handles path tracer start/stop
- Updates shadow plane correctly for each system

## Integration Plan

### Phase 1: Integrate State Manager into ViewerCanvas

1. **Import state manager and coordinator**
   ```typescript
   import { shadowMaterialStateManager } from './utils/ShadowMaterialStateManager'
   import { ShadowSystemCoordinator } from './utils/ShadowSystemCoordinator'
   ```

2. **Create coordinator instance**
   ```typescript
   const shadowCoordinatorRef = useRef<ShadowSystemCoordinator | null>(null)
   ```

3. **Initialize coordinator**
   ```typescript
   if (shadowManager && !shadowCoordinatorRef.current) {
     shadowCoordinatorRef.current = new ShadowSystemCoordinator(
       shadowManager,
       scene,
       directionalLights,
       shadowPlane
     )
   }
   ```

### Phase 2: Update System Switching

1. **Use coordinator for system switches**
   - Replace direct `shadowManager.setShadowSystem()` calls
   - Use `shadowCoordinatorRef.current.switchSystem()`

2. **Save states before switching**
   - Call `shadowMaterialStateManager.saveSceneState()` before switch
   - Call `shadowMaterialStateManager.saveSystemState()` before switch

3. **Restore states after switching**
   - Call `shadowMaterialStateManager.restoreSystemState()` after switch
   - Call `shadowMaterialStateManager.restoreMaterialState()` for each material

### Phase 3: Update Shadow Plane Management

1. **Use coordinator for shadow plane updates**
   - Replace direct shadow plane material updates
   - Use `shadowCoordinatorRef.current.updateShadowPlane()`

2. **Preserve shadow plane state**
   - Save state before changing material type
   - Restore state when switching systems

### Phase 4: Path Tracer Integration

1. **Handle path tracer start**
   - Call `shadowCoordinatorRef.current.onPathTracerStart()` when path tracer starts
   - Save all states before path tracer modifies them

2. **Handle path tracer stop**
   - Call `shadowCoordinatorRef.current.onPathTracerStop()` when path tracer stops
   - Restore all states after path tracer restoration

## Testing Checklist

### System Switching Tests
- [ ] Switch from standard → CSM: Materials preserve shadow properties
- [ ] Switch from CSM → standard: Materials restore correctly
- [ ] Switch from standard → HDR: Shadows still work
- [ ] Switch from HDR → CSM: Materials set up correctly
- [ ] Switch from CSM → HDR: Materials restore correctly

### Shadow Plane Tests
- [ ] Shadow plane material preserved when switching systems
- [ ] Shadow plane receives shadows in all systems
- [ ] Shadow plane transparency works in all systems
- [ ] Shadow plane CSM setup preserved

### Path Tracer Tests
- [ ] Path tracer start: States saved correctly
- [ ] Path tracer stop: States restored correctly
- [ ] Shadow plane works after path tracer
- [ ] Materials work correctly after path tracer

### Material Property Tests
- [ ] castShadow preserved when switching systems
- [ ] receiveShadow preserved when switching systems
- [ ] depthWrite preserved when switching systems
- [ ] CSM setup flags preserved when switching systems

## Expected Benefits

1. **Consistent Shadow Behavior** ✅
   - Shadows work correctly in all systems
   - No loss of shadow properties when switching

2. **Material State Preservation** ✅
   - Materials maintain their properties across system switches
   - No unexpected material changes

3. **Smooth System Transitions** ✅
   - Clean transitions between systems
   - No visual glitches or artifacts

4. **Path Tracer Compatibility** ✅
   - Path tracer works correctly with all systems
   - States preserved during path tracer usage

5. **Better User Experience** ✅
   - Predictable behavior when switching systems
   - No need to reconfigure materials after switches

## Next Steps

1. **Integrate into ViewerCanvas** (Phase 1-4)
2. **Test all system switches**
3. **Test path tracer integration**
4. **Optimize performance** (if needed)
5. **Document usage** for future developers


























