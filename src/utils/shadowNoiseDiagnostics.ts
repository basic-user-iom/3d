/**
 * Shadow Noise Artifacts Diagnostic Tool
 * Based on Perplexity recommendations for diagnosing persistent shadow acne/white noise
 */

import * as THREE from 'three'
import { useAppStore } from '../store/useAppStore'

export interface NoiseDiagnosticResult {
  category: string
  test: string
  status: 'pass' | 'warning' | 'fail'
  message: string
  recommendation?: string
  value?: any
  expected?: any
}

export interface NoiseDiagnostics {
  timestamp: string
  overallStatus: 'pass' | 'issues'
  results: NoiseDiagnosticResult[]
  summary: {
    total: number
    passed: number
    warnings: number
    failed: number
  }
}

/**
 * Comprehensive diagnostic for shadow noise artifacts
 * Checks all potential causes based on Perplexity recommendations
 */
export function diagnoseShadowNoise(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  lights: THREE.Light[]
): NoiseDiagnostics {
  const results: NoiseDiagnosticResult[] = []
  let passed = 0
  let warnings = 0
  let failed = 0

  const shadowCastingLights = lights.filter(
    (light) =>
      (light instanceof THREE.DirectionalLight ||
        light instanceof THREE.SpotLight ||
        light instanceof THREE.PointLight) &&
      light.castShadow &&
      light.shadow
  ) as (THREE.DirectionalLight | THREE.SpotLight | THREE.PointLight)[]

  // ========================================
  // 1. SHADOW MAP RESOLUTION
  // ========================================
  shadowCastingLights.forEach((light, index) => {
    if (light.shadow) {
      const mapSize = light.shadow.mapSize.width
      const recommendedMin = 2048
      const recommendedOptimal = 4096

      if (mapSize < recommendedMin) {
        results.push({
          category: 'Shadow Map Resolution',
          test: `Light ${index + 1} - Map Size`,
          status: 'fail',
          message: `Shadow map resolution is too low: ${mapSize}px`,
          recommendation: `Increase shadow map size to at least ${recommendedMin}px (optimal: ${recommendedOptimal}px) for better quality`,
          value: mapSize,
          expected: `>= ${recommendedMin}px`
        })
        failed++
      } else if (mapSize < recommendedOptimal) {
        results.push({
          category: 'Shadow Map Resolution',
          test: `Light ${index + 1} - Map Size`,
          status: 'warning',
          message: `Shadow map resolution: ${mapSize}px (optimal: ${recommendedOptimal}px)`,
          recommendation: `Consider increasing to ${recommendedOptimal}px for best quality (may impact performance)`,
          value: mapSize,
          expected: `${recommendedOptimal}px`
        })
        warnings++
      } else {
        results.push({
          category: 'Shadow Map Resolution',
          test: `Light ${index + 1} - Map Size`,
          status: 'pass',
          message: `Shadow map resolution: ${mapSize}px (optimal)`,
          value: mapSize
        })
        passed++
      }
    }
  })

  // ========================================
  // 2. SHADOW BIAS VALUES
  // ========================================
  shadowCastingLights.forEach((light, index) => {
    if (light.shadow) {
      const bias = light.shadow.bias || 0
      const normalBias = light.shadow.normalBias || 0

      // Check bias range (should be negative for directional lights)
      if (bias > -0.00005) {
        results.push({
          category: 'Shadow Bias',
          test: `Light ${index + 1} - Bias Value`,
          status: 'warning',
          message: `Shadow bias may be too small: ${bias.toFixed(6)}`,
          recommendation: 'Increase negative bias (e.g., -0.0002 to -0.0005) to prevent shadow acne',
          value: bias,
          expected: '-0.0002 to -0.0005'
        })
        warnings++
      } else if (bias < -0.001) {
        results.push({
          category: 'Shadow Bias',
          test: `Light ${index + 1} - Bias Value`,
          status: 'warning',
          message: `Shadow bias may be too large: ${bias.toFixed(6)}`,
          recommendation: 'Reduce negative bias to prevent peter panning (shadows floating away)',
          value: bias,
          expected: '-0.0002 to -0.0005'
        })
        warnings++
      } else {
        results.push({
          category: 'Shadow Bias',
          test: `Light ${index + 1} - Bias Value`,
          status: 'pass',
          message: `Shadow bias: ${bias.toFixed(6)} (within recommended range)`,
          value: bias
        })
        passed++
      }

      // Check normal bias
      if (normalBias < 0.02) {
        results.push({
          category: 'Shadow Bias',
          test: `Light ${index + 1} - Normal Bias`,
          status: 'warning',
          message: `Normal bias may be too low: ${normalBias.toFixed(4)}`,
          recommendation: 'Increase normal bias to 0.02-0.05 to prevent artifacts on curved surfaces',
          value: normalBias,
          expected: '0.02 to 0.05'
        })
        warnings++
      } else if (normalBias > 0.5) {
        results.push({
          category: 'Shadow Bias',
          test: `Light ${index + 1} - Normal Bias`,
          status: 'warning',
          message: `Normal bias may be too high: ${normalBias.toFixed(4)}`,
          recommendation: 'Reduce normal bias to prevent peter panning',
          value: normalBias,
          expected: '0.02 to 0.5'
        })
        warnings++
      } else {
        results.push({
          category: 'Shadow Bias',
          test: `Light ${index + 1} - Normal Bias`,
          status: 'pass',
          message: `Normal bias: ${normalBias.toFixed(4)} (within recommended range)`,
          value: normalBias
        })
        passed++
      }
    }
  })

  // ========================================
  // 3. SHADOW FILTERING (PCF/RADIUS)
  // ========================================
  const shadowMapType = renderer.shadowMap.type
  const shadowMapTypeName = getShadowMapTypeName(shadowMapType)

  if (shadowMapType !== THREE.PCFSoftShadowMap) {
    results.push({
      category: 'Shadow Filtering',
      test: 'Shadow Map Type',
      status: 'warning',
      message: `Using ${shadowMapTypeName} instead of PCFSoftShadowMap`,
      recommendation: 'Use PCFSoftShadowMap for better quality and to enable shadow radius (blur)',
      value: shadowMapTypeName,
      expected: 'PCFSoftShadowMap'
    })
    warnings++
  } else {
    results.push({
      category: 'Shadow Filtering',
      test: 'Shadow Map Type',
      status: 'pass',
      message: `Shadow map type: ${shadowMapTypeName} (optimal)`,
      value: shadowMapTypeName
    })
    passed++
  }

  // Check shadow radius (blur)
  shadowCastingLights.forEach((light, index) => {
    if (light.shadow) {
      const radius = light.shadow.radius || 0
      const recommendedMin = 2
      const recommendedOptimal = 3

      if (radius < recommendedMin) {
        results.push({
          category: 'Shadow Filtering',
          test: `Light ${index + 1} - Shadow Radius`,
          status: 'warning',
          message: `Shadow radius (blur) is too low: ${radius}`,
          recommendation: `Increase shadow radius to ${recommendedMin}-${recommendedOptimal} for smoother shadows`,
          value: radius,
          expected: `${recommendedMin}-${recommendedOptimal}`
        })
        warnings++
      } else {
        results.push({
          category: 'Shadow Filtering',
          test: `Light ${index + 1} - Shadow Radius`,
          status: 'pass',
          message: `Shadow radius: ${radius} (good)`,
          value: radius
        })
        passed++
      }
    }
  })

  // ========================================
  // 4. MATERIAL PROPERTIES (ROUGHNESS/METALNESS)
  // ========================================
  const problematicMaterials: Array<{
    object: THREE.Mesh
    material: THREE.Material
    issue: string
    roughness?: number
    metalness?: number
    envMapIntensity?: number
  }> = []
  let materialCount = 0

  scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.material) {
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
      materials.forEach((mat, matIndex) => {
        if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
          materialCount++
          const roughness = mat.roughness ?? 1.0
          const metalness = mat.metalness ?? 0.0
          const envMapIntensity = mat.envMapIntensity ?? 1.0

          // Check for very low roughness + high metalness (can cause bright specular highlights)
          if (roughness < 0.1 && metalness > 0.7) {
            problematicMaterials.push({
              object: obj,
              material: mat,
              issue: `Low roughness (${roughness.toFixed(3)}) + high metalness (${metalness.toFixed(3)})`,
              roughness,
              metalness
            })
          }

          // Check for very high environment map intensity (can cause bright reflections)
          if (envMapIntensity > 2.0) {
            problematicMaterials.push({
              object: obj,
              material: mat,
              issue: `High envMapIntensity (${envMapIntensity.toFixed(2)})`,
              envMapIntensity
            })
          }
        }
      })
    }
  })

  if (problematicMaterials.length > 0) {
    // Log detailed information about problematic materials
    const materialDetails = problematicMaterials.map((pm, idx) => {
      const objName = pm.object.name || `Mesh ${idx + 1}`
      const matName = pm.material.name || 'Unnamed Material'
      return `  ${idx + 1}. ${objName} / ${matName}: ${pm.issue}`
    }).join('\n')

    results.push({
      category: 'Material Properties',
      test: 'Roughness/Metalness/EnvMap Intensity',
      status: 'warning',
      message: `Found ${problematicMaterials.length} material(s) with potentially problematic settings`,
      recommendation: `These materials may cause white speckles:\n${materialDetails}\n\nFix: Increase roughness to >=0.2, reduce metalness to <=0.5, or reduce envMapIntensity to <=2.0`,
      value: `${problematicMaterials.length} issues in ${materialCount} materials`
    })
    warnings++

    // Store problematic materials for auto-fix
    ;(window as any).__problematicMaterials = problematicMaterials
  } else if (materialCount > 0) {
    results.push({
      category: 'Material Properties',
      test: 'Roughness/Metalness/EnvMap Intensity',
      status: 'pass',
      message: `Checked ${materialCount} material(s) - no obvious issues`,
      value: materialCount
    })
    passed++
  }

  // ========================================
  // 5. POST-PROCESSING EFFECTS
  // ========================================
  const postProcessingEnabled = useAppStore.getState().postProcessingEnabled
  const aoEnabled = useAppStore.getState().aoEnabled
  const sssEnabled = useAppStore.getState().sssEnabled

  if (postProcessingEnabled) {
    if (aoEnabled) {
      results.push({
        category: 'Post-Processing',
        test: 'AO Enabled',
        status: 'warning',
        message: 'Ambient Occlusion is enabled',
        recommendation:
          'AO can sometimes cause artifacts. Try disabling AO to see if noise disappears. If it does, adjust AO intensity/radius.',
        value: 'enabled'
      })
      warnings++
    }

    if (sssEnabled) {
      results.push({
        category: 'Post-Processing',
        test: 'SSS Enabled',
        status: 'warning',
        message: 'Subsurface Scattering is enabled',
        recommendation:
          'SSS can cause artifacts on dark surfaces. Try disabling SSS to see if noise disappears. If it does, adjust SSS intensity/samples.',
        value: 'enabled'
      })
      warnings++
    }
  }

  // ========================================
  // 6. SHADOW CAMERA BOUNDS
  // ========================================
  shadowCastingLights.forEach((light, index) => {
    if (light.shadow && light.shadow.camera instanceof THREE.OrthographicCamera) {
      const camera = light.shadow.camera
      const width = camera.right - camera.left
      const height = camera.top - camera.bottom
      const mapSize = light.shadow.mapSize.width

      // Calculate effective resolution (pixels per unit)
      const pixelsPerUnit = mapSize / Math.max(width, height)

      // Recommended: at least 1 pixel per unit for good quality
      if (pixelsPerUnit < 0.5) {
        results.push({
          category: 'Shadow Camera Bounds',
          test: `Light ${index + 1} - Effective Resolution`,
          status: 'fail',
          message: `Shadow camera bounds too large: ${pixelsPerUnit.toFixed(2)} pixels/unit`,
          recommendation:
            'Reduce shadow camera bounds size to increase effective resolution. Tighter bounds = better shadow quality.',
          value: `${pixelsPerUnit.toFixed(2)} px/unit`,
          expected: '>= 1.0 px/unit'
        })
        failed++
      } else if (pixelsPerUnit < 1.0) {
        results.push({
          category: 'Shadow Camera Bounds',
          test: `Light ${index + 1} - Effective Resolution`,
          status: 'warning',
          message: `Shadow camera bounds may be too large: ${pixelsPerUnit.toFixed(2)} pixels/unit`,
          recommendation: 'Consider reducing shadow camera bounds for better quality',
          value: `${pixelsPerUnit.toFixed(2)} px/unit`,
          expected: '>= 1.0 px/unit'
        })
        warnings++
      } else {
        results.push({
          category: 'Shadow Camera Bounds',
          test: `Light ${index + 1} - Effective Resolution`,
          status: 'pass',
          message: `Shadow camera effective resolution: ${pixelsPerUnit.toFixed(2)} px/unit (good)`,
          value: `${pixelsPerUnit.toFixed(2)} px/unit`
        })
        passed++
      }
    }
  })

  // ========================================
  // SUMMARY
  // ========================================
  const overallStatus = failed > 0 || warnings > 0 ? 'issues' : 'pass'

  return {
    timestamp: new Date().toISOString(),
    overallStatus,
    results,
    summary: {
      total: results.length,
      passed,
      warnings,
      failed
    }
  }
}

function getShadowMapTypeName(type: THREE.ShadowMapType): string {
  const names: Record<number, string> = {
    [THREE.BasicShadowMap]: 'BasicShadowMap',
    [THREE.PCFShadowMap]: 'PCFShadowMap',
    [THREE.PCFSoftShadowMap]: 'PCFSoftShadowMap',
    [THREE.VSMShadowMap]: 'VSMShadowMap'
  }
  return names[type] || `Unknown (${type})`
}

