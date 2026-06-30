/**
 * Ground Projected Environment Mapping Setup
 * Based on Three.js official example: https://threejs.org/examples/#webgl_materials_envmaps_groundprojected
 * 
 * Usage:
 *   import { setupGroundProjectedEnv } from './ground-projection-setup';
 *   
 *   const env = await setupGroundProjectedEnv(scene, {
 *     envMap: yourEnvMap,
 *     height: 15,
 *     radius: 100
 *   });
 */

import * as THREE from 'three'
import { GroundedSkybox } from 'three/addons/objects/GroundedSkybox.js'

export interface GroundProjectionOptions {
  envMap: THREE.Texture
  height?: number
  radius?: number
  resolution?: number
  positionY?: number
  enabled?: boolean
}

export interface GroundProjectionResult {
  skybox: GroundedSkybox
  envMap: THREE.Texture
  toggle: (enable: boolean) => void
  update: (height?: number, radius?: number, positionY?: number) => void
  recreate: (height?: number, radius?: number, resolution?: number, positionY?: number) => GroundedSkybox
  dispose: () => void
}

/**
 * Setup ground-projected environment mapping
 * @param scene - The Three.js scene
 * @param options - Configuration options
 * @returns Ground projection result with skybox and control functions
 */
export function setupGroundProjectedEnv(
  scene: THREE.Scene,
  options: GroundProjectionOptions
): GroundProjectionResult {
  const {
    envMap,
    height: inputHeight = 15,
    radius: inputRadius = 100,
    resolution: inputResolution = 128,
    positionY: inputPositionY = 0,
    enabled = true
  } = options

  // Ensure height and radius are positive (GroundedSkybox requirement)
  const height = (inputHeight !== undefined && inputHeight > 0) ? inputHeight : 15
  const radius = (inputRadius !== undefined && inputRadius > 0) ? inputRadius : 100
  const resolution = (inputResolution !== undefined && inputResolution > 0) ? inputResolution : 128
  const positionY = inputPositionY !== undefined ? inputPositionY : 0

  // CRITICAL: Ensure texture is in correct state for GroundedSkybox
  // GroundedSkybox expects equirectangular mapping with standard orientation
  if (envMap.mapping !== THREE.EquirectangularReflectionMapping) {
    console.warn('[GroundProjection] Texture mapping is not EquirectangularReflectionMapping, setting it now')
    envMap.mapping = THREE.EquirectangularReflectionMapping
  }
  // Ensure texture rotation and center are at defaults (GroundedSkybox handles its own unwrapping)
  if (envMap.rotation !== 0) {
    console.warn('[GroundProjection] Texture rotation is not 0, resetting to 0 for GroundedSkybox')
    envMap.rotation = 0
  }
  if (envMap.center.x !== 0.5 || envMap.center.y !== 0.5) {
    envMap.center.set(0.5, 0.5)
  }
  // GroundedSkybox expects standard orientation (flipY = false)
  if (envMap.flipY !== false) {
    console.warn('[GroundProjection] Texture flipY is not false, resetting to false for GroundedSkybox')
    envMap.flipY = false
  }
  envMap.needsUpdate = true

  // Create grounded skybox
  // Note: GroundedSkybox needs the equirectangular texture to properly unwrap
  // Use a mutable reference container so we can update it in recreate()
  const skyboxRef: { current: GroundedSkybox } = {
    current: new GroundedSkybox(envMap, height, radius, resolution)
  }
  const skybox = skyboxRef.current // Alias for convenience
  skybox.position.y = height - 0.01 + positionY
  
  // Mark as GroundedSkybox for identification
  ;(skybox as any).isGroundedSkybox = true
  skybox.userData.isGroundedSkybox = true
  
 * GroundedSkybox uses MeshBasicMaterial (no shadow map sampling). Contact shadows on the
 * projected ground are composited via a transparent ShadowMaterial plane — see hdrGroundShadowCatcher.ts.
  const applyShadowSupportToMaterial = (skyboxMesh: GroundedSkybox) => {
    const material = skyboxMesh.material as THREE.Material
    
    // Mark as shadow receiver (even though MeshBasicMaterial won't show shadows)
    // This allows the mesh to be identified as a shadow receiver for debugging
    skyboxMesh.userData.isShadowReceiver = true
    skyboxMesh.userData.isGroundedSkybox = true
    
    // CRITICAL: GroundedSkybox uses MeshBasicMaterial which doesn't support shadows
    // According to Three.js GroundedSkybox source: super(geometry, new MeshBasicMaterial({ map, depthWrite: false }))
    // MeshBasicMaterial doesn't use the Three.js chunk system, so shadow injection will cause shader compilation errors
    // We must skip shadow injection entirely for MeshBasicMaterial to prevent shader errors
    if (material instanceof THREE.MeshBasicMaterial) {
      // MeshBasicMaterial doesn't support shadows - this is expected and OK
      // The ground projection will still render correctly, just without shadow receiving capability
      // Shadows will still work on other objects in the scene, just not on the ground projection mesh itself
      material.visible = true
      return // Early return to prevent any shader modification attempts
    }
    
    // Only attempt shadow injection for ShaderMaterial that uses Three.js chunk system
    // This is a safety check to prevent shader compilation errors
    if (material instanceof THREE.ShaderMaterial) {
      const shaderMaterial = material as THREE.ShaderMaterial
      
      // Check if this is actually a Three.js standard material (has chunk system)
      // GroundedSkybox uses custom shaders that don't use the chunk system
      const isStandardMaterial = (material as any).isMeshStandardMaterial || 
                                 (material as any).isMeshPhysicalMaterial ||
                                 (material as any).isMeshLambertMaterial ||
                                 (material as any).isMeshPhongMaterial
      
      if (!isStandardMaterial) {
        // Custom shader material - skip shadow injection to avoid breaking it
        material.visible = true
        return
      }
      
      // Store original onBeforeCompile if it exists
      const originalOnBeforeCompile = shaderMaterial.onBeforeCompile
      
      // Modify shader to support shadows (with error handling)
      shaderMaterial.onBeforeCompile = (shader: any, renderer: THREE.WebGLRenderer) => {
        try {
          // Call original onBeforeCompile first
          if (originalOnBeforeCompile) {
            originalOnBeforeCompile.call(shaderMaterial, shader, renderer)
          }
          
          // Validate shader strings exist
          if (!shader.fragmentShader || typeof shader.fragmentShader !== 'string') {
            return
          }
          if (!shader.vertexShader || typeof shader.vertexShader !== 'string') {
            return
          }
          
          const fragmentShader = shader.fragmentShader
          const vertexShader = shader.vertexShader
          
          // CRITICAL: Only inject if shader uses Three.js chunk system
          // GroundedSkybox uses custom shaders without chunk system
          const hasChunks = fragmentShader.includes('#include') || vertexShader.includes('#include')
          if (!hasChunks) {
            // Shader doesn't use chunk system - skip shadow injection to prevent errors
            return
          }
          
          // Additional safety: Check for required chunks before injecting
          const hasOutputFragment = fragmentShader.includes('#include <output_fragment>')
          const hasWorldPosVertex = vertexShader.includes('#include <worldpos_vertex>')
          
          if (!hasOutputFragment || !hasWorldPosVertex) {
            // Required chunks not present - skip shadow injection
            return
          }
          
          // Inject shadow map support
          shader.defines = shader.defines || {}
          shader.defines.USE_SHADOWMAP = ''
          shader.defines.SHADOWMAP_TYPE_PCF = ''
          shader.defines.SHADOWMAP_PCF = ''
          
          // Inject shadowmap_fragment chunk (only if not already present)
          if (!fragmentShader.includes('#include <shadowmap_fragment>')) {
            shader.fragmentShader = fragmentShader.replace(
              '#include <output_fragment>',
              '#include <shadowmap_fragment>\n#include <output_fragment>'
            )
          }
          
          // Inject shadowmap_vertex chunk (only if not already present)
          if (!vertexShader.includes('#include <shadowmap_vertex>')) {
            shader.vertexShader = vertexShader.replace(
              '#include <worldpos_vertex>',
              '#include <worldpos_vertex>\n#include <shadowmap_vertex>'
            )
          }
        } catch (error) {
          // Silently fail - don't break the shader if injection fails
          console.warn('[GroundProjection] Could not inject shadow support into shader (this is expected for GroundedSkybox):', error)
        }
      }
      
      shaderMaterial.needsUpdate = true
    } else {
      // For non-shader materials (like MeshBasicMaterial), just mark as visible
      // Note: MeshBasicMaterial won't show shadows, but the mesh will still render
      material.visible = true
    }
  }
  
  // CRITICAL: Enable shadow receiving so shadows cast by objects appear on the ground projection
  skybox.receiveShadow = true
  skybox.castShadow = false // GroundedSkybox doesn't cast shadows, only receives them
  
  // Apply shadow support to the initial skybox
  applyShadowSupportToMaterial(skybox)
  
  // Ensure the mesh itself is configured for shadows
  if (skybox instanceof THREE.Mesh) {
    skybox.castShadow = false
    skybox.receiveShadow = true
  }

  // DO NOT set scene.environment here - it should remain as PMREM for material reflections
  // The envMap passed to GroundedSkybox is for the skybox rendering only

  // Add or remove skybox based on enabled state
  if (enabled) {
    scene.add(skybox)
    // CRITICAL: According to Three.js official GroundedSkybox example, scene.background MUST be null
    // GroundedSkybox is a FULL SPHERE that replaces scene.background entirely
    // It renders both the sky (upper hemisphere) and ground projection (lower hemisphere)
    scene.background = null
    
    // CRITICAL: Set render order to ensure skybox renders behind everything
    // Negative render order means it renders first (behind other objects)
    skybox.renderOrder = -1000
    
    // CRITICAL: Ensure skybox is not culled by camera frustum
    // GroundedSkybox should always be visible regardless of camera position
    skybox.frustumCulled = false
    
    // DEBUG: Log ground projection setup for visibility
    console.log('[GroundProjection] GroundedSkybox added to scene', {
      visible: skybox.visible,
      position: { x: skybox.position.x, y: skybox.position.y, z: skybox.position.z },
      height,
      radius,
      materialType: skybox.material?.constructor?.name,
      materialVisible: skybox.material?.visible,
      envMapMapping: envMap.mapping,
      sceneChildrenCount: scene.children.length,
      renderOrder: skybox.renderOrder,
      frustumCulled: skybox.frustumCulled
    })
    
    // Ensure skybox is visible and properly configured
    skybox.visible = true
    if (skybox.material) {
      skybox.material.visible = true
      skybox.material.needsUpdate = true
      
      // CRITICAL: Ensure material renders correctly
      // For MeshBasicMaterial, ensure it's not transparent unless needed
      if (skybox.material instanceof THREE.MeshBasicMaterial) {
        skybox.material.transparent = false
        skybox.material.opacity = 1.0
        // CRITICAL: depthWrite = false is needed for skybox rendering (renders behind everything)
        // depthTest = true ensures shadow plane can occlude lower hemisphere when viewed from below
        skybox.material.depthWrite = false // GroundedSkybox uses depthWrite: false by default
        skybox.material.depthTest = true // Enable depth testing to respect shadow plane occlusion
        // CRITICAL: Use DoubleSide to ensure textures are visible from inside the sphere
        // This ensures the HDR environment is visible regardless of normal direction
        skybox.material.side = THREE.DoubleSide // Render both sides (ensures visibility from inside)
      }
    }
    
    // Force update matrix to ensure skybox is in correct position
    skybox.updateMatrixWorld(true)
  } else {
    scene.background = envMap
  }
  
  // Toggle function to switch between grounded and standard environment
  const toggle = (enable: boolean) => {
    if (enable) {
      if (!scene.children.includes(skyboxRef.current)) {
        scene.add(skyboxRef.current)
      }
      // CRITICAL: According to Three.js official example, scene.background MUST be null when GroundedSkybox is enabled
      // GroundedSkybox replaces scene.background entirely (renders full sphere: sky + ground)
      scene.background = null
      
      // CRITICAL: Ensure skybox is visible and properly configured
      skyboxRef.current.visible = true
      skyboxRef.current.renderOrder = -1000
      skyboxRef.current.frustumCulled = false
      if (skyboxRef.current.material) {
        skyboxRef.current.material.visible = true
      if (skyboxRef.current.material instanceof THREE.MeshBasicMaterial) {
        // CRITICAL: Use DoubleSide to ensure textures are visible from inside the sphere
        skyboxRef.current.material.side = THREE.DoubleSide // Render both sides (ensures visibility from inside)
        skyboxRef.current.material.depthWrite = false // GroundedSkybox uses depthWrite: false by default
        skyboxRef.current.material.depthTest = true // Enable depth testing to respect shadow plane occlusion
      }
        skyboxRef.current.material.needsUpdate = true
      }
      skyboxRef.current.updateMatrixWorld(true)
      
      console.log('[GroundProjection] Toggled ON', {
        visible: skyboxRef.current.visible,
        inScene: scene.children.includes(skyboxRef.current)
      })
    } else {
      if (scene.children.includes(skyboxRef.current)) {
        scene.remove(skyboxRef.current)
      }
      scene.background = envMap
      
      console.log('[GroundProjection] Toggled OFF')
    }
  }

  // Track current values for updates
  let currentHeight = height
  let currentRadius = radius
  let currentPositionY = positionY

  // Update function for changing parameters dynamically
  // NOTE: Changing radius requires recreating the skybox (geometry limitation)
  // Height and positionY can be changed without recreating
  const update = (newHeight?: number, newRadius?: number, newPositionY?: number) => {
    if (newRadius !== undefined && newRadius !== currentRadius) {
      // Radius change requires recreating the skybox
      console.warn('[GroundProjection] Radius changes require recreating the GroundedSkybox. Use recreate() instead.')
      return
    }
    
    let needsUpdate = false
    
    // Validate and update height by recalculating geometry vertices
    if (newHeight !== undefined && newHeight > 0 && newHeight !== currentHeight) {
      const pos = skyboxRef.current.geometry.getAttribute('position')
      const tmp = new THREE.Vector3()
      const originalRadius = currentRadius
      
      for (let i = 0; i < pos.count; ++i) {
        tmp.fromBufferAttribute(pos, i)
        tmp.normalize().multiplyScalar(originalRadius)
        
        if (tmp.y < 0) {
          const y1 = -newHeight * 3 / 2
          const f = tmp.y < y1 ? -newHeight / tmp.y : (1 - tmp.y * tmp.y / (3 * y1 * y1))
          tmp.multiplyScalar(f)
        }
        
        tmp.toArray(pos.array, 3 * i)
      }
      
      pos.needsUpdate = true
      currentHeight = newHeight
      needsUpdate = true
    }
    
    // Update position Y offset (can be changed without recreating)
    if (newPositionY !== undefined && newPositionY !== currentPositionY) {
      currentPositionY = newPositionY
      needsUpdate = true
    }
    
    // Apply position Y after any height changes
    if (needsUpdate) {
      skyboxRef.current.position.y = currentHeight - 0.01 + currentPositionY
    }
  }
  
  // Recreate function for radius changes
  const recreate = (
    newHeight?: number,
    newRadius?: number,
    newResolution?: number,
    newPositionY?: number
  ): GroundedSkybox => {
    const wasEnabled = scene.children.includes(skyboxRef.current)
    
    // Properly dispose of old skybox
    if (scene.children.includes(skyboxRef.current)) {
      scene.remove(skyboxRef.current)
    }
    
    // Dispose geometry and material
    if (skyboxRef.current.geometry) {
      skyboxRef.current.geometry.dispose()
    }
    if (skyboxRef.current.material instanceof THREE.Material) {
      skyboxRef.current.material.dispose()
    }
    
    // Validate and ensure positive values
    let finalHeight = newHeight !== undefined ? newHeight : currentHeight
    let finalRadius = newRadius !== undefined ? newRadius : currentRadius
    let finalResolution = newResolution !== undefined ? newResolution : resolution
    let finalPositionY = newPositionY !== undefined ? newPositionY : positionY
    
    // Ensure values are positive (GroundedSkybox requirement)
    if (finalHeight <= 0) {
      console.warn('[GroundProjection] Invalid height, using default:', finalHeight)
      finalHeight = 15
    }
    if (finalRadius <= 0) {
      console.warn('[GroundProjection] Invalid radius, using default:', finalRadius)
      finalRadius = 100
    }
    if (finalResolution <= 0) {
      console.warn('[GroundProjection] Invalid resolution, using default:', finalResolution)
      finalResolution = 128
    }
    
    // Create new skybox with resolution parameter
    const newSkybox = new GroundedSkybox(envMap, finalHeight, finalRadius, finalResolution)
    newSkybox.position.y = finalHeight - 0.01 + finalPositionY
    
    // Mark as GroundedSkybox for identification
    ;(newSkybox as any).isGroundedSkybox = true
    newSkybox.userData.isGroundedSkybox = true
    
    // CRITICAL: Set render order to ensure skybox renders behind everything
    newSkybox.renderOrder = -1000
    
    // CRITICAL: Ensure skybox is not culled by camera frustum
    newSkybox.frustumCulled = false
    
    // CRITICAL: Enable shadow receiving so shadows cast by objects appear on the ground projection
    newSkybox.receiveShadow = true
    newSkybox.castShadow = false // GroundedSkybox doesn't cast shadows, only receives them
    
    // CRITICAL: Apply shadow support to the material
    // GroundedSkybox uses MeshBasicMaterial by default, which doesn't support shadows
    // We need to inject shadow support into the shader
    applyShadowSupportToMaterial(newSkybox)
    
    // Ensure the mesh itself is configured for shadows
    if (newSkybox instanceof THREE.Mesh) {
      newSkybox.castShadow = false
      newSkybox.receiveShadow = true
    }
    
    // CRITICAL: Ensure material renders correctly
    if (newSkybox.material instanceof THREE.MeshBasicMaterial) {
      newSkybox.material.transparent = false
      newSkybox.material.opacity = 1.0
      newSkybox.material.depthWrite = false // GroundedSkybox uses depthWrite: false by default
      newSkybox.material.depthTest = true // Enable depth testing to respect shadow plane occlusion
      // CRITICAL: Use DoubleSide to ensure textures are visible from inside the sphere
      newSkybox.material.side = THREE.DoubleSide // Render both sides (ensures visibility from inside)
      newSkybox.material.visible = true
      newSkybox.material.needsUpdate = true
    }
    
    // Ensure skybox is visible
    newSkybox.visible = true
    newSkybox.updateMatrixWorld(true)
    
    // Replace the old skybox reference with the new one
    // CRITICAL: Update the mutable reference container
    skyboxRef.current = newSkybox
    
    // Add to scene if it was enabled before
    if (wasEnabled) {
      scene.add(skyboxRef.current)
      // CRITICAL: According to Three.js official example, scene.background MUST be null when GroundedSkybox is enabled
      scene.background = null
    }
    
    // Update current values
    currentHeight = finalHeight
    currentRadius = finalRadius
    
    return skyboxRef.current
  }

  // Dispose function
  const dispose = () => {
    if (scene.children.includes(skyboxRef.current)) {
      scene.remove(skyboxRef.current)
    }
    if (skyboxRef.current.geometry) {
      skyboxRef.current.geometry.dispose()
    }
    if (skyboxRef.current.material instanceof THREE.Material) {
      skyboxRef.current.material.dispose()
    }
  }

  // Create returned object with getter for skybox to always return current reference
  const result: GroundProjectionResult = {
    get skybox() { return skyboxRef.current },
    envMap,
    toggle,
    update,
    recreate,
    dispose
  }

  return result
}

