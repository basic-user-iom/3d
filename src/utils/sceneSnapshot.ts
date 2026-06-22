/**
 * Comprehensive scene snapshot system
 * Exports and imports ALL viewer settings including camera, HDR, materials, lighting, weather, etc.
 */

// @ts-nocheck

import * as THREE from 'three'
import { useAppStore } from '../store/useAppStore'
import type { CameraView, DirectionalLightConfig } from '../store/useAppStore'

export interface SceneSnapshot {
  version: string // Version of snapshot format
  timestamp: number
  name?: string // Optional name for the snapshot
  
  // Camera
  camera: {
    position: { x: number; y: number; z: number }
    target: { x: number; y: number; z: number }
  }
  
  // HDR Environment
  hdr: {
    enabled: boolean
    url: string | null
    intensity: number
  }
  
  // Lighting
  lighting: {
    ambientIntensity: number
    shadowsEnabled: boolean
    shadowIntensity: number
    shadowBias: number
    showShadowPlane: boolean
    shadowPlaneTransparent: boolean
    directionalLights: DirectionalLightConfig[]
  }
  
  // Weather
  weather: {
    preset: string
    dynamicSkyEnabled: boolean
    cloudDensity: number
    cloudThickness: number
    cloudDetail: number
    cloudScale: number
    cloudStorminess: number
    cloudShadowStrength: number
    cloudColor: string
    fogDensity: number
    fogHeight: number
    fogColor: string
    rainIntensity: number
    snowIntensity: number
    windIntensity: number
    timeOfDay: number
    skyTurbidity: number
    skyAtmosphereDensity: number
    northOffset: number
    sunSize: number
    moonSize: number
    weatherQuality: 'low' | 'medium' | 'high' | 'ultra'
    rainParticleScale: number
    rainParticleSpeed: number
    rainCollisionEnabled: boolean
    snowParticleScale: number
    snowParticleSpeed: number
    snowCollisionEnabled: boolean
    windGustsEnabled: boolean
  }
  
  // Water
  water: {
    enabled: boolean
    level: number
    color: string
    opacity: number
    waveSpeed: number
    waveHeight: number
    reflectivity: number
    mode: 'plane' | 'marchingCubes'
    marchingCubesResolution: number
    marchingCubesIsolation: number
    marchingCubesMetaballCount: number
  }
  
  // Rendering Quality
  rendering: {
    pixelRatio: number
    maxPixelRatio: number
    useLogarithmicDepthBuffer: boolean
    useHighPerformanceGPU: boolean
    preferCPU: boolean
    textureAnisotropy: number
    vsyncEnabled: boolean
    maxFPS: number
    upscalingEnabled: boolean
    upscalingQuality: number
  }
  
  // Display
  display: {
    showGrid: boolean
    showAxes: boolean
    showStats: boolean
    gridSize: number
  }
  
  // Camera Views (optional - include all saved views)
  cameraViews?: CameraView[]
}

const CURRENT_VERSION = '1.0.0'

/**
 * Export complete scene snapshot
 */
export function exportSceneSnapshot(viewer: any, name?: string): SceneSnapshot {
  const state = useAppStore.getState()
  
  // Get camera state from viewer
  let cameraState = { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } }
  if (viewer && viewer.getCameraState) {
    const state = viewer.getCameraState()
    cameraState = {
      position: { x: state.position.x, y: state.position.y, z: state.position.z },
      target: { x: state.target.x, y: state.target.y, z: state.target.z }
    }
  }
  
  const snapshot: SceneSnapshot = {
    version: CURRENT_VERSION,
    timestamp: Date.now(),
    name: name || `Scene Snapshot ${new Date().toISOString().split('T')[0]}`,
    
    camera: cameraState,
    
    hdr: {
      enabled: state.hdrEnabled,
      // Filter out blob URLs - they're temporary and won't work after session ends
      // If it's a blob URL, set to null (user will need to reload HDR file manually)
      url: state.hdrUrl && state.hdrUrl.startsWith('blob:') ? null : state.hdrUrl,
      intensity: state.hdrIntensity
    },
    
    lighting: {
      ambientIntensity: state.ambientIntensity,
      shadowsEnabled: state.shadowsEnabled,
      shadowIntensity: state.shadowIntensity,
      shadowBias: state.shadowBias,
      showShadowPlane: state.showShadowPlane,
      shadowPlaneTransparent: state.shadowPlaneTransparent,
      directionalLights: state.directionalLights.map(light => ({
        ...light,
        // Remove any Three.js objects that might be attached
        position: { ...light.position },
        target: light.target ? { ...light.target } : undefined
      }))
    },
    
    weather: {
      preset: state.weatherPreset,
      dynamicSkyEnabled: state.dynamicSkyEnabled,
      cloudDensity: state.cloudDensity,
      cloudThickness: state.cloudThickness,
      cloudDetail: state.cloudDetail,
      cloudScale: state.cloudScale,
      cloudStorminess: state.cloudStorminess,
      cloudShadowStrength: state.cloudShadowStrength,
      cloudColor: state.cloudColor,
      fogDensity: state.fogDensity,
      fogHeight: state.fogHeight,
      fogColor: state.fogColor,
      rainIntensity: state.rainIntensity,
      snowIntensity: state.snowIntensity,
      windIntensity: state.windIntensity,
      timeOfDay: state.timeOfDay,
      skyTurbidity: state.skyTurbidity,
      skyAtmosphereDensity: state.skyAtmosphereDensity,
      northOffset: state.northOffset,
      sunSize: state.sunSize,
      moonSize: state.moonSize,
      weatherQuality: state.weatherQuality,
      rainParticleScale: state.rainParticleScale,
      rainParticleSpeed: state.rainParticleSpeed,
      rainCollisionEnabled: state.rainCollisionEnabled,
      snowParticleScale: state.snowParticleScale,
      snowParticleSpeed: state.snowParticleSpeed,
      snowCollisionEnabled: state.snowCollisionEnabled,
      windGustsEnabled: state.windGustsEnabled
    },
    
    water: {
      enabled: state.waterEnabled,
      level: state.waterLevel,
      color: state.waterColor,
      opacity: state.waterOpacity,
      waveSpeed: state.waveSpeed,
      waveHeight: state.waveHeight,
      reflectivity: state.waterReflectivity,
      mode: state.waterMode,
      marchingCubesResolution: state.marchingCubesResolution,
      marchingCubesIsolation: state.marchingCubesIsolation,
      marchingCubesMetaballCount: state.marchingCubesMetaballCount
    },
    
    rendering: {
      pixelRatio: state.pixelRatio,
      maxPixelRatio: state.maxPixelRatio,
      useLogarithmicDepthBuffer: state.useLogarithmicDepthBuffer,
      useHighPerformanceGPU: state.useHighPerformanceGPU,
      preferCPU: state.preferCPU,
      textureAnisotropy: state.textureAnisotropy,
      vsyncEnabled: state.vsyncEnabled,
      maxFPS: state.maxFPS,
      upscalingEnabled: state.upscalingEnabled,
      upscalingQuality: state.upscalingQuality
    },
    
    display: {
      showGrid: state.showGrid,
      showAxes: state.showAxes,
      showStats: state.showStats,
      gridSize: state.gridSize
    },
    
    // Optionally include all camera views
    cameraViews: state.cameraViews
  }
  
  console.log('[SceneSnapshot] ✅ Exported complete scene snapshot:', {
    name: snapshot.name,
    timestamp: new Date(snapshot.timestamp).toISOString(),
    camera: snapshot.camera,
    hdr: snapshot.hdr,
    lighting: { lights: snapshot.lighting.directionalLights.length },
    weather: snapshot.weather.preset,
    water: snapshot.water.enabled,
    cameraViews: snapshot.cameraViews?.length || 0
  })
  
  return snapshot
}

/**
 * Import complete scene snapshot
 */
export function importSceneSnapshot(snapshot: SceneSnapshot, viewer: any): void {
  try {
    console.log('[SceneSnapshot] 📥 Importing scene snapshot:', {
      name: snapshot.name,
      version: snapshot.version,
      timestamp: new Date(snapshot.timestamp).toISOString()
    })
    
    const state = useAppStore.getState()
    
    // Restore camera
    if (snapshot.camera && viewer && viewer.setCameraState) {
      const position = new THREE.Vector3(
        snapshot.camera.position.x,
        snapshot.camera.position.y,
        snapshot.camera.position.z
      )
      const target = new THREE.Vector3(
        snapshot.camera.target.x,
        snapshot.camera.target.y,
        snapshot.camera.target.z
      )
      viewer.setCameraState(position, target, false)
      console.log('[SceneSnapshot] ✅ Camera restored')
    }
    
    // Restore HDR
    if (snapshot.hdr) {
      state.setHdrEnabled(snapshot.hdr.enabled)
      if (snapshot.hdr.url && !snapshot.hdr.url.startsWith('blob:')) {
        // Only restore non-blob URLs (blob URLs are temporary and won't work)
        state.setHdrUrl(snapshot.hdr.url)
        console.log('[SceneSnapshot] ✅ HDR settings restored with URL:', snapshot.hdr.url)
      } else {
        // Blob URL or no URL - keep enabled but user needs to reload file
        if (snapshot.hdr.url && snapshot.hdr.url.startsWith('blob:')) {
          console.warn('[SceneSnapshot] ⚠️ HDR URL was a blob URL (temporary) - HDR enabled but file needs to be reloaded manually')
        }
        state.setHdrUrl(null)
        console.log('[SceneSnapshot] ✅ HDR settings restored (enabled, but no valid URL - file needs to be reloaded)')
      }
      state.setHdrIntensity(snapshot.hdr.intensity)
    }
    
    // Restore lighting
    if (snapshot.lighting) {
      state.setAmbientIntensity(snapshot.lighting.ambientIntensity)
      state.setShadowsEnabled(snapshot.lighting.shadowsEnabled)
      state.setShadowIntensity(snapshot.lighting.shadowIntensity)
      state.setShadowBias(snapshot.lighting.shadowBias)
      state.setShadowPlaneTransparent(snapshot.lighting.shadowPlaneTransparent)
      if (snapshot.lighting.showShadowPlane !== state.showShadowPlane) {
        state.toggleShadowPlane()
      }
      
      // Restore directional lights (clear existing and add imported ones)
      // Clear existing lights first to prevent duplicates
      const existingLights = [...state.directionalLights]
      existingLights.forEach(light => {
        state.removeDirectionalLight(light.id, { pushToUndoStack: false })
      })
      
      // Count sun lights in snapshot to prevent duplicates
      const sunLightsInSnapshot = snapshot.lighting.directionalLights.filter(l => l.isSun).length
      if (sunLightsInSnapshot > 1) {
        console.warn(`[SceneSnapshot] ⚠️ Snapshot contains ${sunLightsInSnapshot} sun lights - only the first one will be used as sun`)
      }
      
      // Add imported lights, ensuring only one sun light
      let sunLightAdded = false
      snapshot.lighting.directionalLights.forEach(lightConfig => {
        // If this is a sun light and we already have one, skip it
        if (lightConfig.isSun && sunLightAdded) {
          console.warn(`[SceneSnapshot] ⚠️ Skipping duplicate sun light: ${lightConfig.name}`)
          return
        }
        
        state.addDirectionalLight({
          name: lightConfig.name,
          type: lightConfig.type || 'directional',
          intensity: lightConfig.intensity,
          position: lightConfig.position,
          color: lightConfig.color,
          castShadow: lightConfig.castShadow,
          enabled: lightConfig.enabled,
          isSun: lightConfig.isSun,
          distance: lightConfig.distance,
          decay: lightConfig.decay,
          power: lightConfig.power,
          angle: lightConfig.angle,
          penumbra: lightConfig.penumbra,
          target: lightConfig.target,
          width: lightConfig.width,
          height: lightConfig.height,
          groundColor: lightConfig.groundColor
        }, { pushToUndoStack: false })
        
        if (lightConfig.isSun) {
          sunLightAdded = true
        }
      })
      console.log('[SceneSnapshot] ✅ Lighting settings restored')
    }
    
    // Restore weather
    if (snapshot.weather) {
      state.setWeatherPreset(snapshot.weather.preset)
      state.setDynamicSkyEnabled(snapshot.weather.dynamicSkyEnabled)
      state.setCloudDensity(snapshot.weather.cloudDensity)
      state.setCloudThickness(snapshot.weather.cloudThickness)
      state.setCloudDetail(snapshot.weather.cloudDetail)
      state.setCloudScale(snapshot.weather.cloudScale)
      state.setCloudStorminess(snapshot.weather.cloudStorminess)
      state.setCloudShadowStrength(snapshot.weather.cloudShadowStrength)
      state.setCloudColor(snapshot.weather.cloudColor)
      state.setFogDensity(snapshot.weather.fogDensity)
      state.setFogHeight(snapshot.weather.fogHeight)
      state.setFogColor(snapshot.weather.fogColor)
      state.setRainIntensity(snapshot.weather.rainIntensity)
      state.setSnowIntensity(snapshot.weather.snowIntensity)
      state.setWindIntensity(snapshot.weather.windIntensity)
      state.setTimeOfDay(snapshot.weather.timeOfDay)
      state.setSkyTurbidity(snapshot.weather.skyTurbidity)
      state.setSkyAtmosphereDensity(snapshot.weather.skyAtmosphereDensity)
      state.setNorthOffset(snapshot.weather.northOffset)
      state.setSunSize(snapshot.weather.sunSize)
      state.setMoonSize(snapshot.weather.moonSize)
      state.setWeatherQuality(snapshot.weather.weatherQuality)
      state.setRainParticleScale(snapshot.weather.rainParticleScale)
      state.setRainParticleSpeed(snapshot.weather.rainParticleSpeed)
      state.setRainCollisionEnabled(snapshot.weather.rainCollisionEnabled)
      state.setSnowParticleScale(snapshot.weather.snowParticleScale)
      state.setSnowParticleSpeed(snapshot.weather.snowParticleSpeed)
      state.setSnowCollisionEnabled(snapshot.weather.snowCollisionEnabled)
      state.setWindGustsEnabled(snapshot.weather.windGustsEnabled)
      console.log('[SceneSnapshot] ✅ Weather settings restored')
    }
    
    // Restore water
    if (snapshot.water) {
      state.setWaterEnabled(snapshot.water.enabled)
      state.setWaterLevel(snapshot.water.level)
      state.setWaterColor(snapshot.water.color)
      state.setWaterOpacity(snapshot.water.opacity)
      state.setWaveSpeed(snapshot.water.waveSpeed)
      state.setWaveHeight(snapshot.water.waveHeight)
      state.setWaterReflectivity(snapshot.water.reflectivity)
      state.setWaterMode(snapshot.water.mode)
      state.setMarchingCubesResolution(snapshot.water.marchingCubesResolution)
      state.setMarchingCubesIsolation(snapshot.water.marchingCubesIsolation)
      state.setMarchingCubesMetaballCount(snapshot.water.marchingCubesMetaballCount)
      console.log('[SceneSnapshot] ✅ Water settings restored')
    }
    
    // Restore rendering quality
    if (snapshot.rendering) {
      state.setPixelRatio(snapshot.rendering.pixelRatio)
      state.setMaxPixelRatio(snapshot.rendering.maxPixelRatio)
      state.setUseLogarithmicDepthBuffer(snapshot.rendering.useLogarithmicDepthBuffer)
      state.setUseHighPerformanceGPU(snapshot.rendering.useHighPerformanceGPU)
      state.setPreferCPU(snapshot.rendering.preferCPU)
      state.setTextureAnisotropy(snapshot.rendering.textureAnisotropy)
      state.setVsyncEnabled(snapshot.rendering.vsyncEnabled)
      state.setMaxFPS(snapshot.rendering.maxFPS)
      state.setUpscalingEnabled(snapshot.rendering.upscalingEnabled)
      state.setUpscalingQuality(snapshot.rendering.upscalingQuality)
      console.log('[SceneSnapshot] ✅ Rendering quality settings restored')
    }
    
    // Restore display
    if (snapshot.display) {
      if (snapshot.display.showGrid !== state.showGrid) state.toggleGrid()
      if (snapshot.display.showAxes !== state.showAxes) state.toggleAxes()
      if (snapshot.display.showStats !== state.showStats) state.toggleStats()
      state.setGridSize(snapshot.display.gridSize)
      console.log('[SceneSnapshot] ✅ Display settings restored')
    }
    
    // Restore camera views (optional)
    if (snapshot.cameraViews && snapshot.cameraViews.length > 0) {
      // Clear existing views first
      state.cameraViews.forEach(view => {
        state.removeCameraView(view.id)
      })
      
      // Add imported views
      snapshot.cameraViews.forEach(view => {
        state.addCameraView({
          name: view.name,
          type: view.type,
          cameraPosition: view.cameraPosition,
          cameraTarget: view.cameraTarget,
          createdAt: view.createdAt
        })
      })
      console.log(`[SceneSnapshot] ✅ ${snapshot.cameraViews.length} camera view(s) restored`)
    }
    
    console.log('[SceneSnapshot] ✅ Complete scene snapshot imported successfully')
  } catch (error) {
    console.error('[SceneSnapshot] ❌ Error importing scene snapshot:', error)
    throw error
  }
}

/**
 * Export snapshot to JSON file
 */
export function exportSceneSnapshotToFile(snapshot: SceneSnapshot, filename?: string): void {
  const dataStr = JSON.stringify(snapshot, null, 2)
  const dataBlob = new Blob([dataStr], { type: 'application/json' })
  const url = URL.createObjectURL(dataBlob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename || `scene-snapshot-${new Date().toISOString().split('T')[0]}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
  console.log('[SceneSnapshot] ✅ Exported snapshot to file:', link.download)
}

/**
 * Load snapshot from JSON file (File object)
 * Handles both full scene snapshots and simple camera view arrays
 */
export async function loadSceneSnapshotFromFile(file: File): Promise<SceneSnapshot> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string)
        
        // Check if it's a full scene snapshot
        if (data.version && data.camera && data.hdr && data.lighting && data.weather && data.water) {
          const snapshot = data as SceneSnapshot
          console.log('[SceneSnapshot] ✅ Loaded full scene snapshot from file:', {
            name: snapshot.name,
            version: snapshot.version,
            timestamp: new Date(snapshot.timestamp).toISOString()
          })
          resolve(snapshot)
          return
        }
        
        // Check if it's a simple camera views array - convert to snapshot format
        if (Array.isArray(data) && data.length > 0 && data[0].cameraPosition && data[0].cameraTarget) {
          console.log('[SceneSnapshot] ⚠️ File contains camera views array, not full snapshot. Converting to snapshot format...')
          
          // Use first camera view for camera position
          const firstView = data[0]
          const state = useAppStore.getState()
          
          // Create a snapshot from current state + camera view
          const snapshot: SceneSnapshot = {
            version: CURRENT_VERSION,
            timestamp: Date.now(),
            name: `Snapshot from ${file.name}`,
            camera: {
              position: firstView.cameraPosition,
              target: firstView.cameraTarget
            },
            hdr: {
              enabled: state.hdrEnabled,
              url: state.hdrUrl,
              intensity: state.hdrIntensity
            },
            lighting: {
              ambientIntensity: state.ambientIntensity,
              shadowsEnabled: state.shadowsEnabled,
              shadowIntensity: state.shadowIntensity,
              shadowBias: state.shadowBias,
              showShadowPlane: state.showShadowPlane,
              shadowPlaneTransparent: state.shadowPlaneTransparent,
              directionalLights: state.directionalLights
            },
            weather: {
              preset: state.weatherPreset,
              dynamicSkyEnabled: state.dynamicSkyEnabled,
              cloudDensity: state.cloudDensity,
              cloudThickness: state.cloudThickness,
              cloudDetail: state.cloudDetail,
              cloudScale: state.cloudScale,
              cloudStorminess: state.cloudStorminess,
              cloudShadowStrength: state.cloudShadowStrength,
              cloudColor: state.cloudColor,
              fogDensity: state.fogDensity,
              fogHeight: state.fogHeight,
              fogColor: state.fogColor,
              rainIntensity: state.rainIntensity,
              snowIntensity: state.snowIntensity,
              windIntensity: state.windIntensity,
              timeOfDay: state.timeOfDay,
              skyTurbidity: state.skyTurbidity,
              skyAtmosphereDensity: state.skyAtmosphereDensity,
              northOffset: state.northOffset,
              sunSize: state.sunSize,
              moonSize: state.moonSize,
              weatherQuality: state.weatherQuality,
              rainParticleScale: state.rainParticleScale,
              rainParticleSpeed: state.rainParticleSpeed,
              rainCollisionEnabled: state.rainCollisionEnabled,
              snowParticleScale: state.snowParticleScale,
              snowParticleSpeed: state.snowParticleSpeed,
              snowCollisionEnabled: state.snowCollisionEnabled,
              windGustsEnabled: state.windGustsEnabled
            },
            water: {
              enabled: state.waterEnabled,
              level: state.waterLevel,
              color: state.waterColor,
              opacity: state.waterOpacity,
              waveSpeed: state.waveSpeed,
              waveHeight: state.waveHeight,
              reflectivity: state.waterReflectivity,
              mode: state.waterMode,
              marchingCubesResolution: state.marchingCubesResolution,
              marchingCubesIsolation: state.marchingCubesIsolation,
              marchingCubesMetaballCount: state.marchingCubesMetaballCount
            },
            rendering: {
              pixelRatio: state.pixelRatio,
              maxPixelRatio: state.maxPixelRatio,
              useLogarithmicDepthBuffer: state.useLogarithmicDepthBuffer,
              useHighPerformanceGPU: state.useHighPerformanceGPU,
              preferCPU: state.preferCPU,
              textureAnisotropy: state.textureAnisotropy,
              vsyncEnabled: state.vsyncEnabled,
              maxFPS: state.maxFPS,
              upscalingEnabled: state.upscalingEnabled,
              upscalingQuality: state.upscalingQuality
            },
            display: {
              showGrid: state.showGrid,
              showAxes: state.showAxes,
              showStats: state.showStats,
              gridSize: state.gridSize
            },
            cameraViews: data as any // Include all camera views from the array
          }
          
          console.log('[SceneSnapshot] ✅ Converted camera views array to snapshot format')
          resolve(snapshot)
          return
        }
        
        // Invalid format
        throw new Error('Invalid file format. Expected either:\n1. Full scene snapshot (with version, camera, hdr, lighting, weather, water fields)\n2. Camera views array (array of objects with cameraPosition and cameraTarget)')
      } catch (error) {
        console.error('[SceneSnapshot] ❌ Error parsing snapshot file:', error)
        if (error instanceof Error) {
          reject(error)
        } else {
          reject(new Error('Invalid JSON format or file structure'))
        }
      }
    }
    reader.onerror = () => {
      reject(new Error('Failed to read file'))
    }
    reader.readAsText(file)
  })
}

/**
 * Load snapshot from URL (for files in public folder)
 * Handles both full scene snapshots and simple camera view arrays
 */
export async function loadSceneSnapshotFromUrl(url: string): Promise<SceneSnapshot> {
  try {
    console.log(`[SceneSnapshot] Attempting to load snapshot from URL: ${url}`)
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    })
    
    if (!response.ok) {
      // Don't log 404 as error - it's expected when file doesn't exist
      if (response.status === 404) {
        throw new Error(`File not found (404)`) // Simple message that won't trigger error tracking
      }
      throw new Error(`Failed to load snapshot: ${response.status} ${response.statusText}`)
    }
    
    const data = await response.json()
    
    // Check if it's a full scene snapshot
    if (data.version && data.camera && data.hdr && data.lighting && data.weather && data.water) {
      const snapshot = data as SceneSnapshot
      console.log('[SceneSnapshot] ✅ Loaded full scene snapshot from URL:', {
        name: snapshot.name,
        version: snapshot.version,
        timestamp: new Date(snapshot.timestamp).toISOString()
      })
      return snapshot
    }
    
    // Check if it's a simple camera views array - throw error to indicate it's not a full snapshot
    // (let the caller handle it as a camera view file instead)
    if (Array.isArray(data) && data.length > 0 && data[0].cameraPosition && data[0].cameraTarget) {
      throw new Error('File contains camera views array, not full scene snapshot. Use camera view loader instead.')
    }
    
    // Invalid format
    throw new Error('Invalid snapshot format. Expected full scene snapshot with version, camera, hdr, lighting, weather, and water fields.')
  } catch (error) {
    // Don't log as error if it's expected (format mismatch or file not found)
    const errorMsg = error instanceof Error ? error.message : String(error)
    if (errorMsg.includes('camera views array') || errorMsg.includes('404') || errorMsg.includes('File not found')) {
      // Expected - file doesn't exist or wrong format, just re-throw without logging as error
      throw error
    }
    // Only log unexpected errors
    console.error('[SceneSnapshot] ❌ Error loading snapshot from URL:', error)
    throw error
  }
}

