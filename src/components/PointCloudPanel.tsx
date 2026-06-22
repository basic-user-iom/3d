import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useAppStore } from '../store/useAppStore'
import { getSharedViewer } from '../viewer/useViewer'
import { applyPointCloudRenderMode } from '../viewer/pointCloud/pointCloudRendering'
import { useFloatingPanel } from '../hooks/useFloatingPanel'
import { usePanelStacking } from '../hooks/usePanelStacking'
import './PointCloudPanel.css'

export default function PointCloudPanel() {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const PANEL_WIDTH = 340
  const stackingOffset = usePanelStacking({ panelId: 'point-cloud', anchor: 'right' })
  const { top: panelTop, left: panelLeft, maxHeight, dragging, handleMouseDown } = useFloatingPanel(
    panelRef,
    {
      anchor: 'right',
      stackingOffset,
      panelWidth: PANEL_WIDTH,
      panelId: 'point-cloud'
    }
  )

  const {
    showPointCloudPanel,
    togglePointCloudPanel,
    pointCloudRenderMode,
    setPointCloudRenderMode,
    pointCloudPointScale,
    setPointCloudPointScale
  } = useAppStore()

  const [isMinimized, setIsMinimized] = useState(false)
  const [pointCloudCount, setPointCloudCount] = useState(0)

  // Count the point clouds currently in the scene so the panel can show whether
  // it has anything to act on.
  useEffect(() => {
    if (!showPointCloudPanel) return
    const scene = getSharedViewer()?.scene
    if (!scene) {
      setPointCloudCount(0)
      return
    }
    let count = 0
    scene.traverse((obj) => {
      if ((obj as any).isPoints && obj.userData?.isPointCloud === true) count += 1
    })
    setPointCloudCount(count)
  }, [showPointCloudPanel, pointCloudRenderMode, pointCloudPointScale])

  // Apply the current mode / size to every point cloud in the live scene.
  useEffect(() => {
    if (!showPointCloudPanel) return
    const scene = getSharedViewer()?.scene as THREE.Object3D | undefined
    applyPointCloudRenderMode(scene, pointCloudRenderMode, pointCloudPointScale)
  }, [showPointCloudPanel, pointCloudRenderMode, pointCloudPointScale])

  const sizeLabel = useMemo(() => `${pointCloudPointScale.toFixed(2)}×`, [pointCloudPointScale])

  if (!showPointCloudPanel) return null

  return (
    <div
      ref={panelRef}
      className={`point-cloud-panel ${dragging ? 'dragging' : ''}`}
      style={{
        top: panelTop,
        left: panelLeft,
        maxHeight: maxHeight,
        cursor: dragging ? 'grabbing' : 'default'
      }}
    >
      <div className="panel-header" onMouseDown={handleMouseDown}>
        <h3>🟣 Point Cloud</h3>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="minimize-button"
            title={isMinimized ? 'Maximize panel' : 'Minimize panel'}
          >
            {isMinimized ? '□' : '−'}
          </button>
          <button className="close-button" onClick={togglePointCloudPanel}>×</button>
        </div>
      </div>

      {!isMinimized && (
        <div className="panel-content">
          <div className="pc-section">
            <span className="pc-label">Projection</span>
            <div className="pc-mode-toggle">
              <button
                className={`pc-mode-button ${pointCloudRenderMode === 'points' ? 'active' : ''}`}
                onClick={() => setPointCloudRenderMode('points')}
                title="Render each vertex as a solid square dot"
              >
                ⬛ Points
              </button>
              <button
                className={`pc-mode-button ${pointCloudRenderMode === 'gaussian' ? 'active' : ''}`}
                onClick={() => setPointCloudRenderMode('gaussian')}
                title="Render each vertex as a soft, round Gaussian splat sprite"
              >
                ⚪ Gaussian splat
              </button>
            </div>
            <small className="pc-hint">
              {pointCloudRenderMode === 'gaussian'
                ? 'Soft round sprites with alpha falloff (surface-splatting look).'
                : 'Classic hard square points.'}
            </small>
          </div>

          <div className="pc-section">
            <label className="pc-label">Point size</label>
            <div className="pc-slider-row">
              <input
                type="range"
                min="0.1"
                max="8"
                step="0.05"
                value={pointCloudPointScale}
                onChange={(e) => setPointCloudPointScale(parseFloat(e.target.value))}
                className="pc-slider"
              />
              <span className="pc-slider-value">{sizeLabel}</span>
            </div>
            <small className="pc-hint">Multiplies the auto-computed point size.</small>
          </div>

          <div className="pc-info">
            <small>
              {pointCloudCount > 0
                ? `${pointCloudCount} point cloud${pointCloudCount > 1 ? 's' : ''} in scene.`
                : 'No point cloud detected in the scene yet. Load a point-cloud PLY to use this panel.'}
            </small>
            <small style={{ display: 'block', marginTop: '8px', color: '#888' }}>
              Note: this is a splat-style projection of an XYZ/RGB cloud, not true 3D
              Gaussian Splatting (which needs per-point covariance and opacity data).
            </small>
          </div>
        </div>
      )}
    </div>
  )
}
