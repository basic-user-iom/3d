/**
 * Project Save Testing Script
 * 
 * Run this in the browser console after the app is loaded.
 * Tests project save functionality with different scenarios.
 */

window.testProjectSave = async function() {
  console.log('🧪 Starting Project Save Tests...\n')
  
  const { downloadProjectSnapshot, createProjectSnapshot, downloadPackagedProject } = await import('./src/utils/projectPersistence.ts')
  
  const results = {
    small: null,
    medium: null,
    large: null,
    packaged: null,
    errors: []
  }
  
  try {
    // Test 1: Create snapshot and check size
    console.log('📊 Test 1: Creating project snapshot...')
    const snapshot = await createProjectSnapshot()
    const jsonString = JSON.stringify(snapshot, null, 2)
    const jsonSize = new Blob([jsonString]).size
    const jsonSizeMB = (jsonSize / 1024 / 1024).toFixed(2)
    
    console.log(`✅ Snapshot created: ${jsonSizeMB} MB`)
    console.log(`   - Scene objects: ${snapshot.scene?.objects?.length || 0}`)
    console.log(`   - Textures serialized: ${textureSerializationCount || 0}`)
    console.log(`   - HDR embedded: ${snapshot.store?.hdr?.serialization?.type === 'embedded' ? 'Yes' : 'No'}`)
    
    results.small = {
      size: jsonSizeMB,
      success: true,
      details: {
        objects: snapshot.scene?.objects?.length || 0,
        textures: textureSerializationCount || 0,
        hdrEmbedded: snapshot.store?.hdr?.serialization?.type === 'embedded'
      }
    }
    
    // Test 2: Test JSON save (small/medium)
    if (jsonSize < 20 * 1024 * 1024) {
      console.log('\n📦 Test 2: Testing JSON save (small/medium project)...')
      try {
        // Don't actually download, just create the blob
        const blob = new Blob([jsonString], { type: 'application/json' })
        const blobSizeMB = (blob.size / 1024 / 1024).toFixed(2)
        console.log(`✅ JSON blob created: ${blobSizeMB} MB`)
        console.log(`   - Compression: None (raw JSON)`)
        results.medium = {
          size: blobSizeMB,
          success: true,
          compressed: false
        }
      } catch (error) {
        console.error('❌ JSON save failed:', error)
        results.medium = { success: false, error: error.message }
        results.errors.push({ test: 'JSON Save', error: error.message })
      }
    } else {
      console.log('\n⚠️ Test 2: Skipped (project too large for JSON save without compression)')
      results.medium = { skipped: true, reason: 'Project too large' }
    }
    
    // Test 3: Test packaged project (ZIP with compression)
    console.log('\n📦 Test 3: Testing packaged project (ZIP with compression)...')
    try {
      const packagedBlob = await createPackagedProject(true)
      const packagedSizeMB = (packagedBlob.size / 1024 / 1024).toFixed(2)
      const compressionRatio = ((1 - packagedBlob.size / jsonSize) * 100).toFixed(1)
      console.log(`✅ Packaged project created: ${packagedSizeMB} MB`)
      console.log(`   - Compression: DEFLATE (level 6)`)
      console.log(`   - Compression ratio: ${compressionRatio}%`)
      results.packaged = {
        size: packagedSizeMB,
        success: true,
        compressed: true,
        compressionRatio: compressionRatio
      }
    } catch (error) {
      console.error('❌ Packaged project save failed:', error)
      results.packaged = { success: false, error: error.message }
      results.errors.push({ test: 'Packaged Project', error: error.message })
    }
    
    // Test 4: Check for size warnings
    console.log('\n⚠️ Test 4: Checking size warnings...')
    if (jsonSize > 20 * 1024 * 1024) {
      console.log(`⚠️ Project size (${jsonSizeMB} MB) exceeds 20MB threshold`)
      console.log('   - Recommendation: Use packaged project (ZIP) for large projects')
    } else if (jsonSize > 10 * 1024 * 1024) {
      console.log(`⚠️ Project size (${jsonSizeMB} MB) is getting large (>10MB)`)
      console.log('   - Consider using packaged project for better compression')
    } else {
      console.log(`✅ Project size (${jsonSizeMB} MB) is reasonable`)
    }
    
    // Test 5: Check texture limits
    console.log('\n🔍 Test 5: Checking texture serialization limits...')
    const textureCount = textureSerializationCount || 0
    if (textureCount >= 500) {
      console.log(`⚠️ Texture limit reached: ${textureCount}/500 textures serialized`)
      console.log('   - Some textures may have been skipped')
    } else {
      console.log(`✅ Texture count: ${textureCount}/500 (within limits)`)
    }
    
    // Summary
    console.log('\n📋 Test Summary:')
    console.log('================')
    console.log(`Project Size: ${jsonSizeMB} MB`)
    console.log(`JSON Save: ${results.medium?.success ? '✅' : '❌'}`)
    console.log(`Packaged Save: ${results.packaged?.success ? '✅' : '❌'}`)
    if (results.packaged?.compressionRatio) {
      console.log(`Compression Ratio: ${results.packaged.compressionRatio}%`)
    }
    console.log(`Errors: ${results.errors.length}`)
    
    if (results.errors.length > 0) {
      console.log('\n❌ Errors encountered:')
      results.errors.forEach((err, i) => {
        console.log(`   ${i + 1}. ${err.test}: ${err.error}`)
      })
    }
    
    return results
    
  } catch (error) {
    console.error('❌ Test suite failed:', error)
    results.errors.push({ test: 'Test Suite', error: error.message })
    return results
  }
}

console.log('✅ Project Save Test Suite loaded!')
console.log('Run: window.testProjectSave()')














