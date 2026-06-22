// AO Debugging Test Script
// Run this in browser console to test AO issues

console.log('=== AO Debugging Tests ===')

// Get viewer instance
const viewer = window.__viewer || window.sharedViewer || (window.viewerRef?.current)
if (!viewer) {
  console.error('❌ Viewer not found. Available: window.__viewer, window.sharedViewer, window.viewerRef?.current')
  console.log('Trying to find viewer via React...')
  // Try to find via React
  const root = document.querySelector('#root')
  if (root) {
    console.log('Found root element, but viewer access not available')
  }
  console.log('Please run this script after the viewer is initialized')
} else {
  console.log('✅ Viewer found')
  
  // Test 1: Check Pass Order
  console.log('\n=== Test 1: Pass Order ===')
  const pp = viewer.postProcessingSystem
  if (pp && pp.composer) {
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
        console.log('✅ Pass order is CORRECT (SAOPass immediately after RenderPass)')
      } else {
        console.error('❌ Pass order is WRONG! SAOPass should be immediately after RenderPass')
        console.log('Expected: SAOPass at index', renderPassIndex + 1, 'but found at', saoPassIndex)
      }
    }
  } else {
    console.warn('⚠️ Post-processing system or composer not found')
  }
  
  // Test 2: Check Shadow Maps
  console.log('\n=== Test 2: Shadow Maps ===')
  const renderer = viewer.renderer
  if (renderer) {
    console.log('Shadow maps enabled:', renderer.shadowMap.enabled)
    console.log('Shadow map type:', renderer.shadowMap.type)
    
    if (renderer.shadowMap.enabled) {
      console.log('⚠️ Shadow maps are ENABLED - this may interfere with SAOPass')
      console.log('💡 To test: Disable shadow maps temporarily')
      console.log('   Run: viewer.renderer.shadowMap.enabled = false')
    } else {
      console.log('✅ Shadow maps are disabled')
    }
  }
  
  // Test 3: Check Material Properties
  console.log('\n=== Test 3: Material Properties ===')
  const scene = viewer.scene
  if (scene) {
    const problematicMaterials = []
    let totalMaterials = 0
    let materialsWithAlphaTest = 0
    let materialsWithDepthTestFalse = 0
    let opaqueMaterialsWithDepthWriteFalse = 0
    
    scene.traverse((obj) => {
      if (obj.material) {
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
        materials.forEach((mat) => {
          totalMaterials++
          const issues = []
          
          if (mat.alphaTest !== undefined && mat.alphaTest > 0) {
            materialsWithAlphaTest++
            issues.push(`alphaTest: ${mat.alphaTest}`)
          }
          if (mat.depthTest === false) {
            materialsWithDepthTestFalse++
            issues.push('depthTest: false')
          }
          if (mat.depthWrite === false && !mat.transparent) {
            opaqueMaterialsWithDepthWriteFalse++
            issues.push('depthWrite: false on opaque material')
          }
          
          if (issues.length > 0) {
            problematicMaterials.push({
              name: mat.name || 'unnamed',
              mesh: obj.name || 'unnamed',
              issues: issues,
              material: mat
            })
          }
        })
      }
    })
    
    console.log('Total materials checked:', totalMaterials)
    console.log('Materials with alphaTest:', materialsWithAlphaTest)
    console.log('Materials with depthTest=false:', materialsWithDepthTestFalse)
    console.log('Opaque materials with depthWrite=false:', opaqueMaterialsWithDepthWriteFalse)
    
    if (problematicMaterials.length > 0) {
      console.warn('⚠️ Found', problematicMaterials.length, 'problematic materials:')
      problematicMaterials.slice(0, 10).forEach((m, i) => {
        console.warn(`  ${i + 1}. ${m.mesh} / ${m.name}:`, m.issues.join(', '))
      })
      if (problematicMaterials.length > 10) {
        console.warn(`  ... and ${problematicMaterials.length - 10} more`)
      }
    } else {
      console.log('✅ No problematic materials found')
    }
  }
  
  // Test 4: Check WebGL Errors
  console.log('\n=== Test 4: WebGL Errors ===')
  if (renderer) {
    const gl = renderer.getContext()
    if (gl) {
      const error = gl.getError()
      if (error !== gl.NO_ERROR) {
        const errorNames = {
          0: 'NO_ERROR',
          1280: 'INVALID_ENUM',
          1281: 'INVALID_VALUE',
          1282: 'INVALID_OPERATION',
          1286: 'INVALID_FRAMEBUFFER_OPERATION'
        }
        console.error('❌ WebGL error detected:', errorNames[error] || error)
      } else {
        console.log('✅ No WebGL errors detected')
      }
      
      // Check WebGL capabilities
      console.log('WebGL capabilities:', {
        maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
        maxRenderbufferSize: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
        depthBits: gl.getParameter(gl.DEPTH_BITS),
        stencilBits: gl.getParameter(gl.STENCIL_BITS),
        webglVersion: gl.getParameter(gl.VERSION)
      })
    }
  }
  
  // Test 5: Check Post-Processing Configuration
  console.log('\n=== Test 5: Post-Processing Configuration ===')
  if (pp) {
    console.log('Post-processing enabled:', pp.config?.enabled)
    console.log('AO enabled:', pp.config?.ao?.enabled)
    console.log('AO pass exists:', !!pp.aoPass)
    console.log('Composer exists:', !!pp.composer)
    
    if (pp.composerRenderTarget) {
      console.log('Render target depth buffer:', pp.composerRenderTarget.depthBuffer)
      console.log('Render target depth texture:', !!pp.composerRenderTarget.depthTexture)
    }
    
    if (pp.aoPass) {
      const aoPassAny = pp.aoPass as any
      console.log('SAOPass params:', {
        output: aoPassAny.params?.output,
        saoIntensity: aoPassAny.params?.saoIntensity,
        saoScale: aoPassAny.params?.saoScale,
        saoBias: aoPassAny.params?.saoBias,
        saoKernelRadius: aoPassAny.params?.saoKernelRadius
      })
    }
  }
  
  // Test 6: Check Depth Texture (if available)
  console.log('\n=== Test 6: Depth Texture Check ===')
  if (pp && pp.composer) {
    const composerAny = pp.composer as any
    if (composerAny.readBuffer) {
      console.log('readBuffer depth texture:', !!composerAny.readBuffer.depthTexture)
      if (composerAny.readBuffer.depthTexture) {
        const depthTex = composerAny.readBuffer.depthTexture
        console.log('Depth texture type:', depthTex.constructor.name)
        console.log('Depth texture size:', depthTex.image ? {
          width: depthTex.image.width,
          height: depthTex.image.height
        } : 'N/A')
      } else {
        console.warn('⚠️ readBuffer.depthTexture is missing - SAOPass may not work')
      }
    }
  }
  
  console.log('\n=== Test Summary ===')
  console.log('Run individual tests:')
  console.log('  window.testAODebugging() - Run all tests')
  console.log('  window.testAOPassOrder() - Check pass order')
  console.log('  window.testAOShadowMaps() - Test with shadow maps disabled')
  console.log('  window.testAOMaterials() - Check material properties')
}

// Export test functions
if (typeof window !== 'undefined') {
  window.testAODebugging = function() {
    // Re-run the test
    eval(document.querySelector('script[src*="test-ao-debugging"]')?.textContent || '')
  }
  
  window.testAOPassOrder = function() {
    const viewer = window.__viewer || window.sharedViewer
    if (viewer && viewer.postProcessingSystem && viewer.postProcessingSystem.composer) {
      const passes = viewer.postProcessingSystem.composer.passes
      const passNames = passes.map(p => p.constructor.name)
      console.log('Pass order:', passNames)
      const renderIndex = passNames.indexOf('RenderPass')
      const saoIndex = passNames.indexOf('SAOPass')
      console.log('RenderPass index:', renderIndex)
      console.log('SAOPass index:', saoIndex)
      if (saoIndex === renderIndex + 1) {
        console.log('✅ Pass order is CORRECT')
      } else {
        console.error('❌ Pass order is WRONG')
      }
    }
  }
  
  window.testAOShadowMaps = function() {
    const viewer = window.__viewer || window.sharedViewer
    if (viewer && viewer.renderer) {
      const original = viewer.renderer.shadowMap.enabled
      console.log('Original shadow map state:', original)
      viewer.renderer.shadowMap.enabled = false
      console.log('✅ Shadow maps disabled - test AO now')
      console.log('To re-enable: viewer.renderer.shadowMap.enabled = true')
      return original
    }
  }
  
  window.testAOMaterials = function() {
    const viewer = window.__viewer || window.sharedViewer
    if (viewer && viewer.scene) {
      const problematic = []
      viewer.scene.traverse((obj) => {
        if (obj.material) {
          const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material
          if (mat.alphaTest !== undefined && mat.alphaTest > 0) {
            problematic.push({ mesh: obj.name, material: mat.name, issue: `alphaTest: ${mat.alphaTest}` })
          }
          if (mat.depthTest === false) {
            problematic.push({ mesh: obj.name, material: mat.name, issue: 'depthTest: false' })
          }
          if (mat.depthWrite === false && !mat.transparent) {
            problematic.push({ mesh: obj.name, material: mat.name, issue: 'depthWrite: false on opaque' })
          }
        }
      })
      console.log('Problematic materials:', problematic)
      return problematic
    }
  }
}

console.log('✅ Test functions available:')
console.log('  window.testAODebugging() - Run all tests')
console.log('  window.testAOPassOrder() - Check pass order')
console.log('  window.testAOShadowMaps() - Disable shadow maps for testing')
console.log('  window.testAOMaterials() - Check material properties')












