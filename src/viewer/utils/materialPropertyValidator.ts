/**
 * Material Property Validator
 * Validates material property ranges according to Three.js documentation
 * Based on Perplexity research and Three.js best practices
 */

import * as THREE from 'three'

/**
 * Material property ranges according to Three.js documentation
 */
export const MATERIAL_PROPERTY_RANGES = {
  roughness: { min: 0.0, max: 1.0 },
  metalness: { min: 0.0, max: 1.0 },
  opacity: { min: 0.0, max: 1.0 },
  envMapIntensity: { min: 0.0, max: Infinity }, // No upper limit, but typically 0-10
  clearcoat: { min: 0.0, max: 1.0 },
  clearcoatRoughness: { min: 0.0, max: 1.0 },
  transmission: { min: 0.0, max: 1.0 },
  thickness: { min: 0.0, max: Infinity },
  sheen: { min: 0.0, max: 1.0 },
  sheenRoughness: { min: 0.0, max: 1.0 },
  ior: { min: 1.0, max: 2.5 }, // Index of refraction
  reflectivity: { min: 0.0, max: 1.0 }, // For Phong materials
} as const

/**
 * Material property defaults according to Three.js best practices
 */
export const MATERIAL_DEFAULTS = {
  roughness: 1.0,
  metalness: 0.0,
  opacity: 1.0,
  transparent: false,
  depthWrite: true,
  depthTest: true,
  envMapIntensity: 1.0,
  clearcoat: 0.0,
  clearcoatRoughness: 0.0,
  transmission: 0.0,
  thickness: 0.0,
  sheen: 0.0,
  sheenRoughness: 1.0,
  ior: 1.5,
  reflectivity: 0.5, // For Phong materials
} as const

/**
 * Validates and clamps a material property value to its valid range
 * @param propertyName - Name of the property
 * @param value - Value to validate
 * @param warn - Whether to log warnings (default: true)
 * @returns Clamped value within valid range
 */
export function validateMaterialProperty(
  propertyName: keyof typeof MATERIAL_PROPERTY_RANGES,
  value: number,
  warn: boolean = true
): number {
  const range = MATERIAL_PROPERTY_RANGES[propertyName]
  if (!range) {
    if (warn) {
      console.warn(`[MaterialValidator] Unknown property: ${propertyName}`)
    }
    return value
  }

  const clamped = Math.max(range.min, Math.min(range.max, value))
  
  if (clamped !== value && warn) {
    console.warn(
      `[MaterialValidator] Property ${propertyName} out of range: ${value}, clamped to [${range.min}, ${range.max}]`
    )
  }

  return clamped
}

/**
 * Validates and applies a material property with range checking
 * @param material - Material to update
 * @param propertyName - Name of the property
 * @param value - Value to set
 * @param setNeedsUpdate - Whether to set needsUpdate flag (default: true)
 * @returns Whether the value was actually changed
 */
export function setMaterialProperty(
  material: THREE.Material,
  propertyName: keyof typeof MATERIAL_PROPERTY_RANGES,
  value: number,
  setNeedsUpdate: boolean = true
): boolean {
  // Validate the value
  const validatedValue = validateMaterialProperty(propertyName, value)
  
  // Check if value actually changed
  const currentValue = (material as any)[propertyName]
  if (currentValue === validatedValue) {
    return false // No change needed
  }

  // Set the property
  ;(material as any)[propertyName] = validatedValue
  
  // Set needsUpdate only if value changed and flag is requested
  if (setNeedsUpdate) {
    material.needsUpdate = true
  }

  return true // Value was changed
}

/**
 * Validates multiple material properties at once
 * @param material - Material to validate
 * @param properties - Object with property names and values
 * @param setNeedsUpdate - Whether to set needsUpdate flag (default: true)
 * @returns Object indicating which properties were changed
 */
export function setMaterialProperties(
  material: THREE.Material,
  properties: Partial<Record<keyof typeof MATERIAL_PROPERTY_RANGES, number>>,
  setNeedsUpdate: boolean = true
): Record<string, boolean> {
  const changes: Record<string, boolean> = {}
  let anyChanged = false

  for (const [propertyName, value] of Object.entries(properties)) {
    if (value !== undefined) {
      const changed = setMaterialProperty(
        material,
        propertyName as keyof typeof MATERIAL_PROPERTY_RANGES,
        value,
        false // Don't set needsUpdate for each property
      )
      changes[propertyName] = changed
      if (changed) {
        anyChanged = true
      }
    }
  }

  // Set needsUpdate once if any property changed
  if (anyChanged && setNeedsUpdate) {
    material.needsUpdate = true
  }

  return changes
}

/**
 * Gets recommended material type based on required features
 * Perplexity finding: MeshStandardMaterial preferred for performance (70%+ developers)
 * @param needsClearcoat - Whether clearcoat is needed
 * @param needsTransmission - Whether transmission is needed
 * @param needsSheen - Whether sheen is needed
 * @returns Recommended material type
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
 * Validates a complete material configuration
 * @param config - Material configuration object
 * @returns Validated configuration with clamped values
 */
export function validateMaterialConfig(config: {
  roughness?: number
  metalness?: number
  opacity?: number
  envMapIntensity?: number
  clearcoat?: number
  clearcoatRoughness?: number
  transmission?: number
  [key: string]: any
}): typeof config {
  const validated = { ...config }

  if (validated.roughness !== undefined) {
    validated.roughness = validateMaterialProperty('roughness', validated.roughness, false)
  }
  if (validated.metalness !== undefined) {
    validated.metalness = validateMaterialProperty('metalness', validated.metalness, false)
  }
  if (validated.opacity !== undefined) {
    validated.opacity = validateMaterialProperty('opacity', validated.opacity, false)
  }
  if (validated.envMapIntensity !== undefined) {
    validated.envMapIntensity = validateMaterialProperty('envMapIntensity', validated.envMapIntensity, false)
  }
  if (validated.clearcoat !== undefined) {
    validated.clearcoat = validateMaterialProperty('clearcoat', validated.clearcoat, false)
  }
  if (validated.clearcoatRoughness !== undefined) {
    validated.clearcoatRoughness = validateMaterialProperty('clearcoatRoughness', validated.clearcoatRoughness, false)
  }
  if (validated.transmission !== undefined) {
    validated.transmission = validateMaterialProperty('transmission', validated.transmission, false)
  }

  return validated
}


























