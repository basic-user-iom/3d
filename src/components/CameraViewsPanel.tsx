import { useState, useEffect, useRef, useCallback } from 'react'
import * as THREE from 'three'
import { useAppStore, CameraView } from '../store/useAppStore'
import { useViewer } from '../viewer/useViewer'
import { exportSceneSnapshot, exportSceneSnapshotToFile, loadSceneSnapshotFromFile, importSceneSnapshot } from '../utils/sceneSnapshot'
import { exportPanorama } from '../utils/panoramaExport'
// Path tracer export functionality removed - use PathTracerDemoPanel instead
import CameraControlsPanel from './CameraControlsPanel'
import { trackSliderInteraction } from '../utils/sliderTracker'
import { useFloatingPanel } from '../hooks/useFloatingPanel'
import { usePanelStacking } from '../hooks/usePanelStacking'
import { captureViewerScreenshot } from '../viewer/utils/screenshotCapture'
import { exportPathTracerFromCameraView } from '../utils/pathTracerExport'
import './CameraViewsPanel.css'

// Resolution presets for export
const RESOLUTION_PRESETS: Record<string, { width: number; height: number; label: string }> = {
  '720p': { width: 1280, height: 720, label: '720p HD' },
  '1080p': { width: 1920, height: 1080, label: '1080p Full HD' },
  '1440p': { width: 2560, height: 1440, label: '1440p 2K QHD' },
  '2160p': { width: 3840, height: 2160, label: '2160p 4K UHD' },
  'custom': { width: 0, height: 0, label: 'Custom' }
}

// Panorama resolution presets (equirectangular: width = 2 * height)
const PANORAMA_RESOLUTION_PRESETS: Record<string, { width: number; height: number; label: string }> = {
  '2k': { width: 4096, height: 2048, label: '2K (4096×2048)' },
  '4k': { width: 8192, height: 4096, label: '4K (8192×4096)' },
  '6k': { width: 12288, height: 6144, label: '6K (12288×6144)' },
  '8k': { width: 16384, height: 8192, label: '8K (16384×8192)' }
}

export default function CameraViewsPanel() {
  const { viewer } = useViewer()
  const {
    cameraViews,
    selectedCameraViewId,
    addCameraView,
    removeCameraView,
    updateCameraView,
    setSelectedCameraViewId,
    toggleCameraViewsPanel,
    togglePathTracerPreview,
    cameraViewThumbnails,
    setCameraViewThumbnail,
    setCameraViewThumbnails
  } = useAppStore()
  
  const [editingViewId, setEditingViewId] = useState<string | null>(null)
  const [isMinimized, setIsMinimized] = useState(false)
  const [editName, setEditName] = useState('')
  const [newViewName, setNewViewName] = useState('')
  const [newViewType, setNewViewType] = useState<'static' | 'video' | 'panorama'>('static')
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0)
  const [currentTime, setCurrentTime] = useState(0)
  const thumbnails = cameraViewThumbnails // Use shared thumbnails from store
  const [isRegeneratingThumbnails, setIsRegeneratingThumbnails] = useState(false)
  const [videoExportResolution, setVideoExportResolution] = useState<string>('1080p')
  const [imageExportResolution, setImageExportResolution] = useState<string>('1080p')
  const [panoramaExportResolution, setPanoramaExportResolution] = useState<string>('4k')
  // Camera orientation (Twinmotion-style): yaw/pitch/roll in degrees
  const [yawDeg, setYawDeg] = useState<number>(0)
  const [pitchDeg, setPitchDeg] = useState<number>(0)
  const [rollDeg, setRollDeg] = useState<number>(0)
  const saveInputRef = useRef<HTMLInputElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const playbackIntervalRef = useRef<number | null>(null)
  const isGeneratingThumbnailsRef = useRef(false)
  const thumbnailsRef = useRef<Map<string, string>>(new Map())
  const panelRef = useRef<HTMLDivElement | null>(null)
  const PANEL_WIDTH = 420 // Match the CSS width
  const stackingOffset = usePanelStacking({ panelId: 'cameraViews', anchor: 'right' })
  const { top: panelTop, left: panelLeft, maxHeight, dragging, handleMouseDown } = useFloatingPanel(
    panelRef, 
    { 
      anchor: 'right', 
      anchorGap: 2,
      stackingOffset,
      panelWidth: PANEL_WIDTH,
      panelId: 'cameraViews'
    }
  )
  
  // Path tracer settings
  const [pathTracerSettings, setPathTracerSettings] = useState({
    enabled: false,
    samples: 32,
    bounces: 3,
    width: 1920,
    height: 1080,
    denoiseEnabled: true,
    denoiseStrength: 0.5
  })
  const [showPathTracerDialog, setShowPathTracerDialog] = useState(false)
  const [pathTracerProgress, setPathTracerProgress] = useState(0)
  const [isPathTracing, setIsPathTracing] = useState(false)
  const [pathTracerView, setPathTracerView] = useState<CameraView | null>(null)
  
  // Generate thumbnail for a camera view
  const generateThumbnail = useCallback((view: CameraView): Promise<string> => {
    return new Promise((resolve) => {
      if (!viewer) {
        resolve('')
        return
      }
      
      // Temporarily move camera to view position
      const oldState = viewer.getCameraState()
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
      
      // Set camera position and update controls
      viewer.setCameraState(position, target, false)
      
      // Force multiple render cycles to ensure camera is set and scene is fully rendered
      // Use requestAnimationFrame to ensure render happens
      requestAnimationFrame(() => {
        // Ensure controls are updated after camera change
        viewer.controls.update()
        viewer.renderer.render(viewer.scene, viewer.camera)
        
        // Second frame to ensure everything is settled
        requestAnimationFrame(() => {
            viewer.controls.update()
          viewer.renderer.render(viewer.scene, viewer.camera)
          
          // Third frame for complex scenes with shadows/HDR
          requestAnimationFrame(() => {
            try {
              // Final update and render
              viewer.controls.update()
            viewer.renderer.render(viewer.scene, viewer.camera)
            
              // Wait longer for WebGL to complete, especially for shadows and HDR
            setTimeout(() => {
              try {
                  // One more render to ensure everything is ready
                  viewer.renderer.render(viewer.scene, viewer.camera)
                  
                const canvas = viewer.renderer.domElement
                // Ensure canvas has content
                if (canvas.width > 0 && canvas.height > 0) {
                    const dataUrl = viewer.captureScreenshot
                      ? viewer.captureScreenshot()
                      : captureViewerScreenshot(viewer)
                  
                  // Restore camera
                  viewer.setCameraState(oldState.position, oldState.target, false)
                  viewer.controls.update()
                  viewer.renderer.render(viewer.scene, viewer.camera)
                  
                  resolve(dataUrl)
                } else {
                  // Restore camera if capture failed
                  viewer.setCameraState(oldState.position, oldState.target, false)
                  viewer.controls.update()
                  viewer.renderer.render(viewer.scene, viewer.camera)
                  resolve('')
                }
              } catch (error) {
                console.error('Error capturing thumbnail:', error)
                // Restore camera on error
                viewer.setCameraState(oldState.position, oldState.target, false)
                viewer.controls.update()
                viewer.renderer.render(viewer.scene, viewer.camera)
                resolve('')
              }
              }, 300) // Increased from 150ms to 300ms for better reliability
          } catch (error) {
            console.error('Error during thumbnail render:', error)
            // Restore camera on error
            viewer.setCameraState(oldState.position, oldState.target, false)
            viewer.controls.update()
            viewer.renderer.render(viewer.scene, viewer.camera)
            resolve('')
          }
          })
        })
      })
    })
  }, [viewer])
  
  // Sync thumbnails ref with store thumbnails
  useEffect(() => {
    thumbnailsRef.current = cameraViewThumbnails
  }, [cameraViewThumbnails])

  // Generate thumbnails for all views (shared between auto-effect and manual button)
  const regenerateAllThumbnails = useCallback(async () => {
    if (!viewer || cameraViews.length === 0) return
    if (isGeneratingThumbnailsRef.current) return // Prevent concurrent runs
    
      isGeneratingThumbnailsRef.current = true
    setIsRegeneratingThumbnails(true)
      try {
        const newThumbnails = new Map<string, string>()
        let hasChanges = false
        
        // OPTIMIZATION: Process thumbnails in parallel batches for better performance
        // Use optimal batch size based on CPU cores (but limit to prevent overwhelming)
        const cpuCores = navigator.hardwareConcurrency || 4
        const batchSize = Math.max(2, Math.min(cpuCores - 1, 4)) // 2-4 parallel thumbnails
        
        // Process in batches
        for (let i = 0; i < cameraViews.length; i += batchSize) {
          const batch = cameraViews.slice(i, i + batchSize)
          
          // Generate batch in parallel
          const batchPromises = batch.map(async (view) => {
            const existing = thumbnailsRef.current.get(view.id)
            // Always try to generate if missing or invalid
            if (!existing || existing === '' || existing.startsWith('data:,')) {
              try {
                console.log(`[CameraViewsPanel] Generating thumbnail for view: "${view.name}" (ID: ${view.id})`)
                const thumbnail = await generateThumbnail(view)
                if (thumbnail && thumbnail !== '' && !thumbnail.startsWith('data:,') && thumbnail.length > 100) {
                  // Valid thumbnail (has content, not empty data URL)
                  console.log(`[CameraViewsPanel] ✓ Thumbnail generated successfully for view: "${view.name}"`)
                  return { viewId: view.id, thumbnail, changed: true }
                } else {
                  console.warn(`[CameraViewsPanel] ✗ Thumbnail generation returned invalid result for view: "${view.name}"`, {
                    hasThumbnail: !!thumbnail,
                    length: thumbnail?.length || 0,
                    startsWithData: thumbnail?.startsWith('data:,') || false
                  })
                  // Try to use existing if available
                  if (existing && existing !== '' && !existing.startsWith('data:,') && existing.length > 100) {
                    return { viewId: view.id, thumbnail: existing, changed: false }
                  }
                  // Return empty to indicate failure
                  return { viewId: view.id, thumbnail: '', changed: false }
                }
              } catch (error) {
                console.error(`[CameraViewsPanel] Error generating thumbnail for view "${view.name}":`, error)
                // Try to use existing if available
                if (existing && existing !== '' && !existing.startsWith('data:,') && existing.length > 100) {
                  return { viewId: view.id, thumbnail: existing, changed: false }
                }
                // Return empty to indicate failure
                return { viewId: view.id, thumbnail: '', changed: false }
              }
            }
            // Existing thumbnail is valid, keep it
            return { viewId: view.id, thumbnail: existing, changed: false }
          })
          
          // Wait for batch to complete
          const batchResults = await Promise.all(batchPromises)
          batchResults.forEach(({ viewId, thumbnail, changed }) => {
            // Only add valid thumbnails (non-empty, not empty data URL, has content)
            if (thumbnail && thumbnail !== '' && !thumbnail.startsWith('data:,') && thumbnail.length > 100) {
              newThumbnails.set(viewId, thumbnail)
              if (changed) hasChanges = true
            } else {
              console.warn(`[CameraViewsPanel] Skipping invalid thumbnail for view ID: ${viewId}`)
            }
          })
          
          // Yield to UI thread between batches to prevent freezing
          if (i + batchSize < cameraViews.length) {
            await new Promise(resolve => setTimeout(resolve, 10))
          }
        }
        
        const currentThumbnails = thumbnailsRef.current
        
        // Always update if we have new thumbnails, even if sizes match
        // This ensures new thumbnails are always saved
        if (hasChanges || currentThumbnails.size !== newThumbnails.size || newThumbnails.size > 0) {
          let contentChanged = currentThumbnails.size !== newThumbnails.size
          if (!contentChanged) {
            // Check if any thumbnails are different or new
            for (const [id, thumbnail] of newThumbnails) {
              const current = currentThumbnails.get(id)
              if (current !== thumbnail) {
                contentChanged = true
                break
              }
            }
            // Also check if we have thumbnails that weren't there before
            if (!contentChanged && newThumbnails.size > currentThumbnails.size) {
              contentChanged = true
            }
          }
          
          if (contentChanged || newThumbnails.size > 0) {
            console.log(`[CameraViewsPanel] Updating thumbnails: ${newThumbnails.size} total, ${Array.from(newThumbnails.keys()).length} view(s)`)
            setCameraViewThumbnails(newThumbnails) // Update shared store thumbnails
          }
        } else {
          console.log('[CameraViewsPanel] No thumbnail changes detected')
        }
      } finally {
        isGeneratingThumbnailsRef.current = false
      setIsRegeneratingThumbnails(false)
      }
  }, [cameraViews, viewer, generateThumbnail])
    
  // Auto-generate thumbnails when camera views or viewer change
  useEffect(() => {
    if (!viewer || cameraViews.length === 0) return

    // Check which views need thumbnails
    const viewsNeedingThumbnails = cameraViews.filter(view => {
      const existing = cameraViewThumbnails.get(view.id)
      return !existing || existing === '' || existing.startsWith('data:,')
    })
    
    if (viewsNeedingThumbnails.length === 0) {
      // All thumbnails exist, no need to regenerate
      return
    }
    
    console.log(`[CameraViewsPanel] Auto-generating thumbnails for ${viewsNeedingThumbnails.length} view(s)`)
    
    // Wait a bit longer to ensure scene is fully loaded, especially for the first view
    const timeout = setTimeout(() => {
      regenerateAllThumbnails()
    }, 500) // Increased from 300ms to 500ms for better reliability
    
    return () => {
      clearTimeout(timeout)
      // Don't reset isGeneratingThumbnailsRef here - let the generation complete
    }
  }, [cameraViews, viewer, regenerateAllThumbnails, cameraViewThumbnails])

  // Save current camera position as a new view
  const handleSaveView = () => {
    if (!viewer) return
    
    const name = newViewName.trim() || `${newViewType === 'static' ? 'Static' : newViewType === 'video' ? 'Video' : 'Panorama'} View ${cameraViews.length + 1}`
    const state = viewer.getCameraState()
    
    addCameraView({
      name,
      type: newViewType,
      cameraPosition: {
        x: state.position.x,
        y: state.position.y,
        z: state.position.z
      },
      cameraTarget: {
        x: state.target.x,
        y: state.target.y,
        z: state.target.z
      }
    })
    
    setNewViewName('')
    
    // Update currentTime to new view
    setCurrentTime(cameraViews.length)
    
    // Thumbnail will be generated automatically by the useEffect when cameraViews updates
    // But also trigger immediate generation for the new view
    setTimeout(() => {
      regenerateAllThumbnails()
    }, 100)
  }

  // Navigate to a saved camera view
  const handleLoadView = (view: CameraView, animate: boolean = true) => {
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
    
    viewer.setCameraState(position, target, animate)
    setSelectedCameraViewId(view.id)
    
    // Update timeline position
    const index = cameraViews.findIndex(v => v.id === view.id)
    if (index >= 0) {
      setCurrentTime(index)
    }
  }

  // Playback functionality - Twinmotion style
  const handlePlay = () => {
    if (cameraViews.length === 0 || !viewer) return
    
    if (isPlaying) {
      // Stop playback
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current)
        playbackIntervalRef.current = null
      }
      setIsPlaying(false)
    } else {
      // Start playback
      setIsPlaying(true)
      let currentIndex = selectedCameraViewId
        ? cameraViews.findIndex(v => v.id === selectedCameraViewId)
        : 0
      if (currentIndex < 0) currentIndex = 0
      
      const playNext = () => {
        if (currentIndex >= cameraViews.length) {
          // Loop back to start
          currentIndex = 0
        }
        
        const view = cameraViews[currentIndex]
        handleLoadView(view, true)
        setCurrentTime(currentIndex)
        
        currentIndex++
      }
      
      // Play immediately
      playNext()
      
      // Continue playing
      playbackIntervalRef.current = window.setInterval(() => {
        playNext()
      }, 2000 / playbackSpeed) // 2 seconds per view, adjustable by speed
    }
  }
  
  // Cleanup playback on unmount or when views change
  useEffect(() => {
    return () => {
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current)
      }
    }
  }, [])

  // Timeline scrubbing
  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current || cameraViews.length === 0 || isPlaying) return
    
    const rect = timelineRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const percentage = Math.max(0, Math.min(1, x / rect.width))
    const index = Math.floor(percentage * cameraViews.length)
    
    if (index < cameraViews.length) {
      handleLoadView(cameraViews[index], true)
      setCurrentTime(index)
    }
  }

  // Delete a camera view
  const handleDeleteView = (id: string) => {
    if (confirm('Are you sure you want to delete this camera view?')) {
      removeCameraView(id)
      // Update currentTime if needed
      if (selectedCameraViewId === id) {
        setCurrentTime(0)
      }
    }
  }

  // Start editing view name
  const handleStartEdit = (view: CameraView, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    setEditingViewId(view.id)
    setEditName(view.name)
  }

  // Save edited view name
  const handleSaveEdit = (id: string) => {
    if (editName.trim()) {
      updateCameraView(id, { name: editName.trim() })
    }
    setEditingViewId(null)
    setEditName('')
  }

  // Cancel editing
  const handleCancelEdit = () => {
    setEditingViewId(null)
    setEditName('')
  }

  // Export static image from a camera view
  const handleExportStaticImage = async (view: CameraView) => {
    if (!viewer || view.type !== 'static') return
    
    // Get resolution
    const resolution = resolutionPresets[imageExportResolution]
    if (!resolution) {
      alert('Invalid resolution selected.')
      return
    }
    
    const oldState = viewer.getCameraState()
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
    
    viewer.setCameraState(position, target, false)
    
    // Store original renderer size and camera aspect
    const originalSize = new THREE.Vector2()
    viewer.renderer.getSize(originalSize)
    const originalWidth = originalSize.x
    const originalHeight = originalSize.y
    const originalAspect = viewer.camera.aspect
    
    // Set new resolution
    const exportWidth = resolution.width
    const exportHeight = resolution.height
    const exportAspect = exportWidth / exportHeight
    
    // Temporarily resize renderer and camera for export
    viewer.renderer.setSize(exportWidth, exportHeight, false)
    viewer.camera.aspect = exportAspect
    viewer.camera.updateProjectionMatrix()
    
    // Wait for render
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          viewer.controls.update()
          viewer.renderer.render(viewer.scene, viewer.camera)
          setTimeout(resolve, 200)
        })
      })
    })
    
    try {
      const dataUrl = viewer.captureScreenshot
        ? viewer.captureScreenshot()
        : captureViewerScreenshot(viewer)
      
      // Restore original renderer size and camera
      viewer.renderer.setSize(originalWidth, originalHeight, false)
      viewer.camera.aspect = originalAspect
      viewer.camera.updateProjectionMatrix()
      
      // Restore camera position
      viewer.setCameraState(oldState.position, oldState.target, false)
      viewer.controls.update()
      viewer.renderer.render(viewer.scene, viewer.camera)
      
      // Download
      const link = document.createElement('a')
      link.href = dataUrl
      link.download = `${view.name.replace(/[^a-z0-9]/gi, '_')}-${resolution.label.replace(/\s+/g, '-')}-${Date.now()}.png`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (error) {
      console.error('Error exporting image:', error)
      alert('Failed to export image. Please try again.')
      
      // Restore original renderer size and camera on error
      viewer.renderer.setSize(originalWidth, originalHeight, false)
      viewer.camera.aspect = originalAspect
      viewer.camera.updateProjectionMatrix()
      
      // Restore camera position
      viewer.setCameraState(oldState.position, oldState.target, false)
      viewer.controls.update()
      viewer.renderer.render(viewer.scene, viewer.camera)
    }
  }

      // Preview with path tracer (opens preview panel)
    const handlePreviewPathTracer = (view: CameraView, e?: React.MouseEvent) => {
      if (e) e.stopPropagation()
      if (!viewer || view.type !== 'static') return
      
      // Load the camera view first (without animation for instant preview)
      handleLoadView(view, false)
      
      // Small delay to ensure camera is set and controls are updated, then open preview
      setTimeout(() => {
        if (viewer) {
          viewer.controls.update()
          viewer.renderer.render(viewer.scene, viewer.camera)
        }
        togglePathTracerPreview()
      }, 150)
    }

    const handleExportPathTracer = (view: CameraView) => {
      if (!viewer || view.type !== 'static') return
      setPathTracerView(view)
      setShowPathTracerDialog(true)
    }

    const executePathTracerExport = async () => {
      if (!viewer || !pathTracerView) return

      setIsPathTracing(true)
      setPathTracerProgress(0)

      try {
        await exportPathTracerFromCameraView(
          viewer,
          pathTracerView,
          {
            samples: pathTracerSettings.samples,
            bounces: pathTracerSettings.bounces,
            width: pathTracerSettings.width,
            height: pathTracerSettings.height,
            denoiseEnabled: pathTracerSettings.denoiseEnabled,
            denoiseStrength: pathTracerSettings.denoiseStrength
          },
          {
            onProgress: (progress, message) => {
              setPathTracerProgress(progress)
              if (message) console.log('[CameraViewsPanel] Path tracer:', message)
            }
          }
        )
        alert(`✅ Path traced image exported for "${pathTracerView.name}"`)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        alert(`Failed to export path traced image:\n\n${message}`)
      } finally {
        setIsPathTracing(false)
        setShowPathTracerDialog(false)
        setPathTracerProgress(0)
        setPathTracerView(null)
      }
    }

    // Export 360 panorama from a camera view
    const handleExportPanorama = async (view: CameraView) => {
    if (!viewer || (view.type !== 'static' && view.type !== 'panorama')) return
    
    try {
      const oldState = viewer.getCameraState()
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
      
      viewer.setCameraState(position, target, false)
      viewer.controls.update()
      
      // Wait for render to stabilize
      await new Promise<void>(resolve => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            viewer.renderer.render(viewer.scene, viewer.camera)
            setTimeout(resolve, 200)
          })
        })
      })
      
      // Get panorama resolution from preset
      const panoramaPreset = PANORAMA_RESOLUTION_PRESETS[panoramaExportResolution]
      const resolution = panoramaPreset ? panoramaPreset.height : 4096 // Default to 4K height
      
      // Export panorama with selected resolution
      const blob = await exportPanorama(viewer.scene, viewer.renderer, viewer.camera, resolution)
      
      // Restore camera
      viewer.setCameraState(oldState.position, oldState.target, false)
      viewer.controls.update()
      viewer.renderer.render(viewer.scene, viewer.camera)
      
      // Download
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${view.name.replace(/[^a-z0-9]/gi, '_')}-panorama-${Date.now()}.png`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error exporting panorama:', error)
      alert('Failed to export panorama. Please try again.')
      // Restore camera on error if possible
      if (viewer) {
        const oldState = viewer.getCameraState()
        viewer.setCameraState(oldState.position, oldState.target, false)
        viewer.controls.update()
        viewer.renderer.render(viewer.scene, viewer.camera)
      }
    }
  }
  
  // Use resolution presets from module level
  const resolutionPresets = RESOLUTION_PRESETS

  // Export current camera view as image
  const handleExportCurrentImage = async () => {
    if (!viewer) return
    
    // Get resolution
    const resolution = resolutionPresets[imageExportResolution]
    if (!resolution) {
      alert('Invalid resolution selected.')
      return
    }
    
    // Store original renderer size and camera aspect
    const originalSize = new THREE.Vector2()
    viewer.renderer.getSize(originalSize)
    const originalWidth = originalSize.x
    const originalHeight = originalSize.y
    const originalAspect = viewer.camera.aspect
    
    // Set new resolution
    const exportWidth = resolution.width
    const exportHeight = resolution.height
    const exportAspect = exportWidth / exportHeight
    
    // Temporarily resize renderer and camera for export
    viewer.renderer.setSize(exportWidth, exportHeight, false)
    viewer.camera.aspect = exportAspect
    viewer.camera.updateProjectionMatrix()
    
    // Wait for render
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          viewer.controls.update()
          viewer.renderer.render(viewer.scene, viewer.camera)
          setTimeout(resolve, 200)
        })
      })
    })
    
    // Capture image
    const dataUrl = viewer.captureScreenshot
      ? viewer.captureScreenshot()
      : captureViewerScreenshot(viewer)
    
    // Restore original size
    viewer.renderer.setSize(originalWidth, originalHeight, false)
    viewer.camera.aspect = originalAspect
    viewer.camera.updateProjectionMatrix()
    viewer.controls.update()
    viewer.renderer.render(viewer.scene, viewer.camera)
    
    // Download
    const link = document.createElement('a')
    link.href = dataUrl
    link.download = `screenshot-${Date.now()}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Export current camera view as panorama
  const handleExportCurrentPanorama = async () => {
    if (!viewer) return
    
    try {
      // Get panorama resolution from preset
      const panoramaPreset = PANORAMA_RESOLUTION_PRESETS[panoramaExportResolution]
      const resolution = panoramaPreset ? panoramaPreset.height : 4096 // Default to 4K height
      
      // Export panorama with selected resolution
      const blob = await exportPanorama(viewer.scene, viewer.renderer, viewer.camera, resolution)
      
      // Download
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `panorama-${Date.now()}.png`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error exporting panorama:', error)
      alert('Failed to export panorama. Please try again.')
    }
  }

  // Export video from complete timeline sequence (creates MP4 video)
  const handleExportVideo = async () => {
    if (!viewer || cameraViews.length === 0) {
      alert('No camera views found. Create camera views first.')
      return
    }
    
    // Check if MediaRecorder is supported
    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported('video/webm;codecs=vp9') && !MediaRecorder.isTypeSupported('video/webm;codecs=vp8') && !MediaRecorder.isTypeSupported('video/webm')) {
      alert('Video recording is not supported in this browser. Please use Chrome, Firefox, or Edge.')
      return
    }
    
    const oldState = viewer.getCameraState()
    const canvas = viewer.renderer.domElement
    
    // Get resolution
    const resolution = resolutionPresets[videoExportResolution]
    if (!resolution) {
      alert('Invalid resolution selected.')
      return
    }
    
    // Store original renderer size and camera aspect
    // Get actual renderer size (not canvas element size)
    const originalSize = new THREE.Vector2()
    viewer.renderer.getSize(originalSize)
    const originalWidth = originalSize.x
    const originalHeight = originalSize.y
    const originalAspect = viewer.camera.aspect
    
    // Set new resolution
    const exportWidth = resolution.width
    const exportHeight = resolution.height
    const exportAspect = exportWidth / exportHeight
    
    // Temporarily resize renderer and camera for export
    viewer.renderer.setSize(exportWidth, exportHeight, false)
    viewer.camera.aspect = exportAspect
    viewer.camera.updateProjectionMatrix()
    
    // Get canvas stream (canvas must remain visible for MediaRecorder to work)
    const stream = canvas.captureStream(30) // 30 FPS
    
    // Determine best codec
    let mimeType = 'video/webm;codecs=vp9'
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm;codecs=vp8'
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm'
      }
    }
    
    const mediaRecorder = new MediaRecorder(stream, { mimeType })
    const chunks: Blob[] = []
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data)
      }
    }
    
    return new Promise<void>((resolve, reject) => {
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        // Use .webm extension (MediaRecorder creates WebM, which is MP4-compatible container)
        // Most video players can play WebM, or user can convert to MP4 if needed
        link.download = `timeline-animation-${resolution.label.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.webm`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
        
        // Restore original renderer size and camera
        viewer.renderer.setSize(originalWidth, originalHeight, false)
        viewer.camera.aspect = originalAspect
        viewer.camera.updateProjectionMatrix()
        
        // Restore camera position
        viewer.setCameraState(oldState.position, oldState.target, false)
        viewer.controls.update()
        viewer.renderer.render(viewer.scene, viewer.camera)
        
        alert(`Video exported successfully! (${resolution.label}, ${cameraViews.length} views, ${(blob.size / 1024 / 1024).toFixed(2)} MB)`)
        resolve()
      }
      
      mediaRecorder.onerror = (error) => {
        console.error('MediaRecorder error:', error)
        alert('Error recording video: ' + error)
        
        // Restore original renderer size and camera
        viewer.renderer.setSize(originalWidth, originalHeight, false)
        viewer.camera.aspect = originalAspect
        viewer.camera.updateProjectionMatrix()
        
        // Restore camera position
        viewer.setCameraState(oldState.position, oldState.target, false)
        viewer.controls.update()
        viewer.renderer.render(viewer.scene, viewer.camera)
        reject(error)
      }
      
      // Start recording
      mediaRecorder.start()
      
      // Play through all views in sequence with smooth transitions (same as timeline animation)
      let currentIndex = 0
      const viewDuration = 2000 / playbackSpeed // Total duration per view (same as timeline playback)
      const cameraAnimationDuration = 1000 // Camera transition duration (from ViewerCanvas.tsx)
      const holdDuration = viewDuration - cameraAnimationDuration // Time to hold at final position
      
      const playNextView = async () => {
        if (currentIndex >= cameraViews.length) {
          // Finished - wait a bit for final frame, then stop recording
          setTimeout(() => {
            mediaRecorder.stop()
            stream.getTracks().forEach(track => track.stop())
          }, 500)
          return
        }
        
        const view = cameraViews[currentIndex]
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
        
        // Use animated transition (true) to match timeline behavior - this creates smooth camera movement
        viewer.setCameraState(position, target, true)
        
        // Wait for camera animation to complete (1000ms transition)
        await new Promise<void>(resolve => {
          setTimeout(() => {
            // Ensure camera has reached final position
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                viewer.controls.update()
                viewer.renderer.render(viewer.scene, viewer.camera)
                resolve()
              })
            })
          }, cameraAnimationDuration + 50) // Add small buffer to ensure animation completes
        })
        
        // Hold at this view position for the remaining duration (matching timeline behavior)
        if (holdDuration > 0) {
          await new Promise<void>(resolve => {
            setTimeout(() => {
              // Keep rendering during hold
              requestAnimationFrame(() => {
                viewer.controls.update()
                viewer.renderer.render(viewer.scene, viewer.camera)
                resolve()
              })
            }, holdDuration)
          })
        }
        
        currentIndex++
        
        // Move to next view
        playNextView()
      }
      
      // Start playing views
      playNextView()
    })
  }

  // ---- Camera Orientation Helpers ----
  const updateOrientationFromCamera = useCallback(() => {
    if (!viewer) return
    const { position, target } = viewer.getCameraState()
    const offset = new THREE.Vector3().subVectors(position, target)
    const radius = offset.length()
    if (radius < 1e-6) return
    // Convert to spherical to derive yaw/pitch
    const spherical = new THREE.Spherical().setFromVector3(offset)
    // THREE: spherical.theta is azimuthal angle from +X toward +Z (0..2PI)
    // THREE: spherical.phi is polar angle from +Y (0..PI). We convert to pitch where 0 is horizon.
    const yaw = THREE.MathUtils.radToDeg(spherical.theta)
    const pitch = THREE.MathUtils.radToDeg(Math.PI / 2 - spherical.phi)
    setYawDeg(((yaw % 360) + 360) % 360)
    setPitchDeg(THREE.MathUtils.clamp(pitch, -89.9, 89.9))
    // Roll from camera.up relative to world up; compute signed angle around forward axis
    const camera = viewer.camera
    const forward = new THREE.Vector3().subVectors(target, position).normalize()
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize()
    const projectedUp = new THREE.Vector3().subVectors(camera.up.clone().normalize(), forward.clone().multiplyScalar(camera.up.clone().normalize().dot(forward)))
    const x = projectedUp.dot(right)
    const y = projectedUp.dot(new THREE.Vector3(0, 1, 0))
    const roll = Math.atan2(x, y)
    setRollDeg(THREE.MathUtils.radToDeg(roll))
  }, [viewer])

  const applyOrientation = useCallback((newYawDeg: number, newPitchDeg: number, newRollDeg: number) => {
    if (!viewer) return
    const { position, target } = viewer.getCameraState()
    const offset = new THREE.Vector3().subVectors(position, target)
    const radius = Math.max(0.001, offset.length())
    const yawRad = THREE.MathUtils.degToRad(((newYawDeg % 360) + 360) % 360)
    const pitchClamped = THREE.MathUtils.clamp(newPitchDeg, -89.9, 89.9)
    const pitchRad = THREE.MathUtils.degToRad(pitchClamped)
    // Build new offset from yaw/pitch (yaw around Y, pitch up/down)
    const newOffset = new THREE.Vector3(
      Math.cos(pitchRad) * Math.cos(yawRad),
      Math.sin(pitchRad),
      Math.cos(pitchRad) * Math.sin(yawRad)
    ).multiplyScalar(radius)
    const newPosition = new THREE.Vector3().addVectors(target, newOffset)
    // Apply roll by rotating camera.up around forward axis
    const camera = viewer.camera
    const forward = new THREE.Vector3().subVectors(target, newPosition).normalize()
    const rollRad = THREE.MathUtils.degToRad(newRollDeg)
    const q = new THREE.Quaternion().setFromAxisAngle(forward, rollRad)
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q).normalize()
    camera.up.copy(up)
    viewer.setCameraState(newPosition, target, false)
    if (viewer.controls) {
      viewer.controls.update()
    }
  }, [viewer])

  useEffect(() => {
    updateOrientationFromCamera()
  }, [viewer, updateOrientationFromCamera])

  // Export all camera views as JSON (simple format)
  const handleExportViews = () => {
    const dataStr = JSON.stringify(cameraViews, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `camera-views-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    console.log('[CameraViews] ✅ Exported camera views to JSON')
  }
  
  // Export complete scene snapshot (all settings)
  const handleExportFullSnapshot = () => {
    if (!viewer) {
      alert('Viewer not ready. Please wait a moment and try again.')
      return
    }
    
    try {
      const snapshot = exportSceneSnapshot(viewer, `Scene Snapshot ${new Date().toISOString().split('T')[0]}`)
      exportSceneSnapshotToFile(snapshot, `scene-snapshot-${new Date().toISOString().split('T')[0]}.json`)
      alert(`✅ Complete scene snapshot exported!\n\nIncludes:\n- Camera position\n- HDR settings\n- All lighting\n- Weather settings\n- Water settings\n- Rendering quality\n- All camera views`)
    } catch (error) {
      console.error('[CameraViews] ❌ Error exporting full snapshot:', error)
      alert('Failed to export scene snapshot. Please check console for details.')
    }
  }
  
  // Import complete scene snapshot
  const handleImportFullSnapshot = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    
    try {
      const snapshot = await loadSceneSnapshotFromFile(file)
      
      if (!confirm(`Import complete scene snapshot?\n\nThis will restore:\n- Camera position\n- HDR settings\n- All lighting\n- Weather settings\n- Water settings\n- Rendering quality\n- All camera views\n\nCurrent settings will be replaced.`)) {
        return
      }
      
      importSceneSnapshot(snapshot, viewer)
      alert('✅ Complete scene snapshot imported successfully!')
    } catch (error) {
      console.error('[CameraViews] ❌ Error importing full snapshot:', error)
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      
      // Provide helpful error message
      if (errorMsg.includes('Invalid file format')) {
        alert(`Failed to import: ${errorMsg}\n\nTip: Use "Load Views" for simple camera view files, or export a full snapshot first.`)
      } else {
        alert(`Failed to import scene snapshot:\n\n${errorMsg}\n\nPlease check console for details.`)
      }
    }
    
    // Reset input
    event.target.value = ''
  }

  // Import camera views from JSON file
  const handleImportViews = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target?.result as string)
        
        // Handle both array and single object formats
        let views: CameraView[] = []
        if (Array.isArray(imported)) {
          views = imported
        } else if (imported.cameraPosition && imported.cameraTarget) {
          // Single camera view object
          views = [imported]
        } else {
          alert('Invalid camera views file format. Expected array of camera views or single camera view object.')
          return
        }
        
        // Validate and import views
        let importedCount = 0
        let skippedCount = 0
        
        views.forEach((view) => {
          if (view.name && view.cameraPosition && view.cameraTarget) {
            addCameraView({
              name: view.name,
              type: view.type || 'static', // Default to static for imported views without type
              cameraPosition: view.cameraPosition,
              cameraTarget: view.cameraTarget
            })
            importedCount++
          } else {
            skippedCount++
          }
        })
        
        if (importedCount > 0) {
          console.log(`[CameraViews] ✅ Imported ${importedCount} camera view(s) from ${file.name}`)
          if (skippedCount > 0) {
            console.warn(`[CameraViews] ⚠️ Skipped ${skippedCount} invalid view(s)`)
          }
        } else {
          alert('No valid camera views found in file. Please check the file format.')
        }
      } catch (error) {
        console.error('[CameraViews] ❌ Error importing camera views:', error)
        alert('Error importing camera views: ' + (error as Error).message)
      }
    }
    reader.readAsText(file)
    
    // Reset input
    event.target.value = ''
  }

  // Format date for display
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  }

  // Calculate timeline position
  const timelinePosition = cameraViews.length > 0 
    ? (currentTime / cameraViews.length) * 100 
    : 0

  // Keyboard shortcuts for camera views panel
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      // Don't handle if typing in an input
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }

      const key = event.key.toLowerCase()
      const isCtrl = event.ctrlKey || event.metaKey
      const isShift = event.shiftKey

      // Save current view: Ctrl+Shift+S
      if (key === 's' && isCtrl && isShift) {
        event.preventDefault()
        if (viewer) {
          handleSaveView()
          // Focus input after saving
          setTimeout(() => {
            saveInputRef.current?.focus()
          }, 100)
        }
        return
      }

      // Navigate to views with number keys (1-9)
      if (key >= '1' && key <= '9' && !isCtrl && !isShift) {
        const index = parseInt(key) - 1
        if (index < cameraViews.length) {
          event.preventDefault()
          handleLoadView(cameraViews[index], true)
        }
        return
      }

      // Navigate with arrow keys
      if ((key === 'arrowdown' || key === 'arrowup') && cameraViews.length > 0) {
        event.preventDefault()
        const currentIndex = selectedCameraViewId 
          ? cameraViews.findIndex(v => v.id === selectedCameraViewId)
          : -1
        let newIndex = currentIndex

        if (key === 'arrowdown') {
          newIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % cameraViews.length
        } else {
          newIndex = currentIndex <= 0 ? cameraViews.length - 1 : currentIndex - 1
        }

        if (newIndex >= 0 && newIndex < cameraViews.length) {
          handleLoadView(cameraViews[newIndex], true)
        }
        return
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => {
      window.removeEventListener('keydown', handleKeyPress)
    }
  }, [cameraViews, selectedCameraViewId, viewer])

  return (
    <div
      ref={panelRef}
      className={`camera-views-panel${dragging ? ' dragging' : ''}`}
      style={{ top: `${panelTop}px`, left: `${panelLeft}px`, maxHeight: `${maxHeight}px` }}
    >
      {/* Header - Twinmotion style */}
      <div className="panel-header" onMouseDown={handleMouseDown}>
        <div className="header-top">
          <h2>📹 Camera Views</h2>
          <div className="header-buttons">
            <button 
              onClick={(e) => {
                e.stopPropagation()
                setIsMinimized(!isMinimized)
              }} 
              className="minimize-button" 
              title={isMinimized ? "Maximize panel" : "Minimize panel"}
              data-no-drag
            >
              {isMinimized ? '□' : '−'}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                toggleCameraViewsPanel()
              }}
              className="close-button"
              title="Close panel (V)"
              data-no-drag
            >
              ×
            </button>
          </div>
        </div>
        <div className="shortcuts-hint">
          <div className="shortcut-group">
            <span className="shortcut-key">V</span>
            <span className="shortcut-label">Toggle panel</span>
          </div>
          <div className="shortcut-group">
            <span className="shortcut-key">Ctrl+Shift+S</span>
            <span className="shortcut-label">Record view</span>
          </div>
          <div className="shortcut-group">
            <span className="shortcut-key">1–9</span>
            <span className="shortcut-label">Go to view</span>
          </div>
        </div>
      </div>
      
      {!isMinimized && (
      <div className="panel-content">
        {/* Section 1: Camera Controls - Position camera first */}
        <CameraControlsPanel />
        
        {/* Section 2: Record New View - Prominent and clear */}
        <div className="record-section">
          <h3 className="section-title">Record New View</h3>
          <div className="input-group">
            <select
              value={newViewType}
              onChange={(e) => setNewViewType(e.target.value as 'static' | 'video' | 'panorama')}
              className="camera-type-select"
              title="Camera type: Static for images, Video for sequences, Panorama for 360° equirectangular"
            >
              <option value="static">📷 Static</option>
              <option value="video">🎬 Video</option>
              <option value="panorama">🌐 Panorama</option>
            </select>
            <input
              ref={saveInputRef}
              type="text"
              placeholder="View name..."
              value={newViewName}
              onChange={(e) => setNewViewName(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleSaveView()
                }
              }}
              className="view-name-input"
            />
            <button
              onClick={handleSaveView}
              className="record-button"
              disabled={!viewer}
              title="Record current view (Ctrl+Shift+S)"
            >
              ⏺ Record
            </button>
          </div>
        </div>

        {/* Section 3: Thumbnails tools */}
        <div className="thumbnails-tools">
          <div className="thumbnails-header-row">
            <h3 className="section-title">View Thumbnails</h3>
            <button
              onClick={regenerateAllThumbnails}
              className="secondary-button"
              disabled={!viewer || cameraViews.length === 0 || isRegeneratingThumbnails}
              title="Regenerate thumbnails for all camera views"
            >
              {isRegeneratingThumbnails ? 'Updating…' : 'Regenerate'}
            </button>
          </div>
        </div>

        {/* Section 3: Saved Views List - Clean list format */}
        {cameraViews.length > 0 && (
          <div className="views-list-section">
            <h3 className="section-title">Saved Views ({cameraViews.length})</h3>
            <div className="views-list">
            {cameraViews.map((view, index) => (
              <div
                key={view.id}
                className={`view-card ${selectedCameraViewId === view.id ? 'selected' : ''}`}
                onClick={() => handleLoadView(view, true)}
              >
                {/* Thumbnail */}
                <div className="view-thumbnail">
                  {thumbnails.has(view.id) ? (
                    <img 
                      src={thumbnails.get(view.id)} 
                      alt={view.name}
                      className="thumbnail-image"
                    />
                  ) : (
                    <div className="thumbnail-placeholder">
                      <span>📹</span>
                    </div>
                  )}
                  <div className="view-number">{index + 1}</div>
                  {selectedCameraViewId === view.id && (
                    <div className="view-selected-indicator">✓</div>
                  )}
                </div>
                
                {/* View Info */}
                <div className="view-card-info">
                  {editingViewId === view.id ? (
                    <div className="view-edit-inline">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            handleSaveEdit(view.id)
                          } else if (e.key === 'Escape') {
                            handleCancelEdit()
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="edit-name-input-inline"
                        autoFocus
                      />
                    </div>
                  ) : (
                    <>
                      <div className="view-card-name" title={view.name}>
                        {view.name}
                      </div>
                      <div className="view-card-time">
                        {formatDate(view.createdAt)}
                      </div>
                    </>
                  )}
                </div>
                
                {/* Actions */}
                <div className="view-card-actions" onClick={(e) => e.stopPropagation()}>
                  {editingViewId !== view.id && (
                    <>
                      <button
                        onClick={() => handleLoadView(view, false)}
                        className="card-action-btn"
                        title="Go to (instant)"
                      >
                        ⚡
                      </button>
                      {view.type === 'static' && (
                        <>
                          <button
                            onClick={(e) => handlePreviewPathTracer(view, e)}
                            className="card-action-btn"
                            title="Preview with Path Tracer"
                          >
                            👁️
                          </button>
                          <button
                            onClick={() => handleExportStaticImage(view)}
                            className="card-action-btn"
                            title="Export as image"
                          >
                            📷
                          </button>
                          <button
                            onClick={() => handleExportPanorama(view)}
                            className="card-action-btn"
                            title="Export 360° panorama"
                          >
                            🌐
                          </button>
                          <button
                            onClick={() => handleExportPathTracer(view)}
                            className="card-action-btn"
                            title="Export with Path Tracer (high quality)"
                            disabled={isPathTracing}
                          >
                            ✨
                          </button>
                        </>
                      )}
                      {view.type === 'panorama' && (
                        <button
                          onClick={() => handleExportPanorama(view)}
                          className="card-action-btn"
                          title={`Export 360° equirectangular panorama at ${PANORAMA_RESOLUTION_PRESETS[panoramaExportResolution]?.label || panoramaExportResolution}`}
                        >
                          🌐
                        </button>
                      )}
                      <button
                        onClick={(e) => handleStartEdit(view, e)}
                        className="card-action-btn"
                        title="Rename"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleDeleteView(view.id)}
                        className="card-action-btn delete"
                        title="Delete"
                      >
                        🗑️
                      </button>
                    </>
                  )}
                </div>
                
                {/* Camera Type Badge */}
                <div className={`camera-type-badge ${view.type}`}>
                  {view.type === 'static' ? '📷' : view.type === 'video' ? '🎬' : '🌐'}
                </div>
              </div>
            ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {cameraViews.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">📹</div>
            <p>No camera views recorded</p>
            <small>Position your camera and click "Record" to create a view</small>
          </div>
        )}

        {/* Section 4: Timeline - Only for video playback */}
        {cameraViews.length > 0 && cameraViews.some(v => v.type === 'video') && (
          <div className="timeline-section">
            <h3 className="section-title">Timeline</h3>
            <div className="timeline-header">
              <div className="playback-controls">
                <button
                  onClick={handlePlay}
                  className={`play-button ${isPlaying ? 'playing' : ''}`}
                  title={isPlaying ? 'Stop' : 'Play'}
                >
                  {isPlaying ? '⏸' : '▶'}
                </button>
                <select
                  value={playbackSpeed}
                  onChange={(e) => {
                    setPlaybackSpeed(parseFloat(e.target.value))
                  }}
                  className="speed-select"
                >
                  <option value="0.5">0.5x</option>
                  <option value="1.0">1x</option>
                  <option value="1.5">1.5x</option>
                  <option value="2.0">2x</option>
                </select>
              </div>
            </div>
            
            {/* Visual Timeline */}
            <div 
              ref={timelineRef}
              className="timeline-track"
              onClick={handleTimelineClick}
            >
              <div className="timeline-ruler">
                {cameraViews.map((view, index) => (
                  <div
                    key={view.id}
                    className="timeline-keyframe"
                    style={{ left: `${(index / cameraViews.length) * 100}%` }}
                    title={view.name}
                  >
                    <div className="keyframe-marker"></div>
                    {thumbnails.has(view.id) && (
                      <div className="keyframe-thumbnail" style={{
                        backgroundImage: `url(${thumbnails.get(view.id)})`
                      }}></div>
                    )}
                  </div>
                ))}
              </div>
              
              {/* Playhead */}
              <div 
                className="timeline-playhead"
                style={{ left: `${timelinePosition}%` }}
              ></div>
              
              {/* Time markers */}
              <div className="timeline-markers">
                {cameraViews.map((_, index) => (
                  <div
                    key={index}
                    className="timeline-marker"
                    style={{ left: `${(index / cameraViews.length) * 100}%` }}
                  >
                    {index + 1}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Section 5: Export Settings - Grouped logically */}
        <div className="import-export-section">
          <h3 className="section-title">Export Settings</h3>
          
          {/* Resolution Settings - Grouped in a grid */}
          <div className="resolution-settings-grid">
            <div className="control-group">
              <label>
                <span>📷 Image</span>
                <select
                  value={imageExportResolution}
                  onChange={(e) => setImageExportResolution(e.target.value)}
                  className="resolution-select"
                >
                      {Object.entries(RESOLUTION_PRESETS).filter(([key]) => key !== 'custom').map(([key, preset]) => (
                        <option key={key} value={key}>
                          {preset.label}
                        </option>
                      ))}
                </select>
              </label>
            </div>
            <div className="control-group">
              <label>
                <span>🎬 Video</span>
                <select
                  value={videoExportResolution}
                  onChange={(e) => setVideoExportResolution(e.target.value)}
                  className="resolution-select"
                >
                      {Object.entries(RESOLUTION_PRESETS).filter(([key]) => key !== 'custom').map(([key, preset]) => (
                        <option key={key} value={key}>
                          {preset.label}
                        </option>
                      ))}
                </select>
              </label>
            </div>
            <div className="control-group">
              <label>
                <span>🌐 Panorama</span>
                <select
                  value={panoramaExportResolution}
                  onChange={(e) => setPanoramaExportResolution(e.target.value)}
                  className="resolution-select"
                >
                      {Object.entries(PANORAMA_RESOLUTION_PRESETS).map(([key, preset]) => (
                        <option key={key} value={key}>
                          {preset.label}
                        </option>
                      ))}
                </select>
              </label>
            </div>
          </div>
          
          {/* Export Buttons - Grouped by function */}
          <div className="export-buttons-group">
            <div className="export-group-header">Quick Export</div>
            <div className="import-export-buttons">
              <button
                onClick={handleExportCurrentImage}
                className="export-button"
                title={`Export current camera view as image at ${resolutionPresets[imageExportResolution]?.label || imageExportResolution} resolution`}
              >
                📷 Export Current Image
              </button>
              <button
                onClick={handleExportCurrentPanorama}
                className="export-button"
                title={`Export current camera view as 360° equirectangular panorama at ${PANORAMA_RESOLUTION_PRESETS[panoramaExportResolution]?.label || panoramaExportResolution} resolution`}
              >
                🌐 Export Current Panorama
              </button>
            </div>
          </div>

          {cameraViews.length > 0 && (
            <div className="export-buttons-group">
              <div className="export-group-header">Timeline Export</div>
              <div className="import-export-buttons">
                <button
                  onClick={handleExportVideo}
                  className="export-button video-export"
                  title={`Export complete timeline animation as video at ${resolutionPresets[videoExportResolution]?.label || videoExportResolution} resolution (WebM format, can be converted to MP4)`}
                >
                  🎬 Export Video Sequence
                </button>
              </div>
            </div>
          )}

          <div className="export-buttons-group">
            <div className="export-group-header">Project Management</div>
            <div className="import-export-buttons">
              {cameraViews.length > 0 && (
                <button
                  onClick={handleExportViews}
                  className="export-button"
                  title="Export camera views only (simple JSON)"
                >
                  📤 Export Views
                </button>
              )}
              <button
                onClick={handleExportFullSnapshot}
                className="export-button"
                title="Export complete scene snapshot (camera, HDR, lighting, weather, water, all settings)"
                style={{ backgroundColor: '#4a9eff' }}
              >
                💾 Export Full Snapshot
              </button>
              <label className="import-button">
                📥 Load Views
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportViews}
                  style={{ display: 'none' }}
                />
              </label>
              <label className="import-button">
                📂 Load Full Snapshot
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportFullSnapshot}
                  style={{ display: 'none' }}
                />
              </label>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Path Tracer Dialog */}
      {showPathTracerDialog && (
        <div className="path-tracer-dialog-overlay" onClick={() => setShowPathTracerDialog(false)}>
          <div className="path-tracer-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="path-tracer-dialog-header">
              <h3>Path Tracer Export Settings</h3>
              <button className="close-button" onClick={() => setShowPathTracerDialog(false)}>×</button>
            </div>
            <div className="path-tracer-dialog-content">
              <div className="path-tracer-setting">
                <label>Samples per Pixel:</label>
                <input
                  type="number"
                  min="8"
                  max="512"
                  step="8"
                  value={pathTracerSettings.samples}
                  onChange={(e) => {
                    const newValue = parseInt(e.target.value) || 64
                    trackSliderInteraction('Path Tracer Samples (Views)', newValue, 'CameraViewsPanel', () => setPathTracerSettings({ ...pathTracerSettings, samples: newValue }))
                  }}
                />
                <span className="setting-description">Higher = better quality, slower render (8-512)</span>
              </div>
              
              <div className="path-tracer-setting">
                <label>Bounces:</label>
                <input
                  type="number"
                  min="1"
                  max="8"
                  value={pathTracerSettings.bounces}
                  onChange={(e) => {
                    const newValue = parseInt(e.target.value) || 3
                    trackSliderInteraction('Path Tracer Bounces (Views)', newValue, 'CameraViewsPanel', () => setPathTracerSettings({ ...pathTracerSettings, bounces: newValue }))
                  }}
                />
                <span className="setting-description">Light bounces (1-8)</span>
              </div>
              
              <div className="path-tracer-setting">
                <label>Width:</label>
                <input
                  type="number"
                  min="512"
                  max="4096"
                  step="256"
                  value={pathTracerSettings.width}
                  onChange={(e) => {
                    const newValue = parseInt(e.target.value) || 2048
                    trackSliderInteraction('Path Tracer Width (Views)', newValue, 'CameraViewsPanel', () => setPathTracerSettings({ ...pathTracerSettings, width: newValue }))
                  }}
                />
              </div>
              
              <div className="path-tracer-setting">
                <label>Height:</label>
                <input
                  type="number"
                  min="512"
                  max="4096"
                  step="256"
                  value={pathTracerSettings.height}
                  onChange={(e) => {
                    const newValue = parseInt(e.target.value) || 2048
                    trackSliderInteraction('Path Tracer Height (Views)', newValue, 'CameraViewsPanel', () => setPathTracerSettings({ ...pathTracerSettings, height: newValue }))
                  }}
                />
              </div>
              
              <div className="path-tracer-setting">
                <label>
                  <input
                    type="checkbox"
                    checked={pathTracerSettings.denoiseEnabled}
                    onChange={(e) => setPathTracerSettings({ ...pathTracerSettings, denoiseEnabled: e.target.checked })}
                  />
                  Enable Denoising
                </label>
              </div>
              
              {pathTracerSettings.denoiseEnabled && (
                <div className="path-tracer-setting">
                  <label>Denoise Strength:</label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={pathTracerSettings.denoiseStrength}
                    onChange={(e) => {
                    const newValue = parseFloat(e.target.value)
                    trackSliderInteraction('Path Tracer Denoise Strength (Views)', newValue, 'CameraViewsPanel', () => setPathTracerSettings({ ...pathTracerSettings, denoiseStrength: newValue }))
                  }}
                  />
                  <span>{pathTracerSettings.denoiseStrength.toFixed(1)}</span>
                </div>
              )}
              
              {isPathTracing && (
                <div className="path-tracer-progress">
                  <div className="progress-bar">
                    <div 
                      className="progress-fill" 
                      style={{ width: `${pathTracerProgress * 100}%` }}
                    ></div>
                  </div>
                  <div className="progress-text">
                    Rendering... {Math.round(pathTracerProgress * 100)}%
                  </div>
                </div>
              )}
              
              <div className="path-tracer-dialog-actions">
                <button 
                  className="cancel-button" 
                  onClick={() => setShowPathTracerDialog(false)}
                  disabled={isPathTracing}
                >
                  Cancel
                </button>
                <button 
                  className="export-button" 
                  onClick={executePathTracerExport}
                  disabled={isPathTracing}
                >
                  {isPathTracing ? 'Rendering...' : 'Export'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
