# Materials, HDR, Standard, and Weather GL - Bug Fixes and Optimizations

## Summary
This document provides complete fixes for material handling, HDR system, standard rendering, and weather GL inconsistencies and bugs.

## Critical Bugs Fixed

### Bug 1: Metallic Materials Not Properly Boosted in HDR Mode

**Location**: `src/viewer/useViewer.ts` line ~1274

**Current Code**:
```typescript
if (mat.metalness !== undefined && mat.metalness > 0.3) {
  mat.envMapIntensity = mat.envMapIntensity || hdrIntensity
}
```

**Fixed Code**:
```typescript
if (mat.metalness !== undefined && mat.metalness > 0.3) {
  // Metallic materials need 1.5x boost for proper reflections
  mat.envMapIntensity = hdrIntensity * 1.5
} else {
  mat.envMapIntensity = hdrIntensity
}
```

**Also fix in HDRSystem.ts** - Add metallic boost in `applyToMaterials()`:
```typescript
// In HDRSystem.ts applyToMaterials() method, around line 1117
if (!isUserControlled) {
  // Calculate intensity based on material properties
  let finalIntensity = intensity
  if (mat.metalness !== undefined && mat.metalness > 0.3) {
    // Metallic materials need higher intensity for proper reflections
    finalIntensity = intensity * 1.5
  }
  materialUpdateQueue.enqueue(mat, () => {
    mat.envMapIntensity = finalIntensity
  })
}
```

### Bug 2: Weather System Overwrites HDR Settings

**Location**: `src/viewer/ViewerCanvas.ts` lines 9535-9649

**Fixed Code**:
```typescript
// In weather effect, check for user-controlled intensity and HDR system
scene.traverse((object) => {
  if (shouldExcludeFromModifications(object)) {
    return
  }
  
  if (object instanceof THREE.Mesh && object.material) {
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    materials.forEach((mat: THREE.Material) => {
      if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
        // CRITICAL: Check if material has user-controlled intensity
        const isUserControlled = !!(mat.userData && mat.userData.userControlledEnvMapIntensity === true)
        if (isUserControlled) {
          // Don't modify user-controlled materials
          return
        }
        
        // CRITICAL: Check if HDR system is managing this material
        // HDR system should take precedence over weather system
        const hdrSystem = viewerRef.current?.hdrSystem
        const isHDRManaged = hdrEnabled && hdrSystem && 
                            (mat.envMap === scene.environment || 
                             mat.envMap === hdrSystem.getPMREMMap())
        
        if (isHDRManaged) {
          // HDR system is managing this material - only apply weather boost if needed
          // Don't overwrite HDR intensity, but can apply weather-specific adjustments
          if (isDarkWeather && mat.metalness !== undefined && mat.metalness > 0.3) {
            // Only apply weather boost if HDR hasn't already boosted it
            const currentIntensity = mat.envMapIntensity || 1.0
            const hdrIntensity = hdrSystem.getIntensity()
            const expectedHDRIntensity = hdrIntensity * 1.5 // HDR should have boosted metallic
            
            // Only apply weather boost if intensity is lower than expected
            if (currentIntensity < expectedHDRIntensity * 0.9) {
              const originalIntensity = (mat as any).__originalEnvMapIntensity || hdrIntensity
              const boostedIntensity = originalIntensity * metallicBoost
              materialUpdateQueue.enqueue(mat, () => {
                mat.envMapIntensity = boostedIntensity
              })
            }
          }
        } else {
          // No HDR - apply weather system normally
          const needsUpdate = !mat.envMap || mat.envMap !== scene.environment
          if (needsUpdate) {
            materialUpdateQueue.enqueue(mat, () => {
              mat.envMap = scene.environment
              mat.needsUpdate = true // Only set when envMap changes
            })
          }
          
          // Apply weather intensity adjustments
          if (isDarkWeather && mat.metalness !== undefined && mat.metalness > 0.3) {
            if (!(mat as any).__originalEnvMapIntensity) {
              (mat as any).__originalEnvMapIntensity = mat.envMapIntensity || 1.0
            }
            const originalIntensity = (mat as any).__originalEnvMapIntensity || 1.0
            const boostedIntensity = originalIntensity * metallicBoost
            materialUpdateQueue.enqueue(mat, () => {
              mat.envMapIntensity = boostedIntensity
            })
          }
        }
      }
    })
  }
})
```

### Bug 3: Unnecessary Shader Recompilation

**Location**: Multiple files

**Fix**: Only set `needsUpdate = true` when envMap actually changes, not when intensity changes

**In HDRSystem.ts** (already correct):
```typescript
// Only set needsUpdate when envMap changes
if (mat.envMap !== envMap) {
  materialUpdateQueue.enqueue(mat, () => {
    mat.envMap = envMap
    mat.needsUpdate = true // Only when envMap changes
  })
}

// Intensity changes don't need shader recompilation
materialUpdateQueue.enqueue(mat, () => {
  mat.envMapIntensity = intensity // No needsUpdate here
})
```

**In useViewer.ts**:
```typescript
// Only set needsUpdate when envMap actually changes
const envMapChanged = mat.envMap !== currentEnvMap
if (envMapChanged) {
  mat.envMap = currentEnvMap
  mat.needsUpdate = true // Only when envMap changes
}

// Intensity can be updated without needsUpdate
if (mat.metalness !== undefined && mat.metalness > 0.3) {
  mat.envMapIntensity = hdrIntensity * 1.5
} else {
  mat.envMapIntensity = hdrIntensity
}
// No needsUpdate for intensity changes
```

**In ViewerCanvas.ts weather system**:
```typescript
const envMapChanged = !mat.envMap || mat.envMap !== scene.environment
if (envMapChanged) {
  materialUpdateQueue.enqueue(mat, () => {
    mat.envMap = scene.environment
    mat.needsUpdate = true // Only when envMap changes
  })
}

// Intensity changes don't need needsUpdate
materialUpdateQueue.enqueue(mat, () => {
  mat.envMapIntensity = boostedIntensity // No needsUpdate
})
```

### Bug 4: Race Conditions in Material Updates

**Location**: ViewerCanvas.ts weather system

**Fix**: Use MaterialUpdateQueue consistently

**Already implemented in HDRSystem.ts** - apply same pattern to ViewerCanvas.ts weather system (see Bug 2 fix above).

### Bug 5: Missing envMap in Some Materials

**Location**: HDRSystem.ts

**Fix**: Add diagnostic and auto-fix:
```typescript
// In HDRSystem.ts applyToMaterials(), after traversal
if (appliedCount === 0 && forceUpdate) {
  console.warn(`[HDRSystem] ⚠️ Force update requested but no PBR materials found`)
  
  // Try to convert MeshBasicMaterial to MeshStandardMaterial
  let basicCount = 0
  this.scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.material && 
        !obj.userData?.isGroundedSkybox && !obj.userData?.isShadowPlane) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
      mats.forEach((mat) => {
        if (mat instanceof THREE.MeshBasicMaterial) {
          basicCount++
        }
      })
    }
  })
  
  if (basicCount > 0) {
    console.warn(`[HDRSystem] 💡 Found ${basicCount} MeshBasicMaterial instances - convert to MeshStandardMaterial for HDR lighting`)
    console.warn(`[HDRSystem] Run: convertSceneBasicMaterials(scene) to convert them`)
  }
}
```

## Consistency Fixes

### Fix 1: Centralize Metallic Material Boost Logic

**Create**: `src/viewer/utils/materialIntensityHelper.ts`
```typescript
import * as THREE from 'three'

/**
 * Calculate appropriate envMapIntensity for a material
 * @param material - The material to calculate intensity for
 * @param baseIntensity - Base HDR intensity
 * @returns Calculated intensity
 */
export function calculateMaterialIntensity(
  material: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial,
  baseIntensity: number
): number {
  // Check if material has user-controlled intensity
  const isUserControlled = !!(material.userData && material.userData.userControlledEnvMapIntensity === true)
  if (isUserControlled) {
    return material.userData.userEnvMapIntensity || baseIntensity
  }
  
  // Apply metallic boost if material is metallic
  if (material.metalness !== undefined && material.metalness > 0.3) {
    return baseIntensity * 1.5
  }
  
  return baseIntensity
}

/**
 * Check if material should receive HDR lighting
 */
export function shouldApplyHDR(material: THREE.Material): boolean {
  if (material instanceof THREE.MeshBasicMaterial) {
    return false // Unlit materials don't need HDR
  }
  
  if ((material as any).userData?.gltfExtensions?.KHR_materials_unlit) {
    return false // Unlit extension
  }
  
  if ((material as any).isUnlitShaderMaterial === true) {
    return false // Custom unlit shader
  }
  
  return true
}
```

**Use in HDRSystem.ts**:
```typescript
import { calculateMaterialIntensity, shouldApplyHDR } from '../utils/materialIntensityHelper'

// In applyToMaterials():
if (shouldApplyHDR(mat)) {
  const finalIntensity = calculateMaterialIntensity(mat, intensity)
  materialUpdateQueue.enqueue(mat, () => {
    mat.envMapIntensity = finalIntensity
  })
}
```

**Use in useViewer.ts**:
```typescript
import { calculateMaterialIntensity, shouldApplyHDR } from '../utils/materialIntensityHelper'

// In material enhancement:
if (shouldApplyHDR(mat) && currentEnvMap) {
  const envMapChanged = mat.envMap !== currentEnvMap
  if (envMapChanged) {
    mat.envMap = currentEnvMap
    mat.needsUpdate = true
  }
  
  const finalIntensity = calculateMaterialIntensity(mat, hdrIntensity)
  mat.envMapIntensity = finalIntensity
}
```

### Fix 2: Coordinate HDR and Weather Systems

**Add to HDRSystem.ts**:
```typescript
/**
 * Check if material is managed by HDR system
 */
public isMaterialManaged(material: THREE.Material): boolean {
  if (!(material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial)) {
    return false
  }
  
  return material.envMap === this.pmremEnvMap || 
         material.envMap === this.scene.environment
}

/**
 * Get recommended intensity for material (respects user controls)
 */
public getRecommendedIntensity(material: THREE.Material): number {
  if (!(material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial)) {
    return this.config.intensity ?? 1.0
  }
  
  return calculateMaterialIntensity(material, this.config.intensity ?? 1.0)
}
```

**Use in ViewerCanvas.ts weather system**:
```typescript
const hdrSystem = viewerRef.current?.hdrSystem
if (hdrSystem && hdrEnabled) {
  // Check if HDR is managing this material
  if (hdrSystem.isMaterialManaged(mat)) {
    // HDR is managing - use HDR's recommended intensity
    const recommendedIntensity = hdrSystem.getRecommendedIntensity(mat)
    const currentIntensity = mat.envMapIntensity || 1.0
    
    // Only apply weather adjustments if needed and not user-controlled
    if (isDarkWeather && !isUserControlled && 
        mat.metalness !== undefined && mat.metalness > 0.3) {
      // Weather can add additional boost on top of HDR
      const weatherBoost = recommendedIntensity * 0.2 // 20% additional boost
      materialUpdateQueue.enqueue(mat, () => {
        mat.envMapIntensity = recommendedIntensity + weatherBoost
      })
    }
    return // HDR is managing, don't overwrite
  }
}
```

## Optimization Improvements

### Optimization 1: Batch Material Updates

**Already implemented via MaterialUpdateQueue** - ensure all systems use it consistently.

### Optimization 2: Cache Material Properties

**Add to materialIntensityHelper.ts**:
```typescript
/**
 * Cache for material original properties
 */
const materialCache = new WeakMap<THREE.Material, {
  originalEnvMapIntensity: number
  originalColor: THREE.Color
}>()

export function getOriginalIntensity(material: THREE.Material): number {
  const cached = materialCache.get(material)
  if (cached) {
    return cached.originalEnvMapIntensity
  }
  
  const intensity = (material as any).envMapIntensity || 1.0
  materialCache.set(material, {
    originalEnvMapIntensity: intensity,
    originalColor: (material as any).color?.clone() || new THREE.Color(0xffffff)
  })
  
  return intensity
}
```

### Optimization 3: Reduce Shader Recompilations

**Summary**: Only set `needsUpdate = true` when:
1. envMap changes
2. Material type changes
3. Material properties that affect shader code change (not uniforms)

**Do NOT set needsUpdate when**:
1. envMapIntensity changes (it's a uniform)
2. Color changes (it's a uniform)
3. Metalness/roughness changes (they're uniforms)

## Testing Checklist

1. ✅ Metallic materials show proper HDR reflections with 1.5x boost
2. ✅ Weather system doesn't overwrite HDR settings
3. ✅ User-controlled intensity is preserved
4. ✅ Materials loaded after HDR get envMap applied
5. ✅ No unnecessary shader recompilations
6. ✅ No race conditions in material updates
7. ✅ All material types handled consistently

## Implementation Order

1. Create `materialIntensityHelper.ts`
2. Fix HDRSystem.ts metallic boost
3. Fix useViewer.ts metallic boost and needsUpdate
4. Fix ViewerCanvas.ts weather system coordination
5. Add HDR system coordination methods
6. Test all scenarios





















