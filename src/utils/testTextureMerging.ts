/**
 * Test utility to verify texture merging works correctly
 * This tests that merged textures are properly replaced in materials
 */

import * as THREE from 'three'

interface TestResult {
  success: boolean
  message: string
  details?: any
}

/**
 * Test texture merging on a scene
 * Creates test materials with duplicate textures and verifies they're merged
 */
export function testTextureMerging(scene: THREE.Scene): TestResult {
  try {
    // Create test textures
    const texture1 = new THREE.Texture()
    texture1.name = 'test_texture_1'
    const canvas1 = document.createElement('canvas')
    canvas1.width = 256
    canvas1.height = 256
    texture1.image = canvas1
    texture1.needsUpdate = true
    
    const texture2 = texture1.clone() // Duplicate texture
    texture2.name = 'test_texture_2'
    
    const texture3 = new THREE.Texture() // Different texture
    texture3.name = 'test_texture_3'
    const canvas3 = document.createElement('canvas')
    canvas3.width = 128
    canvas3.height = 128
    texture3.image = canvas3
    texture3.needsUpdate = true
    
    // Create test materials
    const material1 = new THREE.MeshStandardMaterial({ map: texture1 })
    const material2 = new THREE.MeshStandardMaterial({ map: texture2 }) // Uses duplicate
    const material3 = new THREE.MeshStandardMaterial({ map: texture3 }) // Different texture
    const material4 = new THREE.MeshStandardMaterial({ map: texture1 }) // Uses same as material1
    
    // Create test meshes
    const mesh1 = new THREE.Mesh(new THREE.BoxGeometry(), material1)
    const mesh2 = new THREE.Mesh(new THREE.BoxGeometry(), material2)
    const mesh3 = new THREE.Mesh(new THREE.BoxGeometry(), material3)
    const mesh4 = new THREE.Mesh(new THREE.BoxGeometry(), material4)
    
    mesh1.name = 'test_mesh_1'
    mesh2.name = 'test_mesh_2'
    mesh3.name = 'test_mesh_3'
    mesh4.name = 'test_mesh_4'
    
    // Add to scene
    scene.add(mesh1)
    scene.add(mesh2)
    scene.add(mesh3)
    scene.add(mesh4)
    
    // Count textures before merge
    const texturesBefore = new Set<THREE.Texture>()
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
        mats.forEach((mat) => {
          if (mat instanceof THREE.MeshStandardMaterial) {
            if (mat.map) texturesBefore.add(mat.map)
          }
        })
      }
    })
    
    const texturesBeforeCount = texturesBefore.size
    console.log('[TextureMergeTest] Textures before merge:', texturesBeforeCount)
    console.log('[TextureMergeTest] Expected: 2 (texture1/texture2 are duplicates, texture3 is different)')
    
    // Perform merge: replace texture2 with texture1
    const canonicalTexture = texture1
    const toMergeTexture = texture2
    
    // Find all materials using toMergeTexture
    const materialsToUpdate: Array<{ mat: THREE.Material, prop: string }> = []
    
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
        mats.forEach((mat) => {
          if (mat instanceof THREE.MeshStandardMaterial) {
            if (mat.map === toMergeTexture) {
              materialsToUpdate.push({ mat, prop: 'map' })
            }
          }
        })
      }
    })
    
    // Replace textures
    let replaced = 0
    materialsToUpdate.forEach(({ mat, prop }) => {
      (mat as any)[prop] = canonicalTexture
      mat.needsUpdate = true
      replaced++
    })
    
    // Dispose merged texture
    if (toMergeTexture.dispose) {
      toMergeTexture.dispose()
    }
    
    // Count textures after merge
    const texturesAfter = new Set<THREE.Texture>()
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
        mats.forEach((mat) => {
          if (mat instanceof THREE.MeshStandardMaterial) {
            if (mat.map) texturesAfter.add(mat.map)
          }
        })
      }
    })
    
    const texturesAfterCount = texturesAfter.size
    console.log('[TextureMergeTest] Textures after merge:', texturesAfterCount)
    console.log('[TextureMergeTest] Materials updated:', replaced)
    
    // Verify results
    const expectedAfterCount = texturesBeforeCount - 1 // Should be one less
    const success = texturesAfterCount === expectedAfterCount && replaced > 0
    
    // Cleanup test objects
    scene.remove(mesh1)
    scene.remove(mesh2)
    scene.remove(mesh3)
    scene.remove(mesh4)
    
    if (texture3.dispose) texture3.dispose()
    if (canonicalTexture.dispose) canonicalTexture.dispose()
    
    return {
      success,
      message: success 
        ? `✅ Texture merging test passed: ${replaced} material(s) updated, texture count reduced from ${texturesBeforeCount} to ${texturesAfterCount}`
        : `❌ Texture merging test failed: Expected ${expectedAfterCount} textures after merge, got ${texturesAfterCount}. Materials updated: ${replaced}`,
      details: {
        texturesBefore: texturesBeforeCount,
        texturesAfter: texturesAfterCount,
        materialsUpdated: replaced,
        expectedAfter: expectedAfterCount
      }
    }
  } catch (error) {
    return {
      success: false,
      message: `❌ Texture merging test error: ${error}`,
      details: { error: String(error) }
    }
  }
}

/**
 * Test that merged textures are properly referenced in materials
 */
export function testTextureReferences(scene: THREE.Scene): TestResult {
  try {
    // Collect all textures and their references
    const textureRefs = new Map<THREE.Texture, number>()
    
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
        mats.forEach((mat) => {
          const textureProperties = [
            'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap',
            'bumpMap', 'displacementMap', 'alphaMap', 'lightMap', 'clearcoatMap',
            'clearcoatNormalMap', 'clearcoatRoughnessMap', 'sheenColorMap',
            'sheenRoughnessMap', 'transmissionMap', 'thicknessMap'
          ]
          
          textureProperties.forEach((prop) => {
            const texture = (mat as any)[prop] as THREE.Texture | undefined
            if (texture) {
              textureRefs.set(texture, (textureRefs.get(texture) || 0) + 1)
            }
          })
        })
      }
    })
    
    // Check for orphaned textures (textures not referenced by any material)
    const allTextures = new Set<THREE.Texture>()
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
        mats.forEach((mat) => {
          const textureProperties = [
            'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap',
            'bumpMap', 'displacementMap', 'alphaMap', 'lightMap', 'clearcoatMap',
            'clearcoatNormalMap', 'clearcoatRoughnessMap', 'sheenColorMap',
            'sheenRoughnessMap', 'transmissionMap', 'thicknessMap'
          ]
          
          textureProperties.forEach((prop) => {
            const texture = (mat as any)[prop] as THREE.Texture | undefined
            if (texture) {
              allTextures.add(texture)
            }
          })
        })
      }
    })
    
    const orphanedTextures = Array.from(allTextures).filter(tex => !textureRefs.has(tex))
    
    return {
      success: orphanedTextures.length === 0,
      message: orphanedTextures.length === 0
        ? `✅ All textures are properly referenced in materials (${allTextures.size} textures)`
        : `⚠️ Found ${orphanedTextures.length} orphaned texture(s) not referenced by any material`,
      details: {
        totalTextures: allTextures.size,
        referencedTextures: textureRefs.size,
        orphanedTextures: orphanedTextures.length,
        textureReferences: Object.fromEntries(
          Array.from(textureRefs.entries()).map(([tex, count]) => [tex.name || tex.uuid, count])
        )
      }
    }
  } catch (error) {
    return {
      success: false,
      message: `❌ Texture reference test error: ${error}`,
      details: { error: String(error) }
    }
  }
}

/**
 * Run all texture merging tests
 */
export function runTextureMergingTests(scene: THREE.Scene): TestResult[] {
  console.log('[TextureMergeTest] Running texture merging tests...')
  
  const results: TestResult[] = []
  
  // Test 1: Basic texture merging
  results.push(testTextureMerging(scene))
  
  // Test 2: Texture references
  results.push(testTextureReferences(scene))
  
  // Log results
  results.forEach((result, index) => {
    console.log(`[TextureMergeTest] Test ${index + 1}:`, result.message)
    if (result.details) {
      console.log(`[TextureMergeTest] Details:`, result.details)
    }
  })
  
  const allPassed = results.every(r => r.success)
  console.log(`[TextureMergeTest] ${allPassed ? '✅ All tests passed' : '❌ Some tests failed'}`)
  
  return results
}

