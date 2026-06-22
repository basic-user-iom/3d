/**
 * Project Save Testing Script - Browser Console Version
 * 
 * Copy and paste this into the browser console after the app is loaded.
 * Tests project save functionality.
 */

(async function testProjectSave() {
  console.log('🧪 Starting Project Save Tests...\n')
  
  try {
    // Access the project persistence functions from the window or import
    // Note: These need to be exposed or we need to use the UI buttons
    
    // Test 1: Check if functions are available
    console.log('📊 Test 1: Checking function availability...')
    
    // Try to access via window or module
    let createProjectSnapshot, downloadProjectSnapshot, createPackagedProject
    
    // Check if exposed on window
    if (window.createProjectSnapshot) {
      createProjectSnapshot = window.createProjectSnapshot
      downloadProjectSnapshot = window.downloadProjectSnapshot
      createPackagedProject = window.createPackagedProject
      console.log('✅ Functions found on window object')
    } else {
      console.log('⚠️ Functions not exposed on window - will test via UI')
      console.log('   Please use the "Save Project" button in the UI to test')
      return
    }
    
    // Test 2: Create snapshot
    console.log('\n📦 Test 2: Creating project snapshot...')
    const snapshot = await createProjectSnapshot()
    const jsonString = JSON.stringify(snapshot, null, 2)
    const jsonSize = new Blob([jsonString]).size
    const jsonSizeMB = (jsonSize / 1024 / 1024).toFixed(2)
    
    console.log(`✅ Snapshot created: ${jsonSizeMB} MB`)
    console.log(`   - Scene objects: ${snapshot.scene?.objects?.length || 0}`)
    console.log(`   - HDR embedded: ${snapshot.store?.hdr?.serialization?.type === 'embedded' ? 'Yes' : 'No'}`)
    
    // Test 3: Check size and provide recommendations
    console.log('\n⚠️ Test 3: Size analysis...')
    if (jsonSize > 50 * 1024 * 1024) {
      console.log(`❌ Project size (${jsonSizeMB} MB) exceeds 50MB - may cause issues`)
      console.log('   - Recommendation: Use packaged project (ZIP)')
      console.log('   - Recommendation: Use lightweight save (skip textures)')
    } else if (jsonSize > 20 * 1024 * 1024) {
      console.log(`⚠️ Project size (${jsonSizeMB} MB) exceeds 20MB threshold`)
      console.log('   - Recommendation: Use packaged project (ZIP) for better compression')
    } else if (jsonSize > 10 * 1024 * 1024) {
      console.log(`⚠️ Project size (${jsonSizeMB} MB) is getting large (>10MB)`)
      console.log('   - Consider using packaged project for better compression')
    } else {
      console.log(`✅ Project size (${jsonSizeMB} MB) is reasonable`)
    }
    
    // Test 4: Test packaged project compression
    console.log('\n📦 Test 4: Testing packaged project compression...')
    try {
      const packagedBlob = await createPackagedProject(true)
      const packagedSizeMB = (packagedBlob.size / 1024 / 1024).toFixed(2)
      const compressionRatio = jsonSize > 0 ? ((1 - packagedBlob.size / jsonSize) * 100).toFixed(1) : '0'
      console.log(`✅ Packaged project created: ${packagedSizeMB} MB`)
      console.log(`   - Original size: ${jsonSizeMB} MB`)
      console.log(`   - Compressed size: ${packagedSizeMB} MB`)
      console.log(`   - Compression ratio: ${compressionRatio}%`)
      console.log(`   - Space saved: ${((jsonSize - packagedBlob.size) / 1024 / 1024).toFixed(2)} MB`)
    } catch (error) {
      console.error('❌ Packaged project creation failed:', error)
    }
    
    // Summary
    console.log('\n📋 Test Summary:')
    console.log('================')
    console.log(`Project Size: ${jsonSizeMB} MB`)
    console.log(`Status: ${jsonSize < 20 * 1024 * 1024 ? '✅ Good' : jsonSize < 50 * 1024 * 1024 ? '⚠️ Large' : '❌ Very Large'}`)
    console.log('\n💡 Recommendations:')
    if (jsonSize < 10 * 1024 * 1024) {
      console.log('   - JSON save is fine for this project size')
    } else if (jsonSize < 20 * 1024 * 1024) {
      console.log('   - Consider using packaged project (ZIP) for better compression')
    } else {
      console.log('   - Use packaged project (ZIP) for large projects')
      console.log('   - Consider lightweight save (skip textures) if available')
    }
    
  } catch (error) {
    console.error('❌ Test suite failed:', error)
    console.error('   Error details:', error.stack)
  }
})();














