import { useState, useRef, useCallback, useEffect } from 'react'
import { useAppStore } from '../store/useAppStore'
import { useViewer } from '../viewer/useViewer'
import { useFloatingPanel } from '../hooks/useFloatingPanel'
import FloatingPanelHeader from './FloatingPanelHeader'
import { usePanelStacking } from '../hooks/usePanelStacking'
import { enhanceWithReplicate, enhanceWithFallback, type EnhancementMode } from '../utils/aiEnhancement'
import { getReplicateConfigured } from '../utils/replicateClient'
import { captureViewerScreenshot } from '../viewer/utils/screenshotCapture'
import './AIEnhancementPanel.css'

interface EnhancementOption {
  id: EnhancementMode
  name: string
  description: string
  icon: string
  scaleFactor?: number
}

const ENHANCEMENT_OPTIONS: EnhancementOption[] = [
  { 
    id: 'upscale', 
    name: 'AI Upscale', 
    description: 'Upscale image 2x-4x with Real-ESRGAN quality', 
    icon: '🔍',
    scaleFactor: 2
  },
  { 
    id: 'detail', 
    name: 'Detail Refinement', 
    description: 'Enhance fine details and textures', 
    icon: '✨'
  },
  { 
    id: 'texture', 
    name: 'Texture Enhancement', 
    description: 'Improve texture clarity and sharpness', 
    icon: '🎨'
  },
  { 
    id: 'edges', 
    name: 'Edge Sharpening', 
    description: 'Sharpen edges for cleaner architectural lines', 
    icon: '📐'
  },
  { 
    id: 'all', 
    name: 'Full Enhancement', 
    description: 'Combine all enhancements for best quality', 
    icon: '🚀'
  }
]

export default function AIEnhancementPanel() {
  const { 
    showAIEnhancementPanel, 
    toggleAIEnhancementPanel
  } = useAppStore()
  const { viewer } = useViewer()
  const panelRef = useRef<HTMLDivElement | null>(null)
  
  // Calculate stacking offset for right-side panels
  const PANEL_WIDTH = 420
  const stackingOffset = usePanelStacking({ panelId: 'aiEnhancement', anchor: 'right' })
  const { top: panelTop, left: panelLeft, maxHeight, dragging, handleMouseDown } = useFloatingPanel(
    panelRef, 
    { 
      anchor: 'right',
      stackingOffset,
      panelWidth: PANEL_WIDTH,
      panelId: 'aiEnhancement'
    }
  )
  
  const [selectedMode, setSelectedMode] = useState<EnhancementMode | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [originalImage, setOriginalImage] = useState<string | null>(null)
  const [enhancedImage, setEnhancedImage] = useState<string | null>(null)
  const [processingTime, setProcessingTime] = useState<number | null>(null)
  const [isMinimized, setIsMinimized] = useState(false)
  const [replicateConfigured, setReplicateConfigured] = useState<boolean | null>(null)

  useEffect(() => {
    if (!showAIEnhancementPanel) return
    let cancelled = false
    void getReplicateConfigured()
      .then((configured) => {
        if (!cancelled) setReplicateConfigured(configured)
      })
      .catch(() => {
        if (!cancelled) setReplicateConfigured(false)
      })
    return () => {
      cancelled = true
    }
  }, [showAIEnhancementPanel])

  // Capture current view from renderer
  const captureCurrentView = useCallback(async (): Promise<string | null> => {
    if (!viewer?.renderer || !viewer?.scene || !viewer?.camera) {
      console.error('[AIEnhancement] Viewer not ready')
      return null
    }

    try {
      // Force a render to ensure scene is up to date
      viewer.renderer.render(viewer.scene, viewer.camera)
      
      // Wait for rendering to complete
      await new Promise<void>(resolve => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve()
          })
        })
      })

      const canvas = viewer.renderer.domElement
      if (canvas.width > 0 && canvas.height > 0) {
        return viewer.captureScreenshot
          ? viewer.captureScreenshot()
          : captureViewerScreenshot(viewer)
      }
      return null
    } catch (error) {
      console.error('[AIEnhancement] Failed to capture view:', error)
      return null
    }
  }, [viewer])

  // AI Enhancement using proxied Replicate API or fallback
  const enhanceImage = useCallback(async (imageDataUrl: string, mode: EnhancementMode): Promise<string | null> => {
    setIsProcessing(true)
    setProgress(0)
    setProcessingTime(null)

    try {
      const configured =
        replicateConfigured === true ||
        (replicateConfigured === null && (await getReplicateConfigured()))

      if (configured) {
        setReplicateConfigured(true)
        const result = await enhanceWithReplicate(
          imageDataUrl,
          mode,
          (progressUpdate) => {
            setProgress(progressUpdate.progress)
            console.log(`[AIEnhancement] ${progressUpdate.status} - ${progressUpdate.progress}%`)
          }
        )

        setProcessingTime(result.processingTime)
        setProgress(100)
        return result.enhancedImageUrl
      }

      setReplicateConfigured(false)
      console.warn('[AIEnhancement] REPLICATE_API_TOKEN not configured; using fallback enhancement')
      alert(
        '⚠️ Replicate is not configured. Using basic enhancement (no AI).\n\n' +
          'Set REPLICATE_API_TOKEN in your .env file (not VITE_*), then restart Vite / Electron.'
      )

      const result = await enhanceWithFallback(imageDataUrl, mode)
      setProcessingTime(result.processingTime)
      setProgress(100)
      return result.enhancedImageUrl
    } catch (error) {
      console.error('[AIEnhancement] Enhancement failed:', error)

      try {
        console.warn('[AIEnhancement] Attempting fallback enhancement...')
        const result = await enhanceWithFallback(imageDataUrl, mode)
        setProcessingTime(result.processingTime)
        setProgress(100)
        alert('⚠️ API enhancement failed. Using basic enhancement instead.')
        return result.enhancedImageUrl
      } catch {
        alert(`AI Enhancement failed: ${(error as Error)?.message || 'Unknown error'}`)
        return null
      }
    } finally {
      setIsProcessing(false)
    }
  }, [replicateConfigured])

  const handleEnhance = useCallback(async () => {
    if (!selectedMode) {
      alert('Please select an enhancement mode')
      return
    }

    // Capture current view
    const captured = await captureCurrentView()
    if (!captured) {
      alert('Failed to capture current view. Please try again.')
      return
    }

    setOriginalImage(captured)
    setEnhancedImage(null)
    setProcessingTime(null)

    // Enhance image
    const enhanced = await enhanceImage(captured, selectedMode)
    if (enhanced) {
      setEnhancedImage(enhanced)
    }
  }, [selectedMode, captureCurrentView, enhanceImage])

  const handleDownload = useCallback((imageDataUrl: string, filename: string) => {
    const link = document.createElement('a')
    link.style.display = 'none'
    link.download = filename
    link.href = imageDataUrl
    
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }, [])

  if (!showAIEnhancementPanel) {
    return null
  }

  return (
    <div
      ref={panelRef}
      className={`ai-enhancement-panel ${dragging ? 'dragging' : ''}`}
      style={{
        top: `${panelTop}px`,
        left: `${panelLeft}px`,
        maxHeight: `${maxHeight}px`
      }}
    >
      <FloatingPanelHeader
        title="AI Enhance"
        icon="🤖"
        onMouseDown={handleMouseDown}
        isMinimized={isMinimized}
        onMinimize={() => setIsMinimized(!isMinimized)}
        onClose={toggleAIEnhancementPanel}
      />

      {!isMinimized && (
      <div className="ai-enhancement-panel-content">
        <div className="enhancement-modes">
          <h4>Enhancement Modes</h4>
          <div className="modes-grid">
            {ENHANCEMENT_OPTIONS.map((option) => (
              <div
                key={option.id}
                className={`mode-card ${selectedMode === option.id ? 'selected' : ''}`}
                onClick={() => setSelectedMode(option.id)}
              >
                <div className="mode-icon">{option.icon}</div>
                <div className="mode-name">{option.name}</div>
                <div className="mode-description">{option.description}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="enhancement-controls">
          <button
            className="enhance-button"
            onClick={handleEnhance}
            disabled={!selectedMode || isProcessing}
          >
            {isProcessing ? `Processing... ${progress}%` : '✨ Enhance Current View'}
          </button>

          {isProcessing && (
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }}></div>
            </div>
          )}

          {processingTime && (
            <div className="processing-time">
              ⏱️ Processing time: {processingTime.toFixed(2)}s
            </div>
          )}
        </div>

        {(originalImage || enhancedImage) && (
          <div className="comparison-view">
            <h4>Before & After</h4>
            <div className="comparison-images">
              {originalImage && (
                <div className="comparison-item">
                  <div className="comparison-label">Original</div>
                  <img src={originalImage} alt="Original" className="comparison-image" />
                  <button 
                    className="download-button"
                    onClick={() => handleDownload(originalImage, 'original.jpg')}
                  >
                    📥 Download Original
                  </button>
                </div>
              )}
              {enhancedImage && (
                <div className="comparison-item">
                  <div className="comparison-label">Enhanced</div>
                  <img src={enhancedImage} alt="Enhanced" className="comparison-image" />
                  <button 
                    className="download-button"
                    onClick={() => handleDownload(enhancedImage, 'enhanced.jpg')}
                  >
                    📥 Download Enhanced
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="ai-info">
          <h4>ℹ️ About AI Enhancement</h4>
          <p>
            Powered by Real-ESRGAN via Replicate API for professional-grade image enhancement.
            Optimized for architectural visualization with upscaling, detail refinement, texture enhancement, and edge sharpening.
          </p>
          {replicateConfigured === false && (
            <p className="api-key-note">
              🔑 <strong>Server token required:</strong> Set <code>REPLICATE_API_TOKEN</code> in{' '}
              <code>.env</code> (not <code>VITE_*</code>), then restart the editor. Tokens:{' '}
              <a href="https://replicate.com/account/api-tokens" target="_blank" rel="noopener noreferrer">
                replicate.com/account/api-tokens
              </a>
            </p>
          )}
          {replicateConfigured === true && (
            <p className="api-key-note success">
              ✅ Replicate token configured on the server. AI enhancement is ready to use.
            </p>
          )}
        </div>
      </div>
      )}
    </div>
  )
}

