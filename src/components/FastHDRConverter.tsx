import { useState, useRef } from 'react'
import { convertHDRToFastHDR, getRecommendedSettings, isKTX2EncodingAvailable, type ConversionOptions } from '../utils/hdrToFastHDR'

export default function FastHDRConverter() {
  const [isConverting, setIsConverting] = useState(false)
  const [conversionProgress, setConversionProgress] = useState(0)
  const [conversionResult, setConversionResult] = useState<{
    originalSize: number
    convertedSize: number
    compressionRatio: number
    originalResolution: { width: number; height: number }
    convertedResolution: { width: number; height: number }
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [selectedResolution, setSelectedResolution] = useState<string>('4096') // Default to 4K
  const [options, setOptions] = useState<ConversionOptions>({
    quality: 4,
    maxResolution: 4096,
    compressionLevel: 1,
    generateMipmaps: true
  })
  
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Resolution presets
  const resolutionPresets = [
    { label: 'Original (No Resize)', value: '0' },
    { label: '8K (8192px)', value: '8192' },
    { label: '6K (6144px)', value: '6144' },
    { label: '4K (4096px)', value: '4096' },
    { label: '2K (2048px)', value: '2048' },
    { label: '1K (1024px)', value: '1024' },
    { label: '512px', value: '512' },
    { label: 'Custom...', value: 'custom' }
  ]

  // Update maxResolution when selectedResolution changes
  const handleResolutionChange = (value: string) => {
    setSelectedResolution(value)
    if (value === 'custom') {
      // Don't change maxResolution for custom - let user set it in advanced options
      return
    }
    const resolution = value === '0' ? 0 : parseInt(value)
    setOptions({ ...options, maxResolution: resolution })
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Reset state
    setError(null)
    setConversionResult(null)
    setIsConverting(true)
    setConversionProgress(0)

    try {
      // Get recommended settings based on file size
      const fileSizeMB = file.size / 1024 / 1024
      const recommended = getRecommendedSettings(fileSizeMB)
      const finalOptions = { ...recommended, ...options }

      // Check if encoding is available
      // Note: KTX2 encoding with UASTC compression requires specialized libraries
      // For now, we provide instructions for external tools
      if (!isKTX2EncodingAvailable()) {
        // Don't throw error immediately - show helpful message in UI
        setError(
          'KTX2 encoding requires a specialized library (ktx2-encoder or Basis Universal). ' +
          'For now, please use external tools to convert your HDR files to FastHDR format. ' +
          'Once converted, you can load the .ktx2 files directly in this viewer.'
        )
        setIsConverting(false)
        setConversionProgress(0)
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
        return
      }

      // Convert the file
      const result = await convertHDRToFastHDR(file, {
        ...finalOptions,
        onProgress: setConversionProgress
      })

      setConversionResult({
        originalSize: result.originalSize,
        convertedSize: result.convertedSize,
        compressionRatio: result.compressionRatio,
        originalResolution: result.originalResolution,
        convertedResolution: result.convertedResolution
      })

      // Download the converted file
      const url = URL.createObjectURL(result.ktx2Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = file.name.replace(/\.(hdr|exr)$/i, '.ktx2')
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      setError(errorMessage)
      console.error('[FastHDRConverter] Conversion failed:', err)
    } finally {
      setIsConverting(false)
      setConversionProgress(0)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
  }

  return (
    <div>
      <div style={{ 
        marginBottom: '12px',
        padding: '12px',
        backgroundColor: 'rgba(255, 193, 7, 0.1)',
        border: '1px solid rgba(255, 193, 7, 0.3)',
        borderRadius: '6px'
      }}>
        <div style={{ fontSize: '0.9em', color: '#ffc107', marginBottom: '8px' }}>
          <strong>⚠️ Important Note:</strong>
        </div>
        <div style={{ fontSize: '0.85em', color: '#aaa', lineHeight: '1.5' }}>
          This converter creates <strong>equirectangular KTX2 files</strong>, not proper <strong>FastHDR (PMREM) files</strong>. 
          According to <a href="https://cloud.needle.tools/articles/fasthdr-environment-maps" target="_blank" rel="noopener noreferrer" style={{ color: '#4a9eff' }}>FastHDR specification</a>, 
          proper FastHDR files should be pre-computed PMREM textures in CubeUV format. 
          For proper FastHDR files, use the <a href="https://threejs.org/examples/?q=exr%20exporter#misc_exporter_exr" target="_blank" rel="noopener noreferrer" style={{ color: '#4a9eff' }}>Three.js EXR exporter</a> 
          to export PMREM textures, then convert to KTX2 using Basis Universal.
        </div>
      </div>

      <div style={{ 
        marginBottom: '12px',
        padding: '12px',
        backgroundColor: 'rgba(74, 158, 255, 0.1)',
        border: '1px solid rgba(74, 158, 255, 0.3)',
        borderRadius: '6px'
      }}>
        <div style={{ fontSize: '0.9em', color: '#4a9eff', marginBottom: '8px' }}>
          <strong>📋 Current Status:</strong>
        </div>
        <div style={{ fontSize: '0.85em', color: '#aaa', lineHeight: '1.5' }}>
          Browser-based KTX2 encoding is available. Once converted, you can load .ktx2 files directly in this viewer.
        </div>
      </div>

      <div style={{ marginBottom: '12px' }}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".hdr,.exr"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isConverting || !isKTX2EncodingAvailable()}
          className="button-secondary"
          style={{ width: '100%', opacity: isKTX2EncodingAvailable() ? 1 : 0.6 }}
        >
          {isConverting ? `Converting... ${conversionProgress.toFixed(0)}%` : 'Convert HDR/EXR to FastHDR'}
        </button>
        {!isKTX2EncodingAvailable() && (
          <small style={{ display: 'block', color: '#888', marginTop: '4px', fontSize: '0.85em' }}>
            ⚠️ Conversion disabled - use external tools (see instructions below)
          </small>
        )}
      </div>

      {isConverting && (
        <div style={{ marginTop: '8px' }}>
          <div style={{ 
            width: '100%', 
            height: '8px', 
            backgroundColor: 'rgba(255, 255, 255, 0.1)', 
            borderRadius: '4px',
            overflow: 'hidden'
          }}>
            <div style={{ 
              width: `${conversionProgress}%`, 
              height: '100%', 
              backgroundColor: '#4a9eff',
              transition: 'width 0.3s ease'
            }} />
          </div>
        </div>
      )}

      {error && (
        <div style={{ 
          marginTop: '12px',
          padding: '12px',
          backgroundColor: 'rgba(255, 0, 0, 0.1)',
          border: '1px solid rgba(255, 0, 0, 0.3)',
          borderRadius: '6px',
          color: '#ff6b6b'
        }}>
          <strong>Conversion Error:</strong>
          <div style={{ marginTop: '4px', fontSize: '0.9em' }}>{error}</div>
          {error && (
            <div style={{ marginTop: '8px', fontSize: '0.85em', color: '#ffa8a8' }}>
              <strong>How to Convert HDR to FastHDR:</strong>
              <div style={{ marginTop: '8px' }}>
                <div style={{ marginBottom: '8px' }}>
                  <strong>Option 1: Online Converter (Easiest)</strong>
                  <div style={{ marginTop: '4px' }}>
                    <a 
                      href="https://www.3dpea.com/en/convert/HDR-to-KTX2" 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      style={{ color: '#4a9eff', textDecoration: 'underline' }}
                    >
                      → 3DPEA Converter (Free Online Tool)
                    </a>
                  </div>
                </div>
                
                <div style={{ marginBottom: '8px' }}>
                  <strong>Option 2: Command Line (toktx)</strong>
                  <div style={{ marginTop: '4px', fontFamily: 'monospace', fontSize: '0.9em', background: 'rgba(0,0,0,0.3)', padding: '4px 8px', borderRadius: '4px' }}>
                    toktx --bcmp output.ktx2 input.hdr
                  </div>
                  <div style={{ marginTop: '4px', fontSize: '0.85em', color: '#aaa' }}>
                    Install from: <a href="https://github.com/KhronosGroup/KTX-Software" target="_blank" rel="noopener noreferrer" style={{ color: '#4a9eff' }}>KTX-Software</a>
                  </div>
                </div>
                
                <div style={{ marginBottom: '8px' }}>
                  <strong>Option 3: glTF-Transform</strong>
                  <div style={{ marginTop: '4px', fontFamily: 'monospace', fontSize: '0.9em', background: 'rgba(0,0,0,0.3)', padding: '4px 8px', borderRadius: '4px' }}>
                    npm install -g @gltf-transform/cli<br/>
                    gltf-transform uastc input.glb output.glb
                  </div>
                </div>
              </div>
              
              <div style={{ marginTop: '12px', padding: '8px', background: 'rgba(74, 158, 255, 0.1)', borderRadius: '4px', border: '1px solid rgba(74, 158, 255, 0.3)' }}>
                <strong style={{ color: '#4a9eff' }}>💡 Workflow:</strong>
                <div style={{ marginTop: '4px', fontSize: '0.9em', lineHeight: '1.5' }}>
                  1. Convert your HDR/EXR file here → Download the .ktx2 file<br/>
                  2. Upload the .ktx2 file using "Load HDR File" in the lighting menu<br/>
                  3. Enjoy faster loading! KTX2 files load 10x faster and use 95% less GPU memory.
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {conversionResult && (
        <div style={{ 
          marginTop: '12px',
          padding: '12px',
          backgroundColor: 'rgba(74, 158, 255, 0.1)',
          border: '1px solid rgba(74, 158, 255, 0.3)',
          borderRadius: '6px'
        }}>
          <strong style={{ color: '#4a9eff' }}>✅ Conversion Complete!</strong>
          <div style={{ marginTop: '8px', fontSize: '0.9em' }}>
            <div>Original: {formatFileSize(conversionResult.originalSize)} ({conversionResult.originalResolution.width}×{conversionResult.originalResolution.height})</div>
            <div>Converted: {formatFileSize(conversionResult.convertedSize)} ({conversionResult.convertedResolution.width}×{conversionResult.convertedResolution.height})</div>
            <div style={{ marginTop: '4px', fontWeight: 'bold' }}>
              Compression: {(conversionResult.compressionRatio * 100).toFixed(0)}% of original size
            </div>
          </div>
          <div style={{ marginTop: '12px', padding: '8px', background: 'rgba(46, 204, 113, 0.1)', borderRadius: '4px', border: '1px solid rgba(46, 204, 113, 0.3)' }}>
            <strong style={{ color: '#2ecc71' }}>📤 Next Step:</strong>
            <div style={{ marginTop: '4px', fontSize: '0.9em' }}>
              The .ktx2 file has been downloaded. Now upload it using "Load HDR File" in the lighting menu for faster loading!
            </div>
          </div>
        </div>
      )}

      {/* Resolution Selector */}
      <div style={{ marginTop: '12px', marginBottom: '12px' }}>
        <label style={{ display: 'block', marginBottom: '8px' }}>
          <span style={{ fontSize: '0.9em', fontWeight: 'bold' }}>Target Resolution:</span>
          <select
            value={selectedResolution}
            onChange={(e) => handleResolutionChange(e.target.value)}
            style={{
              width: '100%',
              marginTop: '4px',
              padding: '8px 12px',
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '4px',
              color: '#fff',
              fontSize: '14px',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
              fontWeight: '400',
              lineHeight: '1.5',
              cursor: isConverting ? 'not-allowed' : 'pointer',
              outline: 'none',
              WebkitFontSmoothing: 'antialiased',
              MozOsxFontSmoothing: 'grayscale',
              textRendering: 'optimizeLegibility',
              appearance: 'none',
              backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 12 12\'%3E%3Cpath fill=\'%23ffffff\' d=\'M6 9L1 4h10z\'/%3E%3C/svg%3E")',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 12px center',
              paddingRight: '36px'
            }}
            disabled={isConverting}
          >
            {resolutionPresets.map((preset) => (
              <option 
                key={preset.value} 
                value={preset.value}
                style={{
                  backgroundColor: '#1a1a1a',
                  color: '#fff',
                  padding: '8px',
                  fontSize: '14px',
                  fontFamily: 'inherit'
                }}
              >
                {preset.label}
              </option>
            ))}
          </select>
          <small style={{ display: 'block', color: '#888', marginTop: '4px', fontSize: '0.85em' }}>
            {selectedResolution === '0' 
              ? 'Keep original resolution (may be very large)' 
              : selectedResolution === 'custom'
              ? `Custom resolution: ${options.maxResolution || 0}px (set in Advanced Options)`
              : `Resize to ${selectedResolution === '8192' ? '8K' : selectedResolution === '6144' ? '6K' : selectedResolution === '4096' ? '4K' : selectedResolution === '2048' ? '2K' : selectedResolution === '1024' ? '1K' : selectedResolution + 'px'} before conversion. Smaller = faster conversion & smaller file.`}
          </small>
        </label>
      </div>

      <div style={{ marginTop: '12px' }}>
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="button-secondary"
          style={{ width: '100%', fontSize: '0.9em' }}
        >
          {showAdvanced ? '▼ Hide' : '▶ Show'} Advanced Options
        </button>
      </div>

      {showAdvanced && (
        <div style={{ 
          marginTop: '12px',
          padding: '12px',
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '6px'
        }}>
          <label style={{ display: 'block', marginBottom: '8px' }}>
            <span>Quality (0-4):</span>
            <input
              type="range"
              min="0"
              max="4"
              step="1"
              value={options.quality}
              onChange={(e) => setOptions({ ...options, quality: parseInt(e.target.value) })}
              style={{ width: '100%', marginTop: '4px' }}
            />
            <small style={{ display: 'block', color: '#888', marginTop: '4px' }}>
              {options.quality === 0 && 'Lowest (fastest)'}
              {options.quality === 1 && 'Low'}
              {options.quality === 2 && 'Medium'}
              {options.quality === 3 && 'High'}
              {options.quality === 4 && 'Highest (best quality)'}
            </small>
          </label>

          <label style={{ display: 'block', marginBottom: '8px' }}>
            <span>Custom Max Resolution (px):</span>
            <input
              type="number"
              min="256"
              max="16384"
              step="256"
              value={options.maxResolution || 0}
              onChange={(e) => {
                const value = parseInt(e.target.value) || 0
                setOptions({ ...options, maxResolution: value })
                // Update selected resolution to match
                if (value === 0) {
                  setSelectedResolution('0')
                } else {
                  const matchingPreset = resolutionPresets.find(p => p.value !== 'custom' && parseInt(p.value) === value)
                  if (matchingPreset) {
                    setSelectedResolution(matchingPreset.value)
                  } else {
                    setSelectedResolution('custom')
                  }
                }
              }}
              style={{ width: '100%', marginTop: '4px', padding: '4px' }}
            />
            <small style={{ display: 'block', color: '#888', marginTop: '4px' }}>
              {options.maxResolution === 0 
                ? 'No limit - keep original resolution' 
                : `Files larger than ${options.maxResolution}px will be downscaled. Use preset selector above for common sizes.`}
            </small>
          </label>

          <label style={{ display: 'block', marginBottom: '8px' }}>
            <span>Compression Level (0-6):</span>
            <input
              type="range"
              min="0"
              max="6"
              step="1"
              value={options.compressionLevel}
              onChange={(e) => setOptions({ ...options, compressionLevel: parseInt(e.target.value) })}
              style={{ width: '100%', marginTop: '4px' }}
            />
            <small style={{ display: 'block', color: '#888', marginTop: '4px' }}>
              Higher = smaller file, slower encoding
            </small>
          </label>

          <label style={{ display: 'block' }}>
            <input
              type="checkbox"
              checked={options.generateMipmaps}
              onChange={(e) => setOptions({ ...options, generateMipmaps: e.target.checked })}
              style={{ marginRight: '8px' }}
            />
            <span>Generate Mipmaps</span>
            <small style={{ display: 'block', color: '#888', marginTop: '4px' }}>
              Improves quality at different viewing distances
            </small>
          </label>
        </div>
      )}
    </div>
  )
}

