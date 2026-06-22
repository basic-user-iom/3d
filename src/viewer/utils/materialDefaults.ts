/**
 * Material Defaults Constants
 * Standard default values for Three.js materials according to best practices
 * Based on Three.js documentation and Perplexity research
 */

import * as THREE from 'three'

/**
 * Standard material property defaults
 * These values are recommended by Three.js documentation and industry best practices
 */
export const MATERIAL_DEFAULTS = {
  // PBR Properties
  roughness: 1.0, // 0.0 = smooth/mirror, 1.0 = rough/matte
  metalness: 0.0, // 0.0 = dielectric, 1.0 = metal
  opacity: 1.0, // 0.0 = transparent, 1.0 = opaque
  transparent: false,
  
  // Depth Properties
  depthWrite: true, // Required for shadows
  depthTest: true, // Default enabled
  
  // Environment Map
  envMapIntensity: 1.0, // Standard intensity
  
  // Physical Material Properties (only when using MeshPhysicalMaterial)
  clearcoat: 0.0,
  clearcoatRoughness: 0.0,
  transmission: 0.0,
  thickness: 0.0,
  sheen: 0.0,
  sheenRoughness: 1.0,
  ior: 1.5, // Index of refraction (glass = 1.5)
  
  // Phong Material Properties
  reflectivity: 0.5, // For MeshPhongMaterial
} as const

/**
 * Recommended material type based on features needed
 * Perplexity finding: MeshStandardMaterial preferred for performance (70%+ developers)
 * Use MeshPhysicalMaterial only when advanced features are needed
 */
export function getRecommendedMaterialType(
  needsClearcoat: boolean = false,
  needsTransmission: boolean = false,
  needsSheen: boolean = false
): typeof THREE.MeshStandardMaterial | typeof THREE.MeshPhysicalMaterial {
  // Use PhysicalMaterial only when advanced features are needed
  if (needsClearcoat || needsTransmission || needsSheen) {
    return THREE.MeshPhysicalMaterial
  }
  
  // Default to StandardMaterial for better performance
  return THREE.MeshStandardMaterial
}

/**
 * Creates a material with standard defaults
 * @param type - Material type
 * @param overrides - Properties to override defaults
 * @returns Material instance with defaults applied
 */
export function createMaterialWithDefaults<T extends THREE.Material>(
  type: new (params?: any) => T,
  overrides: Partial<Record<string, any>> = {}
): T {
  const defaults: Record<string, any> = {}
  const materialTypeName = type.name
  
  // Apply defaults based on material type
  if (materialTypeName === 'MeshStandardMaterial' || materialTypeName === 'MeshPhysicalMaterial') {
    defaults.roughness = MATERIAL_DEFAULTS.roughness
    defaults.metalness = MATERIAL_DEFAULTS.metalness
    defaults.envMapIntensity = MATERIAL_DEFAULTS.envMapIntensity
  }
  
  if (materialTypeName === 'MeshPhysicalMaterial') {
    defaults.clearcoat = MATERIAL_DEFAULTS.clearcoat
    defaults.clearcoatRoughness = MATERIAL_DEFAULTS.clearcoatRoughness
    defaults.transmission = MATERIAL_DEFAULTS.transmission
    defaults.thickness = MATERIAL_DEFAULTS.thickness
    defaults.sheen = MATERIAL_DEFAULTS.sheen
    defaults.sheenRoughness = MATERIAL_DEFAULTS.sheenRoughness
    defaults.ior = MATERIAL_DEFAULTS.ior
  }
  
  if (materialTypeName === 'MeshPhongMaterial') {
    defaults.reflectivity = MATERIAL_DEFAULTS.reflectivity
  }
  
  // Common defaults
  defaults.opacity = MATERIAL_DEFAULTS.opacity
  defaults.transparent = MATERIAL_DEFAULTS.transparent
  defaults.depthWrite = MATERIAL_DEFAULTS.depthWrite
  defaults.depthTest = MATERIAL_DEFAULTS.depthTest
  
  // Merge with overrides
  const params = { ...defaults, ...overrides }
  
  return new type(params)
}


























