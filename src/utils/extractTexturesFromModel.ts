/**
 * Extract texture information from GLTF/GLB files BEFORE loading the model
 * This allows users to review and merge textures before the model is loaded
 */

import * as THREE from 'three'

export interface ExtractedTextureInfo {
  id: string
  name: string
  uri?: string
  mimeType?: string
  width?: number
  height?: number
  format?: string
  type?: string
  bufferView?: number
  source?: number
  index: number // Index in GLTF textures array
}

export interface ExtractedTextureData {
  textures: ExtractedTextureInfo[]
  images: Array<{
    uri?: string
    mimeType?: string
    bufferView?: number
  }>
  samplers: Array<{
    magFilter?: number
    minFilter?: number
    wrapS?: number
    wrapT?: number
  }>
}

/**
 * Extract texture information from a GLTF file (JSON format)
 * This function extracts ALL textures by processing ALL images in the images array.
 * This is the most comprehensive approach - extract everything, not just what's referenced.
 */
export async function extractTexturesFromGLTF(gltfJson: any, baseUrl?: string): Promise<ExtractedTextureData> {
  const textures: ExtractedTextureInfo[] = []
  const images = gltfJson.images || []
  const samplers = gltfJson.samplers || []
  const texturesArray = gltfJson.textures || []
  
  // Log initial GLTF structure for debugging
  console.log(`🔍 GLTF Structure Analysis:`, {
    imagesCount: images.length,
    texturesCount: texturesArray.length,
    samplersCount: samplers.length,
    materialsCount: (gltfJson.materials || []).length,
    meshesCount: (gltfJson.meshes || []).length,
    extensionsUsed: gltfJson.extensionsUsed || [],
    extensionsRequired: gltfJson.extensionsRequired || []
  })
  
  // Analyze images array structure
  const imagesWithUri = images.filter((img: any) => img.uri !== undefined && img.uri !== null).length
  const imagesWithBufferView = images.filter((img: any) => img.bufferView !== undefined && img.bufferView !== null).length
  const imagesWithNeither = images.length - imagesWithUri - imagesWithBufferView
  
  console.log(`📊 Images Array Analysis:`, {
    total: images.length,
    withUri: imagesWithUri,
    withBufferView: imagesWithBufferView,
    withNeither: imagesWithNeither,
    sampleImages: images.slice(0, 5).map((img: any, idx: number) => ({
      index: idx,
      hasUri: !!img.uri,
      hasBufferView: img.bufferView !== undefined,
      uri: img.uri ? (img.uri.length > 50 ? img.uri.substring(0, 50) + '...' : img.uri) : 'none',
      bufferView: img.bufferView,
      mimeType: img.mimeType,
      name: img.name
    }))
  })
  
  // Track which images we've processed to avoid duplicates
  const processedImageIndices = new Set<number>()
  const processedTextureIndices = new Set<number>()
  
  // FIRST: Process ALL textures from the textures array
  // This is the primary source - each texture is a distinct entity that may reference the same image
  // with different samplers. We want to extract ALL textures, not just unique images.
  texturesArray.forEach((texture: any, textureIndex: number) => {
    const imageIndex = texture.source
    if (imageIndex !== undefined && imageIndex !== null && imageIndex >= 0 && imageIndex < images.length) {
      const image = images[imageIndex]
      const samplerIndex = texture.sampler
      const sampler = samplerIndex !== undefined && samplerIndex !== null && samplerIndex >= 0 && samplerIndex < samplers.length ? samplers[samplerIndex] : {}
      
      let name = texture.name || image.name || `texture_${textureIndex}`
      let uri = image.uri
      
      // If no URI, it might be in a bufferView (embedded in GLB)
      if (!uri && image.bufferView !== undefined && image.bufferView !== null) {
        uri = `bufferView:${image.bufferView}`
      }
      
      // Construct full URL if baseUrl is provided
      if (uri && baseUrl && !uri.startsWith('data:') && !uri.startsWith('http') && !uri.startsWith('bufferView:')) {
        try {
          uri = new URL(uri, baseUrl).href
        } catch (e) {
          console.warn(`Failed to construct URL for texture ${textureIndex}:`, e)
        }
      }
      
      // Add texture if it has a URI or bufferView
      if (uri || image.bufferView !== undefined) {
        textures.push({
          id: `texture-${textureIndex}`,
          name: name,
          uri: uri || undefined,
          mimeType: image.mimeType,
          bufferView: image.bufferView,
          source: texture.source,
          index: textureIndex, // Use original texture index, not textures.length
          format: sampler.magFilter ? 'RGBA' : undefined,
          type: 'UnsignedByte'
        })
        
        processedTextureIndices.add(textureIndex)
        processedImageIndices.add(imageIndex)
      } else {
        // Log textures without URI or bufferView for debugging
        console.warn(`⚠️ Texture ${textureIndex} (image ${imageIndex}) has no URI or bufferView:`, {
          textureName: texture.name,
          imageName: image.name,
          hasUri: !!image.uri,
          hasBufferView: image.bufferView !== undefined,
          image: image
        })
      }
    } else if (imageIndex !== undefined && imageIndex !== null) {
      console.warn(`⚠️ Texture ${textureIndex} references invalid image index: ${imageIndex} (images array length: ${images.length})`)
    }
  })
  
  // SECOND: Process any remaining images that weren't referenced by any texture
  // This catches images that exist but aren't explicitly referenced in textures
  images.forEach((image: any, imageIndex: number) => {
    if (!processedImageIndices.has(imageIndex)) {
      let name = image.name || `image_${imageIndex}`
      let uri = image.uri
      
      // If no URI, it might be in a bufferView (embedded in GLB)
      if (!uri && image.bufferView !== undefined && image.bufferView !== null) {
        uri = `bufferView:${image.bufferView}`
      }
      
      // Construct full URL if baseUrl is provided
      if (uri && baseUrl && !uri.startsWith('data:') && !uri.startsWith('http') && !uri.startsWith('bufferView:')) {
        try {
          uri = new URL(uri, baseUrl).href
        } catch (e) {
          console.warn(`Failed to construct URL for image ${imageIndex}:`, e)
        }
      }
      
      // Add image if we have a URI or bufferView
      if (uri || image.bufferView !== undefined) {
        textures.push({
          id: `image-${imageIndex}`,
          name: name,
          uri: uri || undefined,
          mimeType: image.mimeType,
          bufferView: image.bufferView,
          source: imageIndex,
          index: -1, // -1 indicates this image is not in the textures array
          format: 'RGBA',
          type: 'UnsignedByte'
        })
        
        processedImageIndices.add(imageIndex)
      }
    }
  })
  
  // THIRD: Check materials and extensions for any texture references we might have missed
  // This is a safety net to catch any edge cases, especially in extensions
  const materials = gltfJson.materials || []
  const foundTextureIndices = new Set<number>()
  const foundImageIndices = new Set<number>()
  
  // Recursively find all texture and image indices in an object
  const findTextureAndImageIndices = (obj: any, path: string = ''): { textureIndices: number[], imageIndices: number[] } => {
    const textureIndices: number[] = []
    const imageIndices: number[] = []
    
    if (obj === null || obj === undefined) return { textureIndices, imageIndices }
    
    if (typeof obj === 'object') {
      if (Array.isArray(obj)) {
        obj.forEach((item, i) => {
          const result = findTextureAndImageIndices(item, `${path}[${i}]`)
          textureIndices.push(...result.textureIndices)
          imageIndices.push(...result.imageIndices)
        })
      } else {
        // Check if this object has an 'index' property that might reference a texture
        if (obj.index !== undefined && typeof obj.index === 'number') {
          // Check if this looks like a texture reference (has index, might have texCoord)
          if (obj.texCoord !== undefined || path.includes('Texture') || path.includes('texture') || path.includes('map')) {
            textureIndices.push(obj.index)
          }
        }
        
        // Check for direct image references (some extensions might reference images directly)
        if (obj.source !== undefined && typeof obj.source === 'number' && (path.includes('image') || path.includes('Image'))) {
          imageIndices.push(obj.source)
        }
        
        // Recursively check all properties, especially extensions
        Object.keys(obj).forEach(key => {
          const result = findTextureAndImageIndices(obj[key], path ? `${path}.${key}` : key)
          textureIndices.push(...result.textureIndices)
          imageIndices.push(...result.imageIndices)
        })
      }
    }
    
    return { textureIndices, imageIndices }
  }
  
  // Check all materials for texture references
  materials.forEach((material: any, matIndex: number) => {
    const result = findTextureAndImageIndices(material, `materials[${matIndex}]`)
    result.textureIndices.forEach(textureIndex => {
      foundTextureIndices.add(textureIndex)
    })
    result.imageIndices.forEach(imageIndex => {
      foundImageIndices.add(imageIndex)
    })
  })
  
  // Check root-level extensions for texture references
  if (gltfJson.extensions) {
    const rootExtensions = findTextureAndImageIndices(gltfJson.extensions, 'extensions')
    rootExtensions.textureIndices.forEach(textureIndex => {
      foundTextureIndices.add(textureIndex)
    })
    rootExtensions.imageIndices.forEach(imageIndex => {
      foundImageIndices.add(imageIndex)
    })
  }
  
  // Process any images we found in materials/extensions that we haven't processed yet
  foundImageIndices.forEach(imageIndex => {
    if (!processedImageIndices.has(imageIndex) && imageIndex >= 0 && imageIndex < images.length) {
      const image = images[imageIndex]
      let name = image.name || `image_ext_${imageIndex}`
      let uri = image.uri
      
      if (!uri && image.bufferView !== undefined && image.bufferView !== null) {
        uri = `bufferView:${image.bufferView}`
      }
      
      if (uri && baseUrl && !uri.startsWith('data:') && !uri.startsWith('http') && !uri.startsWith('bufferView:')) {
        try {
          uri = new URL(uri, baseUrl).href
        } catch (e) {
          console.warn(`Failed to construct URL for extension image ${imageIndex}:`, e)
        }
      }
      
      if (uri || image.bufferView !== undefined) {
        textures.push({
          id: `image-ext-${imageIndex}`,
          name: name,
          uri: uri || undefined,
          mimeType: image.mimeType,
          bufferView: image.bufferView,
          source: imageIndex,
          index: -1, // -1 indicates this image is not in the textures array
          format: 'RGBA',
          type: 'UnsignedByte'
        })
        
        processedImageIndices.add(imageIndex)
      }
    }
  })
  
  // Process any textures we found in materials/extensions that reference images we haven't processed yet
  foundTextureIndices.forEach(textureIndex => {
    if (textureIndex >= 0 && textureIndex < texturesArray.length) {
      const texture = texturesArray[textureIndex]
      if (texture && texture.source !== undefined) {
        const imageIndex = texture.source
        if (!processedImageIndices.has(imageIndex) && imageIndex >= 0 && imageIndex < images.length) {
          const image = images[imageIndex]
          const samplerIndex = texture.sampler
          const sampler = samplerIndex !== undefined && samplerIndex !== null && samplerIndex >= 0 ? samplers[samplerIndex] : {}
          
          let name = image.name || texture.name || `texture_ext_${textureIndex}`
          let uri = image.uri
          
          if (!uri && image.bufferView !== undefined && image.bufferView !== null) {
            uri = `bufferView:${image.bufferView}`
          }
          
          if (uri && baseUrl && !uri.startsWith('data:') && !uri.startsWith('http') && !uri.startsWith('bufferView:')) {
            try {
              uri = new URL(uri, baseUrl).href
            } catch (e) {
              console.warn(`Failed to construct URL for extension texture ${textureIndex}:`, e)
            }
          }
          
          if (uri || image.bufferView !== undefined) {
            textures.push({
              id: `texture-ext-${textureIndex}`,
              name: name,
              uri: uri || undefined,
              mimeType: image.mimeType,
              bufferView: image.bufferView,
              source: texture.source,
              index: textureIndex, // Use actual texture index from textures array
              format: sampler.magFilter ? 'RGBA' : undefined,
              type: 'UnsignedByte'
            })
            
            processedImageIndices.add(imageIndex)
          }
        }
      }
    }
  })
  
  // Log detailed information for debugging
  const embeddedCount = textures.filter(t => t.uri?.startsWith('bufferView:') || t.bufferView !== undefined).length
  const externalCount = textures.filter(t => t.uri && !t.uri.startsWith('bufferView:') && !t.uri.startsWith('data:')).length
  const dataUriCount = textures.filter(t => t.uri?.startsWith('data:')).length
  const noUriCount = textures.filter(t => !t.uri && t.bufferView === undefined).length
  
  console.log(`📊 Texture extraction summary:`, {
    texturesArray: texturesArray.length,
    imagesArray: images.length,
    extractedTextures: textures.length,
    processedTextures: processedTextureIndices.size,
    processedImages: processedImageIndices.size,
    embedded: embeddedCount,
    external: externalCount,
    dataUri: dataUriCount,
    noUri: noUriCount,
    foundInMaterials: foundTextureIndices.size,
    foundInExtensions: foundImageIndices.size,
    note: 'Processed ALL textures from textures array first, then remaining images, then materials/extensions'
  })
  
  // Log detailed breakdown
  console.log(`📋 Detailed breakdown:`, {
    fromTexturesArray: textures.filter(t => t.id.startsWith('texture-') && !t.id.includes('ext') && !t.id.includes('mat')).length,
    fromImagesArray: textures.filter(t => t.id.startsWith('image-') && !t.id.includes('ext')).length,
    fromExtensions: textures.filter(t => t.id.includes('ext')).length,
    fromMaterials: textures.filter(t => t.id.includes('mat')).length
  })
  
  // Log warning if we're missing textures
  if (texturesArray.length > textures.length) {
    const missingCount = texturesArray.length - textures.length
    console.warn(`⚠️ WARNING: texturesArray has ${texturesArray.length} textures but we only extracted ${textures.length}. Missing ${missingCount} texture(s).`)
    console.warn(`   This might indicate textures without valid image references or images without URI/bufferView.`)
  }
  
  // Log info about unique images vs total textures
  const uniqueImages = new Set(textures.map(t => t.source)).size
  console.log(`ℹ️ Texture vs Image relationship:`, {
    totalTextures: textures.length,
    uniqueImages: uniqueImages,
    texturesPerImage: (textures.length / uniqueImages).toFixed(2),
    note: 'Multiple textures can reference the same image with different samplers'
  })
  
  // Log first few textures for verification
  if (textures.length > 0) {
    console.log(`📋 Sample extracted textures (first 10):`, textures.slice(0, 10).map(t => ({
      id: t.id,
      name: t.name,
      hasUri: !!t.uri,
      hasBufferView: t.bufferView !== undefined,
      uri: t.uri ? (t.uri.length > 50 ? t.uri.substring(0, 50) + '...' : t.uri) : 'none',
      type: t.uri?.startsWith('bufferView:') ? 'embedded' : t.uri?.startsWith('data:') ? 'dataUri' : t.uri ? 'external' : 'none'
    })))
  }
  
  // Warn if we're missing textures
  if (texturesArray.length > textures.length) {
    console.warn(`⚠️ WARNING: texturesArray has ${texturesArray.length} textures but we only extracted ${textures.length}`)
  }
  if (images.length > processedImageIndices.size) {
    console.warn(`⚠️ WARNING: images array has ${images.length} images but we only processed ${processedImageIndices.size}`)
  }

  return {
    textures,
    images,
    samplers
  }
}

/**
 * Extract texture information from a GLB file (binary format)
 */
export async function extractTexturesFromGLB(file: File): Promise<ExtractedTextureData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    
    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer
        if (!arrayBuffer) {
          reject(new Error('Failed to read file'))
          return
        }

        const dataView = new DataView(arrayBuffer)
        let byteOffset = 0

        // Read GLB header (12 bytes)
        const magic = dataView.getUint32(byteOffset, true)
        if (magic !== 0x46546C67) { // "glTF"
          reject(new Error('Invalid GLB file'))
          return
        }
        
        byteOffset += 4
        const version = dataView.getUint32(byteOffset, true)
        byteOffset += 4
        const length = dataView.getUint32(byteOffset, true)
        byteOffset += 4

        // Read JSON chunk
        const jsonChunkLength = dataView.getUint32(byteOffset, true)
        byteOffset += 4
        const jsonChunkType = dataView.getUint32(byteOffset, true)
        byteOffset += 4
        
        if (jsonChunkType !== 0x4E4F534A) { // "JSON"
          reject(new Error('Invalid GLB structure'))
          return
        }

        const jsonChunk = new Uint8Array(arrayBuffer, byteOffset, jsonChunkLength)
        const jsonText = new TextDecoder().decode(jsonChunk)
        const gltfJson = JSON.parse(jsonText)
        
        // Log GLTF structure for debugging
        console.log(`📋 GLB JSON structure:`, {
          hasImages: !!gltfJson.images,
          imagesCount: gltfJson.images?.length || 0,
          hasTextures: !!gltfJson.textures,
          texturesCount: gltfJson.textures?.length || 0,
          hasMaterials: !!gltfJson.materials,
          materialsCount: gltfJson.materials?.length || 0,
          hasMeshes: !!gltfJson.meshes,
          meshesCount: gltfJson.meshes?.length || 0,
          hasScenes: !!gltfJson.scenes,
          scenesCount: gltfJson.scenes?.length || 0
        })
        
        // Extract textures from JSON
        const result = await extractTexturesFromGLTF(gltfJson)
        
        // Store GLTF JSON and arrayBuffer in result for bufferView extraction
        const resultWithData = {
          ...result,
          gltfJson: gltfJson,
          arrayBuffer: arrayBuffer
        }
        
        resolve(resultWithData)
      } catch (error) {
        reject(error)
      }
    }

    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsArrayBuffer(file)
  })
}

/**
 * Extract texture information from a GLTF file (text format)
 */
export async function extractTexturesFromGLTFFile(file: File): Promise<ExtractedTextureData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string
        if (!text) {
          reject(new Error('Failed to read file'))
          return
        }

        const gltfJson = JSON.parse(text)
        const baseUrl = file.webkitRelativePath 
          ? new URL(file.webkitRelativePath, 'file://').href.replace(/\/[^/]*$/, '/')
          : undefined
        
        const result = await extractTexturesFromGLTF(gltfJson, baseUrl)
        resolve(result)
      } catch (error) {
        reject(error)
      }
    }

    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsText(file)
  })
}

/**
 * Extract textures from any model file format
 */
export async function extractTexturesFromModelFile(file: File): Promise<ExtractedTextureData | null> {
  const fileName = file.name.toLowerCase()
  
  console.log(`🔍 Attempting to extract textures from: ${fileName}`)
  
  try {
    if (fileName.endsWith('.glb')) {
      console.log('📦 Detected GLB file, extracting textures...')
      const result = await extractTexturesFromGLB(file)
      console.log(`✅ Extracted ${result.textures.length} textures from GLB`)
      return result
    } else if (fileName.endsWith('.gltf')) {
      console.log('📄 Detected GLTF file, extracting textures...')
      const result = await extractTexturesFromGLTFFile(file)
      console.log(`✅ Extracted ${result.textures.length} textures from GLTF`)
      return result
    }
    
    console.log(`⚠️ File format not supported for pre-extraction: ${fileName}`)
    // For other formats, return null (textures will be extracted after loading)
    return null
  } catch (error) {
    console.error('❌ Error extracting textures:', error)
    return null
  }
}

/**
 * Extract embedded texture from GLB bufferView
 */
async function extractBufferViewTexture(
  arrayBuffer: ArrayBuffer,
  bufferViewIndex: number,
  gltfJson: any,
  mimeType?: string
): Promise<HTMLImageElement | null> {
  try {
    const dataView = new DataView(arrayBuffer)
    let byteOffset = 0

    // Read GLB header
    byteOffset += 12 // Skip magic, version, length

    // Read JSON chunk
    const jsonChunkLength = dataView.getUint32(byteOffset, true)
    byteOffset += 4
    const jsonChunkType = dataView.getUint32(byteOffset, true)
    byteOffset += 4
    
    if (jsonChunkType !== 0x4E4F534A) { // "JSON"
      return null
    }

    byteOffset += jsonChunkLength

    // Read BIN chunk
    const binChunkLength = dataView.getUint32(byteOffset, true)
    byteOffset += 4
    const binChunkType = dataView.getUint32(byteOffset, true)
    byteOffset += 4
    
    if (binChunkType !== 0x004E4942) { // "BIN\0"
      return null
    }

    // Get bufferView info from GLTF JSON
    const bufferViews = gltfJson.bufferViews || []
    const bufferView = bufferViews[bufferViewIndex]
    
    if (!bufferView) {
      return null
    }

    // Extract image data from binary chunk
    const bufferOffset = bufferView.byteOffset || 0
    const bufferLength = bufferView.byteLength || 0
    const imageData = arrayBuffer.slice(byteOffset + bufferOffset, byteOffset + bufferOffset + bufferLength)
    
    // Create blob and image
    const blob = new Blob([imageData], { type: mimeType || 'image/png' })
    const blobUrl = URL.createObjectURL(blob)
    
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        URL.revokeObjectURL(blobUrl)
        resolve(img)
      }
      img.onerror = () => {
        URL.revokeObjectURL(blobUrl)
        resolve(null)
      }
      img.src = blobUrl
    })
  } catch (error) {
    console.warn('Failed to extract bufferView texture:', error)
    return null
  }
}

/**
 * Load texture images from extracted texture info
 */
export async function loadTextureImages(
  textureInfos: ExtractedTextureInfo[],
  file: File,
  textureFiles?: Map<string, File>,
  gltfJson?: any, // Pass GLTF JSON for bufferView extraction
  arrayBuffer?: ArrayBuffer, // Pass arrayBuffer for bufferView extraction (from GLB)
  onProgress?: (current: number, total: number) => void
): Promise<Map<string, { image: HTMLImageElement, info: ExtractedTextureInfo }>> {
  const loadedTextures = new Map<string, { image: HTMLImageElement, info: ExtractedTextureInfo }>()
  
  // If we don't have arrayBuffer but need it, read the file
  let fileArrayBuffer = arrayBuffer
  if (!fileArrayBuffer && gltfJson) {
    fileArrayBuffer = await file.arrayBuffer()
  }
  
  // Load textures in batches to avoid freezing the UI
  const BATCH_SIZE = 10 // Load 10 textures at a time
  const BATCH_DELAY = 50 // 50ms delay between batches
  
  for (let i = 0; i < textureInfos.length; i += BATCH_SIZE) {
    // Update progress
    if (onProgress) {
      onProgress(Math.min(i, textureInfos.length), textureInfos.length)
    }
    const batch = textureInfos.slice(i, i + BATCH_SIZE)
    
    // Load batch in parallel
    const batchPromises = batch.map(async (info) => {
      try {
        let imageUrl: string | null = null
        let image: HTMLImageElement | null = null
        
        // Check if it's a data URI
        if (info.uri?.startsWith('data:')) {
          imageUrl = info.uri
        }
        // Check if it's a bufferView reference (embedded in GLB)
        // Check both URI format and direct bufferView property
        else if (info.bufferView !== undefined && gltfJson && fileArrayBuffer) {
          // Extract embedded texture from GLB
          const bufferViewIndex = info.bufferView
          image = await extractBufferViewTexture(fileArrayBuffer, bufferViewIndex, gltfJson, info.mimeType)
          if (image) {
            console.log(`✅ Extracted embedded texture: ${info.name} (${image.width}x${image.height})`)
          } else {
            console.warn(`⚠️ Failed to extract embedded texture: ${info.name} (bufferView: ${bufferViewIndex})`)
          }
        }
        // Also check if URI indicates bufferView (for backwards compatibility)
        else if (info.uri?.startsWith('bufferView:') && gltfJson && fileArrayBuffer) {
          // Try to extract bufferView index from URI
          const match = info.uri.match(/bufferView:(\d+)/)
          if (match) {
            const bufferViewIndex = parseInt(match[1], 10)
            image = await extractBufferViewTexture(fileArrayBuffer, bufferViewIndex, gltfJson, info.mimeType)
            if (image) {
              console.log(`✅ Extracted embedded texture from URI: ${info.name} (${image.width}x${image.height})`)
            }
          }
        }
        // Check if we have the texture file
        else if (info.uri && textureFiles) {
          const fileName = info.uri.split('/').pop() || info.uri
          const textureFile = textureFiles.get(fileName) || textureFiles.get(fileName.toLowerCase())
          
          if (textureFile) {
            imageUrl = URL.createObjectURL(textureFile)
          }
        }
        
        // Load image if we have a URL
        if (imageUrl && !image) {
          image = new Image()
          await new Promise((resolve, reject) => {
            image!.onload = () => resolve(image!)
            image!.onerror = () => reject(new Error(`Failed to load texture: ${info.uri}`))
            image!.src = imageUrl!
          })
        }
        
        if (image) {
          return { id: info.id, image, info }
        }
      } catch (error) {
        console.warn(`Failed to load texture ${info.name}:`, error)
      }
      return null
    })
    
    // Wait for batch to complete
    const batchResults = await Promise.all(batchPromises)
    batchResults.forEach(result => {
      if (result) {
        loadedTextures.set(result.id, { image: result.image, info: result.info })
      }
    })
    
    // Yield to UI thread between batches
    if (i + BATCH_SIZE < textureInfos.length) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY))
    }
  }
  
  // Final progress update
  if (onProgress) {
    onProgress(textureInfos.length, textureInfos.length)
  }
  
  return loadedTextures
}

