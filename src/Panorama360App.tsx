import React, { useState, useCallback } from 'react'
import Panorama360Viewer from './components/Panorama360Viewer'
import { convertHDRToFastHDR } from './utils/hdrToFastHDR'
import './Panorama360App.css'

export default function Panorama360App() {
  // Check for URL parameter to auto-load image
  const urlParams = new URLSearchParams(window.location.search)
  const imageUrlParam = urlParams.get('image')
  const initialImage = imageUrlParam || null
  
  const [imageFile, setImageFile] = useState<File | string | null>(initialImage)
  const [dragActive, setDragActive] = useState(false)

  const handleFileSelect = useCallback((file: File) => {
    const extension = file.name.toLowerCase().split('.').pop() || ''
    const supportedFormats = ['ktx2', 'hdr', 'exr', 'jpg', 'jpeg', 'png', 'webp']
    
    if (!supportedFormats.includes(extension)) {
      alert(`Unsupported format: .${extension}\n\nSupported formats: ${supportedFormats.join(', ')}`)
      return
    }
    
    setImageFile(file)
  }, [])

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0])
    }
  }, [handleFileSelect])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0])
    }
  }, [handleFileSelect])

  const handleLoadFromUrl = useCallback(() => {
    const url = prompt('Enter image URL:')
    if (url) {
      setImageFile(url)
    }
  }, [])

  const handleLoadOriginalHDR = useCallback(async () => {
    try {
      // Load the HDR file from public directory
      const response = await fetch('/empty_warehouse_01_8k.hdr')
      if (!response.ok) {
        throw new Error('Failed to fetch HDR file')
      }
      
      const blob = await response.blob()
      const file = new File([blob], 'empty_warehouse_01_8k.hdr', { type: 'image/vnd.radiance' })
      
      console.log('[Panorama360App] Loading original HDR file...')
      setImageFile(file)
      
      console.log('[Panorama360App] HDR file loaded in viewer')
    } catch (error) {
      console.error('[Panorama360App] Failed to load HDR:', error)
      alert(`Failed to load HDR: ${error instanceof Error ? error.message : String(error)}`)
    }
  }, [])

  const handleLoad4KHDR = useCallback(async () => {
    try {
      // Load the 4K HDR file from public directory
      const response = await fetch('/farmland_overcast_4k.hdr')
      if (!response.ok) {
        throw new Error('Failed to fetch 4K HDR file. Please ensure the file is in the public directory.')
      }
      
      const blob = await response.blob()
      const file = new File([blob], 'farmland_overcast_4k.hdr', { type: 'image/vnd.radiance' })
      
      console.log('[Panorama360App] Loading 4K HDR file...')
      setImageFile(file)
      
      console.log('[Panorama360App] 4K HDR file loaded in viewer')
    } catch (error) {
      console.error('[Panorama360App] Failed to load 4K HDR:', error)
      alert(`Failed to load 4K HDR: ${error instanceof Error ? error.message : String(error)}`)
    }
  }, [])

  const handleConvertAndLoadHDR = useCallback(async () => {
    try {
      console.log('[Panorama360App] ⚡ Starting HDR to FastHDR conversion...')
      
      let file: File | null = null
      
      // Check if there's a currently loaded HDR file
      if (imageFile instanceof File) {
        const extension = imageFile.name.toLowerCase().split('.').pop() || ''
        if (extension === 'hdr' || extension === 'exr') {
          console.log('[Panorama360App] Using currently loaded HDR file:', imageFile.name)
          file = imageFile
        }
      }
      
      // If no HDR file is currently loaded, load the default 8K HDR file
      if (!file) {
        console.log('[Panorama360App] Loading default HDR file...')
        const response = await fetch('/empty_warehouse_01_8k.hdr')
        if (!response.ok) {
          throw new Error(`Failed to fetch HDR file: HTTP ${response.status}`)
        }
        
        const blob = await response.blob()
        file = new File([blob], 'empty_warehouse_01_8k.hdr', { type: 'image/vnd.radiance' })
        
        // First, load the original HDR so user can see it
        console.log('[Panorama360App] Loading original HDR file first...')
        setImageFile(file)
        
        // Wait a bit for the HDR to load and display
        await new Promise(resolve => setTimeout(resolve, 1000))
      } else {
        // File is already loaded, just wait a bit for it to be displayed
        await new Promise(resolve => setTimeout(resolve, 500))
      }
      
      if (!file) {
        throw new Error('No HDR file available for conversion')
      }
      
      console.log('[Panorama360App] Converting HDR to FastHDR (KTX2 with PMREM)...', {
        fileName: file.name,
        fileSize: (file.size / 1024 / 1024).toFixed(2) + ' MB'
      })
      
      // Show user feedback
      alert('Starting conversion... This may take a minute. Check the console for progress.')
      
      // Convert to KTX2 (4K resolution for faster conversion)
      // Enable PMREM generation for true FastHDR files
      const result = await convertHDRToFastHDR(file, {
        maxResolution: 4096,
        quality: 4,
        generatePMREM: true, // Enable PMREM generation for FastHDR
        onProgress: (progress) => {
          console.log(`[Panorama360App] Conversion progress: ${progress.toFixed(0)}%`)
        }
      })
      
      console.log('[Panorama360App] ✅ Conversion complete!', {
        originalSize: (result.originalSize / 1024 / 1024).toFixed(2) + ' MB',
        convertedSize: (result.convertedSize / 1024 / 1024).toFixed(2) + ' MB',
        compressionRatio: result.compressionRatio.toFixed(2) + 'x',
        originalResolution: `${result.originalResolution.width}x${result.originalResolution.height}`,
        convertedResolution: `${result.convertedResolution.width}x${result.convertedResolution.height}`
      })
      
      // Create a File object from the blob so the viewer can detect the .ktx2 extension
      const originalName = file.name.replace(/\.(hdr|exr)$/i, '')
      const ktx2File = new File([result.ktx2Blob], `${originalName}.ktx2`, { type: 'image/ktx2' })
      setImageFile(ktx2File)
      
      console.log('[Panorama360App] ✅ FastHDR (KTX2) file loaded in viewer')
      alert(`Conversion successful! File size: ${(result.convertedSize / 1024 / 1024).toFixed(2)} MB (${result.compressionRatio.toFixed(2)}x compression)`)
    } catch (error) {
      console.error('[Panorama360App] ❌ Conversion failed:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      const errorDetails = error instanceof Error && error.stack ? `\n\nDetails: ${error.stack}` : ''
      alert(`Failed to convert HDR to FastHDR:\n\n${errorMessage}${errorDetails}\n\nCheck the browser console for more details.`)
    }
  }, [imageFile])

  return (
    <div className="panorama-360-app">
      <div className="panorama-360-header">
        <h1>360° Panorama Viewer</h1>
        <p>Supports KTX2, HDR, EXR, and standard image formats</p>
        <div className="panorama-360-actions">
          <label className="panorama-360-button">
            📁 Load Image
            <input
              type="file"
              accept=".ktx2,.hdr,.exr,.jpg,.jpeg,.png,.webp"
              onChange={handleFileInput}
              style={{ display: 'none' }}
            />
          </label>
          <button className="panorama-360-button" onClick={handleLoadFromUrl}>
            🔗 Load from URL
          </button>
          <button className="panorama-360-button" onClick={handleLoadOriginalHDR}>
            📷 Load Original HDR (Test)
          </button>
          <button className="panorama-360-button" onClick={handleConvertAndLoadHDR}>
            ⚡ Convert HDR to FastHDR
          </button>
          <button className="panorama-360-button" onClick={handleLoad4KHDR}>
            🖼️ Load 4K HDR (Test)
          </button>
        </div>
      </div>
      
      <div
        className={`panorama-360-content ${dragActive ? 'drag-active' : ''} ${!imageFile ? 'no-image' : ''}`}
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
      >
        {imageFile ? (
          <Panorama360Viewer
            imageUrl={imageFile}
            onLoad={() => {
              console.log('[Panorama360App] Image loaded successfully')
            }}
            onError={(error) => {
              console.error('[Panorama360App] Image load error:', error)
              alert(`Failed to load image: ${error.message}`)
            }}
          />
        ) : (
          <div className="panorama-360-placeholder">
            <div className="placeholder-content">
              <div className="placeholder-icon">🌐</div>
              <h2>360° Panorama Viewer</h2>
              <p>Drag and drop an image file here, or click "Load Image" to browse</p>
              <div className="placeholder-formats">
                <p><strong>Supported formats:</strong></p>
                <ul>
                  <li>KTX2 (FastHDR) - Compressed HDR format</li>
                  <li>HDR - High Dynamic Range</li>
                  <li>EXR - OpenEXR format</li>
                  <li>JPG, PNG, WebP - Standard formats</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

