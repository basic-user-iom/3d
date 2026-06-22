import React, { useEffect, useState, useRef } from 'react'
import { useViewer } from '../viewer/useViewer'
import { useAppStore } from '../store/useAppStore'
import { useFloatingPanel } from '../hooks/useFloatingPanel'
import { usePanelStacking } from '../hooks/usePanelStacking'
import * as THREE from 'three'
import './HDRTestPanel.css'

interface HDRTestResult {
  name: string
  passed: boolean
  message: string
  value?: any
}

export default function HDRTestPanel() {
  const { viewer } = useViewer()
  const { 
    hdrEnabled, 
    hdrUrl, 
    hdrIntensity,
    hdrRotationAzimuth,
    hdrRotationElevation,
    hdrBackgroundVisible,
    hdrGroundProjectionEnabled,
    hdrGroundProjectionHeight,
    hdrGroundProjectionRadius,
    setHdrEnabled,
    setHdrFile,
    setHdrIntensity,
    setHdrRotationAzimuth,
    setHdrRotationElevation,
    setHdrBackgroundVisible,
    setHdrGroundProjectionEnabled,
    setHdrGroundProjectionHeight,
    setHdrGroundProjectionRadius
  } = useAppStore()
  
  const [testResults, setTestResults] = useState<HDRTestResult[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  
  // Calculate stacking offset for right-side panels
  const PANEL_WIDTH = 600
  const stackingOffset = usePanelStacking({ panelId: 'hdrTest', anchor: 'right' })
  const { top: panelTop, left: panelLeft, maxHeight, dragging, handleMouseDown } = useFloatingPanel(
    panelRef as React.RefObject<HTMLElement>, 
    { 
      anchor: 'right',
      stackingOffset,
      panelWidth: PANEL_WIDTH,
      panelId: 'hdrTest'
    }
  )

  const runTests = () => {
    if (!viewer) {
      alert('Viewer not initialized')
      return
    }

    setIsRunning(true)
    
    try {
      const results: HDRTestResult[] = []
      const { scene, hdrSystem, environmentMap, pmremEnvMap } = viewer

      // Test 1: HDR System exists
      results.push({
        name: 'HDR System exists',
        passed: hdrSystem !== undefined && hdrSystem !== null,
        message: hdrSystem ? '✅ HDR System found' : '❌ HDR System not found',
        value: hdrSystem ? 'Initialized' : null
      })

      // Test 2: HDR System enabled
      // CRITICAL: If HDR is loaded (environment map exists), system is effectively enabled
      // even if config.enabled is false (it might be disabled but still have loaded HDR)
      if (hdrSystem && (hdrSystem as any).config) {
        const configEnabled = (hdrSystem as any).config.enabled === true
        const hasLoadedHDR = environmentMap !== null && environmentMap !== undefined
        // System is effectively enabled if HDR is loaded OR config says enabled
        const effectivelyEnabled = configEnabled || hasLoadedHDR
        
        results.push({
          name: 'HDR System enabled',
          passed: effectivelyEnabled || !hasLoadedHDR, // Pass if enabled OR no HDR loaded (optional)
          message: effectivelyEnabled 
            ? '✅ HDR System is enabled' 
            : hasLoadedHDR 
              ? '⚠️ HDR System config disabled but HDR is loaded' 
              : 'ℹ️ HDR System is disabled (HDR is optional)',
          value: effectivelyEnabled
        })
      }

      // Test 3: Environment map loaded
      const hasEnvMap = environmentMap !== null && environmentMap !== undefined
      results.push({
        name: 'Environment map loaded',
        passed: hasEnvMap,
        message: hasEnvMap ? '✅ Environment map is loaded' : '⚠️ Environment map not loaded',
        value: hasEnvMap ? `${environmentMap?.image?.width || 0}x${environmentMap?.image?.height || 0}` : null
      })

      // Test 4: PMREM environment map
      const hasPMREM = pmremEnvMap !== null && pmremEnvMap !== undefined
      results.push({
        name: 'PMREM environment map',
        passed: hasPMREM,
        message: hasPMREM ? '✅ PMREM environment map created' : '⚠️ PMREM environment map not created',
        value: hasPMREM ? 'Created' : null
      })

      // Test 5: Scene environment
      const sceneEnv = scene.environment
      results.push({
        name: 'Scene environment set',
        passed: sceneEnv !== null && sceneEnv !== undefined,
        message: sceneEnv ? '✅ Scene environment is set' : '⚠️ Scene environment not set',
        value: sceneEnv ? 'Active' : null
      })

      // Test 6: Scene background
      // CRITICAL: Background may not be set if ground projection is enabled (it replaces background)
      const sceneBackground = scene.background
      const hasHDRLoaded = environmentMap !== null && environmentMap !== undefined
      let backgroundShouldBeSet = false
      let backgroundReason = ''
      
      if (hdrSystem && (hdrSystem as any).config) {
        const hdrConfig = (hdrSystem as any).config
        const backgroundVisible = hdrConfig.backgroundVisible !== false // Default is true
        const groundProjectionEnabled = hdrConfig.groundProjection?.enabled === true
        
        // Background should be set if:
        // 1. HDR is loaded AND
        // 2. Background visibility is enabled AND
        // 3. Ground projection is NOT enabled (ground projection replaces background)
        if (hasHDRLoaded && backgroundVisible && !groundProjectionEnabled) {
          backgroundShouldBeSet = true
          backgroundReason = 'HDR loaded with background visible'
        } else if (hasHDRLoaded && groundProjectionEnabled) {
          backgroundReason = 'Ground projection enabled (replaces background)'
        } else if (hasHDRLoaded && !backgroundVisible) {
          backgroundReason = 'Background visibility disabled'
        } else {
          backgroundReason = 'No HDR loaded'
        }
      } else {
        backgroundReason = 'HDR system not configured'
      }
      
      // Pass if background is set when it should be, or if it's optional
      const backgroundTestPasses = backgroundShouldBeSet 
        ? (sceneBackground !== null && sceneBackground !== undefined)
        : true // Optional if HDR not loaded, background disabled, or ground projection enabled
      
      results.push({
        name: 'Scene background set',
        passed: backgroundTestPasses,
        message: sceneBackground 
          ? `✅ Scene background is set${backgroundReason ? ` (${backgroundReason})` : ''}` 
          : `ℹ️ Scene background not set${backgroundReason ? ` (${backgroundReason})` : ''}`,
        value: sceneBackground ? 'Active' : null
      })

      // Test 7: HDR URL configured
      results.push({
        name: 'HDR URL configured',
        passed: hdrUrl !== null && hdrUrl !== '',
        message: hdrUrl ? `✅ HDR URL configured: ${hdrUrl.substring(0, 50)}...` : '⚠️ No HDR URL configured',
        value: hdrUrl
      })

      // Test 8: HDR intensity
      // CRITICAL: Check if intensity is sufficient for proper lighting
      const intensitySufficient = hdrIntensity >= 1.0
      const intensityWarning = hdrIntensity < 0.5
      results.push({
        name: 'HDR intensity',
        passed: hdrIntensity > 0,
        message: intensityWarning 
          ? `⚠️ HDR intensity is very low: ${hdrIntensity.toFixed(2)} (recommended: 1.0-3.0)` 
          : intensitySufficient 
            ? `✅ HDR intensity: ${hdrIntensity.toFixed(2)}` 
            : `ℹ️ HDR intensity: ${hdrIntensity.toFixed(2)} (consider increasing to 1.0+ for better lighting)`,
        value: hdrIntensity
      })

      // Test 9: Background visibility
      results.push({
        name: 'Background visible',
        passed: hdrBackgroundVisible === true,
        message: hdrBackgroundVisible ? '✅ Background is visible' : '⚠️ Background is hidden',
        value: hdrBackgroundVisible
      })

      // Test 10: Ground projection
      results.push({
        name: 'Ground projection',
        passed: hdrGroundProjectionEnabled === true,
        message: hdrGroundProjectionEnabled ? '✅ Ground projection enabled' : '⚠️ Ground projection disabled',
        value: hdrGroundProjectionEnabled
      })

      // Test 11-15: Lights Configuration
      if (viewer) {
        const { scene, ambientLight, directionalLights } = viewer
        
        // Test 11: Ambient light exists
        results.push({
          name: 'Ambient light exists',
          passed: ambientLight !== undefined && ambientLight !== null,
          message: ambientLight 
            ? `✅ Ambient light found (intensity: ${ambientLight.intensity.toFixed(2)})` 
            : '❌ Ambient light not found',
          value: ambientLight ? ambientLight.intensity : null
        })

        // Test 12: Directional lights exist
        const dirLights = Array.from(directionalLights?.values() || [])
        const activeDirLights = dirLights.filter(light => light.visible && light.intensity > 0)
        results.push({
          name: 'Directional lights exist',
          passed: activeDirLights.length > 0,
          message: activeDirLights.length > 0 
            ? `✅ Found ${activeDirLights.length} active directional light(s)` 
            : '⚠️ No active directional lights found',
          value: activeDirLights.length
        })

        // Test 13: Directional lights with shadows
        const shadowCastingLights = activeDirLights.filter(light => light.castShadow)
        results.push({
          name: 'Directional lights cast shadows',
          passed: shadowCastingLights.length > 0,
          message: shadowCastingLights.length > 0 
            ? `✅ ${shadowCastingLights.length} directional light(s) cast shadows` 
            : '⚠️ No directional lights cast shadows',
          value: shadowCastingLights.length
        })

        // Test 14: Light intensity with HDR
        if (activeDirLights.length > 0) {
          const mainLight = activeDirLights[0]
          const lightIntensity = mainLight.intensity
          const intensityReasonable = lightIntensity >= 0.5 && lightIntensity <= 3.0
          results.push({
            name: 'Main light intensity',
            passed: intensityReasonable,
            message: intensityReasonable 
              ? `✅ Main light intensity: ${lightIntensity.toFixed(2)}` 
              : `⚠️ Main light intensity: ${lightIntensity.toFixed(2)} (recommended: 0.5-3.0)`,
            value: lightIntensity
          })
        }

        // Test 15: Ambient light intensity with HDR
        if (ambientLight) {
          const ambientIntensity = ambientLight.intensity
          const hasHDRLoaded = environmentMap !== null && environmentMap !== undefined
          const ambientTooLow = hasHDRLoaded && ambientIntensity < 0.05
          const ambientTooHigh = hasHDRLoaded && ambientIntensity > 0.5
          
          results.push({
            name: 'Ambient light intensity with HDR',
            passed: !ambientTooLow && !ambientTooHigh,
            message: hasHDRLoaded
              ? ambientTooLow
                ? `⚠️ Ambient light very low: ${ambientIntensity.toFixed(3)} (may cause dark objects)`
                : ambientTooHigh
                  ? `⚠️ Ambient light high: ${ambientIntensity.toFixed(3)} (may wash out HDR lighting)`
                  : `✅ Ambient light: ${ambientIntensity.toFixed(3)} (appropriate for HDR)`
              : `ℹ️ Ambient light: ${ambientIntensity.toFixed(3)} (no HDR loaded)`,
            value: ambientIntensity
          })
        }

        // Test 16: Light colors
        if (activeDirLights.length > 0) {
          const mainLight = activeDirLights[0]
          const lightColor = mainLight.color
          const colorHex = `#${lightColor.getHexString()}`
          const isWhite = lightColor.r > 0.9 && lightColor.g > 0.9 && lightColor.b > 0.9
          results.push({
            name: 'Main light color',
            passed: true, // Always pass - just informational
            message: isWhite 
              ? `ℹ️ Main light color: White (${colorHex})` 
              : `ℹ️ Main light color: ${colorHex}`,
            value: colorHex
          })
        }

        // Test 17: Total light count
        const allLights: THREE.Light[] = []
        scene.traverse((obj) => {
          if (obj instanceof THREE.Light) {
            allLights.push(obj)
          }
        })
        results.push({
          name: 'Total lights in scene',
          passed: allLights.length > 0,
          message: allLights.length > 0 
            ? `✅ Found ${allLights.length} light(s) in scene` 
            : '⚠️ No lights found in scene',
          value: allLights.length
        })

        // Test 18-20: Material Configuration
        const meshes: THREE.Mesh[] = []
        const materialsWithEnvMap: THREE.Material[] = []
        const materialsWithoutEnvMap: THREE.Material[] = []
        let totalMaterials = 0
        let standardMaterials = 0
        let basicMaterials = 0
        let envMapIntensitySum = 0
        let materialsWithEnvMapCount = 0

        scene.traverse((obj) => {
          if (obj instanceof THREE.Mesh && obj.material) {
            meshes.push(obj)
            const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
            
            materials.forEach((mat) => {
              totalMaterials++
              
              if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
                standardMaterials++
                
                if (mat.envMap) {
                  materialsWithEnvMap.push(mat)
                  materialsWithEnvMapCount++
                  if (mat.envMapIntensity !== undefined) {
                    envMapIntensitySum += mat.envMapIntensity
                  }
                } else {
                  materialsWithoutEnvMap.push(mat)
                }
              } else if (mat instanceof THREE.MeshBasicMaterial) {
                basicMaterials++
              }
            })
          }
        })

        // Test 18: Materials with environment map
        const avgEnvMapIntensity = materialsWithEnvMapCount > 0 
          ? envMapIntensitySum / materialsWithEnvMapCount 
          : 0
        results.push({
          name: 'Materials with environment map',
          passed: materialsWithEnvMapCount > 0,
          message: materialsWithEnvMapCount > 0
            ? `✅ ${materialsWithEnvMapCount} material(s) have environment map (avg intensity: ${avgEnvMapIntensity.toFixed(2)})`
            : '⚠️ No materials have environment map configured',
          value: materialsWithEnvMapCount
        })

        // Test 19: Standard materials (support envMap)
        results.push({
          name: 'Standard materials (support envMap)',
          passed: standardMaterials > 0,
          message: standardMaterials > 0
            ? `✅ Found ${standardMaterials} standard/physical material(s) (support envMap)`
            : '⚠️ No standard materials found (envMap not supported on basic materials)',
          value: standardMaterials
        })

        // Test 20: Materials without environment map
        if (materialsWithoutEnvMap.length > 0 && hasHDRLoaded) {
          results.push({
            name: 'Materials missing environment map',
            passed: false,
            message: `⚠️ ${materialsWithoutEnvMap.length} standard material(s) missing environment map (may appear dark)`,
            value: materialsWithoutEnvMap.length
          })
        }

        // Test 21: Environment map intensity check
        if (materialsWithEnvMapCount > 0) {
          const intensityTooLow = avgEnvMapIntensity < 0.5
          const intensityReasonable = avgEnvMapIntensity >= 0.5 && avgEnvMapIntensity <= 3.0
          results.push({
            name: 'Average envMap intensity',
            passed: intensityReasonable,
            message: intensityTooLow
              ? `⚠️ Average envMap intensity is very low: ${avgEnvMapIntensity.toFixed(2)} (recommended: 1.0-3.0)`
              : intensityReasonable
                ? `✅ Average envMap intensity: ${avgEnvMapIntensity.toFixed(2)}`
                : `⚠️ Average envMap intensity is high: ${avgEnvMapIntensity.toFixed(2)} (may wash out details)`,
            value: avgEnvMapIntensity
          })
        }

        // Test 22: HDR Environment Map Brightness Analysis
        if (environmentMap && environmentMap.image) {
          try {
            let avgLuminance = 0
            let canAnalyze = false
            
            // Handle both Image and DataTexture (DataTextureImageData) cases
            const img = environmentMap.image
            // Check if it's an HTMLImageElement by checking for tagName property
            const isImageElement = img && typeof (img as any).tagName === 'string' && (img as any).tagName === 'IMG'
            
            if (isImageElement && img instanceof HTMLImageElement) {
              // Standard Image element
              const canvas = document.createElement('canvas')
              canvas.width = Math.min(256, img.width || 256)
              canvas.height = Math.min(128, img.height || 128)
              const ctx = canvas.getContext('2d')
              
              if (ctx) {
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
                const pixels = imageData.data
                
                let totalLuminance = 0
                let sampleCount = 0
                
                // Sample every 10th pixel for performance
                for (let i = 0; i < pixels.length; i += 40) {
                  const r = pixels[i] / 255
                  const g = pixels[i + 1] / 255
                  const b = pixels[i + 2] / 255
                  // Calculate relative luminance (ITU-R BT.709)
                  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
                  totalLuminance += luminance
                  sampleCount++
                }
                
                avgLuminance = totalLuminance / sampleCount
                canAnalyze = true
              }
            } else if (environmentMap.image && 'data' in environmentMap.image && 'width' in environmentMap.image && 'height' in environmentMap.image) {
              // DataTexture (HDR/EXR loaded as Float32Array)
              const dataTexture = environmentMap.image as any
              const data = dataTexture.data
              const width = dataTexture.width
              const height = dataTexture.height
              
              if (data && width && height) {
                let totalLuminance = 0
                let sampleCount = 0
                const stride = data.length / (width * height) // Usually 3 (RGB) or 4 (RGBA)
                
                // Sample every 100th pixel for performance
                for (let y = 0; y < height; y += 10) {
                  for (let x = 0; x < width; x += 10) {
                    const idx = (y * width + x) * stride
                    if (idx + 2 < data.length) {
                      const r = data[idx]
                      const g = data[idx + 1]
                      const b = data[idx + 2]
                      // Calculate relative luminance (ITU-R BT.709)
                      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
                      totalLuminance += luminance
                      sampleCount++
                    }
                  }
                }
                
                if (sampleCount > 0) {
                  avgLuminance = totalLuminance / sampleCount
                  canAnalyze = true
                }
              }
            }
            
            if (canAnalyze) {
              const isDark = avgLuminance < 0.1
              const isBright = avgLuminance > 0.5
              
              results.push({
                name: 'HDR map brightness',
                passed: !isDark,
                message: isDark
                  ? `⚠️ HDR map appears dark (luminance: ${avgLuminance.toFixed(3)}). Try increasing HDR intensity to 2.0-3.0`
                  : isBright
                    ? `✅ HDR map is bright (luminance: ${avgLuminance.toFixed(3)})`
                    : `ℹ️ HDR map brightness: ${avgLuminance.toFixed(3)} (moderate)`,
                value: avgLuminance
              })
            }
          } catch (error) {
            // If we can't analyze, skip this test
            console.warn('[HDRTestPanel] Could not analyze HDR brightness:', error)
          }
        }

        // Test 23: Overall Lighting Assessment
        if (hasHDRLoaded && materialsWithEnvMapCount > 0) {
          const hdrIntensity = useAppStore.getState().hdrIntensity || 1.0
          const effectiveLighting = hdrIntensity * avgEnvMapIntensity
          const lightingTooLow = effectiveLighting < 1.0
          const lightingReasonable = effectiveLighting >= 1.0 && effectiveLighting <= 5.0
          
          results.push({
            name: 'Overall HDR lighting',
            passed: lightingReasonable,
            message: lightingTooLow
              ? `⚠️ Overall HDR lighting is low: ${effectiveLighting.toFixed(2)} (HDR intensity × envMap intensity). Try increasing HDR intensity slider to 2.0-3.0`
              : lightingReasonable
                ? `✅ Overall HDR lighting: ${effectiveLighting.toFixed(2)} (HDR: ${hdrIntensity.toFixed(2)} × envMap: ${avgEnvMapIntensity.toFixed(2)})`
                : `⚠️ Overall HDR lighting is high: ${effectiveLighting.toFixed(2)} (may wash out details)`,
            value: effectiveLighting
          })
        }
      }

      setTestResults(results)
    } catch (error) {
      console.error('Error running HDR tests:', error)
      alert(`Error running tests: ${error}`)
    } finally {
      setIsRunning(false)
    }
  }

  useEffect(() => {
    // Auto-run tests when viewer is ready
    if (viewer && testResults.length === 0) {
      runTests()
    }
  }, [viewer])

  // Update preview when environment map changes
  useEffect(() => {
    if (viewer?.environmentMap) {
      const texture = viewer.environmentMap
      if (texture && texture.image) {
        try {
          const img = texture.image
          // Only create preview for Image elements, not DataTexture
          if (img instanceof HTMLImageElement) {
            const canvas = document.createElement('canvas')
            const ctx = canvas.getContext('2d')
            if (ctx) {
              // Create a small preview (256x128 for equirectangular)
              canvas.width = 256
              canvas.height = 128
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
              setPreviewUrl(canvas.toDataURL('image/png'))
            }
          } else {
            // DataTexture - can't create preview easily, skip
            setPreviewUrl(null)
          }
        } catch (e) {
          console.error('Failed to create preview:', e)
          setPreviewUrl(null)
        }
      }
    } else {
      setPreviewUrl(null)
    }
  }, [viewer?.environmentMap])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setHdrFile(file)
      // Auto-enable HDR after file selection
      setTimeout(() => {
        setHdrEnabled(true)
        runTests()
      }, 100)
    }
  }

  const loadTestHDR = async () => {
    // Try to load a test HDR from a common URL
    const testUrls = [
      'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_03_1k.hdr',
      'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/industrial_sunset_02_1k.hdr'
    ]
    
    // For now, just show a message
    alert('To test HDR loading, please select an HDR file using the "Load HDR File" button.')
  }


  const passedCount = testResults.filter(t => t.passed).length
  const totalCount = testResults.length

  const copyResults = () => {
    if (testResults.length === 0) return
    
    let output = '=== HDR Test Results ===\n\n'
    output += `Overall: ${passedCount}/${totalCount} tests passed\n\n`
    
    // Group tests by category
    const categories: { [key: string]: HDRTestResult[] } = {}
    testResults.forEach(test => {
      const category = test.name.includes('System') ? 'HDR System' :
                      test.name.includes('Environment') || test.name.includes('PMREM') ? 'Environment Maps' :
                      test.name.includes('Scene') ? 'Scene Configuration' :
                      test.name.includes('URL') || (test.name.includes('intensity') && !test.name.includes('light') && !test.name.includes('envMap') && !test.name.includes('Overall')) ? 'HDR Settings' :
                      test.name.includes('Background') || test.name.includes('Ground') ? 'Display Settings' :
                      test.name.includes('light') || test.name.includes('Light') ? 'Lights' :
                      test.name.includes('Material') || test.name.includes('envMap') || test.name.includes('brightness') || test.name.includes('Overall') ? 'Materials' :
                      'Other'
      
      if (!categories[category]) {
        categories[category] = []
      }
      categories[category].push(test)
    })
    
    Object.entries(categories).forEach(([category, tests]) => {
      output += `--- ${category} ---\n`
      tests.forEach(test => {
        output += `${test.message}\n`
        if (test.value !== undefined && test.value !== null) {
          output += `  Value: ${test.value}\n`
        }
      })
      output += '\n'
    })
    
    navigator.clipboard.writeText(output)
    alert('HDR test results copied to clipboard')
  }

  return (
    <div 
      ref={panelRef}
      className={`hdr-test-panel${dragging ? ' dragging' : ''}`}
      style={{ top: `${panelTop}px`, left: `${panelLeft}px`, maxHeight: `${maxHeight}px` }}
    >
      <div className="hdr-test-header" onMouseDown={handleMouseDown}>
        <h3>🌍 HDR Test Panel</h3>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <button 
            onClick={() => setIsMinimized(!isMinimized)} 
            className="minimize-button" 
            title={isMinimized ? "Maximize panel" : "Minimize panel"}
          >
            {isMinimized ? '□' : '−'}
          </button>
          <button className="close-button" onClick={() => useAppStore.setState({ showHDRTestPanel: false })}>
            ×
          </button>
        </div>
      </div>

      {!isMinimized && (
        <div className="hdr-test-content">
          <div className="hdr-test-actions">
            <button onClick={runTests} disabled={isRunning}>
              {isRunning ? 'Running...' : 'Run Tests'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".hdr,.exr"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            <button onClick={() => fileInputRef.current?.click()}>
              Load HDR File
            </button>
            {testResults.length > 0 && (
              <button onClick={copyResults}>
                Copy Results
              </button>
            )}
          </div>

          {testResults.length > 0 && (
            <>
              <div className="hdr-test-summary">
                <div className={`test-summary-card ${passedCount === totalCount ? 'pass' : 'partial'}`}>
                  <div className="test-summary-number">{passedCount}</div>
                  <div className="test-summary-label">Passed</div>
                </div>
                <div className={`test-summary-card ${totalCount - passedCount > 0 ? 'fail' : 'pass'}`}>
                  <div className="test-summary-number">{totalCount - passedCount}</div>
                  <div className="test-summary-label">Warnings</div>
                </div>
                <div className="test-summary-card">
                  <div className="test-summary-number">{totalCount}</div>
                  <div className="test-summary-label">Total</div>
                </div>
              </div>

              {/* Live Preview */}
              {previewUrl && (
                <div className="hdr-preview-section">
                  <h4>Live Preview</h4>
                  <div className="hdr-preview-container">
                    <img src={previewUrl} alt="HDR Preview" className="hdr-preview-image" />
                    <div className="hdr-preview-info">
                      <small>Equirectangular HDR Preview</small>
                    </div>
                  </div>
                </div>
              )}

              {/* HDR Controls */}
              <div className="hdr-controls-section">
                <h4>HDR Controls</h4>
                <label>
                  <input
                    type="checkbox"
                    checked={hdrEnabled}
                    onChange={(e) => setHdrEnabled(e.target.checked)}
                  />
                  <span>Enable HDR</span>
                </label>
                <label>
                  <span>Intensity: {hdrIntensity.toFixed(2)}</span>
                  <input
                    type="range"
                    min="0"
                    max="5"
                    step="0.1"
                    value={hdrIntensity}
                    onChange={(e) => {
                      setHdrIntensity(parseFloat(e.target.value))
                      setTimeout(runTests, 100)
                    }}
                  />
                  <small style={{ display: 'block', color: '#aaa', marginTop: '4px' }}>
                    {hdrIntensity < 1.0 
                      ? '⚠️ Low intensity may cause dark objects. Try 1.0-3.0 for better lighting.'
                      : hdrIntensity > 3.0
                        ? 'ℹ️ Very high intensity may wash out details.'
                        : 'Recommended: 1.0-3.0'}
                  </small>
                </label>
                <label>
                  <span>Rotation Azimuth: {hdrRotationAzimuth.toFixed(1)}°</span>
                  <input
                    type="range"
                    min="-180"
                    max="180"
                    step="1"
                    value={hdrRotationAzimuth}
                    onChange={(e) => {
                      setHdrRotationAzimuth(parseFloat(e.target.value))
                      setTimeout(runTests, 100)
                    }}
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={hdrBackgroundVisible}
                    onChange={(e) => {
                      setHdrBackgroundVisible(e.target.checked)
                      setTimeout(runTests, 100)
                    }}
                  />
                  <span>Show Background</span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={hdrGroundProjectionEnabled}
                    onChange={(e) => {
                      setHdrGroundProjectionEnabled(e.target.checked)
                      setTimeout(runTests, 100)
                    }}
                  />
                  <span>Ground Projection</span>
                </label>
              </div>

              {/* Test Results */}
              <div className="hdr-test-results">
                <h4>Test Results</h4>
                <ul className="test-list">
                  {testResults.map((test, i) => (
                    <li key={i} className={test.passed ? 'pass' : 'warning'}>
                      {test.message}
                      {test.value !== undefined && test.value !== null && (
                        <small className="test-value"> ({test.value})</small>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

