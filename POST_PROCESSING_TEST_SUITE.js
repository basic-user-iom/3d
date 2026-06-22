/**
 * Post-Processing Test Suite
 * Run in browser console to test post-processing system
 */

// Test 1: Shadow Map Preservation
function testShadowMaps() {
  console.log('=== Test 1: Shadow Map Preservation ===')
  // Try multiple ways to access viewer
  const viewer = window.__viewer || window.sharedViewer || (window.viewerRef?.current)
  if (!viewer) {
    console.error('Viewer not found. Available: window.__viewer, window.sharedViewer, window.viewerRef?.current')
    return false
  }
  
  const renderer = viewer.renderer
  const pp = viewer.postProcessingSystem
  
  if (!pp) {
    console.error('Post-processing system not found')
    return false
  }
  
  // Enable post-processing
  pp.updateConfig({ enabled: true })
  
  // Check shadow maps are enabled
  const shadowMapsEnabled = renderer.shadowMap.enabled
  console.log('Shadow maps enabled:', shadowMapsEnabled)
  
  // Check render target has depth buffer
  const composer = pp.composer
  const renderTarget = composer?.renderTarget || (composer as any)?._renderTarget
  const hasDepthBuffer = renderTarget?.depthBuffer === true
  console.log('Render target depth buffer:', hasDepthBuffer)
  
  // Visual check required
  console.log('✅ Visual check: Shadows should be visible in scene')
  
  return shadowMapsEnabled && hasDepthBuffer
}

// Test 2: Color Space and Tone Mapping
function testColorSpace() {
  console.log('=== Test 2: Color Space and Tone Mapping ===')
  const viewer = window.__viewer || window.sharedViewer || (window.viewerRef?.current)
  if (!viewer) return false
  
  const renderer = viewer.renderer
  const pp = viewer.postProcessingSystem
  if (!pp) return false
  
  // Enable post-processing with tone mapping
  pp.updateConfig({
    enabled: true,
    toneMapping: { type: 'aces-filmic', exposure: 1.0, whitePoint: 1.0 }
  })
  
  // Check color space
  const colorSpace = renderer.outputColorSpace
  console.log('Output color space:', colorSpace)
  // THREE may not be global, try to get it from viewer
  const THREE = window.THREE || (viewer.renderer?.constructor?.THREE)
  const correctColorSpace = colorSpace === (THREE?.LinearSRGBColorSpace || 100903) // Fallback to enum value
  
  // Check pass order
  const passes = pp.composer.passes
  const passNames = passes.map(p => p.constructor.name)
  console.log('Pass order:', passNames)
  
  // Find indices
  const renderIndex = passNames.indexOf('RenderPass')
  const toneMappingIndex = passes.findIndex(p => p === pp.toneMappingPass)
  const lutIndex = passes.findIndex(p => p === pp.lutPass)
  const colorGradingIndex = passes.findIndex(p => p === pp.colorGradingPass)
  const outputIndex = passes.findIndex(p => p === pp.outputPass)
  
  // Verify order
  const orderCorrect = 
    toneMappingIndex > renderIndex &&
    lutIndex > toneMappingIndex &&
    colorGradingIndex > lutIndex &&
    outputIndex === passes.length - 1
  
  console.log('Color space correct:', correctColorSpace)
  console.log('Pass order correct:', orderCorrect)
  console.log('✅ Visual check: Colors should be vibrant, not washed out')
  
  return correctColorSpace && orderCorrect
}

// Test 3: SSS Shadow Intensity
function testSSSIntensity() {
  console.log('=== Test 3: SSS Shadow Intensity ===')
  const viewer = window.__viewer || window.sharedViewer || (window.viewerRef?.current)
  if (!viewer) return false
  
  const pp = viewer.postProcessingSystem
  if (!pp) return false
  
  pp.updateConfig({ enabled: true, sss: { enabled: true, intensity: 0.5 } })
  
  const sssUniforms = pp.sssPass?.uniforms
  if (!sssUniforms) {
    console.error('SSS pass not found')
    return false
  }
  
  const intensity = sssUniforms.intensity.value
  console.log('SSS intensity:', intensity)
  console.log('Expected: 0.5')
  
  // Check shader code for double application
  console.log('⚠️ Check shader code: intensity should only be applied once')
  console.log('✅ Visual check: Shadows should not be too dark')
  
  return Math.abs(intensity - 0.5) < 0.01
}

// Test 4: SSR Camera Matrices
function testSSRCameraMatrices() {
  console.log('=== Test 4: SSR Camera Matrices ===')
  const viewer = window.__viewer || window.sharedViewer || (window.viewerRef?.current)
  if (!viewer) return false
  
  const pp = viewer.postProcessingSystem
  if (!pp) return false
  
  pp.updateConfig({ enabled: true, ssr: { enabled: true } })
  
  const camera = viewer.camera
  const ssrUniforms = pp.ssrPass?.uniforms
  if (!ssrUniforms) {
    console.error('SSR pass not found')
    return false
  }
  
  // Move camera
  const oldPosition = camera.position.clone()
  camera.position.set(10, 10, 10)
  camera.updateMatrixWorld()
  
  // Render
  pp.render()
  
  // Check matrices are updated
  const projMatrix = camera.projectionMatrix.clone().invert()
  const viewMatrix = camera.matrixWorldInverse.clone().invert()
  
  const projMatch = ssrUniforms.cameraProjectionMatrixInverse.value.equals(projMatrix)
  const viewMatch = ssrUniforms.cameraViewMatrixInverse.value.equals(viewMatrix)
  
  console.log('Projection matrix updated:', projMatch)
  console.log('View matrix updated:', viewMatch)
  
  // Restore camera
  camera.position.copy(oldPosition)
  camera.updateMatrixWorld()
  
  return projMatch && viewMatch
}

// Test 5: Memory Leaks
function testMemoryLeaks() {
  console.log('=== Test 5: Memory Leaks ===')
  const viewer = window.__viewer || window.sharedViewer || (window.viewerRef?.current)
  if (!viewer) return false
  
  const pp = viewer.postProcessingSystem
  if (!pp) return false
  
  // Get initial memory
  const initialMemory = performance.memory?.usedJSHeapSize || 0
  console.log('Initial memory:', initialMemory)
  
  // Enable all effects
  pp.updateConfig({
    enabled: true,
    ao: { enabled: true },
    sss: { enabled: true },
    ssr: { enabled: true },
    bloom: { enabled: true }
  })
  
  // Disable and dispose
  pp.updateConfig({ enabled: false })
  pp.dispose()
  
  // Check that all resources are disposed
  const composerNull = pp.composer === null
  const aoPassNull = pp.aoPass === null
  const sssPassNull = pp.sssPass === null
  const renderTargetNull = pp.composerRenderTarget === null
  
  console.log('Composer disposed:', composerNull)
  console.log('AO pass disposed:', aoPassNull)
  console.log('SSS pass disposed:', sssPassNull)
  console.log('Render target disposed:', renderTargetNull)
  
  // Check memory after GC (may take time)
  setTimeout(() => {
    const finalMemory = performance.memory?.usedJSHeapSize || 0
    const memoryChange = finalMemory - initialMemory
    console.log('Final memory:', finalMemory)
    console.log('Memory change:', memoryChange)
    console.log(memoryChange > 0 ? '⚠️ Memory increased (may be normal)' : '✅ Memory decreased or stable')
  }, 1000)
  
  return composerNull && aoPassNull && sssPassNull && renderTargetNull
}

// Test 6: Texture Updates
function testTextureUpdates() {
  console.log('=== Test 6: Texture Updates ===')
  const viewer = window.__viewer || window.sharedViewer || (window.viewerRef?.current)
  if (!viewer) return false
  
  const pp = viewer.postProcessingSystem
  if (!pp) return false
  
  pp.updateConfig({ enabled: true, sss: { enabled: true } })
  
  const sssUniforms = pp.sssPass?.uniforms
  if (!sssUniforms) return false
  
  // Check depth texture is connected
  const depthTexture = sssUniforms.tDepth.value
  const hasDepthTexture = depthTexture !== null
  console.log('Depth texture connected:', hasDepthTexture)
  
  if (depthTexture && depthTexture.image) {
    const img = depthTexture.image
    const width = img.width || img.naturalWidth || 0
    const height = img.height || img.naturalHeight || 0
    const rendererWidth = viewer.renderer.domElement.width
    const rendererHeight = viewer.renderer.domElement.height
    
    console.log('Depth texture dimensions:', width, 'x', height)
    console.log('Renderer dimensions:', rendererWidth, 'x', rendererHeight)
    
    const dimensionsMatch = width === rendererWidth && height === rendererHeight
    console.log('Dimensions match:', dimensionsMatch)
    
    return hasDepthTexture && dimensionsMatch
  }
  
  return hasDepthTexture
}

// Test 7: Pass Order Stability
function testPassOrderStability() {
  console.log('=== Test 7: Pass Order Stability ===')
  const viewer = window.__viewer || window.sharedViewer || (window.viewerRef?.current)
  if (!viewer) return false
  
  const pp = viewer.postProcessingSystem
  if (!pp) return false
  
  pp.updateConfig({ enabled: true })
  const initialOrder = pp.composer.passes.map(p => p.constructor.name)
  
  // Enable/disable effects
  pp.updateConfig({ ao: { enabled: true } })
  pp.updateConfig({ sss: { enabled: true } })
  pp.updateConfig({ ssr: { enabled: true } })
  pp.updateConfig({ bloom: { enabled: true } })
  
  const finalOrder = pp.composer.passes.map(p => p.constructor.name)
  
  // Verify order is still correct
  const renderFirst = finalOrder[0] === 'RenderPass'
  const outputLast = finalOrder[finalOrder.length - 1] === 'OutputPass'
  
  // Verify tone mapping comes before LUT
  const toneMappingIndex = finalOrder.findIndex((name, i) => pp.composer.passes[i] === pp.toneMappingPass)
  const lutIndex = finalOrder.findIndex((name, i) => pp.composer.passes[i] === pp.lutPass)
  const toneMappingBeforeLUT = toneMappingIndex < lutIndex && toneMappingIndex !== -1 && lutIndex !== -1
  
  console.log('RenderPass first:', renderFirst)
  console.log('OutputPass last:', outputLast)
  console.log('ToneMapping before LUT:', toneMappingBeforeLUT)
  console.log('Final pass order:', finalOrder)
  
  return renderFirst && outputLast && toneMappingBeforeLUT
}

// Run all tests
function runAllTests() {
  console.log('🧪 Running Post-Processing Test Suite...\n')
  
  const results = {
    shadowMaps: testShadowMaps(),
    colorSpace: testColorSpace(),
    sssIntensity: testSSSIntensity(),
    ssrMatrices: testSSRCameraMatrices(),
    memoryLeaks: testMemoryLeaks(),
    textureUpdates: testTextureUpdates(),
    passOrder: testPassOrderStability()
  }
  
  console.log('\n=== Test Results Summary ===')
  console.table(results)
  
  const passed = Object.values(results).filter(r => r).length
  const total = Object.keys(results).length
  console.log(`\n✅ Passed: ${passed}/${total}`)
  
  return results
}

// Export for use
if (typeof window !== 'undefined') {
  (window as any).postProcessingTests = {
    testShadowMaps,
    testColorSpace,
    testSSSIntensity,
    testSSRCameraMatrices,
    testMemoryLeaks,
    testTextureUpdates,
    testPassOrderStability,
    runAllTests
  }
  console.log('✅ Post-processing test suite loaded. Run window.postProcessingTests.runAllTests() to test.')
}


























