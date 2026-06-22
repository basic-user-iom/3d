/**
 * Utility for saving and loading viewer settings (camera, HDR, etc.)
 * Uses localStorage to persist settings across sessions
 */

import * as THREE from 'three'

export interface SavedViewerSettings {
  camera: {
    position: { x: number; y: number; z: number }
    target: { x: number; y: number; z: number }
  }
  hdr: {
    enabled: boolean
    url: string | null
    intensity: number
  }
  timestamp: number
}

const STORAGE_KEY = 'viewer_default_settings'

/**
 * Save current camera view and HDR settings
 */
export function saveViewerSettings(
  cameraPosition: THREE.Vector3,
  cameraTarget: THREE.Vector3,
  hdrEnabled: boolean,
  hdrUrl: string | null,
  hdrIntensity: number
): void {
  try {
    const settings: SavedViewerSettings = {
      camera: {
        position: {
          x: cameraPosition.x,
          y: cameraPosition.y,
          z: cameraPosition.z
        },
        target: {
          x: cameraTarget.x,
          y: cameraTarget.y,
          z: cameraTarget.z
        }
      },
      hdr: {
        enabled: hdrEnabled,
        url: hdrUrl,
        intensity: hdrIntensity
      },
      timestamp: Date.now()
    }
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    console.log('[ViewerSettings] Saved camera view and HDR settings:', {
      camera: settings.camera,
      hdr: settings.hdr
    })
  } catch (error) {
    console.error('[ViewerSettings] Failed to save settings:', error)
  }
}

/**
 * Load saved viewer settings
 */
export function loadViewerSettings(): SavedViewerSettings | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) {
      return null
    }
    
    const settings = JSON.parse(stored) as SavedViewerSettings
    
    // Validate settings structure
    if (!settings.camera || !settings.hdr) {
      console.warn('[ViewerSettings] Invalid settings structure, ignoring')
      return null
    }
    
    console.log('[ViewerSettings] Loaded saved settings:', {
      camera: settings.camera,
      hdr: settings.hdr,
      timestamp: new Date(settings.timestamp).toISOString()
    })
    
    return settings
  } catch (error) {
    console.error('[ViewerSettings] Failed to load settings:', error)
    return null
  }
}

/**
 * Clear saved viewer settings
 */
export function clearViewerSettings(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
    console.log('[ViewerSettings] Cleared saved settings')
  } catch (error) {
    console.error('[ViewerSettings] Failed to clear settings:', error)
  }
}

/**
 * Load camera view from JSON file
 * Supports both local file path and URL
 */
export async function loadCameraViewFromFile(filePath: string): Promise<SavedViewerSettings | null> {
  try {
    console.log(`[ViewerSettings] Attempting to fetch camera view from: ${filePath}`)
    
    // Try to fetch from URL (for files in public folder)
    const response = await fetch(filePath, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    })
    
    if (!response.ok) {
      console.warn(`[ViewerSettings] Failed to load camera view file: ${response.status} ${response.statusText} (path: ${filePath})`)
      return null
    }
    
    const data = await response.json()
    console.log('[ViewerSettings] Raw data from file:', data)
    
    // Handle array of camera views (take first one)
    let cameraView: any
    if (Array.isArray(data) && data.length > 0) {
      cameraView = data[0] // Use first camera view
      console.log(`[ViewerSettings] Loaded camera view from file: ${cameraView.name || 'Unnamed'}`)
    } else if (data.cameraPosition && data.cameraTarget) {
      cameraView = data // Single camera view object
      console.log('[ViewerSettings] Loaded single camera view object from file')
    } else {
      console.warn('[ViewerSettings] Invalid camera view file format. Expected array or object with cameraPosition/cameraTarget')
      console.warn('[ViewerSettings] Received data:', data)
      return null
    }
    
    // Validate camera view has required properties
    if (!cameraView.cameraPosition || !cameraView.cameraTarget) {
      console.error('[ViewerSettings] Camera view missing required properties:', cameraView)
      return null
    }
    
    // Convert to SavedViewerSettings format
    const settings: SavedViewerSettings = {
      camera: {
        position: cameraView.cameraPosition,
        target: cameraView.cameraTarget
      },
      hdr: {
        enabled: false, // Default, can be overridden
        url: null,
        intensity: 1.0
      },
      timestamp: cameraView.createdAt || Date.now()
    }
    
    console.log('[ViewerSettings] ✅ Camera view loaded from file:', {
      camera: settings.camera,
      source: filePath,
      position: settings.camera.position,
      target: settings.camera.target
    })
    
    return settings
  } catch (error) {
    console.error('[ViewerSettings] Failed to load camera view from file:', error)
    if (error instanceof Error) {
      console.error('[ViewerSettings] Error details:', error.message, error.stack)
    }
    return null
  }
}

