// Test script to check hook-based viewer functionality
// Run this in the browser console

console.log('🧪 Testing Hook-Based Viewer Functionality...\n')

// Test 1: Check if viewer is initialized
const viewer = window.getSharedViewer?.()
if (viewer) {
  console.log('✅ Viewer is initialized')
  console.log('  - Scene:', !!viewer.scene)
  console.log('  - Camera:', !!viewer.camera)
  console.log('  - Renderer:', !!viewer.renderer)
  console.log('  - Controls:', !!viewer.controls)
} else {
  console.log('❌ Viewer is not initialized')
}

// Test 2: Check feature flag
const store = window.useAppStore?.getState?.()
if (store) {
  console.log('\n✅ Store accessible')
  console.log('  - useHookBasedViewer:', store.useHookBasedViewer)
} else {
  console.log('\n❌ Store not accessible')
}

// Test 3: Check if hooks are working
console.log('\n📊 Hook Status:')
console.log('  - Check console logs for hook initialization messages')

// Test 4: Check for errors
console.log('\n🔍 Error Check:')
const errors = []
if (!viewer) errors.push('Viewer not initialized')
if (!viewer?.scene) errors.push('Scene missing')
if (!viewer?.camera) errors.push('Camera missing')
if (!viewer?.renderer) errors.push('Renderer missing')
if (!viewer?.controls) errors.push('Controls missing')

if (errors.length === 0) {
  console.log('✅ All core components present')
} else {
  console.log('❌ Missing components:', errors)
}

// Test 5: Check if 3D scene is rendering
if (viewer?.renderer) {
  const canvas = viewer.renderer.domElement
  if (canvas) {
    console.log('\n✅ Renderer canvas found')
    console.log('  - Canvas size:', canvas.width, 'x', canvas.height)
    console.log('  - Canvas visible:', canvas.offsetWidth > 0 && canvas.offsetHeight > 0)
  }
}

console.log('\n✅ Test complete!')














