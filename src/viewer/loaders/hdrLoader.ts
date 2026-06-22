import * as THREE from 'three'
import { RGBELoader, EXRLoader } from 'three-stdlib'

interface ExrParseResult {
  data: THREE.TypedArray
  width: number
  height: number
  format?: THREE.PixelFormat
  type?: THREE.TextureDataType
  colorSpace?: THREE.ColorSpace
}

function parseExrData(loader: EXRLoader, arrayBuffer: ArrayBuffer): ExrParseResult {
  return loader.parse(arrayBuffer) as ExrParseResult
}

function getTextureDimensions(texture: THREE.DataTexture): { width: number; height: number } {
  const width = texture.width ?? texture.image?.width ?? 0
  const height = texture.height ?? texture.image?.height ?? 0
  return { width, height }
}

let rgbeLoader: RGBELoader | null = null
let exrLoader: EXRLoader | null = null

// No global handler needed - we'll catch errors in the promise chain

function getRGBELoader(): RGBELoader {
  if (!rgbeLoader) {
    rgbeLoader = new RGBELoader()
  }
  return rgbeLoader
}

function getEXRLoader(): EXRLoader {
  if (!exrLoader) {
    exrLoader = new EXRLoader()
  }
  return exrLoader
}

export async function loadHDR(
  url: string | File,
  onProgress?: (progress: number) => void
): Promise<THREE.DataTexture> {
  console.log('[loadHDR] Starting, url type:', url instanceof File ? 'File' : 'string', url instanceof File ? '' : url.substring(0, 50))
  
  // Wrap the entire promise to catch unhandled rejections from loader internals
  const promise = new Promise<THREE.DataTexture>((resolve, reject) => {
    // Create a rejection handler specifically for this HDR load operation
    // Store reject function so rejection handler can call it
    let capturedError: Error | null = null
    let hasResolved = false
    let hasRejected = false
    
    // Set up temporary handler to catch RGBELoader internal errors
    const rejectionHandler = (event: PromiseRejectionEvent) => {
      const error = event.reason
      const errorMsg = error instanceof Error ? error.message : String(error || '')
      const errorStack = error instanceof Error ? error.stack : ''
      
      // Intercept HDR-related image property errors during this load
      // Also check stack trace to ensure it's from RGBELoader
      if (errorMsg.includes("reading 'image'") || 
          (errorMsg.includes('image') && errorMsg.includes('undefined')) ||
          (errorStack.includes('RGBELoader') || errorStack.includes('chunk-3UTMOHLI'))) {
        event.preventDefault() // Prevent unhandled rejection - always suppress these
        
        // Only reject if we haven't already resolved/rejected
        if (!hasResolved && !hasRejected) {
          // Check if texture is actually invalid by checking if we have a valid texture object
          // Sometimes RGBELoader has internal errors but still produces a valid texture
          // Wait a bit to see if texture callback has been called
          setTimeout(() => {
            if (!hasResolved && !hasRejected) {
              // Texture callback wasn't called, so this is a real error
              capturedError = new Error(`HDR file loading failed: The file may be corrupted, invalid, or in an unsupported format. Try using an EXR file instead. Original error: ${errorMsg}`)
              console.warn('[loadHDR] RGBELoader error detected:', errorMsg)
              hasRejected = true
              reject(capturedError)
            }
            // If hasResolved is true now, the texture was loaded successfully despite the error
          }, 200)
        } else if (hasResolved) {
          // If we already resolved, just suppress the error silently
          // The texture was successfully loaded despite the internal error
          // No need to log - this is expected behavior
        }
      }
    }
    
    // Use capture phase to catch earlier - register BEFORE any async operations
    window.addEventListener('unhandledrejection', rejectionHandler, true)
    
    // Cleanup function
    const cleanup = () => {
      window.removeEventListener('unhandledrejection', rejectionHandler, true)
    }
    const isFile = url instanceof File
    
    if (isFile) {
      const file = url as File
      const fileName = file.name.toLowerCase()
      const fileSizeMB = file.size / 1024 / 1024
      
      // Warn about very large files
      if (fileSizeMB > 200) {
        console.warn(`⚠️ Large HDR file detected: ${fileSizeMB.toFixed(2)} MB. This may cause memory issues.`)
      }
      
      // Check if file is extremely large (likely to cause out-of-memory)
      if (fileSizeMB > 1000) {
        reject(new Error(`HDR file is too large (${fileSizeMB.toFixed(2)} MB). Files over 1GB may cause the browser to run out of memory. Please use a smaller resolution or convert to a compressed format.`))
        return
      }
      
      // For large files, use object URL and loader.load() instead of FileReader + parse()
      // This is more memory efficient and handles large files better
      const objectUrl = URL.createObjectURL(file)
      
      if (fileName.endsWith('.hdr')) {
        const loader = getRGBELoader()
        console.log('[loadHDR] Loading HDR file:', fileName, `(${fileSizeMB.toFixed(2)} MB)`)
        
        // Wrap in try-catch to handle internal loader errors
        // Also wrap the loader.load call itself to catch any synchronous errors
        try {
          // Use setTimeout to ensure rejection handler is registered before loader starts
          setTimeout(() => {
            // Wrap loader.load in a try-catch to catch any synchronous errors
            try {
              loader.load(
                objectUrl,
                (texture) => {
                    // Wrap in try-catch and setTimeout to catch async errors from RGBELoader internals
                    try {
                      URL.revokeObjectURL(objectUrl)
                      // Safety check: ensure texture is valid before accessing properties
                      if (!texture) {
                        reject(new Error('HDR loader returned undefined texture'))
                        return
                      }
                      // Validate texture has required properties
                      if (typeof texture !== 'object') {
                        reject(new Error('HDR loader returned invalid texture object'))
                        return
                      }
                      // Validate texture is a DataTexture instance
                      if (!(texture instanceof THREE.DataTexture)) {
                        // Check if it has the DataTexture structure
                        if (!('data' in texture) && !('width' in texture) && !('height' in texture)) {
                          reject(new Error('HDR loader returned invalid texture type'))
                          return
                        }
                      }
                      // DataTexture uses width/height directly, not image.width/height
                      // Safely access width/height without touching image property
                      const { width, height } = getTextureDimensions(texture)
                      
                      // Validate dimensions are valid
                      if (!width || !height || width <= 0 || height <= 0) {
                        reject(new Error(`HDR loader returned texture with invalid dimensions: ${width}x${height}`))
                        return
                      }
                      
                      console.log('[loadHDR] Successfully loaded HDR:', width, 'x', height)
                      // Check texture dimensions - very large textures may cause issues
                      if (width > 8192 || height > 8192) {
                        console.warn(`⚠️ Very large HDR texture: ${width}x${height}. This may cause performance issues.`)
                      }
                      
                      // Use setTimeout to ensure any RGBELoader internal errors are caught
                      // Also add a small delay to catch any late errors from RGBELoader internals
                      setTimeout(() => {
                        try {
                          if (!hasRejected && !hasResolved) {
                            hasResolved = true
                            // Keep handler active longer to catch late errors (RGBELoader sometimes errors after callback)
                            setTimeout(() => {
                              cleanup()
                            }, 300) // Keep handler active for 300ms after resolve to catch late errors
                            resolve(texture)
                          }
                        } catch (resolveError) {
                          if (!hasRejected) {
                            hasRejected = true
                            cleanup()
                            const errorMsg = resolveError instanceof Error ? resolveError.message : String(resolveError || 'Unknown error')
                            console.error('[loadHDR] Error resolving texture:', errorMsg)
                            reject(new Error(`Failed to resolve HDR texture: ${errorMsg}`))
                          }
                        }
                      }, 100) // Small delay to catch any synchronous errors
                    } catch (callbackError) {
                      URL.revokeObjectURL(objectUrl)
                      if (!hasRejected) {
                        hasRejected = true
                        cleanup()
                        const errorMsg = callbackError instanceof Error ? callbackError.message : String(callbackError || 'Unknown error')
                        console.error('[loadHDR] Error in success callback:', errorMsg)
                        reject(new Error(`Failed to process loaded HDR texture: ${errorMsg}`))
                      }
                    }
                  },
                (progress) => {
                  if (progress.lengthComputable && onProgress) {
                    onProgress((progress.loaded / progress.total) * 100)
                  }
                },
                (error) => {
                  URL.revokeObjectURL(objectUrl)
                  if (!hasRejected) {
                    hasRejected = true
                    cleanup()
                    const errorMsg = error instanceof Error ? error.message : String(error || 'Unknown error')
                    const errorStack = error instanceof Error ? error.stack : 'No stack trace'
                    console.error('[loadHDR] Failed to load HDR:', errorMsg)
                    console.error('[loadHDR] Error details:', {
                      fileName,
                      fileSizeMB,
                      errorMsg,
                      errorStack: errorStack?.substring(0, 500)
                    })
                    
                    // Provide more helpful error messages
                    if (fileSizeMB > 500) {
                      reject(new Error(`Failed to load large HDR file (${fileSizeMB.toFixed(2)} MB). The file may be too large for the browser to handle, or it may be corrupted. Error: ${errorMsg}`))
                    } else if (errorMsg.includes('memory') || errorMsg.includes('allocation')) {
                      reject(new Error(`Out of memory while loading HDR file. The file (${fileSizeMB.toFixed(2)} MB) is too large for your browser. Try using a lower resolution HDR file.`))
                    } else {
                      reject(new Error(`Failed to load HDR file: ${errorMsg}`))
                    }
                  }
                }
              )
            } catch (loadError) {
              URL.revokeObjectURL(objectUrl)
              if (!hasRejected) {
                hasRejected = true
                cleanup()
                const errorMsg = loadError instanceof Error ? loadError.message : String(loadError || 'Unknown error')
                console.error('[loadHDR] Error starting loader:', errorMsg)
                reject(new Error(`Failed to start HDR loader: ${errorMsg}`))
              }
            }
          }, 0) // setTimeout ensures rejection handler is registered first
        } catch (outerError) {
          URL.revokeObjectURL(objectUrl)
          if (!hasRejected) {
            hasRejected = true
            cleanup()
            const errorMsg = outerError instanceof Error ? outerError.message : String(outerError || 'Unknown error')
            console.error('[loadHDR] Error in outer try-catch:', errorMsg)
            reject(new Error(`Failed to initialize HDR loader: ${errorMsg}`))
          }
        }
      } else if (fileName.endsWith('.exr')) {
        // EXRLoader.load() has issues with blob URLs for large files
        // Fall back to FileReader + parse() approach which is more reliable
        const loader = getEXRLoader()
        const reader = new FileReader()
        
        reader.onprogress = (e) => {
          if (e.lengthComputable && onProgress) {
            onProgress((e.loaded / e.total) * 100)
          }
        }
        
        reader.onload = (e) => {
          URL.revokeObjectURL(objectUrl)
          try {
            const arrayBuffer = e.target?.result as ArrayBuffer
            if (!arrayBuffer || arrayBuffer.byteLength === 0) {
              reject(new Error('Empty or invalid EXR file'))
              return
            }
            console.log('[loadHDR] Parsing EXR file, size:', (arrayBuffer.byteLength / 1024 / 1024).toFixed(2), 'MB')
            const result = parseExrData(loader, arrayBuffer)
            console.log('[loadHDR] Parse result:', result ? 'success' : 'failed')
            
            if (!result) {
              reject(new Error('EXRLoader.parse() returned null or undefined'))
              return
            }
            
            // EXRLoader.parse() returns raw data, not a DataTexture
            // Check if result has required properties
            if (!result.data || !result.width || !result.height) {
              console.error('[loadHDR] Invalid EXR parse result:', result)
              reject(new Error(`Failed to parse EXR file - invalid or corrupted data. Missing: ${!result.data ? 'data' : ''} ${!result.width ? 'width' : ''} ${!result.height ? 'height' : ''}`))
              return
            }
            
            // Determine format and type - EXR typically uses Float32Array with RGBAFormat
            const format = result.format || THREE.RGBAFormat
            const type = result.type || THREE.FloatType
            
            console.log('[loadHDR] EXR data info:', {
              width: result.width,
              height: result.height,
              format: format,
              type: type,
              dataType: result.data?.constructor?.name,
              dataLength: result.data?.length
            })
            
            // Create DataTexture from parsed data
            const texture = new THREE.DataTexture(result.data, result.width, result.height, format, type)
            texture.needsUpdate = true
            if (result.colorSpace !== undefined) {
              texture.colorSpace = result.colorSpace
            }
            
            // DataTexture uses width/height directly, not image.width/height
            console.log('[loadHDR] Successfully created EXR DataTexture:', texture.width, 'x', texture.height)
            resolve(texture)
          } catch (error) {
            console.error('EXR parse error:', error)
            const errorMsg = error instanceof Error ? error.message : String(error || 'Unknown error')
            reject(new Error(`Failed to parse EXR file: ${errorMsg}`))
          }
        }
        
        reader.onerror = () => {
          URL.revokeObjectURL(objectUrl)
          reject(new Error('Failed to read EXR file'))
        }
        
        reader.readAsArrayBuffer(file)
      } else {
        URL.revokeObjectURL(objectUrl)
        reject(new Error('Unsupported HDR format. Supported: .hdr, .exr'))
      }
    } else {
      const urlString = url as string
      const urlLower = urlString.toLowerCase()
      
      if (urlLower.endsWith('.hdr')) {
        const loader = getRGBELoader()
        loader.load(
          urlString,
          (texture) => resolve(texture),
          (progress) => {
            if (progress.lengthComputable && onProgress) {
              onProgress((progress.loaded / progress.total) * 100)
            }
          },
          (error) => reject(error)
        )
      } else if (urlLower.endsWith('.exr')) {
        // For EXR files, use fetch + parse instead of loader.load()
        // EXRLoader.load() has issues with blob URLs
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout
        
        fetch(urlString, { signal: controller.signal })
          .then(response => {
            clearTimeout(timeoutId)
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${response.statusText}`)
            }
            return response.arrayBuffer()
          })
          .then(arrayBuffer => {
            console.log('[loadHDR] Parsing EXR from URL, size:', (arrayBuffer.byteLength / 1024 / 1024).toFixed(2), 'MB')
            const loader = getEXRLoader()
            const result = parseExrData(loader, arrayBuffer)
            console.log('[loadHDR] Parse result:', result ? 'success' : 'failed')
            
            if (!result) {
              reject(new Error('EXRLoader.parse() returned null or undefined'))
              return
            }
            
            if (!result.data || !result.width || !result.height) {
              console.error('[loadHDR] Invalid EXR parse result:', result)
              reject(new Error(`Failed to parse EXR file - invalid or corrupted data. Missing: ${!result.data ? 'data' : ''} ${!result.width ? 'width' : ''} ${!result.height ? 'height' : ''}`))
              return
            }
            
            // Determine format and type
            const format = result.format || THREE.RGBAFormat
            const type = result.type || THREE.FloatType
            
            console.log('[loadHDR] EXR data info:', {
              width: result.width,
              height: result.height,
              format: format,
              type: type,
              dataType: result.data?.constructor?.name,
              dataLength: result.data?.length
            })
            
            // Create DataTexture from parsed data
            const texture = new THREE.DataTexture(result.data, result.width, result.height, format, type)
            texture.needsUpdate = true
            if (result.colorSpace !== undefined) {
              texture.colorSpace = result.colorSpace
            }
            
            // DataTexture uses width/height directly, not image.width/height
            console.log('[loadHDR] Successfully created EXR DataTexture:', texture.width, 'x', texture.height)
            resolve(texture)
          })
          .catch(error => {
            clearTimeout(timeoutId)
            let errorMsg = error instanceof Error ? error.message : String(error || 'Unknown error')
            
            // Provide better error messages for connection issues
            if (error instanceof Error && (error.name === 'AbortError' || errorMsg.includes('timeout'))) {
              errorMsg = `Connection timeout: Failed to load EXR from ${urlString}. The server took too long to respond. Please check your internet connection and try again.`
            } else if (errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError')) {
              errorMsg = `Connection failed: Unable to reach ${urlString}. Please check your internet connection, VPN settings, or firewall.`
            }
            
            reject(new Error(`Failed to load EXR from URL: ${errorMsg}`))
          })
      } else if (urlString.startsWith('blob:')) {
        // For blob URLs without extension, try HDR first (most common), then EXR
        // Since we can't determine format from blob URL, try both loaders
        console.log('[loadHDR] Blob URL detected, trying HDR first...')
        const rgbeLoader = getRGBELoader()
        rgbeLoader.load(
          urlString,
          (texture) => {
            // Safety check: ensure texture is valid
            if (!texture) {
              // Texture is undefined, try EXR fallback by triggering error handler
              console.log('[loadHDR] HDR loader returned undefined, trying EXR...')
              // Manually trigger EXR fallback
              fetch(urlString)
                .then(response => {
                  if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
                  }
                  return response.arrayBuffer()
                })
                .then(arrayBuffer => {
                  console.log('[loadHDR] Parsing blob as EXR, size:', (arrayBuffer.byteLength / 1024 / 1024).toFixed(2), 'MB')
                  const exrLoader = getEXRLoader()
                  const exrResult = parseExrData(exrLoader, arrayBuffer)
                  
                  if (!exrResult) {
                    reject(new Error(`Failed to load blob as HDR or EXR. HDR returned undefined. EXR parse returned null.`))
                    return
                  }
                  
                  if (!exrResult.data || !exrResult.width || !exrResult.height) {
                    reject(new Error(`Failed to load blob as HDR or EXR. HDR returned undefined. EXR data invalid.`))
                    return
                  }
                  
                  const format = exrResult.format || THREE.RGBAFormat
                  const type = exrResult.type || THREE.FloatType
                  
                  console.log('[loadHDR] Successfully parsed as EXR:', exrResult.width, 'x', exrResult.height)
                  const texture = new THREE.DataTexture(exrResult.data, exrResult.width, exrResult.height, format, type)
                  texture.needsUpdate = true
                  if (exrResult.colorSpace !== undefined) {
                    texture.colorSpace = exrResult.colorSpace
                  }
                  
                  resolve(texture)
                })
                .catch(exrError => {
                  const errorMsg = exrError instanceof Error ? exrError.message : String(exrError || 'Unknown error')
                  reject(new Error(`Failed to load blob URL as HDR or EXR. HDR returned undefined. EXR: ${errorMsg}`))
                })
              return
            }
            // DataTexture uses width/height directly, not image.width/height
            const { width, height } = getTextureDimensions(texture)
            console.log('[loadHDR] Successfully loaded as HDR:', width, 'x', height)
            resolve(texture)
          },
          (progress) => {
            if (progress.lengthComputable && onProgress) {
              onProgress((progress.loaded / progress.total) * 100)
            }
          },
          (error) => {
            // HDR failed, try EXR using fetch + parse
            console.log('[loadHDR] HDR loader failed, trying EXR...')
            fetch(urlString)
              .then(response => {
                if (!response.ok) {
                  throw new Error(`HTTP ${response.status}: ${response.statusText}`)
                }
                return response.arrayBuffer()
              })
              .then(arrayBuffer => {
                console.log('[loadHDR] Parsing blob as EXR, size:', (arrayBuffer.byteLength / 1024 / 1024).toFixed(2), 'MB')
                const exrLoader = getEXRLoader()
                const exrResult = parseExrData(exrLoader, arrayBuffer)
                
                if (!exrResult) {
                  const errorMsg = error instanceof Error ? error.message : String(error || 'Unknown error')
                  reject(new Error(`Failed to load blob as HDR or EXR. HDR error: ${errorMsg}. EXR parse returned null.`))
                  return
                }
                
                if (!exrResult.data || !exrResult.width || !exrResult.height) {
                  const errorMsg = error instanceof Error ? error.message : String(error || 'Unknown error')
                  reject(new Error(`Failed to load blob as HDR or EXR. HDR error: ${errorMsg}. EXR data invalid.`))
                  return
                }
                
                const format = exrResult.format || THREE.RGBAFormat
                const type = exrResult.type || THREE.FloatType
                
                console.log('[loadHDR] Successfully parsed as EXR:', exrResult.width, 'x', exrResult.height)
                const texture = new THREE.DataTexture(exrResult.data, exrResult.width, exrResult.height, format, type)
                texture.needsUpdate = true
                if (exrResult.colorSpace !== undefined) {
                  texture.colorSpace = exrResult.colorSpace
                }
                
                resolve(texture)
              })
              .catch(error2 => {
                const errorMsg = error instanceof Error ? error.message : String(error || 'Unknown error')
                const error2Msg = error2 instanceof Error ? error2.message : String(error2 || 'Unknown error')
                reject(new Error(`Failed to load blob URL as HDR or EXR. HDR: ${errorMsg}. EXR: ${error2Msg}`))
              })
          }
        )
      } else {
        // Try to detect format from content if extension is missing
        const loader = getRGBELoader()
        loader.load(
          urlString,
          (texture) => resolve(texture),
          (progress) => {
            if (progress.lengthComputable && onProgress) {
              onProgress((progress.loaded / progress.total) * 100)
            }
          },
          () => {
            // If RGBE fails, try EXR
            const exrLoader = getEXRLoader()
            exrLoader.load(
              urlString,
              (texture) => resolve(texture),
              (progress) => {
                if (progress.lengthComputable && onProgress) {
                  onProgress((progress.loaded / progress.total) * 100)
                }
              },
              (error) => {
                const errorMsg = error instanceof Error ? error.message : String(error || 'Unknown error')
                reject(new Error(`Unsupported HDR format or file error. Supported: .hdr, .exr. Error: ${errorMsg}`))
              }
            )
          }
        )
      }
    }
  })
  
  // Add timeout fallback in case loader doesn't call error callback
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  const timeoutPromise = new Promise<never>((_, timeoutReject) => {
    timeoutId = setTimeout(() => {
      timeoutReject(new Error('HDR loading timed out after 30 seconds. The file may be too large or corrupted.'))
    }, 30000) // 30 second timeout
  })
  
  return Promise.race([
    promise.catch((error) => {
      if (timeoutId) clearTimeout(timeoutId)
      const errorMsg = error instanceof Error ? error.message : String(error || 'Unknown error')
      // If it's the specific image property error, provide a helpful message
      if (errorMsg.includes("reading 'image'") || (errorMsg.includes('image') && errorMsg.includes('undefined'))) {
        throw new Error(`HDR file loading failed: The file may be corrupted, invalid, or in an unsupported format. Try using an EXR file instead, or verify the HDR file is valid. Original error: ${errorMsg}`)
      }
      throw error
    }),
    timeoutPromise
  ]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId)
  })
}

