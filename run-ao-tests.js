// Complete AO Test Script
// This will run all tests and log results

(async function() {
  console.log('=== Starting AO Tests ===\n')
  
  // Get viewer
  const viewer = window.__viewer || window.sharedViewer
  if (!viewer) {
    console.error('❌ Viewer not found')
    return
  }
  console.log('✅ Viewer found\n')
  
  // Test 1: Check if post-processing is enabled
  console.log('=== Test 1: Post-Processing Status ===')
  const pp = viewer.postProcessingSystem
  if (!pp) {
    console.error('❌ Post-processing system not found')
    return
  }
  console.log('Post-processing enabled:', pp.config?.enabled)
  console.log('AO enabled:', pp.config?.ao?.enabled)
  console.log('AO pass exists:', !!pp.aoPass)
  console.log('')
  
  // Test 2: Check Pass Order
  console.log('=== Test 2: Pass Order ===')
  if (pp.composer) {
    const passes = pp.composer.passes
    const passNames = passes.map(p => p.constructor.name)
    console.log('Current pass order:', passNames)
    
    const renderPassIndex = passNames.indexOf('RenderPass')
    const saoPassIndex = passNames.indexOf('SAOPass')
    
    if (renderPassIndex === -1) {
      console.error('❌ RenderPass not found!')
    } else {
      console.log('✅ RenderPass found at index:', renderPassIndex)
    }
    
    if (saoPassIndex === -1) {
      console.warn('⚠️ SAOPass not found (may not be enabled)')
    } else {
      console.log('✅ SAOPass found at index:', saoPassIndex)
      if (saoPassIndex === renderPassIndex + 1) {
        console.log('✅ Pass order is CORRECT')
      } else {
        console.error('❌ Pass order is WRONG!')
      }
    }
  }
  console.log('')
  
  // Test 3: Check Shadow Maps
  console.log('=== Test 3: Shadow Maps ===')
  const renderer = viewer.renderer
  if (renderer) {
    console.log('Shadow maps enabled:', renderer.shadowMap.enabled)
    console.log('Shadow map type:', renderer.shadowMap.type)
  }
  console.log('')
  
  // Test 4: Check Depth Texture
  console.log('=== Test 4: Depth Texture ===')
  if (pp.composer) {
    const composerAny = pp.composer
    if (composerAny.readBuffer) {
      console.log('readBuffer exists:', true)
      console.log('readBuffer.depthTexture exists:', !!composerAny.readBuffer.depthTexture)
      if (composerAny.readBuffer.depthTexture) {
        const depthTex = composerAny.readBuffer.depthTexture
        console.log('Depth texture type:', depthTex.constructor.name)
      } else {
        console.warn('⚠️ readBuffer.depthTexture is missing!')
      }
    } else {
      console.warn('⚠️ readBuffer not found')
    }
  }
  console.log('')
  
  // Test 5: Check Material Properties
  console.log('=== Test 5: Material Properties (Sample) ===')
  const scene = viewer.scene
  if (scene) {
    let totalMaterials = 0
    let materialsWithAlphaTest = 0
    let materialsWithDepthTestFalse = 0
    let opaqueMaterialsWithDepthWriteFalse = 0
    
    scene.traverse((obj) => {
      if (obj.material) {
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
        materials.forEach((mat) => {
          totalMaterials++
          if (mat.alphaTest !== undefined && mat.alphaTest > 0) {
            materialsWithAlphaTest++
          }
          if (mat.depthTest === false) {
            materialsWithDepthTestFalse++
          }
          if (mat.depthWrite === false && !mat.transparent) {
            opaqueMaterialsWithDepthWriteFalse++
          }
        })
      }
    })
    
    console.log('Total materials:', totalMaterials)
    console.log('Materials with alphaTest:', materialsWithAlphaTest)
    console.log('Materials with depthTest=false:', materialsWithDepthTestFalse)
    console.log('Opaque materials with depthWrite=false:', opaqueMaterialsWithDepthWriteFalse)
  }
  console.log('')
  
  // Test 6: Enable AO and test
  console.log('=== Test 6: Enabling AO ===')
  if (pp.config) {
    // Enable post-processing if not enabled
    if (!pp.config.enabled) {
      console.log('Enabling post-processing...')
      pp.updateConfig({ enabled: true })
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    // Enable AO if not enabled
    if (!pp.config.ao?.enabled) {
      console.log('Enabling AO...')
      pp.updateConfig({ 
        ao: {
          ...pp.config.ao,
          enabled: true
        }
      })
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    console.log('Post-processing enabled:', pp.config.enabled)
    console.log('AO enabled:', pp.config.ao?.enabled)
    console.log('✅ AO should now be active - check the 3D view for black screen')
  }
  console.log('')
  
  // Test 7: Test with shadow maps disabled
  console.log('=== Test 7: Testing with Shadow Maps Disabled ===')
  console.log('Setting window.__testAOWithoutShadows = true')
  window.__testAOWithoutShadows = true
  console.log('✅ Shadow maps will be disabled on next render')
  console.log('Check if AO works now (no black screen)')
  console.log('To re-enable: window.__testAOWithoutShadows = false')
  console.log('')
  
  console.log('=== Tests Complete ===')
  console.log('Check the 3D view to see if AO is working or causing black screen')
  console.log('Check console for any warnings or errors')
  
  return {
    viewerFound: true,
    postProcessingEnabled: pp.config?.enabled,
    aoEnabled: pp.config?.ao?.enabled,
    aoPassExists: !!pp.aoPass,
    shadowMapsEnabled: renderer?.shadowMap?.enabled,
    testModeActive: window.__testAOWithoutShadows === true
  }
})()












