// @ts-nocheck

import * as THREE from 'three'
import { GLTFLoader, DRACOLoader, KTX2Loader } from 'three-stdlib'
import { LoadedModel } from '../useViewer'
import { detectMissingTextures, storeMissingTextures } from './missingTextureDetection'
import { registerBlobUrl, revokeBlobUrl } from './blobUrlRegistry'

let dracoLoader: DRACOLoader | null = null
let ktx2Loader: KTX2Loader | null = null
let activeGltfBlobUrls = new Map<File, string>()

function revokeGltfBlobUrls(): void {
  for (const url of activeGltfBlobUrls.values()) {
    revokeBlobUrl(url)
  }
  activeGltfBlobUrls.clear()
}

function getOrCreateGltfBlobUrl(file: File): string {
  if (!activeGltfBlobUrls.has(file)) {
    const url = URL.createObjectURL(file)
    activeGltfBlobUrls.set(file, url)
    registerBlobUrl(url)
  }
  return activeGltfBlobUrls.get(file)!
}

/**
 * Process GPU instancing from GLTF files (EXT_mesh_gpu_instancing)
 * Based on Three.js example: https://threejs.org/examples/#webgl_loader_gltf_instancing
 * Converts meshes with instance attributes to InstancedMesh for efficient rendering
 */
function processInstancing(scene: THREE.Object3D) {
  const meshesToReplace: Array<{ original: THREE.Mesh; instanced: THREE.InstancedMesh }> = []
  
  scene.traverse((node) => {
    // Skip if already an InstancedMesh (GLTFLoader may have already converted it)
    if (node instanceof THREE.InstancedMesh) {
      // Ensure it has proper metadata
      node.userData.isModel = true
      node.userData.isImportedModel = true
      node.userData.excludeFromSkyModifications = true
      node.userData.excludeFromWeatherModifications = true
      node.userData.isInstanced = true
      if (!node.userData.instanceCount) {
        node.userData.instanceCount = node.count
      }
      return
    }
    
    if (node instanceof THREE.Mesh && node.geometry) {
      const geometry = node.geometry
      
      // Check if geometry has instance matrix attribute (EXT_mesh_gpu_instancing)
      // This handles cases where GLTFLoader didn't auto-convert to InstancedMesh
      if (geometry.attributes.instanceMatrix) {
        const instanceMatrix = geometry.attributes.instanceMatrix
        const instanceCount = instanceMatrix.count
        
        if (instanceCount > 0) {
          // Create InstancedMesh with the same geometry and material
          const material = node.material
          const materials = Array.isArray(material) ? material : [material]
          
          // Create instanced mesh for each material
          if (materials.length === 1) {
            // Single material - create one InstancedMesh
            const instancedMesh = new THREE.InstancedMesh(
              geometry,
              materials[0],
              instanceCount
            )
            
            // Copy instance matrices
            const matrix = new THREE.Matrix4()
            for (let i = 0; i < instanceCount; i++) {
              matrix.fromArray(instanceMatrix.array, i * 16)
              instancedMesh.setMatrixAt(i, matrix)
            }
            
            // Copy instance attributes if present
            if (geometry.attributes.instanceColor) {
              const instanceColor = geometry.attributes.instanceColor
              for (let i = 0; i < instanceCount; i++) {
                const color = new THREE.Color()
                color.fromArray(instanceColor.array, i * 3)
                instancedMesh.setColorAt(i, color)
              }
            }
            
            // Copy all other instance attributes
            Object.keys(geometry.attributes).forEach((key) => {
              if (key.startsWith('instance') && key !== 'instanceMatrix' && key !== 'instanceColor') {
                const attr = geometry.attributes[key]
                if (attr && attr.count === instanceCount) {
                  // InstancedMesh will handle these automatically if they're in the geometry
                  // The attribute is already in the geometry, so it should work
                }
              }
            })
            
            // Copy userData and properties from original mesh
            instancedMesh.userData = { ...node.userData }
            instancedMesh.name = node.name
            instancedMesh.position.copy(node.position)
            instancedMesh.rotation.copy(node.rotation)
            instancedMesh.scale.copy(node.scale)
            instancedMesh.visible = node.visible
            instancedMesh.castShadow = node.castShadow
            instancedMesh.receiveShadow = node.receiveShadow
            instancedMesh.frustumCulled = node.frustumCulled
            
            // Mark as instanced and model
            instancedMesh.userData.isModel = true
            instancedMesh.userData.isImportedModel = true
            instancedMesh.userData.excludeFromSkyModifications = true
            instancedMesh.userData.excludeFromWeatherModifications = true
            instancedMesh.userData.isInstanced = true
            instancedMesh.userData.instanceCount = instanceCount
            
            // Store for replacement (replace after traversal to avoid modifying during traversal)
            meshesToReplace.push({ original: node, instanced: instancedMesh })
          } else {
            // Multiple materials - create InstancedMesh for each material
            console.warn('⚠️ Instanced mesh with multiple materials detected. Creating separate InstancedMesh for each material.')
            
            materials.forEach((mat, matIndex) => {
              const instancedMesh = new THREE.InstancedMesh(
                geometry,
                mat,
                instanceCount
              )
              
              // Copy instance matrices
              const matrix = new THREE.Matrix4()
              for (let i = 0; i < instanceCount; i++) {
                matrix.fromArray(instanceMatrix.array, i * 16)
                instancedMesh.setMatrixAt(i, matrix)
              }
              
              // Copy instance attributes
              if (geometry.attributes.instanceColor) {
                const instanceColor = geometry.attributes.instanceColor
                for (let i = 0; i < instanceCount; i++) {
                  const color = new THREE.Color()
                  color.fromArray(instanceColor.array, i * 3)
                  instancedMesh.setColorAt(i, color)
                }
              }
              
              // Copy properties
              instancedMesh.userData = { ...node.userData }
              instancedMesh.name = `${node.name}_material_${matIndex}`
              instancedMesh.position.copy(node.position)
              instancedMesh.rotation.copy(node.rotation)
              instancedMesh.scale.copy(node.scale)
              instancedMesh.visible = node.visible
              instancedMesh.castShadow = node.castShadow
              instancedMesh.receiveShadow = node.receiveShadow
              instancedMesh.frustumCulled = node.frustumCulled
              
              instancedMesh.userData.isModel = true
              instancedMesh.userData.isImportedModel = true
              instancedMesh.userData.excludeFromSkyModifications = true
              instancedMesh.userData.excludeFromWeatherModifications = true
              instancedMesh.userData.isInstanced = true
              instancedMesh.userData.instanceCount = instanceCount
              
              // Add to parent (will be added after traversal)
              if (node.parent) {
                node.parent.add(instancedMesh)
              } else {
                scene.add(instancedMesh)
              }
            })
            
            // Mark original for removal
            meshesToReplace.push({ original: node, instanced: null as any })
          }
        }
      }
    }
  })
  
  // Replace original meshes with instanced versions
  meshesToReplace.forEach(({ original, instanced }) => {
    if (instanced && original.parent) {
      original.parent.add(instanced)
      original.parent.remove(original)
      console.log(`✅ Converted instanced mesh: ${original.name || 'unnamed'} (${instanced.count} instances)`)
    } else if (!instanced && original.parent) {
      // Multiple materials case - remove original
      original.parent.remove(original)
    }
  })
  
  if (meshesToReplace.length > 0) {
    console.log(`✅ Processed ${meshesToReplace.length} instanced mesh(es) from GLTF`)
  }
}

/**
 * Apply chromatic dispersion to glass materials
 * Based on Three.js dispersion example: https://threejs.org/examples/#webgl_loader_gltf_dispersion
 * Creates realistic rainbow refraction effect in glass
 */
export function applyDispersionToMaterial(material: THREE.MeshPhysicalMaterial, dispersionValue: number = 0.02) {
  // Only apply to materials with transmission
  if (!material.transmission || material.transmission <= 0) {
    console.warn('[Dispersion] Skipping dispersion - material has no transmission')
    return
  }
  
  // Store original onBeforeCompile if it exists
  const originalOnBeforeCompile = material.onBeforeCompile
  
  material.onBeforeCompile = (shader: THREE.Shader) => {
    try {
      // Call original onBeforeCompile if it exists
      if (originalOnBeforeCompile) {
        originalOnBeforeCompile(shader)
      }
      
      // Add dispersion uniform
      const dispersion = material.userData.dispersionValue ?? dispersionValue
      shader.uniforms.dispersion = { value: dispersion }
      
      // Inject dispersion uniform declaration
      if (shader.fragmentShader.includes('#include <common>')) {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <common>',
          `
          #include <common>
          uniform float dispersion;
          `
        )
      }
      
      // Modify the output color to add dispersion effect
      // Try multiple hook points for compatibility
      const hookPoints = [
        '#include <output_fragment>',
        '#include <dithering_fragment>',
        '#include <premultiplied_alpha_fragment>'
      ]
      
      let hookApplied = false
      for (const hookPoint of hookPoints) {
        if (shader.fragmentShader.includes(hookPoint)) {
          shader.fragmentShader = shader.fragmentShader.replace(
            hookPoint,
            `
            ${hookPoint}
            
            // Enhanced transmission with dispersion for glass materials
            #ifdef USE_TRANSMISSION
              #ifdef USE_ENVMAP
                #ifdef ENVMAP_TYPE_CUBE
                  // Apply chromatic dispersion to transmission color
                  if (material.transmission > 0.0 && dispersion > 0.0) {
                    vec3 viewDir = normalize(vViewPosition);
                    vec3 normal = normalize(vNormal);
                    float materialIOR = material.ior;
                    
                    // Different IOR for each wavelength (red bends less, blue bends more)
                    float iorR = materialIOR - dispersion;
                    float iorG = materialIOR;
                    float iorB = materialIOR + dispersion;
                    
                    // Calculate refracted directions for each wavelength
                    vec3 refractedR = refract(-viewDir, normal, 1.0 / iorR);
                    vec3 refractedG = refract(-viewDir, normal, 1.0 / iorG);
                    vec3 refractedB = refract(-viewDir, normal, 1.0 / iorB);
                    
                    // Transform to world space for environment map lookup
                    vec3 envDirR = inverseTransformDirection(refractedR, viewMatrix);
                    vec3 envDirG = inverseTransformDirection(refractedG, viewMatrix);
                    vec3 envDirB = inverseTransformDirection(refractedB, viewMatrix);
                    
                    // Sample environment map at different wavelengths
                    vec4 envSampleR = textureCube(envMap, envDirR);
                    vec4 envSampleG = textureCube(envMap, envDirG);
                    vec4 envSampleB = textureCube(envMap, envDirB);
                    
                    // Combine RGB channels with chromatic separation
                    vec3 dispersedEnvColor = vec3(envSampleR.r, envSampleG.g, envSampleB.b);
                    
                    // Apply dispersed color to transmission (modify the output color)
                    float dispersionStrength = clamp(dispersion * 10.0, 0.0, 1.0);
                    gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * dispersedEnvColor, material.transmission * dispersionStrength);
                  }
                #endif
              #endif
            #endif
            `
          )
          hookApplied = true
          break
        }
      }
      
      // If no hook point found, add at the end of main function
      if (!hookApplied) {
        // Find the end of main function and add dispersion code before the closing brace
        const mainMatch = shader.fragmentShader.match(/void\s+main\s*\([^)]*\)\s*\{[\s\S]*\}/)
        if (mainMatch) {
          shader.fragmentShader = shader.fragmentShader.replace(
            /(\}\s*$)/,
            `
            // Enhanced transmission with dispersion
            #ifdef USE_TRANSMISSION
              #ifdef USE_ENVMAP
                #ifdef ENVMAP_TYPE_CUBE
                  if (material.transmission > 0.0 && dispersion > 0.0) {
                    vec3 viewDir = normalize(vViewPosition);
                    vec3 normal = normalize(vNormal);
                    float materialIOR = material.ior;
                    float iorR = materialIOR - dispersion;
                    float iorG = materialIOR;
                    float iorB = materialIOR + dispersion;
                    vec3 refractedR = refract(-viewDir, normal, 1.0 / iorR);
                    vec3 refractedG = refract(-viewDir, normal, 1.0 / iorG);
                    vec3 refractedB = refract(-viewDir, normal, 1.0 / iorB);
                    vec3 envDirR = inverseTransformDirection(refractedR, viewMatrix);
                    vec3 envDirG = inverseTransformDirection(refractedG, viewMatrix);
                    vec3 envDirB = inverseTransformDirection(refractedB, viewMatrix);
                    vec4 envSampleR = textureCube(envMap, envDirR);
                    vec4 envSampleG = textureCube(envMap, envDirG);
                    vec4 envSampleB = textureCube(envMap, envDirB);
                    vec3 dispersedEnvColor = vec3(envSampleR.r, envSampleG.g, envSampleB.b);
                    float dispersionStrength = clamp(dispersion * 10.0, 0.0, 1.0);
                    gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * dispersedEnvColor, material.transmission * dispersionStrength);
                  }
                #endif
              #endif
            #endif
            $1
            `
          )
        }
      }
    } catch (error) {
      console.error('[Dispersion] Error applying dispersion shader:', error)
      // Restore original onBeforeCompile on error
      material.onBeforeCompile = originalOnBeforeCompile
      material.userData.dispersionApplied = false
      material.userData.dispersionError = true
    }
  }
}

// Initialize DRACO loader
async function initDRACO() {
  if (dracoLoader) return dracoLoader
  
  try {
    dracoLoader = new DRACOLoader()
    dracoLoader.setDecoderPath('/draco/gltf/')
    return dracoLoader
  } catch (e) {
    console.warn('DRACO loader initialization failed:', e)
    return null
  }
}

// Initialize KTX2 loader
async function initKTX2() {
  if (ktx2Loader) return ktx2Loader
  
  try {
    ktx2Loader = new KTX2Loader()
    ktx2Loader.setTranscoderPath('/basis/')
    const renderer = new THREE.WebGLRenderer()
    ktx2Loader.detectSupport(renderer)
    renderer.dispose()
    return ktx2Loader
  } catch (e) {
    console.warn('KTX2 loader initialization failed:', e)
    return null
  }
}

export async function loadGLTF(
  data: File | ArrayBuffer | string,
  baseUrl?: string,
  onProgress?: (progress: number) => void,
  textureFiles?: Map<string, File>,
  mergedTextures?: Map<string, string> // Map<textureNameToMerge, canonicalTextureName>
): Promise<LoadedModel> {
  const loader = new GLTFLoader()

  // Configure DRACO loader
  const draco = await initDRACO()
  if (draco) {
    loader.setDRACOLoader(draco)
  }

  // Configure KTX2 loader
  const ktx2 = await initKTX2()
  if (ktx2) {
    loader.setKTX2Loader(ktx2)
  }

  // Set up texture loading manager
  // Track if we set a URL modifier so we can clear it after loading
  let urlModifierSet = false
  
  if (textureFiles && textureFiles.size > 0 || mergedTextures && mergedTextures.size > 0) {
    revokeGltfBlobUrls()
    urlModifierSet = true
    
    THREE.DefaultLoadingManager.setURLModifier((url) => {
    // Store original URL for missing texture detection
    const originalUrl = url
    
    // Handle file:// URLs - extract the path portion
    let cleanUrl = url
    if (url.startsWith('file://')) {
      // Extract path from file:// URL
      try {
        const urlObj = new URL(url)
        cleanUrl = urlObj.pathname || url.replace(/^file:\/\/+/, '')
        // Remove leading slash on Windows (file:///D:/path -> D:/path)
        if (cleanUrl.startsWith('/') && /^[A-Za-z]:/.test(cleanUrl.substring(1))) {
          cleanUrl = cleanUrl.substring(1)
        }
      } catch (e) {
        // If URL parsing fails, try to extract path manually
        cleanUrl = url.replace(/^file:\/\/+/, '').replace(/^\/+/, '')
      }
    }
    
    // Remove blob: prefix if present
    cleanUrl = cleanUrl.replace(/^blob:[^/]+/, '')
    // Remove leading slashes and ./
    cleanUrl = cleanUrl.replace(/^[/\\]+/, '').replace(/^\.\//, '')
    // Normalize path separators
    cleanUrl = cleanUrl.replace(/\\/g, '/')
    
    // Extract just the filename/path relative to base
    // If baseUrl was "source/", and URL is "source/images/file.jpg", extract "images/file.jpg"
    if (baseUrl && cleanUrl.startsWith(baseUrl)) {
      cleanUrl = cleanUrl.substring(baseUrl.length)
    }
    
    const urlLower = cleanUrl.toLowerCase()
    const fileName = cleanUrl.split('/').pop() || cleanUrl
    const fileNameLower = fileName.toLowerCase()
    
    // Apply texture merges: ONLY if this texture is from the current model being loaded
    // This prevents affecting textures from already-loaded models (like the car)
    // First, check if this texture request is from the current model by checking if it matches textureFiles
    let isFromCurrentModel = false
    if (textureFiles && textureFiles.size > 0) {
      // Check if this URL matches any texture file path from the current model
      for (const [path, file] of textureFiles.entries()) {
        const pathFileName = path.split(/[/\\]/).pop()?.toLowerCase()
        const pathNormalized = path.toLowerCase().replace(/\\/g, '/')
        const cleanUrlLower = cleanUrl.toLowerCase()
        
        // Match by filename, path, or if the texture file path contains the requested URL
        if (fileNameLower === pathFileName || 
            cleanUrlLower.includes(pathFileName) ||
            cleanUrlLower.includes(pathNormalized) ||
            pathNormalized.includes(fileNameLower) ||
            pathNormalized.includes(cleanUrlLower)) {
          isFromCurrentModel = true
          break
        }
      }
    }
    
    // Only apply texture merges if this texture is from the current model
    // If it's not from current model, skip merge logic but continue with normal texture loading
    if (mergedTextures && mergedTextures.size > 0 && isFromCurrentModel) {
      // Check if this texture name matches any texture that should be merged
      for (const [toMerge, canonical] of mergedTextures.entries()) {
        // Match by filename or full path
        const toMergeLower = toMerge.toLowerCase()
        const canonicalLower = canonical.toLowerCase()
        
        if (fileNameLower === toMergeLower || cleanUrl.toLowerCase().includes(toMergeLower)) {
          // This texture should be merged - redirect to canonical texture
          console.log(`🔄 Merging texture (current model only): "${fileName}" -> "${canonical}"`)
          
          // Find the canonical texture file
          if (textureFiles) {
            for (const [path, file] of textureFiles.entries()) {
              const pathFileName = path.split(/[/\\]/).pop()?.toLowerCase()
              if (pathFileName === canonicalLower || path.toLowerCase().includes(canonicalLower)) {
                return getOrCreateGltfBlobUrl(file)
              }
            }
          }
        }
      }
    }
    
    // If texture is NOT from current model, return original URL immediately
    // This prevents affecting textures from already-loaded models (like the car)
    if (!isFromCurrentModel) {
      return url
    }
    
    // If texture is from current model but not being merged, continue with normal texture file matching below
    // Try to match texture files (only if textureFiles are provided)
    if (textureFiles && textureFiles.size > 0) {
      // Helper: Normalize a path by removing common prefixes
      const normalizePath = (path: string): string => {
        let normalized = path.toLowerCase().replace(/\\/g, '/')
        // Remove leading slashes
        normalized = normalized.replace(/^[/]+/, '')
        // If baseUrl exists and path starts with it, remove it
        if (baseUrl) {
          const baseLower = baseUrl.toLowerCase().replace(/\\/g, '/').replace(/^[/]+/, '')
          if (normalized.startsWith(baseLower)) {
            normalized = normalized.substring(baseLower.length).replace(/^[/]+/, '')
          }
        }
        return normalized
      }
      
      const targetNormalized = normalizePath(cleanUrl)
      
      // Strategy 1: Try exact path match (case-insensitive, with and without base prefix)
      for (const [path, file] of textureFiles.entries()) {
        const normalizedPath = normalizePath(path)
        
        // Exact match
        if (normalizedPath === targetNormalized) {
          return getOrCreateGltfBlobUrl(file)
        }
        
        // Match if path ends with target (handles "FolderName/images/file.jpg" vs "images/file.jpg")
        if (normalizedPath.endsWith('/' + targetNormalized) || normalizedPath === targetNormalized) {
          return getOrCreateGltfBlobUrl(file)
        }
        
        // Match if target ends with path component (handles "images/file.jpg" in "folder/images/file.jpg")
        const pathParts = normalizedPath.split('/')
        if (pathParts.length > 0 && targetNormalized.includes(pathParts[pathParts.length - 1])) {
          const lastPart = pathParts[pathParts.length - 1]
          if (targetNormalized.endsWith(lastPart) || targetNormalized.includes('/' + lastPart)) {
            return getOrCreateGltfBlobUrl(file)
          }
        }
      }
      
      // Strategy 2: Try filename-only match (most permissive)
      for (const [path, file] of textureFiles.entries()) {
        const pathFileName = path.split(/[/\\]/).pop()?.toLowerCase()
        if (pathFileName && pathFileName === fileNameLower) {
          return getOrCreateGltfBlobUrl(file)
        }
      }
      
      // Strategy 3: Try suffix match (target path is a suffix of stored path)
      // e.g., "images/file.jpg" matches "SomeFolder/images/file.jpg"
      for (const [path, file] of textureFiles.entries()) {
        const normalizedPath = normalizePath(path)
        
        // Check if stored path ends with target path
        if (normalizedPath.endsWith('/' + targetNormalized) || normalizedPath.endsWith(targetNormalized)) {
          return getOrCreateGltfBlobUrl(file)
        }
        
        // Check if target path is contained in stored path (with proper boundaries)
        const searchPath = '/' + targetNormalized
        const index = normalizedPath.indexOf(searchPath)
        if (index >= 0) {
          const afterMatch = index + searchPath.length
          // Match is at the end, or followed by end of string or a slash
          if (afterMatch === normalizedPath.length || normalizedPath[afterMatch] === '/') {
            return getOrCreateGltfBlobUrl(file)
          }
        }
      }
      
      // If no match found, log warning and store original URL for missing texture detection
      console.warn(`⚠ Resource not found in provided files: "${cleanUrl}"`)
      
      // Store original URL in a global map for missing texture detection
      if (!(window as any).__missingTextureUrls) {
        ;(window as any).__missingTextureUrls = new Map()
      }
      ;(window as any).__missingTextureUrls.set(cleanUrl, originalUrl)
      
      // If no match found, return original URL (loader will try to fetch it normally)
      return url
    } else {
      // No textureFiles provided - return original URL for normal loading
      // This handles embedded textures in GLB files or external URLs
      return url
    }
    })
  }

  // Track failed texture loads
  const failedTextureUrls = new Set<string>()
  const originalOnError = THREE.DefaultLoadingManager.onError
  THREE.DefaultLoadingManager.onError = (url: string) => {
    failedTextureUrls.add(url)
    if (originalOnError) {
      originalOnError(url)
    }
  }

  return new Promise((resolve, reject) => {
    const onLoad = (gltf: any) => {
      const scene = gltf.scene
      // Industry-standard: Mark imported models with exclusion flags to prevent sky/environmental effects from modifying them
      scene.userData.isModel = true
      scene.userData.excludeFromSkyModifications = true
      scene.userData.excludeFromWeatherModifications = true
      
      // Process GPU instancing (EXT_mesh_gpu_instancing)
      // Based on: https://threejs.org/examples/#webgl_loader_gltf_instancing
      processInstancing(scene)
      
      // Recursively tag all children with exclusion flags
      // Industry-standard: Disable fog and other sky textures on imported models
      // Only lighting dynamics should affect imported objects, not visual textures
      scene.traverse((child) => {
        child.userData.isImportedModel = true
        child.userData.excludeFromSkyModifications = true
        child.userData.excludeFromWeatherModifications = true
        
        // Disable fog on imported models - fog should only affect lighting, not visual appearance
        // Industry-standard: Apply depth masking to prevent background from showing through
        if (child instanceof THREE.Mesh && child.material) {
          const materials = Array.isArray(child.material) ? child.material : [child.material]
          materials.forEach((mat: THREE.Material) => {
            mat.fog = false // Fog only affects lighting, not imported object textures
            
            // Industry-standard depth masking: Ensure imported models occlude background/sky
            mat.depthTest = true // Enable depth testing
            mat.depthWrite = true // Enable depth writing to create depth mask
            
            // Enhanced material processing for quality improvements
            if (mat instanceof THREE.MeshStandardMaterial || 
                mat instanceof THREE.MeshPhysicalMaterial ||
                mat instanceof THREE.MeshPhongMaterial ||
                mat instanceof THREE.MeshLambertMaterial ||
                mat instanceof THREE.MeshBasicMaterial) {
              
              const hasAlphaMap = mat.alphaMap !== undefined && mat.alphaMap !== null
              
              // Make fully opaque if no alpha map and opacity is near 1.0
              if (!hasAlphaMap && mat.opacity !== undefined && mat.opacity > 0.99) {
                mat.opacity = 1.0
                mat.transparent = false
              } else if (!hasAlphaMap && mat.opacity === undefined) {
                mat.opacity = 1.0
                mat.transparent = false
              } else if (hasAlphaMap) {
                // Use alpha testing for better depth masking with alpha textures
                if (mat.alphaTest === undefined || mat.alphaTest === 0) {
                  mat.alphaTest = 0.1
                }
                // CRITICAL: Only set depthWrite = true if material is NOT transparent
                // Transparent materials (glass/windows) need depthWrite = false to allow shadows through
                // Check if material is transparent OR has been configured for transparent shadow passing
                // IMPROVED: Respect the transparentShadowConfigured marker to prevent overriding transparent materials
                const transmission = (mat as any).transmission ?? 0
                const opacity = mat.opacity ?? 1
                const isTransparent = mat.transparent === true || opacity < 1.0 || transmission > 0
                const wasConfiguredTransparent = (mat as any).userData?.transparentShadowConfigured === true
                
                // Only set depthWrite = true for opaque materials with alpha maps
                // Transparent materials will be handled by useViewer.ts transparent material detection
                if (!isTransparent && !wasConfiguredTransparent) {
                  mat.depthWrite = true // Still write depth for opaque materials with alpha maps
                }
              }
              
              // Enhanced: Mark glass materials for potential dispersion (but don't auto-apply)
              // Users can enable dispersion manually in the Material Panel
              // Based on Three.js dispersion example: https://threejs.org/examples/#webgl_loader_gltf_dispersion
              if (mat instanceof THREE.MeshPhysicalMaterial) {
                const transmission = (mat as any).transmission ?? 0
                const ior = (mat as any).ior ?? 1.5
                
                // Detect glass materials (high transmission, low roughness, reasonable IOR)
                const isGlass = transmission > 0.5 && mat.roughness < 0.3 && ior >= 1.0 && ior <= 2.5
                
                if (isGlass && !mat.userData.dispersionApplied) {
                  // Mark as glass material but don't auto-apply dispersion
                  // Dispersion can be enabled manually via Material Panel to avoid shader errors
                  mat.userData.isGlass = true
                  mat.userData.dispersionValue = 0.02 // Default dispersion value (not applied yet)
                  // Note: Dispersion is only applied when user explicitly enables it in Material Panel
                  
                  // Auto-optimize glass materials with physical transmission best practices
                  // Based on Three.js physical transmission example: https://threejs.org/examples/#webgl_materials_physical_transmission
                  try {
                    // Use dynamic import with .then() since we're not in an async function
                    import('../../utils/physicalTransmission').then(({ optimizeGlassMaterial }) => {
                      const mesh = child instanceof THREE.Mesh ? child : null
                      optimizeGlassMaterial(mat, {
                        geometry: mesh?.geometry,
                        autoDetectIOR: true, // Auto-detect IOR from material name
                        envMapIntensity: 1.5 // Enhanced reflections for glass
                      })
                    }).catch((error) => {
                      // Silently fail if utility not available (not critical)
                      console.debug('[GLTFLoader] Could not optimize glass material:', error)
                    })
                  } catch (error) {
                    // Silently fail if utility not available (not critical)
                    console.debug('[GLTFLoader] Could not optimize glass material:', error)
                  }
                }
              }
            }
            
            mat.needsUpdate = true
          })
        }
        
        // CRITICAL: Ensure smooth shading for car surfaces and all models
        // Compute vertex normals if geometry doesn't have them or if they're invalid
        if (child instanceof THREE.Mesh && child.geometry) {
          const geometry = child.geometry
          
          // Check if geometry has normals
          if (!geometry.attributes.normal || geometry.attributes.normal.count === 0) {
            // No normals - compute them for smooth shading
            geometry.computeVertexNormals()
            console.log(`[GLTFLoader] Computed vertex normals for mesh: ${child.name || 'unnamed'}`)
          } else {
            // Normals exist - ensure they're valid (not all zeros)
            const normals = geometry.attributes.normal.array as Float32Array
            let hasValidNormals = false
            for (let i = 0; i < normals.length; i += 3) {
              const len = Math.sqrt(normals[i] ** 2 + normals[i + 1] ** 2 + normals[i + 2] ** 2)
              if (len > 0.1) {
                hasValidNormals = true
                break
              }
            }
            if (!hasValidNormals) {
              // Normals are invalid (all zeros or too small) - recompute
              geometry.computeVertexNormals()
              console.log(`[GLTFLoader] Recomputed invalid vertex normals for mesh: ${child.name || 'unnamed'}`)
            }
          }
          
          // Ensure normals are marked for update
          geometry.attributes.normal.needsUpdate = true
        }
      })
      
      // CRITICAL: Ensure all materials have flatShading disabled for smooth surfaces
      scene.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material) {
          const materials = Array.isArray(child.material) ? child.material : [child.material]
          materials.forEach((mat: THREE.Material) => {
            // Disable flat shading to ensure smooth surfaces
            if ('flatShading' in mat && mat.flatShading === true) {
              mat.flatShading = false
              mat.needsUpdate = true
              console.log(`[GLTFLoader] Disabled flatShading for smooth surfaces on material: ${mat.name || 'unnamed'}`)
            }
          })
        }
      })
      
      // Attach animations to scene for easy access
      ;(scene as any).animations = gltf.animations || []
      
      // Texture deduplication is currently DISABLED due to issues with incorrect merging
      // It was causing different textures to be merged incorrectly
      // TODO: Re-enable with better comparison logic (e.g., pixel-level comparison or UUID matching)
      // import('../../utils/textureDeduplication').then(({ deduplicateTextures }) => {
      //   try {
      //     const stats = deduplicateTextures(scene)
      //     if (stats.texturesMerged > 0 || stats.materialsMerged > 0) {
      //       const memoryMB = (stats.memorySaved / 1024 / 1024).toFixed(2)
      //       console.log(`✅ Texture deduplication: Merged ${stats.texturesMerged} duplicate texture(s) and ${stats.materialsMerged} material(s), saved ~${memoryMB} MB`)
      //     }
      //   } catch (error) {
      //     console.warn('⚠️ Could not deduplicate textures:', error)
      //   }
      // }).catch((error) => {
      //   console.warn('⚠️ Could not load texture deduplication module:', error)
      // })
      
      // CRITICAL: Clear URL modifier after loading to prevent affecting other models
      if (urlModifierSet) {
        THREE.DefaultLoadingManager.setURLModifier(null)
        console.log('[GLTFLoader] ✅ Cleared URL modifier after model load to prevent affecting other models')
      }
      
      // Restore original error handler
      THREE.DefaultLoadingManager.onError = originalOnError
      
      // Check for missing textures using shared utility
      let missingTextures = detectMissingTextures(scene, textureFiles)
      
      // Update missing texture paths from failed texture URLs
      if (failedTextureUrls.size > 0) {
        failedTextureUrls.forEach(failedUrl => {
          // Try to find matching missing texture and update its path
          const missingTex = missingTextures.find(t => {
            const texPathLower = t.path.toLowerCase()
            const failedUrlLower = failedUrl.toLowerCase()
            const failedFileName = failedUrlLower.split('/').pop() || ''
            const texFileName = texPathLower.split('/').pop() || ''
            return texPathLower.includes(failedFileName) ||
                   failedUrlLower.includes(texFileName) ||
                   texFileName === failedFileName
          })
          if (missingTex) {
            missingTex.path = failedUrl
          }
        })
      }
      
      // Store missing textures in scene userData
      storeMissingTextures(scene, missingTextures)
      
      resolve({
        scene,
        animations: gltf.animations || [],
        userData: {
          format: 'gltf',
          ...gltf.userData
        }
      })
    }

    const onError = (error: ErrorEvent) => {
      // CRITICAL: Clear URL modifier even on error to prevent affecting other models
      if (urlModifierSet) {
        THREE.DefaultLoadingManager.setURLModifier(null)
        console.log('[GLTFLoader] ✅ Cleared URL modifier after load error to prevent affecting other models')
      }
      
      // Restore original error handler
      THREE.DefaultLoadingManager.onError = originalOnError
      
      reject(new Error(`Failed to load GLTF: ${error.message}`))
    }

    const onProgressCallback = (event: ProgressEvent) => {
      if (onProgress && event.lengthComputable) {
        onProgress((event.loaded / event.total) * 100)
      }
    }

    if (data instanceof File) {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const arrayBuffer = e.target?.result as ArrayBuffer
          // Extract base URL from file name if available
          let fileBaseUrl = baseUrl || ''
          if (data.name && !fileBaseUrl) {
            const lastSlash = data.name.lastIndexOf('/')
            if (lastSlash >= 0) {
              fileBaseUrl = data.name.substring(0, lastSlash + 1)
            }
          }
          
          if (data.name.toLowerCase().endsWith('.glb')) {
            loader.parse(arrayBuffer, fileBaseUrl, onLoad, onError)
          } else {
            const text = new TextDecoder().decode(arrayBuffer)
            loader.parse(text, fileBaseUrl, onLoad, onError)
          }
        } catch (err) {
          reject(new Error(`Failed to parse GLTF: ${err instanceof Error ? err.message : String(err)}`))
        }
      }
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsArrayBuffer(data)
    } else if (data instanceof ArrayBuffer) {
      // Assume GLB if it's binary
      const view = new Uint8Array(data.slice(0, 4))
      if (view[0] === 0x67 && view[1] === 0x6C && view[2] === 0x54 && view[3] === 0x46) {
        loader.parse(data, baseUrl || '', onLoad, onError)
      } else {
        const text = new TextDecoder().decode(data)
        loader.parse(text, baseUrl || '', onLoad, onError)
      }
    } else {
      // String URL or JSON string
      if (data.startsWith('http://') || data.startsWith('https://') || data.startsWith('/')) {
        loader.load(data, onLoad, onProgressCallback, onError)
      } else {
        // JSON string
        loader.parse(data, baseUrl || '', onLoad, onError)
      }
    }
  })
}

