import * as THREE from 'three'

/**
 * Cache for material original properties
 */
const materialCache = new WeakMap<THREE.Material, {
  originalEnvMapIntensity: number
  originalColor: THREE.Color
}>()

/**
 * Calculate appropriate envMapIntensity for a material
 * @param material - The material to calculate intensity for
 * @param baseIntensity - Base HDR intensity
 * @returns Calculated intensity
 * 
 * MATCH WEBEXPORT BEHAVIOR: Use base intensity for all materials (no metallic boost)
 * Webexport relies on Three.js automatic behavior where materials use scene.environment
 * with their default envMapIntensity (typically 1.0), without special calculations.
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
  
  // MATCH WEBEXPORT: Use base intensity for all materials (no metallic boost)
  // Webexport doesn't apply special intensity calculations - materials use base intensity
  // This matches how webexport handles materials: they automatically use scene.environment
  // with the base intensity from HDR config, without material-specific adjustments
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

/**
 * Get original intensity from cache or material
 */
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

/**
 * Store original intensity in cache
 */
export function storeOriginalIntensity(material: THREE.Material, intensity: number): void {
  const cached = materialCache.get(material)
  if (!cached) {
    materialCache.set(material, {
      originalEnvMapIntensity: intensity,
      originalColor: (material as any).color?.clone() || new THREE.Color(0xffffff)
    })
  } else {
    cached.originalEnvMapIntensity = intensity
  }
}




















