import React, { useState, useCallback } from 'react'
import { optimizeTexture, type TextureFormat } from '../utils/textureOptimizer'
import './TextureOptimizationDialog.css'

interface TextureFile {
  file: File
  originalSize: number
}

interface TextureOptimizationDialogProps {
  textureFiles: TextureFile[]
  onOptimize: (optimizedFiles: Map<File, File>) => void // Map<originalFile, optimizedFile>
  onSkip: () => void
}

export default function TextureOptimizationDialog({
  textureFiles,
  onOptimize,
  onSkip
}: TextureOptimizationDialogProps) {
  const [format, setFormat] = useState<TextureFormat>('webp')
  const [quality, setQuality] = useState(0.85) // For WebP: 0-1, for KTX2: 0-4
  const [maxResolution, setMaxResolution] = useState(2048)
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [optimizationProgress, setOptimizationProgress] = useState(0)
  const [currentFile, setCurrentFile] = useState<string>('')
  const [results, setResults] = useState<Array<{
    fileName: string
    originalSize: number
    optimizedSize: number
    compressionRatio: number
  }>>([])

  const totalSize = textureFiles.reduce((sum, tf) => sum + tf.originalSize, 0)
  const totalSizeMB = (totalSize / 1024 / 1024).toFixed(2)

  const handleOptimize = useCallback(async () => {
    setIsOptimizing(true)
    setOptimizationProgress(0)
    setResults([])
    
    const optimizedFiles = new Map<File, File>()
    const newResults: typeof results = []
    
    try {
      for (let i = 0; i < textureFiles.length; i++) {
        const textureFile = textureFiles[i]
        setCurrentFile(textureFile.file.name)
        
        const progress = (i / textureFiles.length) * 100
        setOptimizationProgress(progress)
        
        try {
          const result = await optimizeTexture(textureFile.file, {
            format,
            quality: format === 'webp' ? quality : Math.round(quality * 4), // Convert 0-1 to 0-4 for KTX2
            maxResolution: maxResolution > 0 ? maxResolution : undefined,
            generateMipmaps: format === 'ktx2',
            onProgress: (fileProgress) => {
              const totalProgress = progress + (fileProgress / textureFiles.length)
              setOptimizationProgress(totalProgress)
            }
          })
          
          // Create optimized file with new extension
          const extension = format === 'webp' ? '.webp' : '.ktx2'
          const originalName = textureFile.file.name.replace(/\.[^.]+$/, '')
          const optimizedFile = new File(
            [result.optimizedBlob],
            `${originalName}${extension}`,
            { type: format === 'webp' ? 'image/webp' : 'image/ktx2' }
          )
          
          optimizedFiles.set(textureFile.file, optimizedFile)
          
          newResults.push({
            fileName: textureFile.file.name,
            originalSize: result.originalSize,
            optimizedSize: result.optimizedSize,
            compressionRatio: result.compressionRatio
          })
        } catch (error) {
          console.error(`Failed to optimize ${textureFile.file.name}:`, error)
          // Keep original file if optimization fails
          optimizedFiles.set(textureFile.file, textureFile.file)
        }
      }
      
      setOptimizationProgress(100)
      setResults(newResults)
      
      // Wait a moment to show results, then proceed
      setTimeout(() => {
        onOptimize(optimizedFiles)
      }, 1000)
    } catch (error) {
      console.error('Texture optimization failed:', error)
      setIsOptimizing(false)
    }
  }, [textureFiles, format, quality, maxResolution, onOptimize])

  const totalOptimizedSize = results.reduce((sum, r) => sum + r.optimizedSize, 0)
  const totalOptimizedSizeMB = results.length > 0 ? (totalOptimizedSize / 1024 / 1024).toFixed(2) : '0'
  const totalSavings = results.length > 0 ? ((totalSize - totalOptimizedSize) / 1024 / 1024).toFixed(2) : '0'
  const averageCompression = results.length > 0 
    ? (results.reduce((sum, r) => sum + r.compressionRatio, 0) / results.length).toFixed(2)
    : '0'

  return (
    <div className="texture-optimization-dialog-overlay">
      <div className="texture-optimization-dialog">
        <div className="texture-optimization-dialog-header">
          <h2>🖼️ Optimize Textures</h2>
          <p>Found {textureFiles.length} PNG/JPG texture(s) ({totalSizeMB} MB total)</p>
        </div>

        {!isOptimizing && results.length === 0 && (
          <div className="texture-optimization-dialog-content">
            <div className="optimization-options">
              <div className="option-group">
                <label>
                  <strong>Format:</strong>
                </label>
                <div className="radio-group">
                  <label>
                    <input
                      type="radio"
                      value="webp"
                      checked={format === 'webp'}
                      onChange={(e) => setFormat(e.target.value as TextureFormat)}
                    />
                    <span>WebP</span>
                    <span className="format-info">Smaller files, faster loading, good quality</span>
                  </label>
                  <label>
                    <input
                      type="radio"
                      value="ktx2"
                      checked={format === 'ktx2'}
                      onChange={(e) => setFormat(e.target.value as TextureFormat)}
                    />
                    <span>KTX2</span>
                    <span className="format-info">GPU-optimized, best performance, smaller size</span>
                  </label>
                </div>
              </div>

              <div className="option-group">
                <label>
                  <strong>Quality:</strong> {format === 'webp' ? Math.round(quality * 100) : Math.round(quality * 4)}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={quality}
                  onChange={(e) => setQuality(Number(e.target.value))}
                />
                <div className="quality-hint">
                  {format === 'webp' 
                    ? 'Higher = better quality, larger file'
                    : 'Higher = better quality (0-4), larger file'}
                </div>
              </div>

              <div className="option-group">
                <label>
                  <strong>Max Resolution:</strong> {maxResolution}px
                </label>
                <input
                  type="range"
                  min="0"
                  max="4096"
                  step="256"
                  value={maxResolution}
                  onChange={(e) => setMaxResolution(Number(e.target.value))}
                />
                <div className="quality-hint">
                  {maxResolution === 0 ? 'No limit (keep original size)' : `Downscale if larger than ${maxResolution}px`}
                </div>
              </div>
            </div>

            <div className="optimization-preview">
              <div className="preview-stat">
                <span className="stat-label">Total Size:</span>
                <span className="stat-value">{totalSizeMB} MB</span>
              </div>
              <div className="preview-stat">
                <span className="stat-label">Estimated Savings:</span>
                <span className="stat-value">
                  {format === 'webp' ? '30-50%' : '50-70%'}
                </span>
              </div>
            </div>
          </div>
        )}

        {isOptimizing && (
          <div className="texture-optimization-dialog-content">
            <div className="optimization-progress">
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${optimizationProgress}%` }}
                />
              </div>
              <div className="progress-text">
                {currentFile && (
                  <span>Optimizing: {currentFile}</span>
                )}
                <span>{Math.round(optimizationProgress)}%</span>
              </div>
            </div>
          </div>
        )}

        {results.length > 0 && !isOptimizing && (
          <div className="texture-optimization-dialog-content">
            <div className="optimization-results">
              <h3>✅ Optimization Complete!</h3>
              <div className="results-stats">
                <div className="result-stat">
                  <span className="stat-label">Original Size:</span>
                  <span className="stat-value">{totalSizeMB} MB</span>
                </div>
                <div className="result-stat">
                  <span className="stat-label">Optimized Size:</span>
                  <span className="stat-value">{totalOptimizedSizeMB} MB</span>
                </div>
                <div className="result-stat">
                  <span className="stat-label">Space Saved:</span>
                  <span className="stat-value success">{totalSavings} MB</span>
                </div>
                <div className="result-stat">
                  <span className="stat-label">Avg. Compression:</span>
                  <span className="stat-value success">{averageCompression}x</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="texture-optimization-dialog-footer">
          {!isOptimizing && results.length === 0 && (
            <>
              <button onClick={handleOptimize} className="btn-optimize">
                🚀 Optimize All
              </button>
              <button onClick={onSkip} className="btn-skip">
                Skip
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

























