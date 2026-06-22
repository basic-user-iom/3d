import { useState, useRef } from 'react'
import { downloadWebExport, previewWebExport, WebExportOptions } from '../utils/webExport'
import { useAppStore } from '../store/useAppStore'
import { useFloatingPanel } from '../hooks/useFloatingPanel'
import { usePanelStacking } from '../hooks/usePanelStacking'
import './WebExportPanel.css'

export default function WebExportPanel() {
  const { cameraViews, showWebExportPanel, toggleWebExportPanel } = useAppStore()
  const [options, setOptions] = useState<Partial<WebExportOptions>>({
    includeModel: true,
    includeHDR: true,
    includeCameraViews: true,
    includeAnimations: true,
    presentationMode: true,
    transitionDuration: 2.0,
    autoPlay: false,
    loop: true,
    quality: 'high',
    shadowQuality: 'high',
    compressTextures: true,
    exportAsZip: true,
    backgroundColor: '#1a1a1a'
  })
  const [isExporting, setIsExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const [isMinimized, setIsMinimized] = useState(false)
  
  const panelRef = useRef<HTMLDivElement | null>(null)
  const PANEL_WIDTH = 400
  const stackingOffset = usePanelStacking({ panelId: 'webExport', anchor: 'right' })
  const { top: panelTop, left: panelLeft, maxHeight, dragging, handleMouseDown } = useFloatingPanel(
    panelRef, 
    { 
      anchor: 'right',
      stackingOffset,
      panelWidth: PANEL_WIDTH,
      panelId: 'webExport'
    }
  )

  if (!showWebExportPanel) return null

  const [isPreviewing, setIsPreviewing] = useState(false)

  const handlePreview = async () => {
    const views = cameraViews || []
    if (views.length === 0 && options.includeCameraViews) {
      alert('Please create at least one camera view before previewing.')
      return
    }

    setIsPreviewing(true)

    try {
      await previewWebExport(options)
    } catch (error) {
      console.error('Preview failed:', error)
      alert(`Preview failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsPreviewing(false)
    }
  }

  const handleExport = async () => {
    const views = cameraViews || []
    if (views.length === 0 && options.includeCameraViews) {
      alert('Please create at least one camera view before exporting.')
      return
    }

    setIsExporting(true)
    setExportProgress(0)

    try {
      await downloadWebExport(options, (progress, message) => {
        setExportProgress(progress)
        console.log(`[WebExport] ${message} (${progress.toFixed(1)}%)`)
      })

      // Small delay to show 100% before closing
      setTimeout(() => {
        setIsExporting(false)
        setExportProgress(0)
        alert('Export complete! Files have been downloaded. Upload them to your web server.')
      }, 500)
    } catch (error) {
      console.error('Export failed:', error)
      alert(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
      setIsExporting(false)
      setExportProgress(0)
    }
  }

  return (
    <div
      ref={panelRef}
      className={`web-export-panel${dragging ? ' dragging' : ''}`}
      style={{ top: `${panelTop}px`, left: `${panelLeft}px`, maxHeight: `${maxHeight}px` }}
    >
      <div className="web-export-panel-header" onMouseDown={handleMouseDown}>
        <h3>🌐 Export for Web</h3>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <button 
            onClick={() => setIsMinimized(!isMinimized)} 
            className="minimize-button" 
            title={isMinimized ? "Maximize panel" : "Minimize panel"}
          >
            {isMinimized ? '□' : '−'}
          </button>
          <button onClick={toggleWebExportPanel} className="close-button">
            ×
          </button>
        </div>
      </div>
      
      {!isMinimized && (
        <div className="web-export-panel-content">
          <div className="export-section">
            <h3>Export Options</h3>
            
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={options.includeModel ?? true}
                onChange={(e) => setOptions({ ...options, includeModel: e.target.checked })}
              />
              <span>Include 3D Model (GLB format)</span>
            </label>

            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={options.includeHDR ?? true}
                onChange={(e) => setOptions({ ...options, includeHDR: e.target.checked })}
              />
              <span>Include HDR Environment</span>
            </label>

            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={options.includeCameraViews ?? true}
                onChange={(e) => setOptions({ ...options, includeCameraViews: e.target.checked })}
              />
              <span>Include Camera Views ({(cameraViews || []).length} views)</span>
            </label>

            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={options.includeAnimations ?? true}
                onChange={(e) => setOptions({ ...options, includeAnimations: e.target.checked })}
              />
              <span>Include Animations</span>
            </label>
          </div>

          <div className="export-section">
            <h3>Export Format</h3>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={options.exportAsZip ?? true}
                onChange={(e) => setOptions({ ...options, exportAsZip: e.target.checked })}
              />
              <span>Package as ZIP file (uncheck to download individual files)</span>
            </label>
          </div>

          <div className="export-section">
            <h3>Presentation Mode</h3>
            
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={options.presentationMode ?? true}
                onChange={(e) => setOptions({ ...options, presentationMode: e.target.checked })}
              />
              <span>Enable Presentation Mode</span>
            </label>

            {options.presentationMode && (
              <>
                <label className="input-label">
                  <span>Transition Duration (seconds):</span>
                  <input
                    type="number"
                    min="0.5"
                    max="10"
                    step="0.5"
                    value={options.transitionDuration ?? 2.0}
                    onChange={(e) => setOptions({ ...options, transitionDuration: parseFloat(e.target.value) })}
                  />
                </label>

                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={options.autoPlay ?? false}
                    onChange={(e) => setOptions({ ...options, autoPlay: e.target.checked })}
                  />
                  <span>Auto-play on load</span>
                </label>

                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={options.loop ?? true}
                    onChange={(e) => setOptions({ ...options, loop: e.target.checked })}
                  />
                  <span>Loop presentation</span>
                </label>
              </>
            )}
          </div>

          <div className="export-section">
            <h3>Quality Settings</h3>
            
            <label className="select-label">
              <span>Quality:</span>
              <select
                value={options.quality ?? 'high'}
                onChange={(e) => setOptions({ ...options, quality: e.target.value as any })}
              >
                <option value="low">Low (Fast loading)</option>
                <option value="medium">Medium (Balanced)</option>
                <option value="high">High (Recommended)</option>
                <option value="ultra">Ultra (Best quality)</option>
              </select>
            </label>

            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={options.compressTextures ?? true}
                onChange={(e) => setOptions({ ...options, compressTextures: e.target.checked })}
              />
              <span>Compress Textures (WebP/KTX2)</span>
            </label>

            <label className="input-label">
              <span>Background Color:</span>
              <input
                type="color"
                value={options.backgroundColor ?? '#1a1a1a'}
                onChange={(e) => setOptions({ ...options, backgroundColor: e.target.value })}
              />
            </label>
          </div>

          <div className="export-info">
            <h4>📋 Export Includes:</h4>
            <ul>
              <li><code>index.html</code> - Standalone viewer</li>
              {options.includeModel && <li><code>model.glb</code> - 3D model with all objects</li>}
              {options.includeHDR && <li><code>environment.hdr</code> - HDR environment map</li>}
              {options.includeCameraViews && <li>Camera views with preview thumbnails (like in camera mode)</li>}
              <li><code>config.json</code> - All settings (lighting, weather, water, adjustments)</li>
              <li>Last view from project (current camera position)</li>
            </ul>
            <p className="info-text">
              Upload all files to your web server. The viewer uses CDN-hosted Three.js for optimal performance.
              Use the Preview button to see how it will look before exporting.
            </p>
          </div>

          {isExporting && (
            <div className="export-progress">
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${exportProgress}%` }}
                />
              </div>
              <span>Exporting... {exportProgress}%</span>
            </div>
          )}
          
          <div className="export-buttons">
            <button 
              className="export-button preview-button" 
              onClick={handlePreview}
              disabled={isPreviewing || isExporting || (options.includeCameraViews && (cameraViews || []).length === 0)}
              title="Preview how the export will look when hosted on a server"
            >
              {isPreviewing ? 'Opening Preview...' : '👁️ Preview Web Export'}
            </button>
            <button 
              className="export-button" 
              onClick={handleExport}
              disabled={isExporting || isPreviewing || (options.includeCameraViews && (cameraViews || []).length === 0)}
            >
              {isExporting ? 'Exporting...' : '📦 Export'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

