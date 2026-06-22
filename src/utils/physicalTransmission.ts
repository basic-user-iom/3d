/**
 * Physical Transmission Materials Utilities
 * Based on Three.js Physical Transmission example: https://threejs.org/examples/#webgl_materials_physical_transmission
 * 
 * Provides utilities for optimizing glass materials with realistic physical properties
 */

import * as THREE from 'three'

/**
 * IOR (Index of Refraction) values for common materials
 * Based on physical properties of real materials
 */
export const MATERIAL_IOR: Record<string, number> = {
  // Glass types
  'air': 1.0003,
  'water': 1.333,
  'ice': 1.31,
  'window_glass': 1.45,
  'glass': 1.5,
  'crown_glass': 1.52,
  'flint_glass': 1.6,
  'crystal': 1.54,
  'diamond': 2.42,
  
  // Common material names (auto-detect from material names)
  'window': 1.45,
  'glass_': 1.5,
  'crystal_': 1.54,
  'diamond_': 2.42,
  'water_': 1.333,
}

/**
 * Glass material presets for common types
 */
export interface GlassPreset {
  name: string
  transmission: number
  thickness: number
  ior: number
  roughness: number
  color?: string
  thicknessMap?: boolean
  transmissionMap?: boolean
  description: string
}

export const GLASS_PRESETS: Record<string, GlassPreset> = {
  'clear_glass': {
    name: 'Clear Glass',
    transmission: 1.0,
    thickness: 0.5,
    ior: 1.5,
    roughness: 0.0,
    description: 'Perfectly clear glass with no tinting'
  },
  'frosted_glass': {
    name: 'Frosted Glass',
    transmission: 0.9,
    thickness: 0.5,
    ior: 1.5,
    roughness: 0.3,
    description: 'Frosted glass with surface roughness'
  },
  'tinted_glass': {
    name: 'Tinted Glass',
    transmission: 0.8,
    thickness: 2.0,
    ior: 1.5,
    roughness: 0.05,
    color: '#e8f5e9',
    description: 'Green-tinted glass (like automotive glass)'
  },
  'window_glass': {
    name: 'Window Glass',
    transmission: 0.95,
    thickness: 0.3,
    ior: 1.45,
    roughness: 0.05,
    description: 'Standard window glass (thin and clear)'
  },
  'crystal': {
    name: 'Crystal',
    transmission: 1.0,
    thickness: 1.0,
    ior: 1.54,
    roughness: 0.0,
    description: 'Crystal glass with higher IOR'
  },
  'diamond': {
    name: 'Diamond',
    transmission: 1.0,
    thickness: 0.5,
    ior: 2.42,
    roughness: 0.0,
    description: 'Diamond-like material (very high IOR)'
  },
  'ice': {
    name: 'Ice',
    transmission: 0.95,
    thickness: 1.5,
    ior: 1.31,
    roughness: 0.1,
    color: '#e3f2fd',
    description: 'Ice material with low IOR'
  },
  'water': {
    name: 'Water',
    transmission: 0.99,
    thickness: 1.0,
    ior: 1.333,
    roughness: 0.0,
    color: '#e1f5fe',
    description: 'Water-like material'
  }
}

/**
 * Auto-detect IOR from material name
 * @param materialName Material name (case-insensitive)
 * @returns IOR value or default (1.5 for glass)
 */
export function detectIORFromName(materialName: string): number {
  if (!materialName) return 1.5
  
  const lowerName = materialName.toLowerCase()
  
  // Check for exact matches first
  for (const [key, ior] of Object.entries(MATERIAL_IOR)) {
    if (lowerName.includes(key)) {
      return ior
    }
  }
  
  // Default to glass IOR
  return 1.5
}

/**
 * Calculate optimal thickness based on geometry
 * Thicker objects need more thickness for realistic appearance
 * @param geometry Geometry to analyze
 * @returns Optimal thickness value
 */
export function calculateOptimalThickness(geometry: THREE.BufferGeometry): number {
  if (!geometry || !geometry.attributes.position) {
    return 0.5 // Default thickness
  }
  
  // Calculate bounding box
  geometry.computeBoundingBox()
  const bbox = geometry.boundingBox
  if (!bbox) {
    return 0.5
  }
  
  const size = new THREE.Vector3()
  bbox.getSize(size)
  
  // Use average dimension as base for thickness
  // Scale it proportionally (thicker for larger objects)
  const avgDim = (size.x + size.y + size.z) / 3
  const thickness = Math.max(0.1, Math.min(2.0, avgDim * 0.1))
  
  return thickness
}

/**
 * Optimize glass material with physical transmission best practices
 * @param material MeshPhysicalMaterial to optimize
 * @param options Optional override values
 */
export function optimizeGlassMaterial(
  material: THREE.MeshPhysicalMaterial,
  options?: {
    transmission?: number
    thickness?: number
    ior?: number
    roughness?: number
    envMapIntensity?: number
    geometry?: THREE.BufferGeometry
    autoDetectIOR?: boolean
  }
): void {
  if (!material) return
  
  // Preserve existing values if not overridden
  const transmission = options?.transmission ?? material.transmission ?? 0.9
  const roughness = options?.roughness ?? material.roughness ?? 0.0
  
  // Auto-detect IOR from material name if enabled
  let ior = options?.ior ?? material.ior ?? 1.5
  if (options?.autoDetectIOR && material.name) {
    const detectedIOR = detectIORFromName(material.name)
    if (detectedIOR !== 1.5) {
      ior = detectedIOR
    }
  }
  
  // Calculate optimal thickness if geometry provided
  let thickness = options?.thickness ?? material.thickness ?? 0.5
  if (options?.geometry && !options.thickness) {
    thickness = calculateOptimalThickness(options.geometry)
  }
  
  // Apply optimized values
  material.transmission = Math.max(0, Math.min(1, transmission))
  material.thickness = Math.max(0, Math.min(10, thickness))
  material.ior = Math.max(1, Math.min(3, ior))
  material.roughness = Math.max(0, Math.min(1, roughness))
  
  // Enhanced environment map intensity for better reflections
  // Glass materials benefit from brighter reflections
  if (options?.envMapIntensity !== undefined) {
    material.envMapIntensity = options.envMapIntensity
  } else if (material.envMapIntensity === undefined || material.envMapIntensity < 1.0) {
    material.envMapIntensity = 1.5 // Enhanced for glass
  }
  
  // Ensure transparency is enabled for transmission
  material.transparent = transmission > 0
  
  // Physical transmission best practices:
  // - Use low roughness for clear glass
  // - Use proper IOR for realistic refraction
  // - Thickness affects color tinting (thicker = more green tint)
  // - Higher envMapIntensity for better reflections
  
  // Mark as optimized
  material.userData.physicalTransmissionOptimized = true
}

/**
 * Apply glass preset to material
 * @param material Material to apply preset to
 * @param presetName Name of preset (from GLASS_PRESETS)
 */
export function applyGlassPreset(
  material: THREE.MeshPhysicalMaterial,
  presetName: string
): void {
  const preset = GLASS_PRESETS[presetName]
  if (!preset) {
    console.warn(`[PhysicalTransmission] Unknown glass preset: ${presetName}`)
    return
  }
  
  // Apply preset values
  material.transmission = preset.transmission
  material.thickness = preset.thickness
  material.ior = preset.ior
  material.roughness = preset.roughness
  
  if (preset.color) {
    material.color.setHex(parseInt(preset.color.replace('#', ''), 16))
  }
  
  // Enhanced environment map for glass
  material.envMapIntensity = 1.5
  
  // Ensure transparency
  material.transparent = true
  
  // Mark as preset
  material.userData.glassPreset = presetName
}

/**
 * Detect if material is glass-like
 * @param material Material to check
 * @returns True if material appears to be glass
 */
export function isGlassMaterial(material: THREE.Material): boolean {
  if (!(material instanceof THREE.MeshPhysicalMaterial)) {
    return false
  }
  
  const transmission = material.transmission ?? 0
  const roughness = material.roughness ?? 1.0
  const ior = material.ior ?? 1.5
  
  // Glass criteria: high transmission, low roughness, reasonable IOR
  return transmission > 0.5 && roughness < 0.3 && ior >= 1.0 && ior <= 3.0
}

/**
 * Get recommended glass preset based on material properties
 * @param material Material to analyze
 * @returns Recommended preset name or null
 */
export function recommendGlassPreset(material: THREE.MeshPhysicalMaterial): string | null {
  if (!isGlassMaterial(material)) {
    return null
  }
  
  const transmission = material.transmission ?? 0.9
  const roughness = material.roughness ?? 0.0
  const ior = material.ior ?? 1.5
  
  // Recommend based on properties
  if (roughness > 0.2) {
    return 'frosted_glass'
  }
  
  if (ior > 2.0) {
    return 'diamond'
  }
  
  if (ior > 1.5) {
    return 'crystal'
  }
  
  if (ior < 1.4) {
    if (transmission > 0.98) {
      return 'water'
    }
    return 'ice'
  }
  
  if (transmission > 0.95 && material.thickness && material.thickness < 0.5) {
    return 'window_glass'
  }
  
  if (material.thickness && material.thickness > 1.5) {
    return 'tinted_glass'
  }
  
  return 'clear_glass'
}












