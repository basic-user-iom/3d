# Path Tracer Ground Plane Position Fix

## Date
2025-12-17

## Problem
The ground plane in the path tracer was somehow linked to the car's position, causing it to move when the car moved. The plane should be fixed in world space, not relative to any objects.

## Root Causes Identified
1. **Position not explicitly set to world origin** - Only Y position was set, X and Z were left at default (0, but not explicitly)
2. **Bounding box calculation included ground planes** - Could cause circular dependencies
3. **No verification that plane stays fixed** - No checks to prevent the plane from being moved
4. **No verification of parent** - Plane could be accidentally parented to car or other objects

## Fixes Applied

### 1. Explicitly Set Position to World Origin
**File**: `src/viewer/pathTracer/PathTracerDemo.ts`

**Changed**:
```typescript
// Before
this.groundPlaneMesh.position.y = existingGroundY

// After
this.groundPlaneMesh.position.set(0, existingGroundY, 0) // Fixed world position
```

**Why**: Explicitly sets X and Z to 0 (world origin) to ensure the plane is not offset.

### 2. Update Matrix World After Position Set
**Added**:
```typescript
// CRITICAL: Ensure plane is in world space, not parented to any object
this.groundPlaneMesh.updateMatrixWorld(true)
```

**Why**: Forces the plane to update its world matrix, ensuring it's in world space.

### 3. Verify Parent is Scene
**Added**:
```typescript
// CRITICAL: Verify it's not parented to anything (should be direct child of scene)
if (this.groundPlaneMesh.parent !== this.scene) {
  console.warn('[PathTracerDemo] ⚠️ Ground plane is parented to something other than scene!', {
    parent: this.groundPlaneMesh.parent?.name || 'Unknown',
    parentType: this.groundPlaneMesh.parent?.type
  })
  // Force reparent to scene
  if (this.groundPlaneMesh.parent) {
    this.groundPlaneMesh.parent.remove(this.groundPlaneMesh)
  }
  this.scene.add(this.groundPlaneMesh)
}
```

**Why**: Ensures the plane is always a direct child of the scene, not parented to the car or any other object.

### 4. Mark Plane as Fixed
**Added**:
```typescript
// CRITICAL: Mark that this plane should never move (fixed in world space)
this.groundPlaneMesh.userData.fixedWorldPosition = true
```

**Why**: Provides a flag to identify the plane as fixed, allowing runtime checks.

### 5. Exclude Ground Planes from Bounding Box
**Changed**:
```typescript
// Before
if ((obj as any).isGroundedSkybox === true || 
    obj instanceof THREE.Light ||
    obj instanceof THREE.Camera ||
    obj.userData?.isGroundedSkybox === true) {
  return
}

// After
if ((obj as any).isGroundedSkybox === true || 
    obj instanceof THREE.Light ||
    obj instanceof THREE.Camera ||
    obj.userData?.isGroundedSkybox === true ||
    obj.userData?.isPathTracerGroundPlane === true || // Exclude our ground plane
    obj.userData?.isGroundPlane === true || // Exclude existing ground planes
    obj.userData?.isShadowPlane === true) { // Exclude shadow planes
  return
}
```

**Why**: Prevents ground planes from affecting their own size calculation, avoiding circular dependencies.

### 6. Runtime Position Verification in Render Loop
**Added**:
```typescript
// CRITICAL: Ensure ground plane stays fixed in world space (not linked to car position)
if (this.groundPlaneMesh && this.groundPlaneMesh.userData.fixedWorldPosition) {
  // Verify plane is at world origin for X and Z, and check if it's been moved
  const expectedX = 0
  const expectedZ = 0
  const currentY = this.groundPlaneMesh.position.y
  
  // If X or Z have been changed, reset them to 0 (world origin)
  if (Math.abs(this.groundPlaneMesh.position.x - expectedX) > 0.001 || 
      Math.abs(this.groundPlaneMesh.position.z - expectedZ) > 0.001) {
    console.warn('[PathTracerDemo] ⚠️ Ground plane position was modified, resetting to world origin')
    this.groundPlaneMesh.position.set(expectedX, currentY, expectedZ)
    this.groundPlaneMesh.updateMatrixWorld(true)
  }
  
  // Verify plane is direct child of scene, not parented to car or other objects
  if (this.groundPlaneMesh.parent !== this.scene) {
    console.warn('[PathTracerDemo] ⚠️ Ground plane was reparented, fixing')
    if (this.groundPlaneMesh.parent) {
      this.groundPlaneMesh.parent.remove(this.groundPlaneMesh)
    }
    this.scene.add(this.groundPlaneMesh)
    this.groundPlaneMesh.updateMatrixWorld(true)
  }
}
```

**Why**: Runtime safeguard that checks every frame to ensure the plane stays fixed. If something tries to move it, it's automatically reset.

## Expected Results

After these fixes:
1. ✅ Ground plane is fixed at world origin (0, y, 0)
2. ✅ Plane does not move when car moves
3. ✅ Plane is always a direct child of scene, not parented to car
4. ✅ Runtime checks prevent accidental movement
5. ✅ Bounding box calculation doesn't include ground planes

## Testing Checklist

- [ ] Ground plane stays fixed when car moves
- [ ] Ground plane position is (0, y, 0) in world space
- [ ] Ground plane is direct child of scene
- [ ] No console warnings about plane being moved or reparented
- [ ] Plane size is appropriate (not too small or too large)

## Notes

- The ground plane is now explicitly set to world origin (0, y, 0) for X and Z coordinates
- Runtime verification in the render loop ensures the plane stays fixed
- The plane is marked with `fixedWorldPosition` flag for identification
- Bounding box calculation excludes ground planes to prevent circular dependencies
- If the plane is accidentally moved or reparented, it's automatically fixed














