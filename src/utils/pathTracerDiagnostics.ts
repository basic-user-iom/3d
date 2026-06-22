/**
 * Path Tracer Diagnostics
 * 
 * Utility to diagnose why path tracer might fail on large models
 */

import * as THREE from 'three'

export interface PathTracerDiagnosticResult {
  canStart: boolean
  issues: string[]
  warnings: string[]
  sceneStats: {
    totalObjects: number
    totalGeometries: number
    totalVertices: number
    totalTriangles: number
    totalMaterials: number
    totalTextures: number
    meshCount: number
    largestMesh?: {
      name: string
      vertices: number
      triangles: number
    }
  }
  memoryEstimate: {
    geometryBytes: number
    textureBytes: number
    totalBytes: number
    totalMB: number
  }
  recommendations: string[]
}

/**
 * Diagnose a scene before path tracing
 */
export function diagnosePathTracerScene(scene: THREE.Scene): PathTracerDiagnosticResult {
  const issues: string[] = []
  const warnings: string[] = []
  const recommendations: string[] = []

  let totalVertices = 0
  let totalTriangles = 0
  let meshCount = 0
  let largestMesh: { name: string; vertices: number; triangles: number } | undefined

  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  const textures = new Set<THREE.Texture>()

  let estimatedGeometryBytes = 0
  let estimatedTextureBytes = 0

  // Traverse scene and collect statistics
  scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      meshCount++

      const geometry = obj.geometry
      if (geometry && !geometries.has(geometry)) {
        geometries.add(geometry)

        // Count vertices
        const positionAttr = geometry.getAttribute('position')
        if (positionAttr) {
          const vertices = positionAttr.count
          totalVertices += vertices

          // Estimate triangles (assuming indexed or non-indexed geometry)
          let triangles = 0
          if (geometry.index) {
            triangles = geometry.index.count / 3
          } else {
            triangles = vertices / 3
          }
          totalTriangles += triangles

          // Track largest mesh
          if (!largestMesh || vertices > largestMesh.vertices) {
            largestMesh = {
              name: obj.name || 'Unnamed',
              vertices,
              triangles
            }
          }

          // Estimate geometry memory
          // Position: 3 floats per vertex (12 bytes)
          // Normal: 3 floats per vertex (12 bytes)
          // UV: 2 floats per vertex (8 bytes)
          // Index: 1 int per index (4 bytes)
          const bytesPerVertex = 32 // Conservative estimate
          estimatedGeometryBytes += vertices * bytesPerVertex
          if (geometry.index) {
            estimatedGeometryBytes += geometry.index.count * 4
          }
        }
      }

      // Collect materials
      const meshMaterials = Array.isArray(obj.material) ? obj.material : [obj.material]
      meshMaterials.forEach((mat) => {
        if (mat) materials.add(mat)
      })
    }
  })

  // Collect textures from materials
  materials.forEach((material) => {
    const checkTexture = (tex: any) => {
      if (tex instanceof THREE.Texture && !textures.has(tex)) {
        textures.add(tex)

        // Estimate texture memory
        if (tex.image) {
          const width = tex.image.width || 1024
          const height = tex.image.height || 1024
          // Assume RGBA (4 bytes per pixel)
          estimatedTextureBytes += width * height * 4
        }
      }
    }

    // Check common texture properties
    ;['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'envMap'].forEach((prop) => {
      const tex = (material as any)[prop]
      if (tex) checkTexture(tex)
    })
  })

  const totalBytes = estimatedGeometryBytes + estimatedTextureBytes
  const totalMB = totalBytes / (1024 * 1024)

  // Check for issues
  const MAX_VERTICES = 10_000_000 // 10M vertices
  const MAX_TRIANGLES = 5_000_000 // 5M triangles
  const MAX_MEMORY_MB = 2048 // 2GB

  if (totalVertices > MAX_VERTICES) {
    issues.push(`Scene has ${totalVertices.toLocaleString()} vertices (max recommended: ${MAX_VERTICES.toLocaleString()})`)
    recommendations.push('Consider simplifying or decimating the model before path tracing')
  } else if (totalVertices > MAX_VERTICES * 0.5) {
    warnings.push(`Scene has ${totalVertices.toLocaleString()} vertices (approaching limit)`)
  }

  if (totalTriangles > MAX_TRIANGLES) {
    issues.push(`Scene has ${totalTriangles.toLocaleString()} triangles (max recommended: ${MAX_TRIANGLES.toLocaleString()})`)
    recommendations.push('BVH generation may take a long time or fail for very large models')
  } else if (totalTriangles > MAX_TRIANGLES * 0.5) {
    warnings.push(`Scene has ${totalTriangles.toLocaleString()} triangles (approaching limit)`)
    recommendations.push('BVH generation may take 30-60 seconds')
  }

  if (totalMB > MAX_MEMORY_MB) {
    issues.push(`Estimated memory usage: ${totalMB.toFixed(0)}MB (max recommended: ${MAX_MEMORY_MB}MB)`)
    recommendations.push('Path tracer may run out of GPU memory')
  } else if (totalMB > MAX_MEMORY_MB * 0.5) {
    warnings.push(`Estimated memory usage: ${totalMB.toFixed(0)}MB (high)`)
  }

  if (meshCount > 10000) {
    warnings.push(`Scene has ${meshCount.toLocaleString()} meshes (high object count)`)
    recommendations.push('Consider merging static meshes to reduce object count')
  }

  // Overall assessment
  const canStart = issues.length === 0

  return {
    canStart,
    issues,
    warnings,
    sceneStats: {
      totalObjects: scene.children.length,
      totalGeometries: geometries.size,
      totalVertices,
      totalTriangles: Math.floor(totalTriangles),
      totalMaterials: materials.size,
      totalTextures: textures.size,
      meshCount,
      largestMesh
    },
    memoryEstimate: {
      geometryBytes: estimatedGeometryBytes,
      textureBytes: estimatedTextureBytes,
      totalBytes,
      totalMB
    },
    recommendations
  }
}

/**
 * Format diagnostic result as a readable string
 */
export function formatDiagnosticResult(result: PathTracerDiagnosticResult): string {
  const lines: string[] = []

  lines.push('=== PATH TRACER DIAGNOSTICS ===\n')

  lines.push('Scene Statistics:')
  lines.push(`  Total Objects: ${result.sceneStats.totalObjects}`)
  lines.push(`  Meshes: ${result.sceneStats.meshCount.toLocaleString()}`)
  lines.push(`  Unique Geometries: ${result.sceneStats.totalGeometries.toLocaleString()}`)
  lines.push(`  Total Vertices: ${result.sceneStats.totalVertices.toLocaleString()}`)
  lines.push(`  Total Triangles: ${result.sceneStats.totalTriangles.toLocaleString()}`)
  lines.push(`  Materials: ${result.sceneStats.totalMaterials}`)
  lines.push(`  Textures: ${result.sceneStats.totalTextures}`)

  if (result.sceneStats.largestMesh) {
    lines.push(`\nLargest Mesh:`)
    lines.push(`  Name: "${result.sceneStats.largestMesh.name}"`)
    lines.push(`  Vertices: ${result.sceneStats.largestMesh.vertices.toLocaleString()}`)
    lines.push(`  Triangles: ${result.sceneStats.largestMesh.triangles.toLocaleString()}`)
  }

  lines.push(`\nEstimated Memory Usage:`)
  lines.push(`  Geometry: ${(result.memoryEstimate.geometryBytes / (1024 * 1024)).toFixed(1)}MB`)
  lines.push(`  Textures: ${(result.memoryEstimate.textureBytes / (1024 * 1024)).toFixed(1)}MB`)
  lines.push(`  Total: ${result.memoryEstimate.totalMB.toFixed(1)}MB`)

  if (result.issues.length > 0) {
    lines.push(`\n⚠️ ISSUES (${result.issues.length}):`)
    result.issues.forEach((issue) => lines.push(`  - ${issue}`))
  }

  if (result.warnings.length > 0) {
    lines.push(`\n⚠️ WARNINGS (${result.warnings.length}):`)
    result.warnings.forEach((warning) => lines.push(`  - ${warning}`))
  }

  if (result.recommendations.length > 0) {
    lines.push(`\n💡 RECOMMENDATIONS:`)
    result.recommendations.forEach((rec) => lines.push(`  - ${rec}`))
  }

  lines.push(`\n${result.canStart ? '✅ Path tracer can start' : '❌ Path tracer may fail or be very slow'}`)

  return lines.join('\n')
}

/**
 * Expose diagnostics globally for console access
 */
export function exposePathTracerDiagnostics(scene: THREE.Scene) {
  ;(window as any).diagnosePathTracer = () => {
    const result = diagnosePathTracerScene(scene)
    console.log(formatDiagnosticResult(result))
    return result
  }

  console.log('[PathTracerDiagnostics] Diagnostics available: window.diagnosePathTracer()')
  
  // Expose automated test function
  ;(window as any).testPathTracerPresets = async function testPathTracerPresets() {
    console.log('%c🧪 PATH TRACER PRESET TEST', 'color: cyan; font-size: 16px; font-weight: bold')
    console.log('Testing all quality and resolution presets...\n')
    
    const pt = (window as any).__pathTracerDemo
    if (!pt) {
      console.error('❌ Path tracer not initialized! Open Path Tracer panel first.')
      return
    }
    
    const presets = [
      { quality: 'Fast', bounces: 2, resolution: '1080p', scale: 1.0, tiles: 2 },
      { quality: 'Balanced', bounces: 4, resolution: '1080p', scale: 1.0, tiles: 2 },
      { quality: 'High', bounces: 10, resolution: '1080p', scale: 1.0, tiles: 4 },
      { quality: 'Ultra', bounces: 10, resolution: '1080p', scale: 1.0, tiles: 4 },
      { quality: 'Fast', bounces: 2, resolution: '2k', scale: 1.5, tiles: 2 },
      { quality: 'Fast', bounces: 2, resolution: '4k', scale: 2.0, tiles: 2 }
    ]
    
    const results = []
    
    for (const preset of presets) {
      console.log(`\n🧪 Testing: ${preset.quality} / ${preset.resolution} / ${preset.tiles}x${preset.tiles} tiles`)
      
      try {
        // Configure
        if (pt.setBounces) pt.setBounces(preset.bounces)
        if (pt.setTiles) pt.setTiles(preset.tiles)
        if (pt.setResolutionScale) pt.setResolutionScale(preset.scale)
        if (pt.setMaxSamples) pt.setMaxSamples(8) // Quick test
        
        // Start
        if (pt.isRunning && pt.isRunning()) pt.stop()
        if (pt.start) pt.start()
        
        // Wait for completion
        let samples = 0
        for (let i = 0; i < 100; i++) {
          await new Promise(r => setTimeout(r, 100))
          samples = pt.getSampleCount ? pt.getSampleCount() : 0
          if (samples >= 8) break
        }
        
        const success = samples >= 8
        console.log(success ? `  ✅ Completed ${samples} samples` : `  ⚠️ Only ${samples} samples`)
        
        results.push({ ...preset, success, samples })
        
        // Stop
        if (pt.stop) pt.stop()
        await new Promise(r => setTimeout(r, 1000))
        
      } catch (err) {
        console.error(`  ❌ Error:`, err)
        results.push({ ...preset, success: false, error: String(err) })
      }
    }
    
    console.log('\n📊 RESULTS:')
    console.table(results)
    ;(window as any).pathTracerTestResults = results
    console.log('💾 Results saved to: window.pathTracerTestResults')
    
    return results
  }
  
  console.log('[PathTracerDiagnostics] Test function available: window.testPathTracerPresets()')
}

