import { useState, useEffect, useRef, useCallback } from 'react'
import * as THREE from 'three'
import { useAppStore } from '../store/useAppStore'
import { useViewer } from '../viewer/useViewer'
import { trackSliderInteraction } from '../utils/sliderTracker'
import './CameraControlsPanel.css'

/**
 * Twinmotion-style Camera Controls Panel
 * Provides precise degree-based camera rotation controls:
 * - Azimuth (horizontal rotation) in degrees
 * - Elevation (vertical rotation/pitch) in degrees
 * - Distance from target
 * - Real-time sync with OrbitControls
 */
export default function CameraControlsPanel() {
  const { viewer } = useViewer()
  const maxDistanceLimit = viewer?.controls?.maxDistance ?? 5000
  
  // Camera orientation in degrees (Twinmotion-style)
  const [azimuth, setAzimuth] = useState<number>(0) // Horizontal rotation (0-360°)
  const [elevation, setElevation] = useState<number>(0) // Vertical rotation (-90 to 90°)
  const [distance, setDistance] = useState<number>(10) // Distance from target
  const isUpdatingRef = useRef<boolean>(false) // Use ref to avoid stale closures
  const updateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  
  // Calculate camera orientation from current camera position and target
  const updateCameraOrientation = useCallback(() => {
    if (!viewer || !viewer.controls || !viewer.camera) return
    
    const { camera, controls } = viewer
    
    // Calculate direction vector from target to camera
    const direction = new THREE.Vector3()
      .subVectors(camera.position, controls.target)
      .normalize()
    
    // Calculate distance
    const dist = Math.min(camera.position.distanceTo(controls.target), maxDistanceLimit)
    
    // Calculate azimuth (horizontal angle, 0-360°)
    // Azimuth is angle around Y axis in XZ plane
    let azim = Math.atan2(direction.x, direction.z) * (180 / Math.PI)
    if (azim < 0) azim += 360
    
    // Calculate elevation (vertical angle, -90 to 90°)
    // Elevation is angle from horizontal plane
    const elev = Math.asin(direction.y) * (180 / Math.PI)
    
    if (!isUpdatingRef.current) {
      setAzimuth(azim)
      setElevation(elev)
      setDistance(dist)
    }
  }, [viewer, maxDistanceLimit])
  
  // Update camera orientation when controls change
  useEffect(() => {
    if (!viewer || !viewer.controls) return
    
    const handleChange = () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current)
      }
      // Debounce updates to avoid excessive state changes
      updateTimeoutRef.current = setTimeout(() => {
        updateCameraOrientation()
      }, 50)
    }
    
    viewer.controls.addEventListener('change', handleChange)
    
    // Initial update
    updateCameraOrientation()
    
    return () => {
      viewer.controls?.removeEventListener('change', handleChange)
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current)
      }
    }
  }, [viewer, updateCameraOrientation])
  
  // Set camera position from azimuth, elevation, and distance
  const setCameraFromOrientation = (azim: number, elev: number, dist: number) => {
    if (!viewer || !viewer.controls || !viewer.camera) return
    
    isUpdatingRef.current = true
    const safeDistance = Math.min(Math.max(0.1, dist), maxDistanceLimit)
    
    // Convert to radians
    const azimRad = THREE.MathUtils.degToRad(azim)
    const elevRad = THREE.MathUtils.degToRad(elev)
    
    // Calculate direction vector using spherical coordinates
    // In Three.js: X is right, Y is up, Z is forward
    // Azimuth: rotation around Y axis (0° = looking along +Z, 90° = looking along +X)
    // Elevation: angle from horizontal (0° = horizon, 90° = straight up)
    const direction = new THREE.Vector3(
      Math.sin(azimRad) * Math.cos(elevRad),  // X: sin(azimuth) * cos(elevation)
      Math.sin(elevRad),                       // Y: sin(elevation) 
      Math.cos(azimRad) * Math.cos(elevRad)    // Z: cos(azimuth) * cos(elevation)
    )
    
    // Set camera position relative to target
    const newPosition = new THREE.Vector3()
      .addVectors(viewer.controls.target, direction.multiplyScalar(safeDistance))
    
    // Update camera position
    viewer.camera.position.copy(newPosition)
    viewer.camera.lookAt(viewer.controls.target)
    
    // Update controls to reflect new position (this updates internal state)
    viewer.controls.update()
    
    // Force a render
    viewer.renderer.render(viewer.scene, viewer.camera)
    
    // Reset updating flag after a short delay
    setTimeout(() => {
      isUpdatingRef.current = false
      updateCameraOrientation()
    }, 100)
  }
  
  // Handle azimuth change
  const handleAzimuthChange = (value: number) => {
    // Normalize to 0-360 range
    let normalized = value % 360
    if (normalized < 0) normalized += 360
    setAzimuth(normalized)
    setCameraFromOrientation(normalized, elevation, distance)
  }
  
  // Handle elevation change
  const handleElevationChange = (value: number) => {
    // Clamp to -90 to 90 degrees
    const clamped = Math.max(-90, Math.min(90, value))
    setElevation(clamped)
    setCameraFromOrientation(azimuth, clamped, distance)
  }
  
  // Handle distance change
  const handleDistanceChange = (value: number) => {
    const clamped = Math.min(Math.max(0.1, value), maxDistanceLimit)
    setDistance(clamped)
    setCameraFromOrientation(azimuth, elevation, clamped)
  }
  
  // Reset camera to default position
  const resetCamera = () => {
    if (!viewer) return
    viewer.resetCamera()
    // Update orientation after reset
    setTimeout(() => {
      updateCameraOrientation()
    }, 200)
  }
  
  // Focus on selected object
  const focusOnObject = () => {
    if (!viewer) return
    const { selectedObject } = useAppStore.getState()
    if (selectedObject) {
      viewer.frameObject(selectedObject)
      setTimeout(() => {
        updateCameraOrientation()
      }, 200)
    }
  }
  
  if (!viewer) return null
  
  return (
    <div className="camera-controls-section">
      <h3 className="section-title">Camera Orientation</h3>
      <div className="camera-controls-grid">
        <div className="control-group">
          <label>
            <span className="control-label">Azimuth</span>
            <div className="slider-container">
              <input
                type="range"
                min="0"
                max="360"
                step="1"
                value={azimuth}
                onChange={(e) => {
                  const newValue = parseFloat(e.target.value)
                  trackSliderInteraction('Camera Azimuth', newValue, 'CameraControlsPanel', () => handleAzimuthChange(newValue))
                }}
                className="slider"
              />
              <input
                type="number"
                min="0"
                max="360"
                step="1"
                value={Math.round(azimuth)}
                onChange={(e) => {
                  const newValue = parseFloat(e.target.value) || 0
                  trackSliderInteraction('Camera Azimuth (Input)', newValue, 'CameraControlsPanel', () => handleAzimuthChange(newValue))
                }}
                className="number-input"
              />
              <span className="unit">°</span>
            </div>
            <small className="control-hint">Horizontal rotation (0-360°)</small>
          </label>
        </div>
        
        <div className="control-group">
          <label>
            <span className="control-label">Elevation</span>
            <div className="slider-container">
              <input
                type="range"
                min="-90"
                max="90"
                step="1"
                value={elevation}
                onChange={(e) => {
                  const newValue = parseFloat(e.target.value)
                  trackSliderInteraction('Camera Elevation', newValue, 'CameraControlsPanel', () => handleElevationChange(newValue))
                }}
                className="slider"
              />
              <input
                type="number"
                min="-90"
                max="90"
                step="1"
                value={Math.round(elevation)}
                onChange={(e) => {
                  const newValue = parseFloat(e.target.value) || 0
                  trackSliderInteraction('Camera Elevation (Input)', newValue, 'CameraControlsPanel', () => handleElevationChange(newValue))
                }}
                className="number-input"
              />
              <span className="unit">°</span>
            </div>
            <small className="control-hint">Vertical rotation (-90 to 90°)</small>
          </label>
        </div>
        
        <div className="control-group">
          <label>
            <span className="control-label">Distance</span>
            <div className="slider-container">
              <input
                type="range"
                min="0.1"
                max={maxDistanceLimit}
                step="0.1"
                value={distance}
                onChange={(e) => {
                  const newValue = parseFloat(e.target.value)
                  trackSliderInteraction('Camera Distance', newValue, 'CameraControlsPanel', () => handleDistanceChange(newValue))
                }}
                className="slider"
              />
              <input
                type="number"
                min="0.1"
                max={maxDistanceLimit}
                step="0.1"
                value={distance.toFixed(1)}
                onChange={(e) => {
                  const newValue = parseFloat(e.target.value) || 0.1
                  trackSliderInteraction('Camera Distance (Input)', newValue, 'CameraControlsPanel', () => handleDistanceChange(newValue))
                }}
                className="number-input"
              />
              <span className="unit">u</span>
            </div>
            <small className="control-hint">Distance from target</small>
          </label>
        </div>
      </div>
      
      <div className="camera-controls-actions">
        <button onClick={resetCamera} className="action-button">
          Reset Camera
        </button>
        <button onClick={focusOnObject} className="action-button">
          Focus Selected
        </button>
      </div>
      
      <div className="camera-controls-info">
        <small>
          <strong>Twinmotion-style controls:</strong> Adjust camera rotation with precise degree values.
          Values update automatically when you rotate the camera manually.
        </small>
      </div>
    </div>
  )
}

