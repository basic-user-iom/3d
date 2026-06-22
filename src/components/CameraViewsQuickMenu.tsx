import { useState, useEffect, useRef, useCallback } from 'react'
import { useAppStore, CameraView } from '../store/useAppStore'
import { useViewer } from '../viewer/useViewer'
import * as THREE from 'three'
import { generateViewThumbnail } from '../utils/webExport'
import './CameraViewsQuickMenu.css'

export default function CameraViewsQuickMenu() {
  const { viewer } = useViewer()
  const {
    cameraViews,
    selectedCameraViewId,
    showCameraViewsPanel,
    toggleCameraViewsPanel,
    setSelectedCameraViewId,
    cameraViewThumbnails // Use shared thumbnails from store
  } = useAppStore()
  
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [isOpen])

  const handleLoadView = (view: CameraView) => {
    if (!viewer) return
    
    const position = new THREE.Vector3(
      view.cameraPosition.x,
      view.cameraPosition.y,
      view.cameraPosition.z
    )
    const target = new THREE.Vector3(
      view.cameraTarget.x,
      view.cameraTarget.y,
      view.cameraTarget.z
    )
    
    viewer.setCameraState(position, target, true)
    setSelectedCameraViewId(view.id)
    setIsOpen(false)
  }

  const handleOpenPanel = () => {
    toggleCameraViewsPanel()
    setIsOpen(false)
  }

  // Thumbnails are now managed by CameraViewsPanel and stored in the global store
  // No need to generate them here - just use the shared thumbnails

  // Show menu only if there are views saved
  if (cameraViews.length === 0 && !showCameraViewsPanel) {
    return null
  }

  return (
    <div className="camera-views-quick-menu" ref={menuRef}>
      <button
        className="quick-menu-button"
        onClick={() => setIsOpen(!isOpen)}
        title="Camera Views Quick Access (V key)"
      >
        📹
        {cameraViews.length > 0 && (
          <span className="view-count">{cameraViews.length}</span>
        )}
      </button>

      {isOpen && (
        <div className="quick-menu-dropdown">
          <div className="quick-menu-header">
            <span>Camera Views</span>
            <button
              onClick={handleOpenPanel}
              className="open-panel-button"
              title="Open full panel"
            >
              ⚙️
            </button>
          </div>
          
          {cameraViews.length === 0 ? (
            <div className="quick-menu-empty">
              No views saved
              <button onClick={handleOpenPanel} className="text-link">
                Create one
              </button>
            </div>
          ) : (
            <div className="quick-menu-list">
              {cameraViews.map((view, index) => {
                const thumbnail = cameraViewThumbnails.get(view.id) // Use shared thumbnails
                return (
                  <button
                    key={view.id}
                    onClick={() => handleLoadView(view)}
                    className={`quick-menu-item ${
                      selectedCameraViewId === view.id ? 'active' : ''
                    }`}
                    title={`Go to: ${view.name} (Press ${index + 1})`}
                  >
                    {thumbnail ? (
                      <img 
                        src={thumbnail} 
                        alt={view.name}
                        className="quick-menu-thumbnail"
                      />
                    ) : (
                      <div className="quick-menu-thumbnail-placeholder">
                        <span>📹</span>
                      </div>
                    )}
                    <span className="view-number">{index + 1}</span>
                    <span className="view-name">{view.name}</span>
                  </button>
                )
              })}
            </div>
          )}

          <div className="quick-menu-footer">
            <span className="hint">Press V for panel, 1-9 for views</span>
          </div>
        </div>
      )}
    </div>
  )
}

