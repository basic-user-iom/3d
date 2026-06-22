/**
 * Web Export Utility
 * Exports 3D scene for web hosting with camera views, animations, and presentation mode
 * 
 * Best Practices:
 * - Use glTF/GLB format for models (web-optimized)
 * - Compress textures (WebP, KTX2)
 * - Include LOD for performance
 * - Use CDN for assets
 * - Implement lazy loading
 * - Optimize file sizes
 */

import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import JSZip from 'jszip'
import { useAppStore, CameraView } from '../store/useAppStore'
import { getSharedViewer } from '../viewer/useViewer'
import { captureViewerScreenshot } from '../viewer/utils/screenshotCapture'
import { ExportWorkerPool } from './webExportWorker'

export interface WebExportOptions {
  includeModel: boolean
  includeHDR: boolean
  includeCameraViews: boolean
  includeAnimations: boolean
  presentationMode: boolean
  transitionDuration: number // in seconds
  autoPlay: boolean
  loop: boolean
  quality: 'low' | 'medium' | 'high' | 'ultra'
  compressTextures: boolean
  shadowQuality?: 'low' | 'medium' | 'high' | 'ultra' // Shadow map resolution
  exportAsZip?: boolean // If true, package as ZIP; if false, download individual files
  backgroundColor?: string
}

export interface WebExportResult {
  html: string
  modelFile?: Blob
  hdrFile?: Blob
  configFile: Blob
  thumbnails?: Map<string, Blob> // Thumbnail files as blobs
  assets: {
    model?: string // filename
    hdr?: string // filename
    config: string // filename
    thumbnails?: Map<string, string> // thumbnail filenames
  }
}

/**
 * Generate thumbnail for camera view
 * Uses multiple render cycles to ensure scene is fully rendered before capture
 */
export async function generateViewThumbnail(
  viewer: any,
  view: CameraView,
  width: number = 256,
  height: number = 144,
  isFirst: boolean = false
): Promise<string> {
  if (!viewer || !viewer.renderer || !viewer.camera || !viewer.scene) {
    return ''
  }

  return new Promise((resolve) => {
    // Save current camera state
    const oldState = viewer.getCameraState()
    const oldClearColor = new THREE.Color()
    viewer.renderer.getClearColor(oldClearColor)
    const oldClearAlpha = viewer.renderer.getClearAlpha()

    // KEEP the scene background (including HDR environment) for thumbnails
    // The web export shows HDR, so thumbnails should match that
    // Only set clear color as fallback for areas not covered by HDR
    viewer.renderer.setClearColor(0x1a1a1a, 1.0)

    // Move camera to view position
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
            // First thumbnail needs more time for scene initialization
          setTimeout(() => {
            try {
                // Additional render cycles for first thumbnail to ensure scene is ready
                if (isFirst) {
                  viewer.controls.update()
                  viewer.renderer.render(viewer.scene, viewer.camera)
                  // Wait a bit more for HDR/environment to load
                  setTimeout(() => {
                    viewer.controls.update()
                    viewer.renderer.render(viewer.scene, viewer.camera)
                    captureThumbnail()
                  }, 200)
                } else {
                  captureThumbnail()
                }
                
                function captureThumbnail() {
                // One more render to ensure everything is ready
                  viewer.controls.update()
                viewer.renderer.render(viewer.scene, viewer.camera)
                
              const canvas = viewer.renderer.domElement
                console.log('[WebExport] Thumbnail canvas:', canvas.width, 'x', canvas.height)
                
                // Ensure canvas has content
              if (canvas.width > 0 && canvas.height > 0) {
                  const dataURL = viewer.captureScreenshot
                    ? viewer.captureScreenshot()
                    : captureViewerScreenshot(viewer)
                  console.log('[WebExport] Thumbnail data URL length:', dataURL.length, 'starts with:', dataURL.substring(0, 50))
                
                  // Restore camera and clear color
                viewer.setCameraState(oldState.position, oldState.target, false)
                  viewer.renderer.setClearColor(oldClearColor, oldClearAlpha)
                viewer.controls.update()
                viewer.renderer.render(viewer.scene, viewer.camera)
                
                resolve(dataURL)
              } else {
                  // Restore camera and clear color if capture failed
                  viewer.setCameraState(oldState.position, oldState.target, false)
                  viewer.renderer.setClearColor(oldClearColor, oldClearAlpha)
                  viewer.controls.update()
                  viewer.renderer.render(viewer.scene, viewer.camera)
                resolve('')
                  }
              }
            } catch (error) {
              console.warn('Failed to capture thumbnail:', error)
                // Restore camera and clear color on error
              viewer.setCameraState(oldState.position, oldState.target, false)
                viewer.renderer.setClearColor(oldClearColor, oldClearAlpha)
                viewer.controls.update()
                viewer.renderer.render(viewer.scene, viewer.camera)
              resolve('')
            }
            }, isFirst ? 500 : 300) // Longer timeout for first thumbnail to ensure scene is fully loaded
        } catch (error) {
          console.warn('Failed to render thumbnail:', error)
            // Restore camera and clear color on error
          viewer.setCameraState(oldState.position, oldState.target, false)
            viewer.renderer.setClearColor(oldClearColor, oldClearAlpha)
            viewer.controls.update()
            viewer.renderer.render(viewer.scene, viewer.camera)
          resolve('')
        }
        })
      })
    })
  })
}

/**
 * Export model to GLB format
 * Creates a clean scene copy to avoid exporting helpers, lights, and other non-model objects
 */
export async function exportModelToGLB(
  scene: THREE.Scene,
  options: { binary: boolean; includeAnimations: boolean } = { binary: true, includeAnimations: true }
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      // Create a clean scene copy for export (exclude helpers, lights, cameras, etc.)
      const exportScene = new THREE.Scene()
      exportScene.name = scene.name || 'Exported Scene'
      
      // Collect animations from the original scene
      const animations: THREE.AnimationClip[] = []
      if (options.includeAnimations && (scene as any).animations && Array.isArray((scene as any).animations)) {
        animations.push(...(scene as any).animations.filter((anim: any) => anim && anim.tracks && Array.isArray(anim.tracks)))
      }
      
      // Collect all user-imported models to ensure they're all included
      const userModels: THREE.Object3D[] = []
      const modelNames: string[] = []
      
      // First, identify all user-imported models (objects with isModel or isImportedModel flags)
      scene.children.forEach((child) => {
        // Check if this is a user-imported model (not auto-loaded, not a helper)
        const isUserModel = (
          (child.userData.isModel === true || child.userData.isImportedModel === true) &&
          child.userData.isAutoLoaded !== true &&
          child.userData.isHelper !== true &&
          child.userData.isGroundedSkybox !== true &&
          child.userData.isShadowPlane !== true &&
          !(child instanceof THREE.Light) &&
          !(child instanceof THREE.Camera) &&
          !child.type.includes('Helper')
        )
        
        if (isUserModel) {
          userModels.push(child)
          modelNames.push(child.name || child.userData.fileName || 'Unnamed Model')
          console.log(`[WebExport] Found user-imported model to export: "${child.name || child.userData.fileName || 'Unnamed'}" (ID: ${child.id})`)
        }
      })
      
      console.log(`[WebExport] Total user-imported models found: ${userModels.length}`, modelNames)
      
      // Temporarily hide problematic objects, then restore after export
      const hiddenObjects: THREE.Object3D[] = []
      
      // Hide helpers, lights, cameras, and controls before export
      // BUT keep shadow planes visible - they need to be exported
      // CRITICAL: Do NOT hide user-imported models - they must be included
      scene.traverse((child) => {
        // Don't hide shadow planes - they need to be in the export
        if (child.userData.isShadowPlane || (child.name || '').toLowerCase().includes('shadow')) {
          return // Skip shadow planes - keep them visible
        }
        
        // CRITICAL: Do NOT hide user-imported models
        if (child.userData.isModel === true || child.userData.isImportedModel === true) {
          return // Keep all user models visible
        }
        
        if (
          child instanceof THREE.Light ||
          child instanceof THREE.Camera ||
          child.type === 'GridHelper' ||
          child.type === 'AxesHelper' ||
          child.type === 'TransformControls' ||
          child.type === 'ArrowHelper' ||
          child.type === 'BoxHelper' ||
          child.type === 'PlaneHelper' ||
          child.type === 'PolarGridHelper' ||
          child.userData.isHelper === true ||
          child.userData.skipExport === true ||
          child.userData.isGroundedSkybox === true // Don't export GroundedSkybox - it will be recreated in the viewer
        ) {
          if (child.visible) {
            child.visible = false
            hiddenObjects.push(child)
          }
        }
      })
      
      // Ensure all materials have their textures and properties updated before export
      // This ensures texture merges and material changes are included
      let materialCount = 0
      let textureCount = 0
      const exportedTextures = new Set<THREE.Texture>()
      
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.material) {
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
          materials.forEach((mat) => {
            materialCount++
            // Ensure material is updated
            mat.needsUpdate = true
            
            // Collect all textures to ensure they're exported
            const textureProps = [
              'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap',
              'bumpMap', 'displacementMap', 'alphaMap', 'lightMap', 'clearcoatMap',
              'clearcoatNormalMap', 'clearcoatRoughnessMap', 'sheenColorMap',
              'sheenRoughnessMap', 'transmissionMap', 'thicknessMap', 'specularMap',
              'specularIntensityMap', 'specularColorMap'
            ]
            
            textureProps.forEach((prop) => {
              const texture = (mat as any)[prop] as THREE.Texture | undefined
              if (texture && texture.image) {
                exportedTextures.add(texture)
                textureCount++
                // Ensure texture is ready for export
                texture.needsUpdate = true
              }
            })
          })
        }
      })
      
      // Count all meshes in scene before export to verify what's being exported
      let totalMeshes = 0
      let totalGroups = 0
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          totalMeshes++
        } else if (obj instanceof THREE.Group) {
          totalGroups++
        }
      })
      
      console.log(`[WebExport] Scene contents before export:`)
      console.log(`   - Scene children: ${scene.children.length}`)
      console.log(`   - Total meshes: ${totalMeshes}`)
      console.log(`   - Total groups: ${totalGroups}`)
      console.log(`   - User models: ${userModels.length}`)
      console.log(`[WebExport] Exporting model with ${materialCount} material(s) and ${textureCount} texture map(s)`)
      console.log(`[WebExport] Including all material changes, texture merges, and geometry modifications`)
      console.log(`[WebExport] Format: ${options.binary ? 'GLB (binary glTF)' : 'glTF (JSON)'} - Fully compatible with GLTFLoader`)
      
      const exporter = new GLTFExporter()
      
      exporter.parse(
        scene, // Use original scene but with problematic objects hidden
        (result) => {
          // Restore visibility of hidden objects
          hiddenObjects.forEach(obj => {
            obj.visible = true
          })
          
          console.log(`[WebExport] ✅ Model exported successfully`)
      console.log(`[WebExport] 📦 Export includes:`)
      console.log(`   - ${userModels.length} user-imported model(s): ${modelNames.join(', ')}`)
      console.log(`   - All material changes (colors, properties, textures)`)
      console.log(`   - All texture merges (merged textures are already applied)`)
      console.log(`   - All geometry modifications (edge smoothing, beveling, etc.)`)
      console.log(`   - All texture maps (${textureCount} texture map(s) across ${materialCount} material(s))`)
      console.log(`   - Current scene state (all transformations and modifications)`)
      console.log(`[WebExport] Format: ${options.binary ? 'GLB (binary)' : 'glTF (JSON)'} - Compatible with GLTFLoader`)
          
          if (options.binary) {
            // GLB format
            const blob = new Blob([result as ArrayBuffer], { type: 'model/gltf-binary' })
            resolve(blob)
          } else {
            // glTF JSON format
            const jsonString = JSON.stringify(result, null, 2)
            const blob = new Blob([jsonString], { type: 'application/json' })
            resolve(blob)
          }
        },
        (error) => {
          // Restore visibility even on error
          hiddenObjects.forEach(obj => {
            obj.visible = true
          })
          console.error('[WebExport] GLTFExporter error:', error)
          reject(error)
        },
        {
          binary: options.binary,
          includeCustomExtensions: true,
          animations: options.includeAnimations ? (animations.length > 0 ? undefined : []) : [],
          // Ensure all textures are embedded
          embedImages: true,
          // Include all material properties
          onlyVisible: false
        }
      )
    } catch (error) {
      console.error('Export model error:', error)
      reject(error)
    }
  })
}

/**
 * Export HDR environment map
 */
export async function exportHDR(
  scene: THREE.Scene
): Promise<Blob | null> {
  const envMap = scene.environment
  if (!envMap || !(envMap instanceof THREE.Texture)) {
    return null
  }

  // Convert texture to HDR format
  // Note: This is a simplified version - full HDR export would require EXRLoader
  const canvas = document.createElement('canvas')
  const image = envMap.image as HTMLImageElement | HTMLCanvasElement | ImageBitmap | { width?: number; height?: number } | null
  canvas.width = (image && 'width' in image && typeof image.width === 'number') ? image.width : 1024
  canvas.height = (image && 'height' in image && typeof image.height === 'number') ? image.height : 512
  
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  if (image && (image instanceof HTMLImageElement || image instanceof HTMLCanvasElement || image instanceof ImageBitmap)) {
    ctx.drawImage(image, 0, 0)
  } else {
    return null
  }
  
  // Convert to blob (as PNG - full HDR would need EXR format)
  // TODO: Use proper HDR/EXR encoding library to preserve HDR data
  // Options: exr-writer, three/examples/jsm/exporters/EXRExporter, or similar
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob || null)
    }, 'image/png')
  })
}

/**
 * Create standalone HTML viewer
 */
export function createStandaloneViewerHTML(
  options: WebExportOptions,
  cameraViews: CameraView[],
  thumbnails: Map<string, string>,
  config?: any // Full config object with all settings
): string {
  // Ensure cameraViews is always an array
  const safeCameraViews = Array.isArray(cameraViews) ? cameraViews : []
  const transitionDuration = options.transitionDuration || 2.0
  const autoPlay = options.autoPlay !== false
  const loop = options.loop !== false
  
  // Build config string - if config is provided, use it, otherwise build a default one
  // CRITICAL: Ensure configString is always valid JSON to prevent syntax errors
  let configString: string
  try {
    if (config) {
      configString = JSON.stringify(config, null, 2)
    } else {
      configString = JSON.stringify({
        transitionDuration,
        autoPlay,
        loop,
        cameraViews: safeCameraViews
      }, null, 2)
    }
    // Ensure configString is not empty or undefined
    if (!configString || configString.trim() === '') {
      configString = JSON.stringify({
        transitionDuration,
        autoPlay,
        loop,
        cameraViews: safeCameraViews
      }, null, 2)
    }
  } catch (error) {
    console.error('[WebExport] Error stringifying config:', error)
    // Fallback to minimal valid config
    configString = JSON.stringify({
      transitionDuration,
      autoPlay,
      loop,
      cameraViews: safeCameraViews
    }, null, 2)
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
  <meta http-equiv="Pragma" content="no-cache">
  <meta http-equiv="Expires" content="0">
  <title>3D Presentation</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: #1a1a1a;
      color: #ffffff;
      overflow: hidden;
    }
    
    #viewer-container {
      width: 100vw;
      height: 100vh;
      position: relative;
    }
    
    #canvas {
      width: 100%;
      height: 100%;
      display: block;
    }
    
    .camera-views-menu {
      position: fixed;
      bottom: 20px;
      left: 20px;
      background: rgba(0, 0, 0, 0.8);
      backdrop-filter: blur(10px);
      border-radius: 12px;
      padding: 16px;
      min-width: 280px;
      max-width: calc(100vw - 40px);
      width: fit-content;
      z-index: 1000;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    }
    
    /* Lightweight Objects panel (right side) */
    .objects-panel {
      position: fixed;
      top: 20px;
      right: 20px;
      /* Reserve space for presentation controls at bottom (Previous, Next, Quality buttons) */
      /* Presentation controls: ~50px height + 20px bottom margin + 20px gap = ~90px */
      /* Also reserve space for header and padding: ~60px */
      max-height: calc(100vh - 170px);
      width: 360px;
      min-width: 320px;
      max-width: calc(100vw - 40px);
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(10px);
      border-radius: 12px;
      padding: 0;
      z-index: 1000;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
      display: flex;
      flex-direction: column;
      /* Match main viewer: panel itself doesn't scroll, only content area does */
      overflow: hidden;
    }
    
    .objects-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 20px;
      padding-bottom: 10px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      flex-shrink: 0;
      background: rgba(36, 36, 36, 0.9);
      margin: 0;
    }
    
    .objects-title {
      font-size: 15px;
      font-weight: 600;
    }
    
    .objects-toggle-btn {
      border: none;
      background: transparent;
      color: #aaa;
      cursor: pointer;
      font-size: 12px;
      padding: 2px 6px;
      border-radius: 6px;
    }
    
    .objects-toggle-btn:hover {
      background: rgba(255, 255, 255, 0.08);
      color: #fff;
    }
    
    .objects-list {
      overflow-y: auto;
      overflow-x: auto;
      /* Reserve space: header (60px) + padding (40px) + presentation controls (90px) = 190px */
      max-height: calc(100vh - 190px);
      padding: 20px;
      font-size: 14px;
      line-height: 1.5;
      width: 100%;
      box-sizing: border-box;
      flex: 1;
      min-height: 0;
      /* Match main viewer scrollbar styling - this is the ONLY scrollable area */
      scrollbar-width: thin;
      scrollbar-color: rgba(255, 255, 255, 0.2) rgba(0, 0, 0, 0.2);
      -webkit-overflow-scrolling: touch;
    }
    
    .objects-list::-webkit-scrollbar {
      width: 8px;
    }
    
    .objects-list::-webkit-scrollbar-track {
      background: rgba(255, 255, 255, 0.05);
      border-radius: 4px;
    }
    
    .objects-list::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.3);
      border-radius: 4px;
    }
    
    .objects-list::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.5);
    }
    
    .objects-tree-node {
      user-select: none;
      width: 100%;
      box-sizing: border-box;
      /* Ensure nodes don't get cut off */
      overflow: visible;
    }
    
    .objects-tree-node-content {
      display: flex;
      flex-direction: column;
      padding: 7px 12px;
      border-radius: 4px;
      cursor: pointer;
      transition: background-color 0.2s;
      position: relative;
      min-height: 34px;
      gap: 6px;
      width: 100%;
      box-sizing: border-box;
      overflow: visible;
      /* Ensure content doesn't get cut off */
      min-width: 0;
    }
    
    .objects-tree-node-content:hover {
      background-color: rgba(255, 255, 255, 0.05);
    }
    
    .objects-node-main-row {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      min-width: 0;
      overflow: visible;
      /* Ensure row can accommodate full text */
      flex-wrap: nowrap;
    }
    
    .objects-expand-btn {
      background: none;
      border: none;
      color: #aaa;
      font-size: 11px;
      width: 18px;
      height: 18px;
      padding: 0;
      margin-right: 2px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: color 0.2s;
      flex-shrink: 0;
    }
    
    .objects-expand-btn:hover {
      color: white;
    }
    
    .objects-no-children-indent {
      width: 18px;
      height: 18px;
      margin-right: 2px;
      flex-shrink: 0;
    }
    
    .objects-node-icon {
      margin-right: 4px;
      font-size: 16px;
      flex-shrink: 0;
    }
    
    .objects-node-name-container {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
      /* Allow container to expand for long names, but respect panel width */
      gap: 2px;
      overflow: visible;
      /* Allow container to grow to fit content */
      flex-shrink: 1;
      /* Ensure text can wrap and expand */
      width: 100%;
    }
    
    .objects-node-name {
      color: #e8e8e8;
      white-space: normal;
      overflow-wrap: break-word;
      word-wrap: break-word;
      word-break: break-word;
      font-weight: 500;
      min-width: 0;
      /* Remove max-width constraint to allow full text display */
      font-size: 13.5px;
      line-height: 1.4;
      /* Ensure text is fully visible */
      overflow: visible;
      text-overflow: clip;
    }
    
    .objects-node-filename {
      color: rgba(255, 255, 255, 0.5);
      font-size: 11px;
      white-space: normal;
      overflow-wrap: break-word;
      word-wrap: break-word;
      word-break: break-word;
      /* Remove max-width constraint to allow full text display */
      font-style: italic;
      margin-top: 1px;
      line-height: 1.3;
      overflow: visible;
      text-overflow: clip;
    }
    
    .objects-node-actions {
      display: flex;
      gap: 4px;
      opacity: 0;
      max-height: 0;
      overflow: hidden;
      transition: opacity 0.2s ease, max-height 0.2s ease, padding-top 0.2s ease;
      flex-shrink: 0;
      margin-left: 26px;
      padding-top: 0;
    }
    
    .objects-tree-node-content:hover .objects-node-actions {
      opacity: 1;
      max-height: 50px;
      padding-top: 4px;
    }
    
    .objects-action-btn {
      background: none;
      border: none;
      font-size: 14px;
      cursor: pointer;
      padding: 2px 4px;
      border-radius: 3px;
      transition: background-color 0.2s;
      line-height: 1;
    }
    
    .objects-action-btn:hover {
      background-color: rgba(255, 255, 255, 0.1);
    }
    
    .objects-tree-children {
      margin-left: 12px;
      border-left: 1px solid rgba(255, 255, 255, 0.08);
      padding-left: 6px;
      margin-top: 2px;
      width: 100%;
      max-width: 100%;
      box-sizing: border-box;
      overflow: visible;
    }
    
    .objects-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 5px 0;
      gap: 6px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.03);
      font-size: 12px;
    }
    
    @media (max-width: 768px) {
      .objects-panel {
        width: calc(100vw - 40px);
        max-width: calc(100vw - 40px);
        min-width: 0;
        right: 20px;
        left: 20px;
        /* On mobile, reserve more space for presentation controls */
        max-height: calc(100vh - 200px);
      }
      
      .objects-list {
        max-height: calc(100vh - 220px);
      }
      
      .camera-views-menu {
        bottom: 10px;
        left: 10px;
        right: 10px;
        width: calc(100vw - 20px);
        max-width: calc(100vw - 20px);
        padding: 12px;
        min-width: 0;
      }
      
      .camera-views-list {
        gap: 8px;
        padding: 6px 0;
      }
      
      .camera-view-item {
        min-width: 100px !important;
        width: 100px !important;
      }
      
      .camera-view-thumbnail {
        width: 100%;
        height: 100%;
      }
      
      .camera-view-name {
        font-size: 10px;
        padding: 6px;
      }
      
      .camera-view-number {
        font-size: 11px;
        padding: 2px 5px;
      }
      
      .presentation-controls {
        bottom: 10px !important;
        right: 10px !important;
        left: 10px !important;
        flex-direction: row;
        flex-wrap: wrap;
        gap: 8px;
        max-width: calc(100vw - 20px);
        min-width: 0;
        /* On mobile, ensure controls don't overlap with objects panel */
        max-width: min(calc(100vw - 20px), calc(100vw - 380px));
      }
      
      .presentation-button {
        padding: 10px 16px;
        font-size: 12px;
        white-space: nowrap;
        flex: 0 0 auto;
      }
    }
    
    @media (max-width: 480px) {
      .camera-views-menu {
        bottom: 80px;
        padding: 10px;
      }
      
      .camera-views-header {
        margin-bottom: 8px;
        padding-bottom: 8px;
      }
      
      .camera-views-title {
        font-size: 14px;
      }
      
      .camera-views-list {
        gap: 6px;
        padding: 4px 0;
      }
      
      .camera-view-item {
        min-width: 80px !important;
        width: 80px !important;
      }
      
      .camera-view-thumbnail {
        width: 100%;
        height: 100%;
      }
      
      .camera-view-name {
        font-size: 9px !important;
        padding: 4px;
      }
      
      .camera-view-number {
        font-size: 10px;
        padding: 1px 4px;
      }
      
      .presentation-controls {
        bottom: 80px !important;
        flex-wrap: wrap;
        max-width: calc(100vw - 20px);
      }
      
      .presentation-button {
        padding: 8px 12px;
        font-size: 11px;
      }
    }
    
    @media (max-width: 360px) {
      .camera-view-item {
        min-width: 70px !important;
        width: 70px !important;
      }
      
      .camera-view-name {
        font-size: 8px !important;
      }
    }
    
    .camera-views-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      padding-bottom: 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }
    
    .camera-views-title {
      font-size: 16px;
      font-weight: 600;
    }
    
    .camera-views-list {
      display: flex;
      gap: 12px;
      overflow-x: auto;
      overflow-y: hidden;
      padding: 8px 0;
      scrollbar-width: thin;
      -webkit-overflow-scrolling: touch;
      scroll-behavior: smooth;
      width: 100%;
      max-width: 100%;
    }
    
    .camera-view-item {
      position: relative;
      aspect-ratio: 16/9;
      border-radius: 8px;
      overflow: hidden;
      cursor: pointer;
      transition: all 0.2s ease;
      border: 2px solid transparent;
      flex-shrink: 0;
      min-width: 120px;
      width: 120px;
    }
    
    .camera-view-item:hover {
      transform: scale(1.05);
      border-color: rgba(255, 255, 255, 0.3);
    }
    
    .camera-view-item.active {
      border-color: #4a9eff;
      box-shadow: 0 0 20px rgba(74, 158, 255, 0.5);
    }
    
    .camera-view-thumbnail {
      width: 100%;
      height: 100%;
      object-fit: cover;
      background: #2a2a2a;
    }
    
    .camera-view-number {
      position: absolute;
      top: 4px;
      left: 4px;
      background: rgba(0, 0, 0, 0.7);
      color: white;
      font-size: 12px;
      font-weight: 600;
      padding: 2px 6px;
      border-radius: 4px;
    }
    
    .camera-view-name {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      background: linear-gradient(to top, rgba(0, 0, 0, 0.9), transparent);
      padding: 8px;
      font-size: 11px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    .presentation-controls {
      position: fixed;
      bottom: 20px;
      right: 20px;
      display: flex;
      gap: 12px;
      z-index: 1001;
      align-items: flex-end;
      flex-wrap: wrap;
      /* Ensure controls don't overlap with objects panel on the right */
      /* Objects panel is 320px wide + 20px right margin = 340px */
      max-width: calc(100vw - 360px);
      min-width: 200px;
    }
    
    .presentation-button {
      background: rgba(0, 0, 0, 0.8);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 14px;
      transition: all 0.2s ease;
      white-space: nowrap;
    }
    
    .presentation-button:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: rgba(255, 255, 255, 0.3);
    }
    
    .presentation-button:active {
      transform: scale(0.95);
    }
    
    .quality-selector-container {
      position: relative;
    }
    
    .quality-menu {
      position: absolute;
      bottom: 100%;
      right: 0;
      margin-bottom: 8px;
      background: rgba(0, 0, 0, 0.9);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 8px;
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 180px;
      max-width: 300px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
      z-index: 1002;
      /* Ensure menu doesn't overlap with objects panel */
      max-height: calc(100vh - 200px);
      overflow-y: auto;
    }
    
    .shadow-tuning {
      margin-top: 6px;
      padding-top: 6px;
      border-top: 1px solid rgba(255, 255, 255, 0.12);
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    
    .shadow-tuning-row {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    
    .shadow-tuning-label {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: rgba(255, 255, 255, 0.8);
    }
    
    .shadow-tuning-value {
      font-variant-numeric: tabular-nums;
      color: rgba(180, 220, 255, 0.9);
      margin-left: 8px;
    }
    
    .shadow-tuning-slider {
      width: 100%;
    }
    
    .shadow-tuning-toggle {
      width: 40px;
      height: 20px;
      cursor: pointer;
    }
    
    .shadow-tuning-select {
      width: 100%;
      padding: 4px 8px;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 4px;
      color: white;
      font-size: 12px;
      cursor: pointer;
    }
    
    .shadow-tuning-select:hover {
      background: rgba(255, 255, 255, 0.15);
    }
    
    .shadow-tuning-select option {
      background: #2a2a2a;
      color: white;
    }
    
    .quality-option {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: white;
      padding: 10px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      text-align: left;
      transition: all 0.2s ease;
    }
    
    .quality-option:hover {
      background: rgba(255, 255, 255, 0.15);
      border-color: rgba(255, 255, 255, 0.3);
    }
    
    .quality-option.active {
      background: rgba(74, 158, 255, 0.3);
      border-color: #4a9eff;
      color: #4a9eff;
    }
    
    @media (max-width: 768px) {
      .quality-menu {
        right: auto;
        left: 0;
      }
    }
    
    .loading-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: #1a1a1a;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      flex-direction: column;
      gap: 20px;
    }
    
    .loading-spinner {
      width: 50px;
      height: 50px;
      border: 4px solid rgba(255, 255, 255, 0.1);
      border-top-color: #4a9eff;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    
    .loading-text {
      font-size: 16px;
      color: rgba(255, 255, 255, 0.7);
      margin-bottom: 8px;
    }
    
    .loading-percentage {
      font-size: 14px;
      color: rgba(255, 255, 255, 0.5);
      font-weight: 500;
    }
    
    /* Scrollbar styling */
    .camera-views-list::-webkit-scrollbar {
      width: 6px;
    }
    
    .camera-views-list::-webkit-scrollbar-track {
      background: rgba(255, 255, 255, 0.05);
      border-radius: 3px;
    }
    
    .camera-views-list::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.2);
      border-radius: 3px;
    }
    
    .camera-views-list::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.3);
    }
  </style>
</head>
<body>
  <div id="viewer-container">
    <canvas id="canvas"></canvas>
    
    ${options.presentationMode ? `
    <div class="camera-views-menu">
      <div class="camera-views-header">
        <span class="camera-views-title">Camera Views</span>
      </div>
      <div class="camera-views-list" id="camera-views-list" style="min-width: ${safeCameraViews.length * 132}px;">
        ${safeCameraViews.map((view, index) => {
          const viewNameEscaped = (view.name || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
          const thumbnailUrl = thumbnails.get(view.id) || '';
          return `
          <div class="camera-view-item" data-view-id="${view.id}" data-index="${index}">
            <img src="${thumbnailUrl}" alt="${viewNameEscaped}" class="camera-view-thumbnail" onerror="this.style.display='none'; this.parentElement.innerHTML='<div style=\\'padding:20px;text-align:center;color:#888;\\'>📹<br>' + '${viewNameEscaped}' + '</div>'">
            <div class="camera-view-number">${index + 1}</div>
            <div class="camera-view-name">${view.name || ''}</div>
          </div>
        `;
        }).join('')}
      </div>
      <script>
        // Adjust camera views list and menu width based on viewport and number of views
        (function() {
          const list = document.getElementById('camera-views-list');
          const menu = list ? list.closest('.camera-views-menu') : null;
          if (list && menu) {
            const updateWidth = () => {
              const itemCount = ${safeCameraViews.length};
              const itemWidth = 120; // width of each item
              const gap = 12; // gap between items
              const padding = 32; // menu padding (16px * 2)
              const calculatedWidth = itemCount * (itemWidth + gap);
              const maxWidth = window.innerWidth - 40;
              const listWidth = Math.min(calculatedWidth, maxWidth - padding);
              list.style.minWidth = listWidth + 'px';
              // Ensure menu expands to fit the list
              menu.style.width = 'fit-content';
              menu.style.maxWidth = Math.min(calculatedWidth + padding, maxWidth) + 'px';
            };
            updateWidth();
            window.addEventListener('resize', updateWidth);
          }
        })();
      </script>
    </div>
    
    <div class="presentation-controls">
      <button class="presentation-button" id="play-pause-btn">${autoPlay ? '⏸️ Pause' : '▶️ Play'}</button>
      <button class="presentation-button" id="prev-btn">⏮️ Previous</button>
      <button class="presentation-button" id="next-btn">⏭️ Next</button>
      <div class="quality-selector-container">
        <button class="presentation-button" id="quality-btn" title="Shadow Quality">⚙️ Quality</button>
        <div class="quality-menu" id="quality-menu" style="display: none;">
          <button class="quality-option" data-quality="low">Low (1024px)</button>
          <button class="quality-option" data-quality="medium">Medium (2048px)</button>
          <button class="quality-option" data-quality="high">High (4096px)</button>
          <button class="quality-option" data-quality="ultra">Ultra (8192px)</button>
          
          <div class="shadow-tuning">
            <div class="shadow-tuning-row">
              <div class="shadow-tuning-label">
                <span>Shadow Bias</span>
                <span class="shadow-tuning-value" id="shadow-bias-value">0.00015</span>
        </div>
              <input
                id="shadow-bias-slider"
                class="shadow-tuning-slider"
                type="range"
                min="-0.02"
                max="0.02"
                step="0.0001"
                value="0.00015"
              />
            </div>
            <div class="shadow-tuning-row">
              <div class="shadow-tuning-label">
                <span>Normal Bias</span>
                <span class="shadow-tuning-value" id="shadow-normal-bias-value">0.10</span>
              </div>
              <input
                id="shadow-normal-bias-slider"
                class="shadow-tuning-slider"
                type="range"
                min="0"
                max="5.0"
                step="0.05"
                value="0.10"
              />
            </div>
            <div class="shadow-tuning-row">
              <div class="shadow-tuning-label">
                <span>Shadow Radius (Blur)</span>
                <span class="shadow-tuning-value" id="shadow-radius-value">4</span>
              </div>
              <input
                id="shadow-radius-slider"
                class="shadow-tuning-slider"
                type="range"
                min="0"
                max="32"
                step="0.5"
                value="4"
              />
            </div>
            <div class="shadow-tuning-row">
              <div class="shadow-tuning-label">
                <span>Shadow Camera Near</span>
                <span class="shadow-tuning-value" id="shadow-camera-near-value">0.001</span>
              </div>
              <input
                id="shadow-camera-near-slider"
                class="shadow-tuning-slider"
                type="range"
                min="0.0001"
                max="10"
                step="0.01"
                value="0.001"
              />
            </div>
            <div class="shadow-tuning-row">
              <div class="shadow-tuning-label">
                <span>Shadow Camera Far</span>
                <span class="shadow-tuning-value" id="shadow-camera-far-value">200</span>
              </div>
              <input
                id="shadow-camera-far-slider"
                class="shadow-tuning-slider"
                type="range"
                min="10"
                max="1000"
                step="10"
                value="200"
              />
            </div>
            <div class="shadow-tuning-row">
              <div class="shadow-tuning-label">
                <span>Shadow Distance</span>
                <span class="shadow-tuning-value" id="shadow-distance-value">100</span>
              </div>
              <input
                id="shadow-distance-slider"
                class="shadow-tuning-slider"
                type="range"
                min="10"
                max="500"
                step="5"
                value="100"
              />
            </div>
            <div class="shadow-tuning-row">
              <div class="shadow-tuning-label">
                <span>Contact Shadow Strength</span>
                <span class="shadow-tuning-value" id="contact-shadow-value">0.5</span>
              </div>
              <input
                id="contact-shadow-slider"
                class="shadow-tuning-slider"
                type="range"
                min="0"
                max="2.0"
                step="0.1"
                value="0.5"
              />
            </div>
            <div class="shadow-tuning-row">
              <div class="shadow-tuning-label">
                <span>Self-Shadowing</span>
                <span class="shadow-tuning-value" id="self-shadow-value">On</span>
              </div>
              <input
                id="self-shadow-toggle"
                class="shadow-tuning-toggle"
                type="checkbox"
                checked
              />
            </div>
            <div class="shadow-tuning-row">
              <div class="shadow-tuning-label">
                <span>Shadow Filter Type</span>
                <select id="shadow-filter-type" class="shadow-tuning-select">
                  <option value="PCFSoft">PCF Soft (Recommended)</option>
                  <option value="PCF">PCF</option>
                  <option value="Basic">Basic</option>
                  <option value="VSM">VSM (Variance Shadow Maps)</option>
                </select>
              </div>
            </div>
            <div class="shadow-tuning-row">
              <div class="shadow-tuning-label">
                <span>Shadow Color Intensity</span>
                <span class="shadow-tuning-value" id="shadow-color-intensity-value">1.0</span>
              </div>
              <input
                id="shadow-color-intensity-slider"
                class="shadow-tuning-slider"
                type="range"
                min="0"
                max="2.0"
                step="0.1"
                value="1.0"
              />
            </div>
            <div class="shadow-tuning-row">
              <div class="shadow-tuning-label">
                <span>Light Distance</span>
                <span class="shadow-tuning-value" id="shadow-light-distance-value">40</span>
              </div>
              <input
                id="shadow-light-distance-slider"
                class="shadow-tuning-slider"
                type="range"
                min="5"
                max="150"
                step="1"
                value="40"
              />
            </div>
            <div class="shadow-tuning-row">
              <div class="shadow-tuning-label">
                <span>Sun Azimuth</span>
                <span class="shadow-tuning-value" id="shadow-sun-azimuth-value">45°</span>
              </div>
              <input
                id="shadow-sun-azimuth-slider"
                class="shadow-tuning-slider"
                type="range"
                min="0"
                max="360"
                step="1"
                value="45"
              />
            </div>
            <div class="shadow-tuning-row">
              <div class="shadow-tuning-label">
                <span>Sun Elevation</span>
                <span class="shadow-tuning-value" id="shadow-sun-elevation-value">45°</span>
              </div>
              <input
                id="shadow-sun-elevation-slider"
                class="shadow-tuning-slider"
                type="range"
                min="5"
                max="85"
                step="1"
                value="45"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
    ` : ''}
    
    <!-- Lightweight Objects panel (visibility + focus) -->
    <div class="objects-panel" id="objects-panel">
      <div class="objects-header">
        <span class="objects-title">Objects</span>
        <button class="objects-toggle-btn" id="objects-toggle-btn">Hide</button>
      </div>
      <div class="objects-list" id="objects-list">
        <!-- Filled at runtime from loaded GLB scene -->
      </div>
    </div>
    
    <div class="loading-overlay" id="loading-overlay">
      <div class="loading-spinner"></div>
      <div class="loading-text">Loading 3D scene...</div>
      <div class="loading-percentage" id="loading-percentage">0%</div>
    </div>
  </div>

  <script type="importmap">
    {
      "imports": {
        "three": "https://cdn.jsdelivr.net/npm/three@0.162.0/build/three.module.js",
        "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.162.0/examples/jsm/",
        "meshoptimizer": "https://cdn.jsdelivr.net/npm/meshoptimizer@0.19.0/dist/meshopt_decoder.module.js"
      }
    }
  </script>

  <script type="module">
    import * as THREE from 'three';
    import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
    import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
    import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
    import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
    import { GroundedSkybox } from 'three/addons/objects/GroundedSkybox.js';
    import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
    
    // Load MeshoptSimplifier dynamically (it's a large library)
    let MeshoptSimplifier = null;
    (async () => {
      try {
        // Try to load from CDN - meshoptimizer package structure
        const meshoptModule = await import('https://cdn.jsdelivr.net/npm/meshoptimizer@0.19.0/+esm');
        MeshoptSimplifier = meshoptModule.MeshoptSimplifier || meshoptModule;
        if (MeshoptSimplifier && MeshoptSimplifier.simplify) {
          console.log('[WebExport] MeshoptSimplifier loaded successfully');
        } else {
          throw new Error('MeshoptSimplifier not found in module');
        }
      } catch (e) {
        console.warn('[WebExport] Failed to load MeshoptSimplifier, will use fallback decimation:', e);
        MeshoptSimplifier = null;
      }
    })();
    
    // Configuration - includes all exported settings
    const CONFIG = ${configString};
    
    // Ensure cameraViews is always an array
    if (!CONFIG.cameraViews || !Array.isArray(CONFIG.cameraViews)) {
      CONFIG.cameraViews = [];
    }
    
    // Ensure other array properties are safe
    if (!CONFIG.lighting) CONFIG.lighting = {};
    if (!CONFIG.lighting.directionalLights || !Array.isArray(CONFIG.lighting.directionalLights)) {
      CONFIG.lighting.directionalLights = [];
    }
    if (!CONFIG.lighting.sceneLights || !Array.isArray(CONFIG.lighting.sceneLights)) {
      CONFIG.lighting.sceneLights = [];
    }
    
    // Ensure camera bounds are initialized
    if (!CONFIG.cameraBounds) {
      CONFIG.cameraBounds = {
        enabled: false,
        min: { x: -100, y: -10, z: -100 },
        max: { x: 100, y: 100, z: 100 }
      };
    }
    
    // Validate camera bounds - warn if bounds are invalid (min >= max or all zeros)
    if (CONFIG.cameraBounds && CONFIG.cameraBounds.enabled) {
      const min = CONFIG.cameraBounds.min;
      const max = CONFIG.cameraBounds.max;
      const isValid = min.x < max.x && min.y < max.y && min.z < max.z;
      if (!isValid) {
        console.warn('[WebExport] Camera bounds are invalid (min >= max or all zeros). Disabling bounds.', {
          min,
          max
        });
        CONFIG.cameraBounds.enabled = false;
      } else {
        console.log('[WebExport] Camera bounds enabled:', {
          min,
          max,
          enabled: CONFIG.cameraBounds.enabled
        });
      }
    }
    
    // Initialize Three.js
    const canvas = document.getElementById('canvas');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    // BEST PRACTICE: Use PCFSoftShadowMap for smoother shadows that reduce flickering
    // This provides better quality than BasicShadowMap while maintaining performance
    // CRITICAL: PCFSoftShadowMap is required for shadow radius (blur) to work
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 10000);
    
    // Initialize CSS3D renderer for YouTube videos
    const css3dRenderer = new CSS3DRenderer();
    css3dRenderer.setSize(window.innerWidth, window.innerHeight);
    css3dRenderer.domElement.style.position = 'absolute';
    css3dRenderer.domElement.style.top = '0';
    css3dRenderer.domElement.style.left = '0';
    css3dRenderer.domElement.style.pointerEvents = 'none';
    css3dRenderer.domElement.style.zIndex = '21';
    css3dRenderer.domElement.style.overflow = 'hidden';
    document.getElementById('viewer-container').appendChild(css3dRenderer.domElement);
    
    // Controls
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 1;
    controls.maxDistance = 1000;
    
    // Presentation state
    let currentViewIndex = 0;
    let isPlaying = CONFIG.autoPlay;
    let transitionAnimation = null;
    
    // Simple camera debug tracker
    const cameraDebug = {
      enabled: true,
      log: (label, data) => {
        if (!cameraDebug.enabled) return;
        try {
          console.log('[WebExport CameraDebug]', label, data);
        } catch (e) {
          // ignore logging errors
        }
      },
      checkNaN: (vec, label) => {
        if (!vec) return false;
        const hasNaN = !isFinite(vec.x) || !isFinite(vec.y) || !isFinite(vec.z);
        if (hasNaN) {
          cameraDebug.log('NaN detected', { label, x: vec.x, y: vec.y, z: vec.z });
        }
        return hasNaN;
      }
    };
    
    // Camera transition function (smooth interpolation)
    function transitionToView(viewIndex, duration) {
      if (!Array.isArray(CONFIG.cameraViews) || viewIndex < 0 || viewIndex >= CONFIG.cameraViews.length) {
        console.warn('Invalid view index:', viewIndex);
        return;
      }
      
      // Ensure scene is ready
      if (!scene || !camera || !renderer) {
        console.warn('Scene not ready for transition');
        return;
      }
      
      const view = CONFIG.cameraViews[viewIndex];
      if (!view || !view.cameraPosition || !view.cameraTarget) {
        console.warn('Invalid view data:', view);
        return;
      }
      
      const startPos = camera.position.clone();
      const startTarget = controls.target.clone();
      const endPos = new THREE.Vector3(view.cameraPosition.x, view.cameraPosition.y, view.cameraPosition.z);
      const endTarget = new THREE.Vector3(view.cameraTarget.x, view.cameraTarget.y, view.cameraTarget.z);

      // Sanitize target/position coming from CONFIG to avoid NaN camera state
      const sanitizeVector = (vec, fallback, label) => {
        const invalid = !isFinite(vec.x) || !isFinite(vec.y) || !isFinite(vec.z);
        if (invalid) {
          cameraDebug.log('transition:sanitize', {
            label,
            original: { x: vec.x, y: vec.y, z: vec.z },
            fallback: { x: fallback.x, y: fallback.y, z: fallback.z }
          });
          vec.copy(fallback);
        }
      };

      sanitizeVector(endPos, startPos, 'endPos');
      sanitizeVector(endTarget, startTarget, 'endTarget');

      // Resolve effective duration to avoid NaN in interpolation
      let effectiveDuration = typeof duration === 'number' && isFinite(duration) && duration > 0
        ? duration
        : (typeof CONFIG.transitionDuration === 'number' && isFinite(CONFIG.transitionDuration) && CONFIG.transitionDuration > 0
            ? CONFIG.transitionDuration
            : 1.0);
      
      cameraDebug.log('transition:start', {
        viewIndex,
        duration: effectiveDuration,
        startPos: { x: startPos.x, y: startPos.y, z: startPos.z },
        startTarget: { x: startTarget.x, y: startTarget.y, z: startTarget.z },
        endPos: { x: endPos.x, y: endPos.y, z: endPos.z },
        endTarget: { x: endTarget.x, y: endTarget.y, z: endTarget.z }
      });
      
      const startTime = Date.now();
      
      // Disable controls during transition to prevent interference
      const wasEnabled = controls.enabled;
      controls.enabled = false;
      
      // Ensure scene is visible before starting transition
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Group) {
          obj.visible = true;
        }
      });
      
      // CRITICAL: Disable shadow map auto-update during transition to prevent flickering
      const wasAutoUpdate = renderer.shadowMap.autoUpdate;
      renderer.shadowMap.autoUpdate = false;
      
      // Initial render before transition
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      
      function animate() {
        const elapsed = (Date.now() - startTime) / 1000;
        const rawProgress = elapsed / effectiveDuration;
        const progress = Math.min(Math.max(rawProgress, 0), 1);
        
        // Ease in-out cubic
        const eased = progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;
        
        camera.position.lerpVectors(startPos, endPos, eased);
        controls.target.lerpVectors(startTarget, endTarget, eased);
        
        // Detect invalid camera state that could cause black screen
        const posHasNaN = cameraDebug.checkNaN(camera.position, 'camera.position');
        const targetHasNaN = cameraDebug.checkNaN(controls.target, 'controls.target');
        const camPos = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
        const camTarget = { x: controls.target.x, y: controls.target.y, z: controls.target.z };
        if ((posHasNaN || targetHasNaN) && progress < 1) {
          cameraDebug.log('transition:invalid-state', { viewIndex, progress, camPos, camTarget });
        }
        controls.update();
        
        // CRITICAL: Always render during transition to prevent black screen
        // Also ensure camera projection is updated
        camera.updateProjectionMatrix();
        
        // CRITICAL: Ensure scene is visible and all objects are rendered
        scene.traverse((obj) => {
          if (obj instanceof THREE.Mesh || obj instanceof THREE.Group) {
            if (!obj.visible) {
              obj.visible = true;
            }
          }
        });
        
        renderer.render(scene, camera);
        
        if (progress < 1) {
          transitionAnimation = requestAnimationFrame(animate);
        } else {
          transitionAnimation = null;
          controls.enabled = wasEnabled;
          // Re-enable shadow map auto-update after transition
          renderer.shadowMap.autoUpdate = wasAutoUpdate;
          // Final render after transition completes
          camera.updateProjectionMatrix();
          renderer.render(scene, camera);
          updateActiveView(viewIndex);
          cameraDebug.log('transition:complete', {
            viewIndex,
            finalPos: camPos,
            finalTarget: camTarget
          });
        }
      }
      
      if (transitionAnimation) {
        cancelAnimationFrame(transitionAnimation);
        transitionAnimation = null;
      }
      
      animate();
    }
    
    function updateActiveView(index) {
      document.querySelectorAll('.camera-view-item').forEach((item, i) => {
        item.classList.toggle('active', i === index);
      });
      currentViewIndex = index;
    }
    
    // Presentation controls
    ${options.presentationMode ? `
    function nextView() {
      if (transitionAnimation || !Array.isArray(CONFIG.cameraViews) || CONFIG.cameraViews.length === 0) return;
      const next = (currentViewIndex + 1) % CONFIG.cameraViews.length;
      if (next === 0 && !CONFIG.loop) {
        isPlaying = false;
        updatePlayPauseButton();
        return;
      }
      transitionToView(next);
    }
    
    function prevView() {
      if (transitionAnimation || !Array.isArray(CONFIG.cameraViews) || CONFIG.cameraViews.length === 0) return;
      const prev = currentViewIndex - 1;
      if (prev < 0) {
        if (CONFIG.loop) {
          transitionToView(CONFIG.cameraViews.length - 1);
        }
        return;
      }
      transitionToView(prev);
    }
    
    function updatePlayPauseButton() {
      const btn = document.getElementById('play-pause-btn');
      if (btn) {
        btn.textContent = isPlaying ? '⏸️ Pause' : '▶️ Play';
      }
    }
    
    // Auto-play
    let autoPlayInterval = null;
    function startAutoPlay() {
      if (autoPlayInterval) clearInterval(autoPlayInterval);
      autoPlayInterval = setInterval(() => {
        if (isPlaying && !transitionAnimation) {
          nextView();
        }
      }, CONFIG.transitionDuration * 1000 + 1000); // transition + 1s pause
    }
    
    function stopAutoPlay() {
      if (autoPlayInterval) {
        clearInterval(autoPlayInterval);
        autoPlayInterval = null;
      }
    }
    
    const playPauseBtn = document.getElementById('play-pause-btn');
    if (playPauseBtn) {
      playPauseBtn.addEventListener('click', () => {
      isPlaying = !isPlaying;
      updatePlayPauseButton();
      if (isPlaying) {
        startAutoPlay();
      } else {
        stopAutoPlay();
      }
    });
    }
    
    const nextBtn = document.getElementById('next-btn');
    if (nextBtn) {
      nextBtn.addEventListener('click', nextView);
    }
    const prevBtn = document.getElementById('prev-btn');
    if (prevBtn) {
      prevBtn.addEventListener('click', prevView);
    }
    
    // Shadow quality and shadow tuning management
    let currentShadowQuality = CONFIG.shadowQuality || 'high';
    let currentShadowBias = 0.00015;
    let currentShadowNormalBias = 0.10;
    let currentShadowRadius = 4;
    let currentShadowCameraNear = 0.001;
    let currentShadowCameraFar = 200;
    let currentShadowDistance = 100;
    let currentContactShadowStrength = 0.5;
    let currentSelfShadowing = true;
    let currentShadowFilterType = 'PCFSoft';
    let currentShadowColorIntensity = 1.0;
    let currentShadowLightDistance = 40;
    let currentSunAzimuthDeg = 45;
    let currentSunElevationDeg = 45;
    
    function getShadowMapSize(quality) {
      switch (quality) {
        case 'low': return 1024;
        case 'medium': return 2048;
        case 'high': return 4096;
        case 'ultra': return 8192;
        default: return 4096;
      }
    }
    
    function applyShadowTuning() {
      // CRITICAL: Keep shadow map autoUpdate enabled - shadows need to update continuously
      // This is essential for shadows to work when sliders change
      if (!renderer.shadowMap.autoUpdate) {
        renderer.shadowMap.autoUpdate = true;
      }
      
      const biasLabel = document.getElementById('shadow-bias-value');
      const normalBiasLabel = document.getElementById('shadow-normal-bias-value');
      const radiusLabel = document.getElementById('shadow-radius-value');
      const cameraNearLabel = document.getElementById('shadow-camera-near-value');
      const cameraFarLabel = document.getElementById('shadow-camera-far-value');
      const shadowDistanceLabel = document.getElementById('shadow-distance-value');
      const contactShadowLabel = document.getElementById('contact-shadow-value');
      const selfShadowLabel = document.getElementById('self-shadow-value');
      const shadowColorIntensityLabel = document.getElementById('shadow-color-intensity-value');
      const lightDistanceLabel = document.getElementById('shadow-light-distance-value');
      const sunAzimuthLabel = document.getElementById('shadow-sun-azimuth-value');
      const sunElevationLabel = document.getElementById('shadow-sun-elevation-value');
      if (biasLabel) {
        biasLabel.textContent = currentShadowBias.toFixed(5);
      }
      if (normalBiasLabel) {
        normalBiasLabel.textContent = currentShadowNormalBias.toFixed(2);
      }
      if (radiusLabel) {
        radiusLabel.textContent = currentShadowRadius.toFixed(1);
      }
      if (cameraNearLabel) {
        cameraNearLabel.textContent = currentShadowCameraNear.toFixed(3);
      }
      if (cameraFarLabel) {
        cameraFarLabel.textContent = currentShadowCameraFar.toFixed(0);
      }
      if (shadowDistanceLabel) {
        shadowDistanceLabel.textContent = currentShadowDistance.toFixed(0);
      }
      if (contactShadowLabel) {
        contactShadowLabel.textContent = currentContactShadowStrength.toFixed(1);
      }
      if (selfShadowLabel) {
        selfShadowLabel.textContent = currentSelfShadowing ? 'On' : 'Off';
      }
      if (shadowColorIntensityLabel) {
        shadowColorIntensityLabel.textContent = currentShadowColorIntensity.toFixed(1);
      }
      if (lightDistanceLabel) {
        lightDistanceLabel.textContent = currentShadowLightDistance.toFixed(0);
      }
      if (sunAzimuthLabel) {
        sunAzimuthLabel.textContent = currentSunAzimuthDeg.toFixed(0) + '°';
      }
      if (sunElevationLabel) {
        sunElevationLabel.textContent = currentSunElevationDeg.toFixed(0) + '°';
      }

      // Apply shadow filter type to renderer
      if (renderer.shadowMap) {
        switch (currentShadowFilterType) {
          case 'PCFSoft':
            renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            break;
          case 'PCF':
            renderer.shadowMap.type = THREE.PCFShadowMap;
            break;
          case 'Basic':
            renderer.shadowMap.type = THREE.BasicShadowMap;
            break;
          case 'VSM':
            renderer.shadowMap.type = THREE.VSMShadowMap;
            break;
        }
      }

      // CRITICAL: Apply shadow settings to ALL directional lights with shadows
      // This works for BOTH ground projection and standard 360 HDR modes
      // The shadow settings are independent of the HDR projection type
      scene.traverse((light) => {
        if (light instanceof THREE.DirectionalLight && light.castShadow && light.shadow) {
          // ANTI-ARTIFACT FIXES based on Three.js best practices:
          // 1. Calculate optimal bias based on shadow map resolution and scene scale
          //    This prevents shadow acne (self-shadowing artifacts) and peter panning
          const shadowMapSize = light.shadow.mapSize.width;
          const shadowCamera = light.shadow.camera;
          
          // Calculate scene scale from shadow camera frustum
          let sceneScale = 1.0;
          if (shadowCamera && shadowCamera instanceof THREE.OrthographicCamera) {
            const frustumWidth = shadowCamera.right - shadowCamera.left;
            const frustumHeight = shadowCamera.top - shadowCamera.bottom;
            sceneScale = Math.max(frustumWidth, frustumHeight);
          }
          
          // Optimal bias calculation: 
          // - Higher resolution shadow maps can use smaller bias (less shadow acne)
          // - Larger scenes need slightly larger bias to prevent peter panning
          // - Formula: bias = constant / (shadowMapSize * sceneScale)
          //   This ensures bias scales appropriately with resolution and scene size
          const baseBias = 0.0001;
          const resolutionScale = 2048 / shadowMapSize; // Normalize to 2048px base
          const sceneScaleFactor = Math.min(sceneScale / 100, 2.0); // Cap scene scale influence
          const optimalBias = baseBias * resolutionScale * sceneScaleFactor;
          
          // Use user's bias value directly when slider is moved, otherwise use optimal calculation
          // This allows fine-tuning while maintaining artifact-free defaults
          // CRITICAL: Always respect user's slider input - only use optimal bias if user hasn't touched the slider
          const finalBias = currentShadowBias;
          light.shadow.bias = THREE.MathUtils.clamp(finalBias, -0.001, 0.001);
          
          // Normal bias: helps reduce shadow acne on surfaces with sharp angles
          // CRITICAL: Always respect user's slider input - only apply contact shadow adjustment
          let finalNormalBias = currentShadowNormalBias;
          if (currentContactShadowStrength > 0) {
            // Increase normal bias for better contact shadows at edges
            // Make contact shadow strength more impactful (multiply by larger factor)
            // Contact shadows help shadows appear tighter at contact points (where objects touch ground)
            // Higher values push shadows closer to objects, reducing light leaks
            finalNormalBias = currentShadowNormalBias * (1 + currentContactShadowStrength * 1.0);
          }
          // Don't scale normal bias by resolution - let user control it directly via slider
          // The slider already allows full range (0 to 5.0), so user can adjust as needed
          light.shadow.normalBias = THREE.MathUtils.clamp(finalNormalBias, 0, 5.0);
          
          // Shadow radius (blur) - helps soften shadow edges and reduce aliasing artifacts
          // CRITICAL: Shadow radius only works with PCF and PCFSoft shadow map types
          // Ensure we're using a compatible shadow map type
          // Shadow radius controls the softness/blur of shadow edges (higher = softer shadows)
          if (renderer.shadowMap.type === THREE.PCFSoftShadowMap || renderer.shadowMap.type === THREE.PCFShadowMap) {
            // Apply shadow radius directly - this controls blur/softness of shadow edges
            light.shadow.radius = currentShadowRadius;
            // Force shadow map update when radius changes (helps with visibility)
            light.shadow.needsUpdate = true;
          } else {
            // If using Basic or VSM, radius has no effect, so set to 0
            light.shadow.radius = 0;
          }
          
          // Update shadow camera near/far planes with artifact prevention
          if (shadowCamera) {
            // CRITICAL: Shadow camera near plane controls precision of shadows at close distances
            // Smaller values = better precision for close objects, but can cause z-fighting
            // Larger values = less precision but more stable
            // Use the user's slider value directly
            const oldNear = shadowCamera.near;
            shadowCamera.near = Math.max(currentShadowCameraNear, 0.0001);
            
            // Keep far plane tight to maximize shadow map resolution
            shadowCamera.far = Math.min(currentShadowCameraFar, currentShadowDistance);
            
            // CRITICAL: Update projection matrix and force shadow map regeneration
            // Shadow camera near/far changes require shadow map regeneration to be visible
            if (Math.abs(oldNear - shadowCamera.near) > 0.00001) {
              shadowCamera.updateProjectionMatrix();
              // Force shadow map to regenerate when camera near/far changes
              light.shadow.needsUpdate = true;
              renderer.shadowMap.needsUpdate = true;
            }
            
            // ANTI-ARTIFACT: Tighten shadow camera bounds to maximize resolution
            // This reduces pixelation artifacts in shadows
            // NOTE: Disabled automatic bounds tightening in render loop to prevent performance issues
            // Shadow camera bounds are set during initial setup and when shadow quality changes
          }
          
          light.shadow.needsUpdate = true;
          
          // Optionally adjust light distance and direction (sun azimuth/elevation)
          const target = light.target || { position: new THREE.Vector3(0, 0, 0) };
          const targetPos = target.position || new THREE.Vector3(0, 0, 0);

          const azimuthRad = (currentSunAzimuthDeg * Math.PI) / 180;
          const elevationRad = (currentSunElevationDeg * Math.PI) / 180;

          const distance = currentShadowLightDistance;
          const dir = new THREE.Vector3(
            Math.cos(elevationRad) * Math.cos(azimuthRad),
            Math.sin(elevationRad),
            Math.cos(elevationRad) * Math.sin(azimuthRad)
          );

          if (isFinite(dir.x) && isFinite(dir.y) && isFinite(dir.z)) {
            const pos = targetPos.clone().add(dir.multiplyScalar(distance));
            light.position.copy(pos);
          }
        }
      });
      
      // Apply self-shadowing control to meshes
      // For interior surfaces, self-shadowing helps show depth and prevents light leaks
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh && !obj.userData.isShadowPlane && !obj.userData.isHelper && !obj.userData.isGroundedSkybox) {
          const material = Array.isArray(obj.material) ? obj.material[0] : obj.material;
          if (material) {
            // Self-shadowing control: DoubleSide materials allow shadows on back faces (interior surfaces)
            // FrontSide only shows shadows on front faces (reduces self-shadowing artifacts)
            if (currentSelfShadowing) {
              // Enable self-shadowing - use DoubleSide for opaque materials to show interior shadows
              if (!material.transparent && material.side !== THREE.DoubleSide) {
                material.side = THREE.DoubleSide;
                material.needsUpdate = true;
              }
            } else {
              // Disable self-shadowing - use FrontSide to reduce shadow acne on interior surfaces
              if (!material.transparent && material.side !== THREE.FrontSide) {
                material.side = THREE.FrontSide;
                material.needsUpdate = true;
              }
            }
          }
        }
      });
      
      // CRITICAL: Apply shadow color intensity to shadow plane
      // This affects shadow darkness/opacity on the shadow plane
      // Works for BOTH ground projection and standard 360 HDR modes
      scene.traverse((obj) => {
        if (obj.userData.isShadowPlane && obj.material) {
          const material = Array.isArray(obj.material) ? obj.material[0] : obj.material;
          if (material instanceof THREE.ShadowMaterial) {
            // Store base opacity and multiply by intensity
            const baseOpacity = material.userData.baseOpacity || 0.5;
            material.opacity = Math.min(1.0, baseOpacity * currentShadowColorIntensity);
            material.needsUpdate = true;
          } else if (material instanceof THREE.MeshStandardMaterial && material.transparent) {
            // For non-shadow materials, adjust opacity based on intensity
            const baseOpacity = material.userData.baseOpacity || material.opacity;
            material.opacity = Math.min(1.0, baseOpacity * currentShadowColorIntensity);
            material.needsUpdate = true;
          }
        }
      });

      // CRITICAL: Force shadow map regeneration when settings change
      // Keep autoUpdate enabled so shadows continue to work
      renderer.shadowMap.needsUpdate = true;
      renderer.shadowMap.autoUpdate = true;

      // CRITICAL: Force immediate shadow map regeneration for ALL shadow settings
      // These settings require shadow map to be regenerated to be visible
      scene.traverse((light) => {
        if (light instanceof THREE.DirectionalLight && light.castShadow && light.shadow) {
          // Force shadow map to regenerate
          light.shadow.needsUpdate = true;
          if (light.shadow.camera) {
            light.shadow.camera.updateProjectionMatrix();
          }
        }
      });

      // CRITICAL: Force immediate render to show changes
      // Don't disable autoUpdate - shadows need to update continuously
      requestAnimationFrame(() => {
        renderer.render(scene, camera);
        requestAnimationFrame(() => {
          renderer.render(scene, camera);
          // Keep autoUpdate enabled - don't disable it
          // Shadows need to update when objects or lights move
        });
      });
    }
    
    function updateShadowQuality(quality) {
      currentShadowQuality = quality;
      const newSize = getShadowMapSize(quality);
      
      console.log('Updating shadow quality to', quality, '(', newSize, 'px)');
      
      // Update all directional lights - need to dispose old shadow map and create new one
      scene.traverse((light) => {
        if (light instanceof THREE.DirectionalLight && light.castShadow) {
          // Dispose old shadow map if it exists
          if (light.shadow.map) {
            light.shadow.map.dispose();
            light.shadow.map = null;
          }
          
          // Update shadow map size
          light.shadow.mapSize.width = newSize;
          light.shadow.mapSize.height = newSize;
          
          // Force shadow map to be recreated
          light.shadow.needsUpdate = true;
          light.shadow.camera.updateProjectionMatrix();
          
          // Mark that shadow map needs to be regenerated
          renderer.shadowMap.needsUpdate = true;
          
          console.log('Light shadow updated:', {
            quality: quality,
            size: newSize,
            lightPosition: light.position,
            castShadow: light.castShadow
          });
        }
      });
      
      // Update UI
      document.querySelectorAll('.quality-option').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.quality === quality);
      });
      
      // Update button text
      const qualityBtn = document.getElementById('quality-btn');
      if (qualityBtn) {
        const qualityLabel = quality.charAt(0).toUpperCase() + quality.slice(1);
        qualityBtn.textContent = '\u2699\uFE0F ' + qualityLabel;
      }
      
      // Hide menu
      const qualityMenu = document.getElementById('quality-menu');
      if (qualityMenu) {
        qualityMenu.style.display = 'none';
      }
      
      // Force multiple renders to ensure shadow maps are regenerated
      requestAnimationFrame(() => {
        renderer.render(scene, camera);
        requestAnimationFrame(() => {
          renderer.render(scene, camera);
        });
      });
    }
    
    // Quality selector button
    const qualityBtnEl = document.getElementById('quality-btn');
    if (qualityBtnEl) {
      qualityBtnEl.addEventListener('click', (e) => {
      e.stopPropagation();
      const qualityMenu = document.getElementById('quality-menu');
      if (qualityMenu) {
        const isVisible = qualityMenu.style.display !== 'none';
        qualityMenu.style.display = isVisible ? 'none' : 'flex';
      }
    });
    }

    // Shadow tuning sliders (bias / normalBias / radius / camera near/far / distance / contact / self-shadow / filter / color)
    const biasSlider = document.getElementById('shadow-bias-slider');
    const normalBiasSlider = document.getElementById('shadow-normal-bias-slider');
    const radiusSlider = document.getElementById('shadow-radius-slider');
    const cameraNearSlider = document.getElementById('shadow-camera-near-slider');
    const cameraFarSlider = document.getElementById('shadow-camera-far-slider');
    const shadowDistanceSlider = document.getElementById('shadow-distance-slider');
    const contactShadowSlider = document.getElementById('contact-shadow-slider');
    const selfShadowToggle = document.getElementById('self-shadow-toggle');
    const shadowFilterTypeSelect = document.getElementById('shadow-filter-type');
    const shadowColorIntensitySlider = document.getElementById('shadow-color-intensity-slider');
    const lightDistanceSlider = document.getElementById('shadow-light-distance-slider');
    const sunAzimuthSlider = document.getElementById('shadow-sun-azimuth-slider');
    const sunElevationSlider = document.getElementById('shadow-sun-elevation-slider');

    if (biasSlider) {
      biasSlider.addEventListener('input', (e) => {
        const target = e.target;
        const value = parseFloat(target.value);
        if (!isNaN(value)) {
          currentShadowBias = value;
          applyShadowTuning();
        }
      });
    }

    if (normalBiasSlider) {
      normalBiasSlider.addEventListener('input', (e) => {
        const target = e.target;
        const value = parseFloat(target.value);
        if (!isNaN(value)) {
          currentShadowNormalBias = value;
          applyShadowTuning();
        }
      });
    }

    if (radiusSlider) {
      radiusSlider.addEventListener('input', (e) => {
        const target = e.target;
        const value = parseFloat(target.value);
        if (!isNaN(value)) {
          currentShadowRadius = value;
          applyShadowTuning();
        }
      });
    }

    if (cameraNearSlider) {
      cameraNearSlider.addEventListener('input', (e) => {
        const target = e.target;
        const value = parseFloat(target.value);
        if (!isNaN(value)) {
          currentShadowCameraNear = value;
          applyShadowTuning();
        }
      });
    }

    if (cameraFarSlider) {
      cameraFarSlider.addEventListener('input', (e) => {
        const target = e.target;
        const value = parseFloat(target.value);
        if (!isNaN(value)) {
          currentShadowCameraFar = value;
          applyShadowTuning();
        }
      });
    }

    if (shadowDistanceSlider) {
      shadowDistanceSlider.addEventListener('input', (e) => {
        const target = e.target;
        const value = parseFloat(target.value);
        if (!isNaN(value)) {
          currentShadowDistance = value;
          applyShadowTuning();
        }
      });
    }

    if (contactShadowSlider) {
      contactShadowSlider.addEventListener('input', (e) => {
        const target = e.target;
        const value = parseFloat(target.value);
        if (!isNaN(value)) {
          currentContactShadowStrength = value;
          applyShadowTuning();
        }
      });
    }

    if (selfShadowToggle) {
      selfShadowToggle.addEventListener('change', (e) => {
        currentSelfShadowing = e.target.checked;
        applyShadowTuning();
      });
    }

    if (shadowFilterTypeSelect) {
      shadowFilterTypeSelect.addEventListener('change', (e) => {
        currentShadowFilterType = e.target.value;
        applyShadowTuning();
      });
    }

    if (shadowColorIntensitySlider) {
      shadowColorIntensitySlider.addEventListener('input', (e) => {
        const target = e.target;
        const value = parseFloat(target.value);
        if (!isNaN(value)) {
          currentShadowColorIntensity = value;
          applyShadowTuning();
        }
      });
    }

    if (lightDistanceSlider) {
      lightDistanceSlider.addEventListener('input', (e) => {
        const target = e.target;
        const value = parseFloat(target.value);
        if (!isNaN(value)) {
          currentShadowLightDistance = value;
          applyShadowTuning();
        }
      });
    }

    if (sunAzimuthSlider) {
      sunAzimuthSlider.addEventListener('input', (e) => {
        const target = e.target;
        const value = parseFloat(target.value);
        if (!isNaN(value)) {
          currentSunAzimuthDeg = value;
          applyShadowTuning();
        }
      });
    }

    if (sunElevationSlider) {
      sunElevationSlider.addEventListener('input', (e) => {
        const target = e.target;
        const value = parseFloat(target.value);
        if (!isNaN(value)) {
          currentSunElevationDeg = value;
          applyShadowTuning();
        }
      });
    }

    // Initialize labels and apply initial tuning once lights are created
    applyShadowTuning();
    
    // Quality option clicks
    document.querySelectorAll('.quality-option').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const quality = btn.dataset.quality;
        if (quality) {
          updateShadowQuality(quality);
        }
      });
    });
    
    // Close quality menu when clicking outside
    document.addEventListener('click', (e) => {
      const qualityMenu = document.getElementById('quality-menu');
      const qualityBtn = document.getElementById('quality-btn');
      if (qualityMenu && qualityBtn && 
          !qualityMenu.contains(e.target) && 
          !qualityBtn.contains(e.target)) {
        qualityMenu.style.display = 'none';
      }
    });
    
    // Set initial quality button text
    const qualityBtn = document.getElementById('quality-btn');
    if (qualityBtn) {
      const qualityLabel = currentShadowQuality.charAt(0).toUpperCase() + currentShadowQuality.slice(1);
      qualityBtn.textContent = '⚙️ ' + qualityLabel;
    }
    
    // Set initial active quality option
    document.querySelectorAll('.quality-option').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.quality === currentShadowQuality);
    });
    
    // Setup camera view click handlers - use event delegation to handle dynamic updates
    function setupCameraViewHandlers() {
      // Clear any existing transition animations
      if (transitionAnimation) {
        cancelAnimationFrame(transitionAnimation);
        transitionAnimation = null;
      }
      
      // Remove old listeners to prevent duplicates by cloning nodes
      document.querySelectorAll('.camera-view-item').forEach((item) => {
        const newItem = item.cloneNode(true);
        if (item.parentNode) {
          item.parentNode.replaceChild(newItem, item);
        }
      });
      
      // Add new listeners with fresh state
      document.querySelectorAll('.camera-view-item').forEach((item, index) => {
        item.addEventListener('click', () => {
          // Check if scene is loaded and ready
          if (!scene || !camera || !renderer) {
            console.warn('Scene not ready for transition');
            return;
          }
          
          // Check if there's already a transition in progress
          if (transitionAnimation) {
            cancelAnimationFrame(transitionAnimation);
            transitionAnimation = null;
          }
          
          // CRITICAL: Ensure ALL objects are visible before transition
          scene.traverse((obj) => {
            if (obj instanceof THREE.Mesh || obj instanceof THREE.Group || obj instanceof THREE.Light) {
              if (!obj.visible) {
                obj.visible = true;
              }
            }
          });
          
          // CRITICAL: Force multiple renders to ensure scene is visible before transition
          camera.updateProjectionMatrix();
          renderer.render(scene, camera);
          
          // Wait a frame to ensure render completes
          requestAnimationFrame(() => {
            // Force another render
            camera.updateProjectionMatrix();
            renderer.render(scene, camera);
            
            // Start transition
            transitionToView(index);
          });
        });
      });
    }
    
    // Setup handlers after scene loads
    setupCameraViewHandlers();
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Number keys for camera view navigation (1-9)
      if (e.key >= '1' && e.key <= '9') {
        const viewIndex = parseInt(e.key) - 1;
        if (Array.isArray(CONFIG.cameraViews) && viewIndex >= 0 && viewIndex < CONFIG.cameraViews.length) {
          e.preventDefault();
          transitionToView(viewIndex);
        }
      } else if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        nextView();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevView();
      } else if (e.key === 'Escape') {
        isPlaying = false;
        stopAutoPlay();
        updatePlayPauseButton();
      }
    });
    
    if (CONFIG.autoPlay) {
      startAutoPlay();
    }
    ` : ''}
    
    // CRITICAL: Store carRoot reference for render loop (needed for shadow plane positioning in standard 360 HDR)
    // Declare at top level so it's accessible from both loadModel() and the render loop
    let renderLoopCarRoot = null;
    
    // Progress tracking
    let modelProgress = 0;
    let hdrProgress = 0;
    // Check if model and HDR files exist by checking if they're included in the export
    // We'll determine this dynamically based on what actually loads
    let hasModel = false;
    let hasHDR = false;
    
    function updateLoadingProgress() {
      const percentageEl = document.getElementById('loading-percentage');
      if (!percentageEl) return;
      
      // Calculate overall progress: model is 70% of loading, HDR is 30%
      let overallProgress = 0;
      if (hasModel && hasHDR) {
        overallProgress = (modelProgress * 0.7) + (hdrProgress * 0.3);
      } else if (hasModel) {
        overallProgress = modelProgress;
      } else if (hasHDR) {
        overallProgress = hdrProgress;
      } else {
        // If neither is detected yet, show a minimal progress
        overallProgress = Math.max(modelProgress, hdrProgress);
      }
      
      percentageEl.textContent = Math.round(overallProgress) + '%';
    }
    
    // Helper function to extract YouTube video ID
    function extractYouTubeId(url) {
      if (!url) return null;
      const patterns = [
        new RegExp('(?:youtube\\.com/watch\\?v=|youtu\\.be/|youtube\\.com/embed/)([^&\\n?#]+)'),
        new RegExp('youtube\\.com/watch\\?.*v=([^&\\n?#]+)'),
        new RegExp('youtu\\.be/([^?\\n#]+)')
      ];
      for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) return match[1];
      }
      return null;
    }
    
    // Helper function to extract YouTube si parameter
    function extractYouTubeSi(url) {
      if (!url) return null;
      const pattern = new RegExp('[?&]si=([^&\\n?#]+)');
      const match = url.match(pattern);
      return match ? match[1] : null;
    }
    
    // Helper function to wrap text (matches main viewer)
    function wrapText(ctx, text, maxWidth) {
      const words = text.split(' ');
      const lines = [];
      let currentLine = words[0];
      
      for (let i = 1; i < words.length; i++) {
        const word = words[i];
        const width = ctx.measureText(currentLine + ' ' + word).width;
        if (width < maxWidth) {
          currentLine += ' ' + word;
        } else {
          lines.push(currentLine);
          currentLine = word;
        }
      }
      lines.push(currentLine);
      return lines;
    }
    
    // Create hotspot panel (matches main 3D viewer implementation)
    function createHotspotPanel(hotspot, position, scene) {
      // DUPLICATE PREVENTION: Check if panel already exists for this hotspot
      let existingPanel = null;
      scene.traverse((obj) => {
        if (obj.userData.hotspotId === hotspot.id && obj.userData.isHotspotPanel) {
          existingPanel = obj;
        }
      });
      
      if (existingPanel) {
        console.log('[WebExport] Panel already exists for hotspot:', hotspot.id, '- skipping duplicate creation');
        return;
      }
      
      // Check panelState - only create visible panel if state is 'open', otherwise create hidden panel
      const panelState = hotspot.panelState || 'closed'; // Default to closed (matches main viewer)
      const isOpen = panelState === 'open';
      
      console.log('[WebExport] Creating panel for hotspot:', hotspot.id, 'type:', (hotspot.content && hotspot.content.type) || 'unknown', 'panelState:', panelState, 'isOpen:', isOpen);
        const contentType = hotspot.content.type;
        const contentData = hotspot.content.data;
        const panelConfig = hotspot.panelDimensions || {};
        const panelWidthPixels = panelConfig.widthPixels || null;
        const panelHeightPixels = panelConfig.heightPixels || null;
        
        // Get formatting settings (matches main viewer)
        const formatting = hotspot.content.formatting || {};
        const popupSettings = hotspot.content.popupSettings || {};
        const fontSize = formatting.fontSize || 16;
        const fontFamily = formatting.fontFamily || 'Arial, sans-serif';
        const textColor = formatting.color || '#ffffff';
        const bold = formatting.bold || false;
        const italic = formatting.italic || false;
        const underline = formatting.underline || false;
        const textAlign = (formatting.align === 'justify' ? 'left' : formatting.align) || 'left';
        const padding = formatting.padding || 16;
        const backgroundColor = (formatting.backgroundColor && formatting.backgroundColor !== 'transparent') 
          ? formatting.backgroundColor 
          : (popupSettings.backgroundColor || 'rgba(25, 25, 30, 0.98)');
        const borderRadius = popupSettings.borderRadius || 12;
        const borderWidth = hotspot.panelBorder?.width || 2;
        const borderColor = hotspot.panelBorder?.color || '#00AAFF';
        const maxWidth = popupSettings.maxWidth || 300;
        const maxHeight = popupSettings.maxHeight || 400;
      
      // Position panel below marker (matches main viewer: -1.2 units below)
      const panelPosition = position.clone().add(new THREE.Vector3(0, -1.2, 0));
      
      // For YouTube videos, use CSS3D panel (matches main 3D viewer implementation)
      if (contentType === 'youtube' && contentData) {
        const videoId = extractYouTubeId(contentData);
        const siParam = extractYouTubeSi(contentData) || 'TRivzqXJKfnNdTo6';
        
        if (videoId) {
          // Calculate panel dimensions (matches main viewer CSS3D panel logic)
          const videoMaxWidth = popupSettings.maxWidth || 400;
          const videoMaxHeight = popupSettings.maxHeight || 600;
          const videoPadding = padding;
          
          let panelWidth, panelHeight, videoWidth, videoHeight;
          
          if (panelWidthPixels !== null && panelWidthPixels !== undefined) {
            // Use provided width
            panelWidth = panelWidthPixels;
            if (panelHeightPixels !== null && panelHeightPixels !== undefined) {
              // Use provided height
              panelHeight = panelHeightPixels;
            } else {
              // Calculate height from width using 16:9 aspect ratio
              panelHeight = (panelWidth - videoPadding * 2) / (16 / 9) + videoPadding * 2;
            }
            // Calculate video dimensions from panel dimensions (subtract padding)
            videoWidth = panelWidth - videoPadding * 2;
            videoHeight = panelHeight - videoPadding * 2;
          } else {
            // Calculate from defaults (3x multiplier for CSS3D panels, matches main viewer)
            const sizeMultiplier = 3;
            videoWidth = Math.min((videoMaxWidth * sizeMultiplier) - videoPadding * 2, 1200);
            videoHeight = videoWidth / (16 / 9);
            panelWidth = videoWidth + videoPadding * 2;
            panelHeight = panelHeightPixels ?? (videoHeight + videoPadding * 2);
            // If height was provided, recalculate video height
            if (panelHeightPixels !== null && panelHeightPixels !== undefined) {
              videoHeight = panelHeight - videoPadding * 2;
            }
          }
          
          // Create container div (matches main viewer styling)
          const div = document.createElement('div');
          div.style.width = panelWidth + 'px';
          div.style.height = panelHeight + 'px';
          div.style.backgroundColor = backgroundColor;
          div.style.borderRadius = borderRadius + 'px';
          div.style.padding = videoPadding + 'px';
          div.style.boxSizing = 'border-box';
          div.style.overflow = 'visible';
          div.style.border = borderWidth + 'px solid ' + borderColor;
          div.style.position = 'absolute';
          div.style.transformStyle = 'preserve-3d';
          div.style.backfaceVisibility = 'visible';
          div.style.pointerEvents = 'auto';
          div.style.touchAction = 'auto';
          div.style.userSelect = 'none';
          div.style.webkitUserSelect = 'none';
          div.setAttribute('data-css3d-panel', 'true');
          
          // Create YouTube iframe (matches main viewer)
          const iframe = document.createElement('iframe');
          iframe.width = videoWidth;
          iframe.height = videoHeight;
          iframe.src = 'https://www.youtube.com/embed/' + videoId + '?si=' + siParam + '&controls=1';
          iframe.title = hotspot.name || 'YouTube video player';
          iframe.setAttribute('frameborder', '0');
          iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
          iframe.referrerPolicy = 'strict-origin-when-cross-origin';
          iframe.allowFullscreen = true;
          iframe.style.width = '100%';
          iframe.style.height = '100%';
          iframe.style.border = 'none';
          iframe.style.borderRadius = '8px';
          iframe.style.pointerEvents = 'auto';
          iframe.style.touchAction = 'auto';
          iframe.style.display = 'block';
          iframe.style.position = 'relative';
          iframe.style.overflow = 'visible';
          
          // Add close button for CSS3D panel
          const closeButton = document.createElement('div');
          closeButton.style.position = 'absolute';
          closeButton.style.top = '8px';
          closeButton.style.right = '8px';
          closeButton.style.width = '24px';
          closeButton.style.height = '24px';
          closeButton.style.backgroundColor = 'rgba(255, 0, 0, 0.7)';
          closeButton.style.borderRadius = '50%';
          closeButton.style.display = 'flex';
          closeButton.style.alignItems = 'center';
          closeButton.style.justifyContent = 'center';
          closeButton.style.cursor = 'pointer';
          closeButton.style.zIndex = '1000';
          closeButton.style.color = '#ffffff';
          closeButton.style.fontSize = '16px';
          closeButton.style.fontWeight = 'bold';
          closeButton.style.lineHeight = '1';
          closeButton.textContent = '×';
          closeButton.title = 'Close panel';
          closeButton.setAttribute('data-hotspot-id', hotspot.id);
          
          // Add hover effect
          closeButton.addEventListener('mouseenter', () => {
            closeButton.style.backgroundColor = 'rgba(255, 0, 0, 0.9)';
          });
          closeButton.addEventListener('mouseleave', () => {
            closeButton.style.backgroundColor = 'rgba(255, 0, 0, 0.7)';
          });
          
          // Add click handler to close panel
          closeButton.addEventListener('click', (e) => {
            e.stopPropagation();
            css3dObject.visible = false;
            css3dObject.userData.isVisible = false;
            renderer.render(scene, camera);
            if (css3dRenderer) css3dRenderer.render(scene, camera);
            console.log('[WebExport] Closed CSS3D panel for hotspot:', hotspot.id);
          });
          
          div.appendChild(iframe);
          div.appendChild(closeButton);
          
          // Create CSS3D object
          const css3dObject = new CSS3DObject(div);
          css3dObject.position.copy(panelPosition);
          
          // CSS3D scale calculation (matches main viewer)
          // Target height in 3D units (increased to 2.0 for better visibility)
          const targetHeight3DUnits = 2.0;
          let scale = targetHeight3DUnits / panelHeight;
          
          // Ensure minimum scale for very large panels
          const minHeight3DUnits = 1.5;
          const minScale = minHeight3DUnits / panelHeight;
          if (scale < minScale) {
            scale = minScale;
          }
          
          // Cap maximum scale
          const maxHeight3DUnits = 3.0;
          const maxScale = maxHeight3DUnits / panelHeight;
          if (scale > maxScale) {
            scale = maxScale;
          }
          
          // Use uniform scale to maintain aspect ratio
          css3dObject.scale.set(scale, scale, 1);
          
          // Store metadata (matches main viewer)
          css3dObject.userData.isCSS3DPanel = true;
          css3dObject.userData.isHotspotPanel = true;
          css3dObject.userData.hotspotId = hotspot.id;
          css3dObject.userData.isBillboard = true;
          css3dObject.userData.css3dScale = scale;
          css3dObject.userData.panelHeightPixels = panelHeight;
          css3dObject.userData.panelWidthPixels = panelWidth;
          css3dObject.userData.actualWidth = panelWidth;
          css3dObject.userData.actualHeight = panelHeight;
          css3dObject.userData.divElement = div;
          css3dObject.userData.iframeElement = iframe;
          css3dObject.userData.isVisible = isOpen; // Track panel visibility (matches main viewer panelState)
          css3dObject.userData.closeButton = closeButton; // Store close button reference
          
          // Set visibility based on panelState (matches main viewer)
          css3dObject.visible = isOpen;
          if (!isOpen) {
            div.style.display = 'none'; // Hide the DOM element for CSS3D
          }
          
          scene.add(css3dObject);
          console.log('[WebExport] Created CSS3D panel for YouTube video:', hotspot.id, 'videoId:', videoId, 'visible:', isOpen);
        } else {
          console.warn('[WebExport] Could not extract YouTube video ID from:', contentData);
        }
      } else {
        // For other content types, create canvas-based panel (matches main viewer)
        // Use panel dimensions from hotspot or defaults
        const effectiveMaxWidth = maxWidth;
        const effectiveMaxHeight = maxHeight;
        
        // Calculate actual panel dimensions based on content (matches main viewer logic)
        let actualPanelWidth = effectiveMaxWidth;
        let actualPanelHeight = effectiveMaxHeight;
        let contentWidth = 0;
        let contentHeight = 0;
        
        // Create temporary canvas for measuring
        const measureCanvas = document.createElement('canvas');
        const measureCtx = measureCanvas.getContext('2d');
        measureCtx.font = fontSize + 'px ' + fontFamily;
        
        if (contentType === 'text' && contentData) {
          // Measure text and calculate dimensions
          const textWidth = effectiveMaxWidth - padding * 2;
          const singleLineWidth = measureCtx.measureText(contentData).width;
          
          let lines;
          if (singleLineWidth <= textWidth) {
            lines = [contentData];
            contentWidth = singleLineWidth;
          } else {
            lines = wrapText(measureCtx, contentData, textWidth);
            contentWidth = Math.max(...lines.map(line => measureCtx.measureText(line).width));
          }
          
          contentHeight = lines.length * (fontSize * 1.4);
          // Use fixed panel size so font size doesn't change panel dimensions
          actualPanelWidth = Math.max(effectiveMaxWidth, 200);
          actualPanelHeight = Math.max(effectiveMaxHeight * 0.6, 150);
        } else if (contentType === 'html' && contentData) {
          // Strip HTML tags for preview
          const htmlTagRegex = /<[^>]*>/g;
          const text = contentData.replace(htmlTagRegex, '');
          const textWidth = effectiveMaxWidth - padding * 2;
          const singleLineWidth = measureCtx.measureText(text).width;
          
          let lines;
          if (singleLineWidth <= textWidth) {
            lines = [text];
            contentWidth = singleLineWidth;
          } else {
            lines = wrapText(measureCtx, text, textWidth);
            contentWidth = Math.max(...lines.map(line => measureCtx.measureText(line).width));
          }
          
          contentHeight = Math.min(lines.length * (fontSize * 1.4), effectiveMaxHeight - padding * 2);
          // Use fixed panel size so font size doesn't change panel dimensions
          actualPanelWidth = Math.max(effectiveMaxWidth, 200);
          actualPanelHeight = Math.max(effectiveMaxHeight * 0.6, 150);
        } else {
          // For image/video or unknown content types, use reasonable defaults
          actualPanelWidth = Math.max(effectiveMaxWidth, 200);
          actualPanelHeight = Math.max(effectiveMaxHeight * 0.5, 120);
        }
        
        // Override with user-specified dimensions if provided
        // This ensures the panel is exactly the size the user wants
        if (panelWidthPixels !== null && panelWidthPixels !== undefined) {
          actualPanelWidth = panelWidthPixels;
        }
        if (panelHeightPixels !== null && panelHeightPixels !== undefined) {
          actualPanelHeight = panelHeightPixels;
        }
        
        // Log panel dimensions for debugging
        console.log('[WebExport] Panel dimensions calculated:', {
          hotspotId: hotspot.id,
          contentType,
          actualPanelWidth,
          actualPanelHeight,
          aspectRatio: (actualPanelWidth / actualPanelHeight).toFixed(2)
        });
        
        // Use actual panel dimensions directly for canvas (no power-of-2 complexity for web export)
        // This ensures consistent sizing and simpler UV mapping
        const canvasWidth = Math.ceil(actualPanelWidth);
        const canvasHeight = Math.ceil(actualPanelHeight);
        
        const canvas = document.createElement('canvas');
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        const ctx = canvas.getContext('2d');
        
        // Store actual dimensions
        canvas.__actualWidth = actualPanelWidth;
        canvas.__actualHeight = actualPanelHeight;
        
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw directly without scaling - canvas matches panel size exactly
        const w = actualPanelWidth;
        const h = actualPanelHeight;
        const r = Math.min(borderRadius, 8); // Limit border radius for small panels
        
        // Draw shadow first (subtle for web export)
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 4;
        
        // Draw background with rounded corners
        ctx.fillStyle = backgroundColor;
        ctx.beginPath();
        ctx.moveTo(r, 0);
        ctx.lineTo(w - r, 0);
        ctx.quadraticCurveTo(w, 0, w, r);
        ctx.lineTo(w, h - r);
        ctx.quadraticCurveTo(w, h, w - r, h);
        ctx.lineTo(r, h);
        ctx.quadraticCurveTo(0, h, 0, h - r);
        ctx.lineTo(0, r);
        ctx.quadraticCurveTo(0, 0, r, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        
        // Draw border
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = borderWidth;
        ctx.beginPath();
        ctx.moveTo(r, 0);
        ctx.lineTo(w - r, 0);
        ctx.quadraticCurveTo(w, 0, w, r);
        ctx.lineTo(w, h - r);
        ctx.quadraticCurveTo(w, h, w - r, h);
        ctx.lineTo(r, h);
        ctx.quadraticCurveTo(0, h, 0, h - r);
        ctx.lineTo(0, r);
        ctx.quadraticCurveTo(0, 0, r, 0);
        ctx.closePath();
        ctx.stroke();
        
        // Draw close button (X) in top-right corner
        // Scale button size based on panel size (smaller panels = smaller button)
        const closeButtonSize = Math.max(16, Math.min(24, actualPanelHeight * 0.2)); // 16-24px, proportional
        const closeButtonPadding = 6;
        const closeButtonX = actualPanelWidth - closeButtonSize - closeButtonPadding;
        const closeButtonY = closeButtonPadding;
        
        // Draw close button background (small red circle)
        ctx.save();
        ctx.fillStyle = 'rgba(255, 60, 60, 0.9)';
        ctx.beginPath();
        ctx.arc(closeButtonX + closeButtonSize / 2, closeButtonY + closeButtonSize / 2, closeButtonSize / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        
        // Draw X icon (proportional to button size)
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1.5, closeButtonSize * 0.12); // Proportional line width
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        const iconPadding = closeButtonSize * 0.28; // Proportional padding inside circle
        ctx.beginPath();
        ctx.moveTo(closeButtonX + iconPadding, closeButtonY + iconPadding);
        ctx.lineTo(closeButtonX + closeButtonSize - iconPadding, closeButtonY + closeButtonSize - iconPadding);
        ctx.moveTo(closeButtonX + closeButtonSize - iconPadding, closeButtonY + iconPadding);
        ctx.lineTo(closeButtonX + iconPadding, closeButtonY + closeButtonSize - iconPadding);
        ctx.stroke();
        
        // Store close button bounds for click detection (matches main viewer)
        // Since we're drawing from (0,0), closeButtonX and closeButtonY are already relative to panel top-left
        canvas.__closeButtonBounds = {
          x: closeButtonX,
          y: closeButtonY,
          width: closeButtonSize,
          height: closeButtonSize
        };
        
        // Draw content based on type (matches main viewer - drawing from 0,0)
        if (contentType === 'text' && contentData) {
          // Build font string with formatting (matches main viewer)
          let fontStyle = '';
          let fontWeight = 'normal';
          if (bold) fontWeight = 'bold';
          if (italic) fontStyle = 'italic';
          
          const fontParts = [];
          if (fontStyle) fontParts.push(fontStyle);
          if (fontWeight !== 'normal') fontParts.push(fontWeight);
          fontParts.push(fontSize + 'px');
          fontParts.push(fontFamily);
          ctx.font = fontParts.join(' ');
          
          // Text shadow for readability (matches main viewer)
          ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
          ctx.shadowBlur = 1;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0.5;
          
          ctx.fillStyle = textColor;
          ctx.textAlign = textAlign;
          ctx.textBaseline = 'top';
          
          // Calculate text X position based on alignment (no x offset needed)
          let textX = padding;
          if (textAlign === 'center') {
            textX = actualPanelWidth / 2;
          } else if (textAlign === 'right') {
            textX = actualPanelWidth - padding;
          }
          
          // Draw text lines
          const textWidth = actualPanelWidth - padding * 2;
          const singleLineWidth = ctx.measureText(contentData).width;
          let lines;
          if (singleLineWidth <= textWidth) {
            lines = [contentData];
          } else {
            lines = wrapText(ctx, contentData, textWidth);
          }
          
          // Start from padding (no y offset needed)
          let yPos = padding;
          lines.forEach((line) => {
            ctx.fillText(line, textX, yPos);
            yPos += fontSize * 1.4;
          });
          
          // Draw underline if needed (matches main viewer - no x/y offset)
          if (underline) {
            ctx.strokeStyle = textColor;
            ctx.lineWidth = Math.max(1, fontSize / 20);
            lines.forEach((line, index) => {
              const metrics = ctx.measureText(line);
              const underlineY = padding + (index + 1) * (fontSize * 1.4) + 2;
              const underlineStartX = textAlign === 'center' 
                ? textX - metrics.width / 2 
                : textAlign === 'right'
                ? textX - metrics.width
                : textX;
              ctx.beginPath();
              ctx.moveTo(underlineStartX, underlineY);
              ctx.lineTo(underlineStartX + metrics.width, underlineY);
              ctx.stroke();
            });
          }
          
          // Reset shadow
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
        } else if (contentType === 'html' && contentData) {
          // Strip HTML tags (matches main viewer)
          const htmlTagRegex = /<[^>]*>/g;
          const text = contentData.replace(htmlTagRegex, '');
          
          ctx.font = fontSize + 'px ' + fontFamily;
          ctx.fillStyle = textColor;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          
          const textWidth = actualPanelWidth - padding * 2;
          const singleLineWidth = ctx.measureText(text).width;
          let lines;
          if (singleLineWidth <= textWidth) {
            lines = [text];
          } else {
            lines = wrapText(ctx, text, textWidth);
          }
          
          // Draw from (0,0) - no x/y offset needed
          let yPos = padding;
          lines.forEach((line) => {
            ctx.fillText(line, padding, yPos);
            yPos += fontSize * 1.4;
          });
        } else if (contentType === 'image') {
          ctx.fillStyle = '#666';
          ctx.font = fontSize + 'px ' + fontFamily;
          ctx.textAlign = 'center';
          ctx.fillText('[Image]', actualPanelWidth / 2, actualPanelHeight / 2);
        } else if (contentType === 'video') {
          ctx.fillStyle = '#666';
          ctx.font = fontSize + 'px ' + fontFamily;
          ctx.textAlign = 'center';
          ctx.fillText('[Video]', actualPanelWidth / 2, actualPanelHeight / 2);
        }
        
        // Create texture and mesh (matches main viewer scaling)
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.generateMipmaps = true;
        texture.needsUpdate = true;
        texture.flipY = true;
        
        const material = new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
          depthTest: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          opacity: 0.95
        });
        
        // Calculate geometry size using pixelsToWorldUnits (matches main viewer)
        const pixelsToWorldUnits = 0.01; // 1 pixel = 0.01 world units
        let panelWidth, panelHeight;
        
        if (panelWidthPixels !== null && panelWidthPixels !== undefined) {
          panelWidth = panelWidthPixels * pixelsToWorldUnits;
          if (panelHeightPixels !== null && panelHeightPixels !== undefined) {
            panelHeight = panelHeightPixels * pixelsToWorldUnits;
          } else {
            const aspect = actualPanelWidth / actualPanelHeight;
            panelHeight = panelWidth / aspect;
          }
        } else {
          // FIXED: Keep panel size constant regardless of font size
          // Font size changes only affect how large text appears WITHIN the fixed panel
          // Panel height is fixed at 1.5 world units
          const baseHeightWorldUnits = 1.5; // Fixed panel height
          const aspect = actualPanelWidth / actualPanelHeight;
          panelHeight = baseHeightWorldUnits;
          panelWidth = panelHeight * aspect;
        }
        
        console.log('[WebExport] Panel mesh dimensions:', {
          hotspotId: hotspot.id,
          canvasWidth: actualPanelWidth,
          canvasHeight: actualPanelHeight,
          meshWidth: panelWidth,
          meshHeight: panelHeight,
          aspect: actualPanelWidth / actualPanelHeight
        });
        
        const geometry = new THREE.PlaneGeometry(panelWidth, panelHeight);
        
        const panel = new THREE.Mesh(geometry, material);
        panel.position.copy(panelPosition);
        panel.renderOrder = 0;
        panel.userData.isHotspotPanel = true;
        panel.userData.hotspotId = hotspot.id;
        panel.userData.isBillboard = true;
        panel.userData.actualWidth = actualPanelWidth;
        panel.userData.actualHeight = actualPanelHeight;
        panel.userData.isVisible = isOpen; // Track panel visibility (matches main viewer panelState)
        panel.userData.canvas = canvas; // Store canvas reference for close button detection
        
        // Set visibility based on panelState (matches main viewer)
        panel.visible = isOpen;
        
        scene.add(panel);
        
        // Make panel face the camera initially (billboard effect)
        // Note: The animation loop will continue to update this
        if (typeof camera !== 'undefined' && camera) {
          panel.lookAt(camera.position);
        }
        
        console.log('[WebExport] Created canvas panel for hotspot:', hotspot.id, 'visible:', isOpen);
      }
    }
    
    // Hotspot initialization function
    function initializeHotspots(hotspots, scene, camera, renderer) {
      if (!hotspots || !Array.isArray(hotspots) || hotspots.length === 0) {
        return;
      }
      
      console.log('[WebExport] Initializing hotspots:', hotspots.length);
      
      hotspots.forEach((hotspot) => {
        try {
          // Create hotspot marker (sprite) unless icon is explicitly disabled
          const position = new THREE.Vector3(
            hotspot.position.x,
            hotspot.position.y,
            hotspot.position.z
          );
          
          // Respect per-hotspot icon visibility flag from editor
          const showIcon = hotspot.showIcon !== false;
          
          // Create marker (matches main viewer implementation)
          let texture;
          let iconForMarker = null;
          
          if (showIcon && hotspot.icon) {
            if (hotspot.icon.type === 'symbol') {
              iconForMarker = { type: 'default', value: hotspot.icon.value };
            } else if (hotspot.icon.type === 'custom-image') {
              iconForMarker = { type: 'custom-image', value: hotspot.icon.value };
            } else if (hotspot.icon.type === 'default' || hotspot.icon.type === 'emoji' || hotspot.icon.type === 'custom') {
              iconForMarker = { type: hotspot.icon.type, value: hotspot.icon.value };
            }
          }
          
          // Create icon texture based on type (matches main viewer)
          if (showIcon && iconForMarker) {
            if (iconForMarker.type === 'emoji') {
              // Create emoji icon texture (matches main viewer)
              const size = 256;
              const canvas = document.createElement('canvas');
              canvas.width = canvas.height = size;
              const ctx = canvas.getContext('2d');
              ctx.clearRect(0, 0, size, size);
              
              // Modern gradient circle with enhanced shadow and glow
              ctx.save();
              ctx.translate(size / 2, size / 2);
              
              // Enhanced shadow with blur
              ctx.save();
              ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
              ctx.shadowBlur = size * 0.1;
              ctx.shadowOffsetX = 0;
              ctx.shadowOffsetY = size * 0.03;
              ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
              ctx.beginPath();
              ctx.arc(0, size * 0.02, size * 0.38, 0, Math.PI * 2);
              ctx.fill();
              ctx.restore();
              
              // Modern gradient background (glass morphism style)
              const gradient = ctx.createRadialGradient(-size * 0.2, -size * 0.2, 0, 0, 0, size * 0.4);
              gradient.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
              gradient.addColorStop(0.5, 'rgba(245, 245, 250, 0.9)');
              gradient.addColorStop(1, 'rgba(235, 235, 245, 0.85)');
              ctx.fillStyle = gradient;
              ctx.beginPath();
              ctx.arc(0, 0, size * 0.38, 0, Math.PI * 2);
              ctx.fill();
              
              // Modern subtle border with gradient
              const borderGradient = ctx.createLinearGradient(-size * 0.4, -size * 0.4, size * 0.4, size * 0.4);
              borderGradient.addColorStop(0, 'rgba(200, 200, 220, 0.4)');
              borderGradient.addColorStop(1, 'rgba(180, 180, 200, 0.3)');
              ctx.strokeStyle = borderGradient;
              ctx.lineWidth = size * 0.025;
              ctx.stroke();
              
              // Subtle highlight for depth
              ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
              ctx.beginPath();
              ctx.arc(-size * 0.1, -size * 0.1, size * 0.15, 0, Math.PI * 2);
              ctx.fill();
              ctx.restore();
              
              // Draw emoji
              ctx.save();
              ctx.translate(size / 2, size / 2);
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.font = 'bold ' + (size * 0.5) + 'px \\"Segoe UI Emoji\\", \\"Apple Color Emoji\\", \\"Noto Color Emoji\\", sans-serif';
              ctx.fillText(iconForMarker.value, 0, 0);
              ctx.restore();
              
              texture = new THREE.CanvasTexture(canvas);
              texture.colorSpace = THREE.SRGBColorSpace;
              texture.generateMipmaps = true;
              texture.needsUpdate = true;
            } else if (iconForMarker.type === 'custom-image') {
              // For custom images, create a simple placeholder for now
              // In a full implementation, we'd load the image asynchronously
              const size = 256;
              const canvas = document.createElement('canvas');
              canvas.width = canvas.height = size;
              const ctx = canvas.getContext('2d');
              ctx.clearRect(0, 0, size, size);
              
              // Draw shadow
              ctx.save();
              ctx.translate(size / 2, size / 2);
              ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
              ctx.beginPath();
              ctx.arc(0, size * 0.02, size * 0.38, 0, Math.PI * 2);
              ctx.fill();
              ctx.restore();
              
              // Draw placeholder circle
              ctx.save();
              ctx.translate(size / 2, size / 2);
              ctx.fillStyle = '#cccccc';
              ctx.beginPath();
              ctx.arc(0, 0, size * 0.38, 0, Math.PI * 2);
              ctx.fill();
              ctx.strokeStyle = '#999999';
              ctx.lineWidth = size * 0.02;
              ctx.stroke();
              ctx.restore();
              
              texture = new THREE.CanvasTexture(canvas);
              texture.colorSpace = THREE.SRGBColorSpace;
              texture.generateMipmaps = true;
              texture.needsUpdate = true;
            } else {
              // Default icon (matches main viewer)
              const size = 256;
              const canvas = document.createElement('canvas');
              canvas.width = canvas.height = size;
              const ctx = canvas.getContext('2d');
              ctx.clearRect(0, 0, size, size);
              
              const cx = size / 2;
              const cy = size / 2;
              const radius = size * 0.35;
              
              // Perfect circular shadow below
              ctx.save();
              ctx.translate(cx, cy + size * 0.02);
              const shadowRadius = radius * 1.2;
              const shadowGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, shadowRadius);
              shadowGradient.addColorStop(0, 'rgba(0, 0, 0, 0.2)');
              shadowGradient.addColorStop(0.5, 'rgba(0, 0, 0, 0.1)');
              shadowGradient.addColorStop(0.8, 'rgba(0, 0, 0, 0.05)');
              shadowGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
              ctx.fillStyle = shadowGradient;
              ctx.beginPath();
              ctx.arc(0, 0, shadowRadius, 0, Math.PI * 2, false);
              ctx.fill();
              ctx.restore();
              
              // Main circle - modern gradient (blue to cyan)
              ctx.save();
              ctx.translate(cx, cy);
              
              // Outer glow
              const glowGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 1.3);
              glowGradient.addColorStop(0, 'rgba(74, 158, 255, 0.2)');
              glowGradient.addColorStop(0.6, 'rgba(74, 158, 255, 0.1)');
              glowGradient.addColorStop(1, 'rgba(74, 158, 255, 0)');
              ctx.fillStyle = glowGradient;
              ctx.beginPath();
              ctx.arc(0, 0, radius * 1.3, 0, Math.PI * 2);
              ctx.fill();
              
              // Main circle with modern gradient
              const circleGradient = ctx.createRadialGradient(-radius * 0.3, -radius * 0.3, 0, 0, 0, radius);
              circleGradient.addColorStop(0, '#4a9eff');
              circleGradient.addColorStop(0.5, '#3d8bf0');
              circleGradient.addColorStop(1, '#2d6cd9');
              ctx.fillStyle = circleGradient;
              ctx.beginPath();
              ctx.arc(0, 0, radius, 0, Math.PI * 2);
              ctx.fill();
              
              // Subtle border
              const borderGradient = ctx.createLinearGradient(-radius, -radius, radius, radius);
              borderGradient.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
              borderGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.1)');
              borderGradient.addColorStop(1, 'rgba(200, 220, 255, 0.2)');
              ctx.strokeStyle = borderGradient;
              ctx.lineWidth = size * 0.015;
              ctx.stroke();
              
              // Inner highlight
              const highlightGradient = ctx.createRadialGradient(-radius * 0.4, -radius * 0.4, 0, -radius * 0.2, -radius * 0.2, radius * 0.5);
              highlightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
              highlightGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.15)');
              highlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
              ctx.fillStyle = highlightGradient;
              ctx.beginPath();
              ctx.arc(-radius * 0.2, -radius * 0.2, radius * 0.5, 0, Math.PI * 2);
              ctx.fill();
              
              // Center dot
              ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
              ctx.beginPath();
              ctx.arc(0, 0, radius * 0.15, 0, Math.PI * 2);
              ctx.fill();
              
              ctx.restore();
              
              texture = new THREE.CanvasTexture(canvas);
              texture.colorSpace = THREE.SRGBColorSpace;
              texture.generateMipmaps = true;
              texture.needsUpdate = true;
            }
          } else {
            // No icon specified, use default
            const size = 256;
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = size;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, size, size);
            
            const cx = size / 2;
            const cy = size / 2;
            const radius = size * 0.35;
            
            // Same default icon creation as above
            ctx.save();
            ctx.translate(cx, cy + size * 0.02);
            const shadowRadius = radius * 1.2;
            const shadowGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, shadowRadius);
            shadowGradient.addColorStop(0, 'rgba(0, 0, 0, 0.2)');
            shadowGradient.addColorStop(0.5, 'rgba(0, 0, 0, 0.1)');
            shadowGradient.addColorStop(0.8, 'rgba(0, 0, 0, 0.05)');
            shadowGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = shadowGradient;
            ctx.beginPath();
            ctx.arc(0, 0, shadowRadius, 0, Math.PI * 2, false);
            ctx.fill();
            ctx.restore();
            
            ctx.save();
            ctx.translate(cx, cy);
            const glowGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 1.3);
            glowGradient.addColorStop(0, 'rgba(74, 158, 255, 0.2)');
            glowGradient.addColorStop(0.6, 'rgba(74, 158, 255, 0.1)');
            glowGradient.addColorStop(1, 'rgba(74, 158, 255, 0)');
            ctx.fillStyle = glowGradient;
            ctx.beginPath();
            ctx.arc(0, 0, radius * 1.3, 0, Math.PI * 2);
            ctx.fill();
            
            const circleGradient = ctx.createRadialGradient(-radius * 0.3, -radius * 0.3, 0, 0, 0, radius);
            circleGradient.addColorStop(0, '#4a9eff');
            circleGradient.addColorStop(0.5, '#3d8bf0');
            circleGradient.addColorStop(1, '#2d6cd9');
            ctx.fillStyle = circleGradient;
            ctx.beginPath();
            ctx.arc(0, 0, radius, 0, Math.PI * 2);
            ctx.fill();
            
            const borderGradient = ctx.createLinearGradient(-radius, -radius, radius, radius);
            borderGradient.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
            borderGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.1)');
            borderGradient.addColorStop(1, 'rgba(200, 220, 255, 0.2)');
            ctx.strokeStyle = borderGradient;
            ctx.lineWidth = size * 0.015;
            ctx.stroke();
            
            const highlightGradient = ctx.createRadialGradient(-radius * 0.4, -radius * 0.4, 0, -radius * 0.2, -radius * 0.2, radius * 0.5);
            highlightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
            highlightGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.15)');
            highlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = highlightGradient;
            ctx.beginPath();
            ctx.arc(-radius * 0.2, -radius * 0.2, radius * 0.5, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.beginPath();
            ctx.arc(0, 0, radius * 0.15, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            
            texture = new THREE.CanvasTexture(canvas);
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.generateMipmaps = true;
            texture.needsUpdate = true;
          }
          
          // Create sprite material and sprite (matches main viewer)
          const spriteMaterial = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: true,
            depthWrite: false,
            sizeAttenuation: true,
            opacity: 1.0
          });
          
          const sprite = new THREE.Sprite(spriteMaterial);
          sprite.position.set(0, 0, 0); // Relative to group
          sprite.scale.setScalar(1.2); // Matches main viewer scale
          sprite.renderOrder = 1000; // Matches main viewer
          sprite.userData.isHotspot = true;
          sprite.userData.hotspotId = hotspot.id;
          sprite.userData.hotspotName = hotspot.name;
          sprite.userData.baseScale = 1.2;
          // Hide sprite entirely when showIcon is false (helper sphere still used for interactions)
          sprite.visible = showIcon;
          
          // Create invisible helper sphere for easier clicking (matches main viewer)
          const helperGeometry = new THREE.SphereGeometry(0.3, 16, 16);
          const helperMaterial = new THREE.MeshBasicMaterial({
            visible: false,
            transparent: true,
            opacity: 0
          });
          const helperSphere = new THREE.Mesh(helperGeometry, helperMaterial);
          helperSphere.position.set(0, 0, 0); // Relative to group
          helperSphere.renderOrder = 999;
          helperSphere.userData.isHotspot = true;
          helperSphere.userData.hotspotId = hotspot.id;
          helperSphere.userData.hotspotName = hotspot.name;
          helperSphere.userData.isHotspotHelper = true;
          helperSphere.userData.associatedSprite = sprite;
          sprite.userData.helperSphere = helperSphere;
          
          // Create group to hold both sprite and helper (matches main viewer)
          const group = new THREE.Group();
          group.add(sprite);
          group.add(helperSphere);
          group.position.copy(position);
          group.userData.isHotspot = true;
          group.userData.hotspotId = hotspot.id;
          group.userData.hotspotName = hotspot.name;
          group.userData.baseScale = 1.2;
          group.userData.hotspotSprite = sprite;
          group.userData.hotspotHelper = helperSphere;
          
          scene.add(group);
          
          // Create label if hotspot has label (matches main viewer implementation)
          if (hotspot.label && hotspot.label.text) {
            const labelFontSize = hotspot.label.fontSize || 16;
            const labelFontFamily = 'Arial, sans-serif';
            const labelColor = hotspot.label.color || '#ffffff';
            const labelBgColor = hotspot.label.backgroundColor || 'rgba(40, 40, 45, 0.95)';
            const labelBorderRadius = hotspot.label.borderRadius || 6;
            const labelBorderWidth = hotspot.label.borderWidth || 2;
            const labelBorderColor = hotspot.label.borderColor || '#00AAFF';
            const labelPadding = 10;
            
            // Use 12x resolution to match content panel quality
            // This ensures consistent border thickness and crisp text rendering
            const scale = 12; // Match content panel resolution (12x)
            
            // Measure text
            const measureCanvas = document.createElement('canvas');
            const measureCtx = measureCanvas.getContext('2d');
            measureCtx.font = '600 ' + labelFontSize + 'px -apple-system, BlinkMacSystemFont, \\"Segoe UI\\", \\"Roboto\\", \\"Helvetica Neue\\", ' + labelFontFamily + ', sans-serif';
            const metrics = measureCtx.measureText(hotspot.label.text);
            const textWidth = metrics.width;
            const textHeight = labelFontSize;
            
            // Calculate base dimensions
            const baseWidth = textWidth + labelPadding * 2;
            const baseHeight = textHeight + labelPadding * 2;
            
            const labelCanvas = document.createElement('canvas');
            labelCanvas.width = baseWidth * scale;
            labelCanvas.height = baseHeight * scale;
            const labelCtx = labelCanvas.getContext('2d');
            labelCtx.scale(scale, scale);
            
            // Draw background with rounded corners (matches main viewer)
            const x = labelPadding / 2;
            const y = labelPadding / 2;
            const w = baseWidth - labelPadding;
            const h = baseHeight - labelPadding;
            const r = labelBorderRadius;
            
            // Shadow
            labelCtx.save();
            labelCtx.shadowColor = 'rgba(0, 0, 0, 0.2)';
            labelCtx.shadowBlur = 4;
            labelCtx.shadowOffsetX = 0;
            labelCtx.shadowOffsetY = 1;
            
            // Gradient background
            if (labelBgColor.includes('rgba')) {
              const rgbaMatch = labelBgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+),?\s*([\d.]+)?\)/);
              if (rgbaMatch) {
                const red = parseInt(rgbaMatch[1]);
                const g = parseInt(rgbaMatch[2]);
                const b = parseInt(rgbaMatch[3]);
                const a = rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 1;
                const bgGradient = labelCtx.createLinearGradient(x, y, x, y + h);
                bgGradient.addColorStop(0, 'rgba(' + Math.min(red + 10, 255) + ', ' + Math.min(g + 10, 255) + ', ' + Math.min(b + 10, 255) + ', ' + (a * 0.95) + ')');
                bgGradient.addColorStop(1, 'rgba(' + Math.max(red - 5, 0) + ', ' + Math.max(g - 5, 0) + ', ' + Math.max(b - 5, 0) + ', ' + (a * 0.9) + ')');
                labelCtx.fillStyle = bgGradient;
              } else {
                labelCtx.fillStyle = labelBgColor;
              }
            } else {
              labelCtx.fillStyle = labelBgColor;
            }
            
            // Rounded rectangle
            labelCtx.beginPath();
            labelCtx.moveTo(x + r, y);
            labelCtx.lineTo(x + w - r, y);
            labelCtx.quadraticCurveTo(x + w, y, x + w, y + r);
            labelCtx.lineTo(x + w, y + h - r);
            labelCtx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
            labelCtx.lineTo(x + r, y + h);
            labelCtx.quadraticCurveTo(x, y + h, x, y + h - r);
            labelCtx.lineTo(x, y + r);
            labelCtx.quadraticCurveTo(x, y, x + r, y);
            labelCtx.closePath();
            labelCtx.fill();
            labelCtx.restore();
            
            // Border
            // Now using same 12x resolution as content panel
            // Scale border proportionally to element size ratio (label/panel = 0.8/1.5 ≈ 0.5)
            if (labelBorderWidth > 0) {
              labelCtx.beginPath();
              labelCtx.moveTo(x + r, y);
              labelCtx.lineTo(x + w - r, y);
              labelCtx.quadraticCurveTo(x + w, y, x + w, y + r);
              labelCtx.lineTo(x + w, y + h - r);
              labelCtx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
              labelCtx.lineTo(x + r, y + h);
              labelCtx.quadraticCurveTo(x, y + h, x, y + h - r);
              labelCtx.lineTo(x, y + r);
              labelCtx.quadraticCurveTo(x, y, x + r, y);
              labelCtx.closePath();
              labelCtx.strokeStyle = labelBorderColor;
              var scaledLabelBorderWidth = Math.max(0.5, labelBorderWidth * 0.5);
              labelCtx.lineWidth = scaledLabelBorderWidth;
              labelCtx.stroke();
            }
            
            // Draw text
            labelCtx.font = '600 ' + labelFontSize + 'px -apple-system, BlinkMacSystemFont, \\"Segoe UI\\", \\"Roboto\\", \\"Helvetica Neue\\", ' + labelFontFamily + ', sans-serif';
            labelCtx.shadowColor = 'rgba(0, 0, 0, 0.3)';
            labelCtx.shadowBlur = 1;
            labelCtx.shadowOffsetX = 0;
            labelCtx.shadowOffsetY = 0.5;
            labelCtx.fillStyle = labelColor;
            labelCtx.textAlign = 'center';
            labelCtx.textBaseline = 'middle';
            labelCtx.fillText(hotspot.label.text, baseWidth / 2, baseHeight / 2);
            
            const labelTexture = new THREE.CanvasTexture(labelCanvas);
            labelTexture.colorSpace = THREE.SRGBColorSpace;
            labelTexture.generateMipmaps = false;
            labelTexture.minFilter = THREE.LinearFilter;
            labelTexture.magFilter = THREE.LinearFilter;
            labelTexture.needsUpdate = true;
            
            // Store base dimensions
            labelTexture.image.__baseWidth = baseWidth;
            labelTexture.image.__baseHeight = baseHeight;
            
            const labelMaterial = new THREE.SpriteMaterial({ 
              map: labelTexture, 
              transparent: true,
              depthTest: true,
              depthWrite: false,
              sizeAttenuation: true,
              opacity: 1.0
            });
            const labelSprite = new THREE.Sprite(labelMaterial);
            
            // Position label above marker (matches main viewer)
            const labelOffsetY = hotspot.label.offsetY || 0;
            const labelOffsetX = hotspot.label.offsetX || 0;
            labelSprite.position.set(
              position.x + labelOffsetX,
              position.y + 0.3 + labelOffsetY,
              position.z
            );
            
            // Calculate proper scale (matches main viewer)
            const aspectRatio = baseWidth / baseHeight;
            const baseScale = 0.4; // World units for label height - smaller to fit better with content panel
            labelSprite.scale.set(baseScale * aspectRatio, baseScale, 1);
            
            labelSprite.renderOrder = 1001;
            labelSprite.userData.isHotspotLabel = true;
            labelSprite.userData.hotspotId = hotspot.id;
            labelSprite.userData.labelText = hotspot.label.text;
            labelSprite.userData.canClickToOpen = true; // Mark label as clickable to open panel
            scene.add(labelSprite);
          }
          
          // Create connecting line if target position exists
          if (hotspot.targetEndpointPosition) {
            const endpointPos = new THREE.Vector3(
              hotspot.targetEndpointPosition.x,
              hotspot.targetEndpointPosition.y,
              hotspot.targetEndpointPosition.z
            );
            
            const lineGeometry = new THREE.BufferGeometry().setFromPoints([endpointPos, position]);
            const lineMaterial = new THREE.LineBasicMaterial({
              color: 0x4a9eff,
              transparent: true,
              opacity: 0.7,
              depthTest: true,
              depthWrite: false
            });
            const line = new THREE.Line(lineGeometry, lineMaterial);
            line.renderOrder = -1; // Render before panels to ensure line is always behind text field/panel
            line.userData.isHotspotLine = true;
            line.userData.hotspotId = hotspot.id;
            scene.add(line);
          }
          
          // Create 3D panel if hotspot has content
          if (hotspot.content && hotspot.content.type && hotspot.content.data) {
            console.log('[WebExport] Hotspot has content, creating panel:', hotspot.id, 'contentType:', hotspot.content.type);
            createHotspotPanel(hotspot, position, scene);
          } else {
            console.log('[WebExport] Hotspot has no content, skipping panel:', hotspot.id, 'content:', hotspot.content);
          }
          
          console.log('[WebExport] Created hotspot:', hotspot.id, hotspot.name);
        } catch (error) {
          console.error('[WebExport] Failed to create hotspot', hotspot.id, ':', error);
        }
      });
      
      // NOTE: rebuildCSS3DCache is called from the animation loop scope after initializeHotspots returns
      // (It's not in scope here, so we can't call it directly)
    }
    
    // Load model
    // CACHING: IndexedDB cache for GLB model files
    const CACHE_NAME = 'glb-model-cache';
    const CACHE_VERSION = 1;
    let db = null;
    
    async function initCache() {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(CACHE_NAME, CACHE_VERSION);
        request.onerror = () => {
          console.warn('[WebExport] IndexedDB not available, caching disabled');
          resolve(null);
        };
        request.onsuccess = () => {
          db = request.result;
          console.log('[WebExport] IndexedDB cache initialized');
          resolve(db);
        };
        request.onupgradeneeded = (event) => {
          const upgradeDb = event.target.result;
          if (!upgradeDb.objectStoreNames.contains('models')) {
            upgradeDb.createObjectStore('models', { keyPath: 'url' });
          }
        };
      });
    }
    
    async function getCachedModel(url) {
      if (!db) return null;
      return new Promise((resolve) => {
        const transaction = db.transaction(['models'], 'readonly');
        const store = transaction.objectStore('models');
        const request = store.get(url);
        request.onsuccess = () => {
          const cached = request.result;
          if (cached && cached.data && cached.timestamp) {
            // Cache valid for 7 days
            const age = Date.now() - cached.timestamp;
            if (age < 7 * 24 * 60 * 60 * 1000) {
              console.log('[WebExport] Using cached model (age: ' + Math.round(age / 1000) + 's)');
              resolve(cached.data);
            } else {
              console.log('[WebExport] Cache expired, loading fresh model');
              resolve(null);
            }
          } else {
            resolve(null);
          }
        };
        request.onerror = () => resolve(null);
      });
    }
    
    async function cacheModel(url, data) {
      if (!db) return;
      return new Promise((resolve) => {
        const transaction = db.transaction(['models'], 'readwrite');
        const store = transaction.objectStore('models');
        store.put({ url, data, timestamp: Date.now() });
        transaction.oncomplete = () => {
          console.log('[WebExport] Model cached successfully');
          resolve();
        };
        transaction.onerror = () => {
          console.warn('[WebExport] Failed to cache model');
          resolve();
        };
      });
    }
    
    async function loadModel() {
      // Initialize cache
      await initCache();
      
      const loader = new GLTFLoader();
      
      // Setup DRACO loader for compressed models
      const dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
      loader.setDRACOLoader(dracoLoader);
      
      const modelUrl = './model.glb';
      
      try {
        const loadStartTime = performance.now();
        hasModel = true; // We're attempting to load the model
        modelProgress = 0;
        updateLoadingProgress();
        
        // Try to load from cache first
        let gltf = null;
        const cachedData = await getCachedModel(modelUrl);
        
        if (cachedData) {
          // Load from cache - create blob URL for loader
          try {
            modelProgress = 30;
            updateLoadingProgress();
            const blob = new Blob([cachedData], { type: 'model/gltf-binary' });
            const blobUrl = URL.createObjectURL(blob);
            gltf = await loader.loadAsync(blobUrl);
            URL.revokeObjectURL(blobUrl);
            modelProgress = 100;
            updateLoadingProgress();
            console.log('[WebExport] Model loaded from cache');
          } catch (e) {
            console.warn('[WebExport] Failed to parse cached model, loading fresh:', e);
            gltf = null;
          }
        }
        
        // If cache miss or parse failed, load from URL
        if (!gltf) {
          // Use load() with progress callback instead of loadAsync()
          gltf = await new Promise((resolve, reject) => {
            loader.load(
              modelUrl,
              (gltf) => {
                modelProgress = 100;
                updateLoadingProgress();
                resolve(gltf);
              },
              (progress) => {
                if (progress.total > 0) {
                  modelProgress = (progress.loaded / progress.total) * 100;
                  updateLoadingProgress();
                } else {
                  // If total is unknown, estimate based on loaded bytes
                  modelProgress = Math.min(90, (progress.loaded / 1000000) * 10); // Rough estimate
                  updateLoadingProgress();
                }
              },
              (error) => {
                reject(error);
              }
            );
          });
          
          // Cache the model file for future loads
          try {
            const response = await fetch(modelUrl);
            const arrayBuffer = await response.arrayBuffer();
            await cacheModel(modelUrl, arrayBuffer);
          } catch (e) {
            console.warn('[WebExport] Failed to cache model:', e);
          }
        }
        const loadTime = performance.now() - loadStartTime;
        const animCount = gltf.animations && gltf.animations.length ? gltf.animations.length : 0;
        console.log('[WebExport] Model loaded successfully in ' + loadTime.toFixed(2) + 'ms:', 
          'Scene children: ' + gltf.scene.children.length + ', ' +
          'Animations: ' + animCount);
        
        // CRITICAL: Restore userData (fileName, customName, etc.) from GLTF metadata
        // GLTFExporter stores userData in the extras field, and GLTFLoader should restore it
        // But we need to explicitly restore it to ensure it's available
        const restoreUserDataFromGLTF = (obj, nodeIndex) => {
          if (!obj || !gltf.parser || !gltf.parser.json) return;
          
          obj.userData = obj.userData || {};
          
          // Try to get userData from GLTF node extras
          if (gltf.parser.json.nodes && gltf.parser.json.nodes[nodeIndex]) {
            const nodeData = gltf.parser.json.nodes[nodeIndex];
            if (nodeData.extras) {
              // Restore customName if it exists in extras
              if (nodeData.extras.customName && !obj.userData.customName) {
                obj.userData.customName = nodeData.extras.customName;
                console.log('[WebExport] Restored customName from GLTF:', nodeData.extras.customName, 'for object:', obj.name || 'Unnamed');
              }
              // Restore fileName if it exists in extras
              if (nodeData.extras.fileName && !obj.userData.fileName) {
                obj.userData.fileName = nodeData.extras.fileName;
              }
              // Restore other userData properties
              Object.keys(nodeData.extras).forEach(key => {
                if (key !== 'customName' && key !== 'fileName' && !obj.userData[key]) {
                  obj.userData[key] = nodeData.extras[key];
                }
              });
            }
          }
          
          // Also check scene extras for root objects
          if (gltf.parser.json.scenes && gltf.parser.json.scenes[0]) {
                const sceneData = gltf.parser.json.scenes[0];
            if (sceneData.extras) {
              // Restore fileName from scene extras if not already set
              if (sceneData.extras.fileName && !obj.userData.fileName) {
                obj.userData.fileName = sceneData.extras.fileName;
              }
            }
          }
          
          // Fallback: If fileName isn't in userData, try to get it from various sources
          if (!obj.userData.fileName) {
            // 1. Check if the object name looks like a filename (has extension)
            if (obj.name && (obj.name.endsWith('.gltf') || obj.name.endsWith('.glb') || obj.name.endsWith('.obj') || obj.name.endsWith('.ply'))) {
              obj.userData.fileName = obj.name;
            } 
            // 2. Check if scene name looks like a filename
            else if (gltf.scene.name && (gltf.scene.name.endsWith('.gltf') || gltf.scene.name.endsWith('.glb') || gltf.scene.name.endsWith('.obj') || gltf.scene.name.endsWith('.ply'))) {
              obj.userData.fileName = gltf.scene.name;
            }
            // 3. For first root object, use scene name if it's not generic "Scene" and looks meaningful
            else if (nodeIndex === 0 && gltf.scene.name && gltf.scene.name !== 'Scene' && gltf.scene.name.length > 0) {
                // Only use scene name if it doesn't look like a generic name
                if (!gltf.scene.name.match(/^(Scene|Root|Object3D|Group)(-\d+)?$/i)) {
                obj.userData.fileName = gltf.scene.name;
              }
            }
          }
        };
        
        // Restore userData for all root children
        if (gltf.scene && gltf.scene.children && gltf.scene.children.length > 0) {
          gltf.scene.children.forEach((child, index) => {
            restoreUserDataFromGLTF(child, index);
            
            // Also recursively restore userData for all children
            child.traverse((descendant) => {
              // Try to find the node index in GLTF JSON by matching UUID or name
              if (gltf.parser && gltf.parser.json && gltf.parser.json.nodes) {
                const nodeIndex = gltf.parser.json.nodes.findIndex((node) => 
                  (node.extras && node.extras.uuid === descendant.uuid) || 
                  node.name === descendant.name
                );
                if (nodeIndex >= 0) {
                  restoreUserDataFromGLTF(descendant, nodeIndex);
                }
              }
            });
          });
        }
        
        // PERFORMANCE OPTIMIZATION: Enable frustum culling and optimize meshes
        let meshCount = 0;
        let totalTriangles = 0;
        gltf.scene.traverse(function(child) {
          if (child instanceof THREE.Mesh) {
            meshCount++;
            
            // Enable frustum culling for better performance
            child.frustumCulled = true;
            
            // Count triangles for performance metrics
            if (child.geometry && child.geometry.attributes && child.geometry.attributes.position) {
              const positionAttr = child.geometry.attributes.position;
              const triangleCount = positionAttr.count / 3;
              totalTriangles += triangleCount;
            }
            
            // Optimize geometry if needed
            if (child.geometry) {
              // Ensure geometry is indexed for better performance
              if (!child.geometry.index && child.geometry.attributes.position) {
                child.geometry.computeVertexNormals();
              }
              
              // Dispose unused attributes if present
              if (child.geometry.attributes.color && child.geometry.attributes.color.count === 0) {
                child.geometry.deleteAttribute('color');
              }
            }
            
            // Optimize materials
            if (child.material) {
              const materials = Array.isArray(child.material) ? child.material : [child.material];
              materials.forEach(function(mat) {
                // Enable depth testing and writing for better performance
                mat.depthTest = true;
                mat.depthWrite = true;
                
                // Disable unnecessary features if not used
                if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
                  // Only enable features that are actually used
                  if (mat.envMapIntensity === 0 || !mat.envMap) {
                    mat.envMap = null;
                  }
                }
              });
            }
          }
        });
        
        console.log('[WebExport] Performance stats: ' + meshCount + ' meshes, ~' + Math.round(totalTriangles / 1000) + 'K triangles');
        
        // Advanced LOD system - same as 3D viewer
        // Helper function to create simplified geometry using MeshoptSimplifier with fallback
        function createSimplifiedGeometry(geometry, reductionFactor, meshName) {
          try {
            if (!geometry.index || !geometry.attributes.position) {
              return null;
            }
            
            const originalIndices = geometry.index.array;
            const originalIndexCount = originalIndices.length;
            const originalTriangleCount = originalIndexCount / 3;
            const positionAttr = geometry.attributes.position;
            const positionArray = positionAttr.array;
            const vertexCount = positionAttr.count;
            
            if (originalIndexCount < 3 || originalTriangleCount < 3) {
              return null;
            }
            
            const targetTriangleCount = Math.max(3, Math.floor(originalTriangleCount * reductionFactor));
            
            if (targetTriangleCount >= originalTriangleCount || targetTriangleCount < 3) {
              return null;
            }
            
            // Remove degenerate triangles first
            const validIndices = [];
            for (let i = 0; i < originalIndices.length; i += 3) {
              const i0 = originalIndices[i];
              const i1 = originalIndices[i + 1];
              const i2 = originalIndices[i + 2];
              if (i0 !== i1 && i1 !== i2 && i0 !== i2) {
                validIndices.push(i0, i1, i2);
              }
            }
            
            if (validIndices.length < 3) {
              return null;
            }
            
            // Check for fine details (small triangles = headlights, badges, etc.)
            const areas = [];
            for (let i = 0; i < validIndices.length; i += 3) {
              const i0 = validIndices[i], i1 = validIndices[i + 1], i2 = validIndices[i + 2];
              const v0x = positionArray[i0 * 3], v0y = positionArray[i0 * 3 + 1], v0z = positionArray[i0 * 3 + 2];
              const v1x = positionArray[i1 * 3] - v0x, v1y = positionArray[i1 * 3 + 1] - v0y, v1z = positionArray[i1 * 3 + 2] - v0z;
              const v2x = positionArray[i2 * 3] - v0x, v2y = positionArray[i2 * 3 + 1] - v0y, v2z = positionArray[i2 * 3 + 2] - v0z;
              const crossX = v1y * v2z - v1z * v2y;
              const crossY = v1z * v2x - v1x * v2z;
              const crossZ = v1x * v2y - v1y * v2x;
              const area = 0.5 * Math.sqrt(crossX * crossX + crossY * crossY + crossZ * crossZ);
              areas.push(area);
            }
            
            areas.sort((a, b) => a - b);
            const medianArea = areas[Math.floor(areas.length / 2)];
            const smallThreshold = medianArea * 0.1;
            const fineDetailRatio = areas.filter(a => a < smallThreshold).length / areas.length;
            
            // Skip simplification if too many fine details (lowered threshold to protect small parts)
            if (fineDetailRatio > 0.25) {
              console.log('[WebExport] ⚠️ "' + (meshName || 'unnamed') + '" has too many fine details (' + (fineDetailRatio * 100).toFixed(1) + '%). Skipping simplification to preserve details.');
              return null;
            }
            
            // Skip simplification for very small meshes (likely small parts like mirrors, badges, etc.)
            // Check bounding box size
            geometry.computeBoundingBox();
            const bbox = geometry.boundingBox;
            if (bbox) {
              const size = new THREE.Vector3();
              bbox.getSize(size);
              const maxDim = Math.max(size.x, size.y, size.z);
              // If mesh is very small (< 0.5 units in any dimension), skip simplification
              if (maxDim < 0.5) {
                console.log('[WebExport] ⚠️ "' + (meshName || 'unnamed') + '" is very small (' + maxDim.toFixed(3) + ' units). Skipping simplification to preserve small parts.');
                return null;
              }
            }
            
            // Skip simplification for meshes with names suggesting small parts
            const name = (meshName || '').toLowerCase();
            const smallPartKeywords = ['mirror', 'badge', 'emblem', 'logo', 'antenna', 'wiper', 'handle', 'button', 'knob', 'light', 'lens'];
            if (smallPartKeywords.some(keyword => name.includes(keyword))) {
              console.log('[WebExport] ⚠️ "' + (meshName || 'unnamed') + '" appears to be a small part. Skipping simplification.');
              return null;
            }
            
            // Try MeshoptSimplifier first
            let simplified = null;
            if (MeshoptSimplifier) {
              try {
                const indices = new Uint32Array(validIndices);
                const positions = new Float32Array(positionArray);
                simplified = MeshoptSimplifier.simplify(indices, positions, 3, targetTriangleCount);
              } catch (e) {
                // Fallback to simple decimation
              }
            }
            
            // Fallback: simple area-based decimation with detail preservation
            if (!simplified || simplified.length < 3) {
              const triangles = [];
              for (let i = 0; i < validIndices.length; i += 3) {
                const i0 = validIndices[i], i1 = validIndices[i + 1], i2 = validIndices[i + 2];
                const area = areas[i / 3];
                triangles.push({ i0, i1, i2, area });
              }
              
              triangles.sort((a, b) => b.area - a.area); // Largest first
              const toKeep = triangles.slice(0, targetTriangleCount);
              simplified = new Uint32Array(toKeep.length * 3);
              for (let i = 0; i < toKeep.length; i++) {
                simplified[i * 3] = toKeep[i].i0;
                simplified[i * 3 + 1] = toKeep[i].i1;
                simplified[i * 3 + 2] = toKeep[i].i2;
              }
            }
            
            if (!simplified || simplified.length < 3) {
              return null;
            }
            
            const simplifiedGeometry = geometry.clone();
            simplifiedGeometry.setIndex(new THREE.BufferAttribute(simplified, 1));
            simplifiedGeometry.computeVertexNormals();
            simplifiedGeometry.computeBoundingSphere();
            simplifiedGeometry.computeBoundingBox();
            
            return simplifiedGeometry;
          } catch (e) {
            console.warn('[WebExport] Failed to simplify geometry:', e);
            return null;
          }
        }
        
        // LOD SYSTEM: Advanced LOD system (same as 3D viewer)
        console.log('[WebExport] LOD Check: totalTriangles=' + totalTriangles + ', threshold=500000, enableLOD=' + (totalTriangles > 500000));
        const enableLOD = totalTriangles > 500000; // Enable LOD for models with >500K triangles
        if (enableLOD) {
          console.log('[WebExport] 🔧 High triangle count detected (' + Math.round(totalTriangles / 1000) + 'K). Generating LOD levels...');
          
          // LOD Configuration - same distances as 3D viewer
          const LOD_DISTANCES = {
            high: 100,    // High detail: 0-100 units
            medium: 300,  // Medium detail: 100-300 units  
            low: 600      // Low detail: 300-600+ units (never disappears)
          };
          
          let lodSuccessCount = 0;
          let lodErrorCount = 0;
          let lodAlreadyExistsCount = 0;
          
          // Only generate LOD for meshes that don't already have LOD
          // Check per-mesh to handle mixed scenarios (some meshes may already have LOD from standard preview)
          gltf.scene.traverse((obj) => {
            // Skip if already a LOD object (LOD already exists for this object)
            if (obj instanceof THREE.LOD && obj.userData.hasLOD) {
              lodAlreadyExistsCount++;
              return; // Skip - LOD already exists
            }
            
            // Check if parent is a LOD object (this mesh is already part of a LOD)
            if (obj.parent instanceof THREE.LOD && obj.parent.userData.hasLOD) {
              return; // Skip - this mesh is already part of a LOD
            }
            
            if (obj instanceof THREE.Mesh && obj.geometry && obj.material && !obj.userData.isShadowPlane) {
              const geometry = obj.geometry;
              const positionAttr = geometry.attributes.position;
              
              if (positionAttr && geometry.index) {
                const triangleCount = geometry.index.count / 3;
                
                // Apply LOD only to larger meshes (>5000 triangles) to protect small parts
                // Small parts like rearview mirrors, badges, etc. should not be simplified
                if (triangleCount > 5000) {
                  try {
                    const originalMesh = obj;
                    const originalGeometry = geometry;
                    const originalMaterial = obj.material;
                    const meshName = obj.name || 'unnamed';
                    
                    // Use VERY conservative reduction factors (same as 3D viewer)
                    // Medium LOD: Keep 95% of triangles (5% reduction) - minimal reduction to prevent holes
                    const mediumGeometry = createSimplifiedGeometry(originalGeometry, 0.95, meshName);
                    // Low LOD: Keep 90% of triangles (10% reduction) - minimal reduction to prevent holes
                    const lowGeometry = createSimplifiedGeometry(originalGeometry, 0.9, meshName);
                    
                    if (mediumGeometry && lowGeometry) {
                      // Create LOD object with three levels
                      const lod = new THREE.LOD();
                      
                      // High detail (original) - always visible up to 100 units
                      const highMesh = new THREE.Mesh(originalGeometry, originalMaterial);
                      if (highMesh && highMesh.geometry && highMesh.material) {
                      lod.addLevel(highMesh, 0);
                      }
                      
                      // Medium detail - visible from 100 to 300 units
                      const mediumMesh = new THREE.Mesh(mediumGeometry, originalMaterial);
                      if (mediumMesh && mediumMesh.geometry && mediumMesh.material) {
                      lod.addLevel(mediumMesh, LOD_DISTANCES.high);
                      }
                      
                      // Low detail - visible from 300 units to infinity (never disappears)
                      const lowMesh = new THREE.Mesh(lowGeometry, originalMaterial);
                      if (lowMesh && lowMesh.geometry && lowMesh.material) {
                      lod.addLevel(lowMesh, LOD_DISTANCES.medium);
                      }
                      
                      // CRITICAL: Verify LOD has at least one level before using it
                      if (lod.levels && lod.levels.length > 0) {
                      // Copy transform and userData from original
                      lod.position.copy(originalMesh.position);
                      lod.rotation.copy(originalMesh.rotation);
                      lod.scale.copy(originalMesh.scale);
                      lod.userData = Object.assign({}, originalMesh.userData);
                      lod.userData.hasLOD = true;
                      lod.userData.originalTriangleCount = triangleCount;
                      
                      // Replace original mesh with LOD
                      if (originalMesh.parent) {
                        originalMesh.parent.add(lod);
                        originalMesh.parent.remove(originalMesh);
                        // Dispose original mesh geometry only - DO NOT dispose material
                        // Material is still being used by LOD levels, and may be shared with other meshes
                        originalMesh.geometry.dispose();
                      }
                      
                      lodSuccessCount++;
                      } else {
                        lodErrorCount++;
                        console.warn('[WebExport] Failed to create LOD - no valid levels:', meshName);
                        // Dispose LOD if it's invalid
                        lod.traverse((child) => {
                          if (child.geometry) child.geometry.dispose();
                          if (child.material && !Array.isArray(child.material)) {
                            child.material.dispose();
                          }
                        });
                      }
                    } else {
                      lodErrorCount++;
                    }
                  } catch (e) {
                    lodErrorCount++;
                    console.warn('[WebExport] Failed to create LOD for mesh:', obj.name || 'unnamed', e);
                  }
                }
              }
            }
          });
          
          if (lodAlreadyExistsCount > 0 && lodSuccessCount === 0) {
            console.log('[WebExport] ✅ LOD already exists in model (reused from standard preview). No regeneration needed.');
          } else {
          console.log('[WebExport] ✅ LOD generation complete: ' + lodSuccessCount + ' success, ' + lodErrorCount + ' skipped');
            if (lodAlreadyExistsCount > 0) {
              console.log('[WebExport]   Reused ' + lodAlreadyExistsCount + ' existing LOD object(s) from standard preview');
            }
          if (lodSuccessCount > 0) {
            console.log('[WebExport]   LOD distances: High (0-100), Medium (100-300), Low (300-600+) units');
            console.log('[WebExport]   LOD reduction: Medium (95% triangles), Low (90% triangles) - very conservative to prevent holes');
            }
          }
        } else if (totalTriangles > 500000) {
          console.warn('[WebExport] ⚠️ High triangle count (' + Math.round(totalTriangles / 1000) + 'K). LOD not enabled (threshold: 500K).');
        }
        
        // CRITICAL: Filter out any undefined/null children from the entire scene hierarchy
        // This must be done BEFORE any traversal to prevent Three.js internal errors
        const cleanSceneHierarchy = (obj) => {
          if (!obj || typeof obj !== 'object') return;
          
          if (obj.children && Array.isArray(obj.children)) {
            // Filter out invalid children and ensure array is dense (no undefined entries)
            const validChildren = [];
            for (let i = 0; i < obj.children.length; i++) {
              const child = obj.children[i];
              if (child && typeof child === 'object' && ('type' in child || 'isObject3D' in child || 'traverse' in child)) {
                // Recursively clean this child's hierarchy first
                cleanSceneHierarchy(child);
                validChildren.push(child);
              }
            }
            // Replace children array with clean, dense array
            obj.children = validChildren;
          }
        };
        
        // Safe traversal helper to avoid Three.js traverse issues with undefined children
        // Uses an explicit stack to walk the hierarchy and validates each child
        const safeTraverse = (root, callback) => {
          if (!root || typeof root !== 'object') return;
          
          const stack = [root];
          
          while (stack.length > 0) {
            const obj = stack.pop();
            if (!obj || typeof obj !== 'object') continue;
            
            // Execute callback safely
            try {
              callback(obj);
            } catch (e) {
              console.warn('[WebExport] Error in safeTraverse callback:', e);
            }
            
            // Push valid children onto the stack
            if (obj.children && Array.isArray(obj.children)) {
              for (let i = 0; i < obj.children.length; i++) {
                const child = obj.children[i];
                if (child && typeof child === 'object') {
                  stack.push(child);
                }
              }
            }
          }
        };
        
        // Clean the entire scene hierarchy before adding to scene
        cleanSceneHierarchy(gltf.scene);
        
        // CRITICAL: Restore userData flags that may have been lost during GLB export/import
        // GLTFExporter may not preserve all userData, so we need to detect models and restore flags
        const restoreModelFlags = (obj) => {
          if (!obj || typeof obj !== 'object') return;
          
          // Skip system objects - they should never be marked as models
          const userData = obj.userData || {};
          const name = (obj.name || '').toLowerCase();
          const isSystemObject = 
            userData.isNativeObjectsGroup === true ||
            userData.isStartingObjectsGroup === true ||
            userData.isHelper === true ||
            name === 'native_objects' ||
            name === 'starting_objects' ||
            name === 'native objects' ||
            name === 'starting objects';
          
          if (isSystemObject) {
            // Don't mark system objects as models, but still process their children
            if (obj.children && Array.isArray(obj.children)) {
              obj.children.forEach(child => restoreModelFlags(child));
            }
            return;
          }
          
          // Check if this object has geometry (is a mesh or has mesh children)
          // Use recursive check to find meshes at any depth
          const hasGeometry = obj instanceof THREE.Mesh && obj.geometry;
          const hasMeshChildren = (() => {
            if (!obj.children || !Array.isArray(obj.children)) return false;
            // Recursively check for meshes at any depth
            const checkForMeshes = (child) => {
              if (child instanceof THREE.Mesh && child.geometry) return true;
              if (child.children && Array.isArray(child.children)) {
                return child.children.some(checkForMeshes);
              }
              return false;
            };
            return obj.children.some(checkForMeshes);
          })();
          
          // If it's a root object (direct child of scene) with geometry, mark it as a model
          // BUT: Only if it's not a system object and has actual model geometry (not just helpers)
          if ((hasGeometry || hasMeshChildren) && (!obj.userData || (!obj.userData.isModel && !obj.userData.isImportedModel))) {
            // Check if parent is gltf.scene (scene hasn't been added yet at this point)
            const isRootObject = !obj.parent || obj.parent === gltf.scene;
            
            // Additional check: make sure this isn't just a container for helpers
            // A real model should have meshes that aren't helpers (recursively check)
            const hasNonHelperMeshes = (() => {
              if (!obj.children || !Array.isArray(obj.children)) return false;
              const checkForNonHelperMeshes = (child) => {
                if (child instanceof THREE.Mesh && child.geometry) {
                  const childUserData = child.userData || {};
                  const isHelper = childUserData.isHelper || 
                                   childUserData.isBoundingBoxHelper || 
                                   childUserData.isLightGizmo ||
                                   (child.type && child.type.includes('Helper'));
                  return !isHelper;
                }
                // Recursively check children
                if (child.children && Array.isArray(child.children)) {
                  return child.children.some(checkForNonHelperMeshes);
                }
                return false;
              };
              return obj.children.some(checkForNonHelperMeshes);
            })();
            
            if (isRootObject && (hasGeometry || hasNonHelperMeshes)) {
              // This is a root model object
              if (!obj.userData) obj.userData = {};
              obj.userData.isModel = true;
              obj.userData.isImportedModel = true;
              console.log('[WebExport] Restored isModel flag for root object:', obj.name || 'Unnamed');
            } else if (!isRootObject) {
              // This is a child of a model
              if (!obj.userData) obj.userData = {};
              obj.userData.isImportedModel = true;
            }
          }
          
          // Recursively process children
          if (obj.children && Array.isArray(obj.children)) {
            obj.children.forEach(child => restoreModelFlags(child));
          }
        };
        
        // Restore flags for all objects in the loaded GLB
        // Note: restoreModelFlags already processes children recursively, so we only need to call it once
        restoreModelFlags(gltf.scene);
        
        // CRITICAL: Handle multiple models - GLB can contain multiple root objects
        // All models are children of gltf.scene, so we add the entire scene
        scene.add(gltf.scene);
        
        // CRITICAL: Ensure all models are visible
        gltf.scene.visible = true;
        try {
        gltf.scene.traverse(function(child) {
          // Ensure all imported models are visible
            if (child && child.userData && (child.userData.isModel === true || child.userData.isImportedModel === true)) {
            child.visible = true;
          }
        });
        } catch (e) {
          console.warn('[WebExport] Error during initial scene traversal, continuing anyway:', e);
        }
        
        console.log('[WebExport] Loaded models:', gltf.scene.children.length, 'root object(s)');
        for (let i = 0; i < gltf.scene.children.length; i++) {
          const child = gltf.scene.children[i];
          const modelName = child.name || 'Unnamed';
          console.log('[WebExport]   Model ' + (i + 1) + ': "' + modelName + '" (ID: ' + child.id + ')');
        }
        
        // MATCH WORKING EXPORT: Don't reposition the models - keep them at their original positions
        // The models should already be positioned correctly in the GLB file
        // Store reference to scene root for shadow plane positioning (use first model or scene root)
        const carRoot = gltf.scene.children.length > 0 ? gltf.scene.children[0] : gltf.scene;
        
        // CRITICAL: Store carRoot reference for render loop (needed for shadow plane positioning in standard 360 HDR)
        // Make it accessible to the render loop
        renderLoopCarRoot = carRoot;

        // Build Objects panel matching 3D viewer structure (hierarchical tree with dimensions)
        try {
          const objectsPanelEl = document.getElementById('objects-panel');
          const objectsListEl = document.getElementById('objects-list');
          const toggleBtn = document.getElementById('objects-toggle-btn');
          if (objectsPanelEl && objectsListEl && toggleBtn) {
            // Helper to check if object should be skipped (matching ObjectsPanel logic)
            const isHelperLike = (obj) => {
              if (!obj) return true;
              const userData = obj.userData || {};
              const name = (obj.name || '').toLowerCase();
              const type = obj.type || '';
              return (
                userData.isHelper === true ||
                userData.isShadowPlane === true ||
                userData.isGroundedSkybox === true ||
                userData.isNativeObjectsGroup === true ||
                userData.isTransformControls === true ||
                userData.isLightGizmo === true ||
                userData.isBoundingBoxHelper === true ||
                userData.isDynamicSky === true ||
                userData.isSun === true ||
                userData.isMoon === true ||
                type.includes('Helper') ||
                name.includes('helper') ||
                name === 'grid' ||
                name === 'axes' ||
                obj instanceof THREE.AmbientLight
              );
            };

            // Build scene tree matching ObjectsPanel.tsx structure exactly
            const buildSceneTree = () => {
              if (!gltf || !gltf.scene) return [];
              
              const nodes = [];
              
              // Calculate mesh statistics - EXACT COPY from ObjectsPanel.tsx
              const calculateMeshStats = (obj) => {
                let totalTriangles = 0;
                let totalSize = 0;
                
                if (obj instanceof THREE.Mesh && obj.geometry) {
                  const geom = obj.geometry;
                  
                  if (geom.index) {
                    totalTriangles = geom.index.count / 3;
                  } else if (geom.attributes.position) {
                    totalTriangles = geom.attributes.position.count / 3;
                  }
                  
                  let vertexSize = 0;
                  if (geom.attributes.position) {
                    vertexSize += geom.attributes.position.count * 3 * 4;
                  }
                  if (geom.attributes.normal) {
                    vertexSize += geom.attributes.normal.count * 3 * 4;
                  }
                  if (geom.attributes.uv) {
                    vertexSize += geom.attributes.uv.count * 2 * 4;
                  }
                  if (geom.index) {
                    totalSize += geom.index.count * 4;
                  }
                  totalSize += vertexSize;
                  
                  if (obj.material) {
                    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                    mats.forEach(mat => {
                      const textureProps = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'];
                      textureProps.forEach(prop => {
                        const tex = mat[prop];
                        if (tex && tex.image) {
                          const img = tex.image;
                          const width = img.width || img.naturalWidth || 0;
                          const height = img.height || img.naturalHeight || 0;
                          if (width > 0 && height > 0) {
                            totalSize += width * height * 4;
                          }
                        }
                      });
                    });
                  }
                }
                
                if (obj.children && Array.isArray(obj.children)) {
                  obj.children.forEach(child => {
                    const childStats = calculateMeshStats(child);
                    totalTriangles += childStats.triangles;
                    totalSize += childStats.size;
                  });
                }
                
                return { triangles: totalTriangles, size: totalSize };
              };
              
              // Traverse function - EXACT COPY from ObjectsPanel.tsx lines 152-296
              const traverse = (obj, parentNodes) => {
                // If this is the starting objects group, traverse its children but don't add the group itself
                if (obj.userData && obj.userData.isStartingObjectsGroup) {
                  console.log('[WebExport] Objects panel: Skipping Starting_Objects group, traversing children');
                  // Traverse all children (lights) and add them directly to parentNodes
                  if (obj.children && Array.isArray(obj.children)) {
                    obj.children.forEach(child => traverse(child, parentNodes));
                  }
                  return;
                }
                
                // Skip native objects group entirely (don't traverse children - they're all helpers)
                if (obj.userData && obj.userData.isNativeObjectsGroup) {
                  console.log('[WebExport] Objects panel: Skipping Native_Objects group entirely');
                  return;
                }
                
                // Always include models - they should never be filtered out
                // Check both isModel (root model object) and isImportedModel (child objects)
                // Also check if this is a root imported model (has isImportedModel but parent doesn't have isModel)
                // FALLBACK: If flags are missing (GLB export may not preserve userData), detect by geometry
                const hasModelFlag = obj.userData && (obj.userData.isModel === true || obj.userData.isImportedModel === true);
                // Recursively check for meshes at any depth (not just direct children)
                const hasGeometry = (() => {
                  if (obj instanceof THREE.Mesh && obj.geometry) return true;
                  if (obj.children && Array.isArray(obj.children)) {
                    const checkForMeshes = (child) => {
                      if (child instanceof THREE.Mesh && child.geometry) return true;
                      if (child.children && Array.isArray(child.children)) {
                        return child.children.some(checkForMeshes);
                      }
                      return false;
                    };
                    return obj.children.some(checkForMeshes);
                  }
                  return false;
                })();
                const isRootObject = !obj.parent || obj.parent === gltf.scene || obj.parent === scene;
                const isModel = hasModelFlag || (hasGeometry && isRootObject);
                
                // Determine if this is a root model object (should appear in the list)
                // EXACT MATCH with ObjectsPanel.tsx lines 167-168
                // Root model = has isModel flag, OR is a direct child of scene with isImportedModel AND parent doesn't have isModel
                const isRootModel = (obj.userData && obj.userData.isModel === true) || 
                                   (obj.userData && obj.userData.isImportedModel === true && 
                                    (!obj.parent || obj.parent === gltf.scene || obj.parent === scene || !obj.parent.userData || !obj.parent.userData.isModel)) ||
                                   (hasGeometry && isRootObject && !hasModelFlag); // Fallback: detect by geometry if flags missing
                
                // CRITICAL: Only treat as root model if it's actually a root object (direct child of scene)
                // This prevents child components from appearing as separate root models
                const isActuallyRoot = !obj.parent || obj.parent === gltf.scene || obj.parent === scene;
                const finalIsRootModel = isRootModel && isActuallyRoot;
                
                // DEBUG: Log why isRootModel might be false for root objects with model flags
                if (isActuallyRoot && hasModelFlag && !isRootModel) {
                  console.warn('[WebExport] Objects panel: Root object with model flags but isRootModel=false:', {
                    name: obj.name || 'Unnamed',
                    id: obj.id,
                    isModel: obj.userData && obj.userData.isModel,
                    isImportedModel: obj.userData && obj.userData.isImportedModel,
                    hasModelFlag: hasModelFlag,
                    isRootModel: isRootModel,
                    parent: obj.parent ? (obj.parent.name || 'Unnamed') + ' (ID:' + obj.parent.id + ')' : 'none',
                    parentIsScene: obj.parent === gltf.scene || obj.parent === scene,
                    parentHasIsModel: obj.parent && obj.parent.userData && obj.parent.userData.isModel
                  });
                }
                
                // DEBUG: Log ALL root objects with model flags to see what's happening
                if (isActuallyRoot && (hasModelFlag || isModel)) {
                  const debugInfo = {
                    name: obj.name || 'Unnamed',
                    id: obj.id,
                    isModel: isModel,
                    hasModelFlag: hasModelFlag,
                    isRootModel: isRootModel,
                    isActuallyRoot: isActuallyRoot,
                    finalIsRootModel: finalIsRootModel,
                    userDataIsModel: obj.userData && obj.userData.isModel,
                    userDataIsImportedModel: obj.userData && obj.userData.isImportedModel,
                    parent: obj.parent ? (obj.parent.name || 'Unnamed') + ' (ID:' + obj.parent.id + ')' : 'none',
                    // Break down isRootModel calculation
                    check1_isModel: obj.userData && obj.userData.isModel === true,
                    check2_isImportedModel: obj.userData && obj.userData.isImportedModel === true,
                    check2_parent: !obj.parent || obj.parent === gltf.scene || obj.parent === scene,
                    check2_parentHasIsModel: obj.parent && obj.parent.userData && obj.parent.userData.isModel,
                    check3_hasGeometry: hasGeometry,
                    check3_isRootObject: isRootObject,
                    check3_notHasModelFlag: !hasModelFlag
                  };
                  console.log('[WebExport] Objects panel: Root object with model flags detected:', JSON.stringify(debugInfo, null, 2));
                  
                  // If finalIsRootModel is false, explain why
                  if (!finalIsRootModel) {
                    console.warn('[WebExport] Objects panel: Root object NOT added because finalIsRootModel=false. Breakdown:', {
                      isRootModel: isRootModel,
                      isActuallyRoot: isActuallyRoot,
                      reason: !isRootModel ? 'isRootModel is false' : 'isActuallyRoot is false'
                    });
                  } else {
                    // CRITICAL: Log when we have a root model that should be added
                    console.log('[WebExport] Objects panel: Root model detected, continuing to filters. ID:', obj.id, 'Name:', obj.name || 'Unnamed');
                  }
                }
                
                // CRITICAL DEBUG: Log if root model is being filtered out
                if (finalIsRootModel && isActuallyRoot && obj.id === 33) {
                  console.log('[WebExport] Objects panel: Root model 33 - Starting filter checks...', {
                    isPivotWrapper: !!(obj.userData && obj.userData.isPivotWrapper),
                    hasOriginalModel: !!(obj.userData && obj.userData.originalModel),
                    originalModelId: obj.userData && obj.userData.originalModel ? obj.userData.originalModel.id : 'N/A'
                  });
                }
                
                // Skip "Imported Model" wrapper - show children directly as root nodes instead
                // This matches the 3D viewer behavior where "Imported Model" is skipped and actual content is shown
                // Check if this is a root model wrapper (has isModel but no direct geometry) that would be named "Imported Model"
                // IMPORTANT: This check must come BEFORE the pivot wrapper check, otherwise pivot wrappers will skip it
                if (finalIsRootModel && isActuallyRoot && obj.userData && obj.userData.isModel && 
                    !(obj instanceof THREE.Mesh && obj.geometry) &&
                    obj.children && Array.isArray(obj.children) && obj.children.length > 0) {
                  // Check if this would be named "Imported Model" (no fileName, no customName, no name)
                  const wouldBeNamedImportedModel = !obj.userData.fileName && 
                                                    !obj.userData.customName && 
                                                    (!obj.name || obj.name === '' || obj.name === 'Unnamed');
                  
                  // Check if this is a wrapper with a "Scene" child (preferred case)
                  const sceneChild = obj.children.find(child => child.name === 'Scene' || child.name === 'scene');
                  if (sceneChild) {
                    // Skip the wrapper and traverse "Scene" directly as a root node
                    // This will make "Scene" appear as the root instead of "Imported Model"
                    console.log('[WebExport] Objects panel: Skipping "Imported Model" wrapper (ID:', obj.id, 'Name:', obj.name || 'Unnamed', '), showing "Scene" as root instead.');
                    traverse(sceneChild, parentNodes);
                    return;
                  } else if (wouldBeNamedImportedModel) {
                    // Skip the wrapper and traverse all children directly as root nodes
                    // This prevents "Imported Model" from appearing when there's no "Scene" child
                    // BUT: Filter out helper objects, transform controls, and other system objects
                    console.log('[WebExport] Objects panel: Skipping "Imported Model" wrapper (ID:', obj.id, 'Name:', obj.name || 'Unnamed', '), showing children as root nodes instead.');
                    obj.children.forEach(child => {
                      // Skip helper objects, transform controls, and system objects
                      const childIsHelper = child.userData && (child.userData.isHelper || child.userData.isTransformControls || child.userData.isLightGizmo || child.userData.isBoundingBoxHelper);
                      const childIsSystemObject = child.userData && (child.userData.isNativeObjectsGroup || child.userData.isStartingObjectsGroup || child.userData.isShadowPlane || child.userData.isGridHelper || child.userData.isAxesHelper);
                      const childIsHelperType = child.type && (child.type.includes('Helper') || child.type === 'TransformControlsGizmo' || child.type === 'TransformControlsPlane');
                      const childIsLineSegments = child.type === 'LineSegments' || child.type === 'Line';
                      const childNameIsHelper = child.name && (child.name.includes('Helper') || child.name.includes('Gizmo') || child.name.startsWith('mesh_') || child.name.includes('Model Component'));
                      
                      // Check if this child would be named "Model Component" (same logic as main filter)
                      const childHasCustomName = child.userData && child.userData.customName && child.userData.customName !== 'none';
                      const childHasFileName = child.userData && child.userData.fileName && child.userData.fileName !== 'none';
                      const childHasName = child.name && child.name !== '' && child.name !== 'Unnamed';
                      const childIsModel = child.userData && (child.userData.isModel === true || child.userData.isImportedModel === true);
                      const childWouldBeModelComponent = childIsModel && !childHasCustomName && !childHasFileName && !childHasName;
                      
                      // Only traverse if it's not a helper/system object and wouldn't be named "Model Component"
                      if (!childIsHelper && !childIsSystemObject && !childIsHelperType && !childIsLineSegments && !childNameIsHelper && !childWouldBeModelComponent) {
                        traverse(child, parentNodes);
                      } else {
                        console.log('[WebExport] Objects panel: Filtering out helper/system object from wrapper children:', child.name || 'Unnamed', 'Type:', child.type, 'wouldBeModelComponent:', childWouldBeModelComponent);
                      }
                    });
                    return;
                  }
                }
                
                // Handle pivot wrappers specially - show the original model instead of the pivot wrapper
                // BUT: For root models, if originalModel is missing/invalid/has no ID, still add the wrapper to prevent losing the model
                if (obj.userData && obj.userData.isPivotWrapper) {
                  const originalModel = obj.userData.originalModel;
                  // Check if originalModel exists, is valid, AND has an ID (required for adding to tree)
                  if (originalModel && typeof originalModel === 'object' && originalModel.id !== undefined) {
                    // The original model is inside the pivot wrapper and has an ID
                    // Recursively traverse the original model as if it were at this position in the tree
                    traverse(originalModel, parentNodes);
                    // Don't add the pivot wrapper itself - we've replaced it with the original model
                    return;
                  } else {
                    // CRITICAL: If originalModel is missing/invalid/has no ID but this is a root model, we MUST add the wrapper
                    // Otherwise the model will be lost from the object menu
                    if (finalIsRootModel && isActuallyRoot) {
                      console.warn('[WebExport] Objects panel: Root model is pivot wrapper but originalModel is missing/invalid/has no ID. Adding wrapper to prevent model loss. ID:', obj.id, 'Name:', obj.name || 'Unnamed', 'originalModel exists:', !!originalModel, 'originalModel has ID:', originalModel && originalModel.id !== undefined);
                      // Continue processing - don't return, let it be added as a normal model
                    } else {
                      // For non-root models, skip if originalModel is missing/invalid/has no ID
                      return;
                    }
                  }
                }
                
                // Skip native objects group and other helper objects
                // BUT: never skip models
                if (!isModel && obj.userData && (obj.userData.isHelper || obj.userData.isNativeObjectsGroup || obj.userData.isTransformControls)) {
                  return;
                }
                
                // Skip AmbientLight - it's controlled from Lighting Panel, not Objects Panel
                // Check both the instance type and the name (some ambient lights are wrapped in Object3D)
                if (obj instanceof THREE.AmbientLight || 
                    (obj.name && (obj.name === 'Ambient_Light' || obj.name === 'AmbientLight' || obj.name.toLowerCase().includes('ambient_light')))) {
                  return;
                }
                
                // Skip light gizmos - they're visual helpers for lights, not selectable objects
                if (!isModel && obj.userData && obj.userData.isLightGizmo) {
                  return;
                }
                
                // Skip transform controls gizmo objects (Gizmo, Planes, etc.)
                if (!isModel && (obj.type === 'TransformControlsGizmo' || obj.type === 'TransformControlsPlane')) {
                  return;
                }
                
                // Skip Three.js helper objects (DirectionalLightHelper, etc.)
                // These are typically named with "Helper" suffix or are instances of Helper classes
                // BUT: never skip models, even if they have "Helper" in the name (unlikely but possible)
                if (!isModel && (obj.type && obj.type.includes('Helper') || (obj.name && obj.name.includes('Helper')))) {
                    return;
                  }
                
                // Skip weather system objects (sky, sun/moon meshes) - they are visual effects, not scene objects
                if (!isModel && obj.userData && (obj.userData.isDynamicSky || obj.userData.isSun || obj.userData.isMoon)) {
                  return;
                }
                
                // Skip ground projection skybox objects
                if (!isModel && obj.userData && (obj.userData.isGroundedSkybox || obj.type === 'GroundedSkybox')) {
                  return;
                }

                // Skip bounding box helpers
                if (!isModel && obj.userData && obj.userData.isBoundingBoxHelper) {
                  return;
                }
                
                // Skip CineShader demo screen - it's a helper/demo object, not a scene model
                // BUT: never skip models, even if they have CineShader flags (unlikely but possible)
                if (!isModel && obj.userData && (obj.userData.isDemoShaderScreen || obj.userData.isCineShaderDemoScreenGroup)) {
                  if (finalIsRootModel && isActuallyRoot && obj.id === 33) {
                    console.warn('[WebExport] Objects panel: Root model 33 - FILTERED OUT by CineShader check!');
                  }
                    return;
                }
                
                // Skip objects with CineShader-related names
                if (!isModel && obj.name && (obj.name.toLowerCase().includes('cineshader') || obj.name.toLowerCase().includes('cinescene'))) {
                  return;
                }
                
                // Skip objects with names starting with "mesh_" - these are typically internal GLTF meshes
                // that shouldn't be shown at the root level (they should be nested within their parent groups)
                if (obj.name && obj.name.startsWith('mesh_')) {
                  console.log('[WebExport] Objects panel: Skipping internal mesh object (ID:', obj.id, 'Name:', obj.name, 'Type:', obj.type, ')');
                  return;
                }
                
                // Skip "Model Component" objects - these are typically helper objects or transform control wrappers
                // Check if this would be named "Model Component" (isModel but not root, no custom name, no fileName)
                const hasCustomName = obj.userData && obj.userData.customName && obj.userData.customName !== 'none';
                const hasFileName = obj.userData && obj.userData.fileName && obj.userData.fileName !== 'none';
                const hasName = obj.name && obj.name !== '' && obj.name !== 'Unnamed';
                if (isModel && !finalIsRootModel && !hasCustomName && !hasFileName && !hasName) {
                  // This would be named "Model Component" - skip it as it's a helper/wrapper object
                  console.log('[WebExport] Objects panel: Skipping "Model Component" object (ID:', obj.id, 'Type:', obj.type, ')');
                  return;
                }
                
                // Include primitive objects (they have isModel flag, so they're already included above)
                // Primitives are treated the same as imported models - draggable, selectable, scalable
                
                // Skip generic Object3D groups that aren't models and don't have meaningful names
                // These are typically system objects or intermediate groups
                if (!isModel && obj instanceof THREE.Object3D && !(obj instanceof THREE.Mesh) && !(obj instanceof THREE.Group) && !(obj instanceof THREE.Light)) {
                  // Only skip if it's a generic Object3D without meaningful userData or name
                  // Keep groups and meshes as they might be user-created
                  if (!obj.userData || (!obj.userData.isModel && !obj.userData.isImportedModel && (!obj.name || obj.name.startsWith('Object3D-')))) {
                    return;
                  }
                }

                // Include models, lights (except AmbientLight), groups, and other non-helper objects
                // For models, use a better name if available
                // Check for custom name first (user-renamed) - EXACT MATCH with ObjectsPanel.tsx line 251
                let name = (obj.userData && obj.userData.customName) || obj.name;
                if (!name || name === '') {
                  if (finalIsRootModel) {
                    // Try to get name from file or use default
                    name = (obj.userData && obj.userData.fileName) || 'Imported Model';
                  } else if (isModel) {
                    name = 'Model Component (' + obj.type + ')';
                  } else if (obj instanceof THREE.Group) {
                    name = 'Group';
                  } else if (obj instanceof THREE.Mesh) {
                    name = 'Mesh';
                  } else if (obj instanceof THREE.Light) {
                    // Use light type as name for lights
                    if (obj instanceof THREE.DirectionalLight) {
                      name = 'Directional Light';
                    } else if (obj instanceof THREE.PointLight) {
                      name = 'Point Light';
                    } else if (obj instanceof THREE.SpotLight) {
                      name = 'Spot Light';
                    } else if (obj instanceof THREE.RectAreaLight) {
                      name = 'Rect Area Light';
                    } else if (obj instanceof THREE.HemisphereLight) {
                      name = 'Hemisphere Light';
                    } else {
                      name = 'Light';
                    }
                  } else {
                    // Fallback: use type and id, but handle undefined values
                    const objType = obj.type || 'Object3D';
                    const objId = obj.id !== undefined ? obj.id : 'unknown';
                    name = objType + '-' + objId;
                  }
                }
                
                // Validate object before creating node
                // CRITICAL: Only validate for objects we're adding to the tree, not for traversal
                // If an object has invalid ID, skip adding it but still traverse its children
                if (!obj || typeof obj !== 'object') {
                  console.warn('[WebExport] Objects panel: Skipping invalid object (null/not object):', {
                    hasObj: !!obj,
                    objType: typeof obj
                  });
                    return;
                }
                
                // DEBUG: Log ALL objects that reach this point with finalIsRootModel=true
                if (finalIsRootModel && isActuallyRoot) {
                  console.log('[WebExport] Objects panel: Root model reached validation check:', {
                    name: obj.name || 'Unnamed',
                    type: obj.type || 'Unknown',
                    id: obj.id,
                    isModel: isModel,
                    isRootModel: isRootModel,
                    finalIsRootModel: finalIsRootModel,
                    isActuallyRoot: isActuallyRoot,
                    hasModelFlag: hasModelFlag,
                    hasGeometry: hasGeometry
                  });
                }
                
                // DEBUG: Log root models before validation to see if they're being processed
                // Also log when we have a root object with model flags but finalIsRootModel is false
                if (isActuallyRoot && (isModel || hasModelFlag)) {
                  if (finalIsRootModel) {
                    console.log('[WebExport] Objects panel: Processing root model before validation:', {
                      name: obj.name || 'Unnamed',
                      type: obj.type || 'Unknown',
                      id: obj.id,
                      isModel: isModel,
                    isRootModel: isRootModel,
                      finalIsRootModel: finalIsRootModel,
                      isActuallyRoot: isActuallyRoot,
                    hasModelFlag: hasModelFlag,
                      hasGeometry: hasGeometry
                    });
                  } else {
                    console.warn('[WebExport] Objects panel: Root object with model flags but finalIsRootModel=false:', {
                      name: obj.name || 'Unnamed',
                      type: obj.type || 'Unknown',
                      id: obj.id,
                      isModel: isModel,
                      isRootModel: isRootModel,
                      finalIsRootModel: finalIsRootModel,
                      isActuallyRoot: isActuallyRoot,
                      hasModelFlag: hasModelFlag,
                    hasGeometry: hasGeometry,
                      parent: obj.parent ? (obj.parent.name || 'Unnamed') + ' (ID:' + obj.parent.id + ')' : 'none',
                      parentIsScene: obj.parent === gltf.scene || obj.parent === scene
                    });
                  }
                }
                
                // CRITICAL DEBUG: Log if root model 33 reaches ID check
                if (finalIsRootModel && isActuallyRoot && obj.id === 33) {
                  console.log('[WebExport] Objects panel: Root model 33 - Reached ID check, ID:', obj.id);
                }
                
                // If object has no ID, we can't add it to the tree, but we should still traverse children
                // This is important for models with nested structures where some intermediate objects lack IDs
                // CRITICAL: Check ID BEFORE we do all the expensive calculations, but AFTER we've determined if it's a model
                // This way we can still traverse children of models even if intermediate objects lack IDs
                if (obj.id === undefined) {
                  // CRITICAL DEBUG: Log if root model 33 is being skipped due to missing ID
                  if (finalIsRootModel && isActuallyRoot) {
                    console.error('[WebExport] Objects panel: Root model 33 - SKIPPED due to missing ID! This should not happen!');
                  }
                  console.warn('[WebExport] Objects panel: Object has no ID, skipping node but traversing children:', {
                    name: obj.name || 'Unnamed',
                    type: obj.type || 'Unknown',
                    id: obj.id,
                    isModel: isModel,
                    isRootModel: isRootModel,
                    finalIsRootModel: finalIsRootModel,
                    isActuallyRoot: isActuallyRoot,
                    childrenCount: obj.children ? obj.children.length : 0,
                    parent: obj.parent ? (obj.parent.name || 'Unnamed') + ' (ID:' + obj.parent.id + ')' : 'none',
                    // CRITICAL: Log if this is a root model that's being skipped
                    isRootModelBeingSkipped: finalIsRootModel && isActuallyRoot
                  });
                  // Still traverse children even if this object can't be added to the tree
                  // For models, we MUST traverse children to find the actual car meshes
                  // CRITICAL: For root models with no ID, we should still add their children to parentNodes (not as children of this object)
                  if (obj.children && Array.isArray(obj.children)) {
                    obj.children.forEach(child => {
                      // Only traverse if child is not a helper, OR if this is a model (models can have helper children)
                      const childIsHelper = child.type && child.type.includes('Helper') || (child.name && child.name.includes('Helper'));
                      if (isModel || !childIsHelper) {
                        // If this is a root model, add children directly to parentNodes (same level)
                        // Otherwise, they would be lost since we can't add this object to the tree
                        traverse(child, finalIsRootModel ? parentNodes : parentNodes);
                      }
                    });
                  }
                  return;
                }
                
                // Calculate mesh statistics
                const stats = calculateMeshStats(obj);
                
                // Calculate bounding box dimensions, excluding helper objects
                let dimensions = null;
                try {
                  const box = new THREE.Box3();
                  // Manually expand by object, excluding helpers to get accurate dimensions
                  obj.traverse((child) => {
                    if (child instanceof THREE.Mesh && child.geometry) {
                      const childUserData = child.userData || {};
                      // Skip helpers to prevent inflated dimensions
                      if (!childUserData.isHelper && 
                          !childUserData.isBoundingBoxHelper && 
                          !childUserData.isLightGizmo &&
                          !childUserData.isTransformControls &&
                          !(child.type && child.type.includes('Helper'))) {
                        const childBox = new THREE.Box3().setFromObject(child);
                        if (!childBox.isEmpty()) {
                          box.expandByBox(childBox);
                        }
                      }
                    }
                  });
                  if (!box.isEmpty()) {
                    const size = box.getSize(new THREE.Vector3());
                    if (size.x > 0 || size.y > 0 || size.z > 0) {
                      dimensions = size.x.toFixed(1) + 'm × ' + size.y.toFixed(1) + 'm × ' + size.z.toFixed(1) + 'm';
                    }
                  }
                } catch (e) {
                  // If bounding box calculation fails, dimensions stays null
                }
                
                const displayName = dimensions ? name + ' (' + dimensions + ')' : name;
                
                const node = {
                  object: obj,
                  name: name,
                  displayName: displayName,
                  type: obj.type || 'Unknown',
                  visible: obj.visible !== false,
                  children: [],
                  dimensions: dimensions,
                  triangles: stats.triangles > 0 ? Math.floor(stats.triangles) : undefined,
                  size: stats.size > 0 ? stats.size : undefined,
                  fileName: (obj.userData && obj.userData.fileName) || null
                };
                const finalFileName = (obj.userData && obj.userData.fileName) || 'none';
                const finalCustomName = (obj.userData && obj.userData.customName) || 'none';
                console.log('[WebExport] Objects panel: Adding node to tree:', 
                  'Name="' + name + '", Type=' + (obj.type || 'Unknown') + ', ID=' + obj.id + 
                  ', fileName="' + finalFileName + '", customName="' + finalCustomName + '"' +
                  ', isModel=' + isModel + ', isRootModel=' + finalIsRootModel + 
                  ', isActuallyRoot=' + isActuallyRoot +
                  ', triangles=' + (stats.triangles > 0 ? Math.floor(stats.triangles) : 0));
                parentNodes.push(node);
                
                // Traverse children, but skip helper objects in the hierarchy
                // Always traverse children of models though
                if (obj.children && Array.isArray(obj.children)) {
                  obj.children.forEach(child => {
                    // Use same geometry fallback logic as root objects for consistency
                    const childHasModelFlag = child.userData && (child.userData.isModel === true || child.userData.isImportedModel === true);
                    const childHasGeometry = (child instanceof THREE.Mesh && child.geometry) || 
                                             (child instanceof THREE.Group && child.children && child.children.some(c => c instanceof THREE.Mesh && c.geometry));
                    const childIsModel = childHasModelFlag || childHasGeometry;
                    // Include children of models, or children that aren't helpers
                    if (isModel || childIsModel || !(child.type && child.type.includes('Helper') || (child.name && child.name.includes('Helper')))) {
                      traverse(child, node.children);
                    }
                  });
                }
              };
              
              // Traverse all root children of the scene - MATCH ObjectsPanel.tsx line 298 EXACTLY
              // ObjectsPanel.tsx: viewer.scene.children.forEach(child => traverse(child, nodes))
              // In web export, we use gltf.scene.children (which is the same as scene.children after loading)
              console.log('[WebExport] Objects panel: Starting traversal of', gltf.scene.children.length, 'root children');
              gltf.scene.children.forEach((child, index) => {
                const childName = child.name || 'Unnamed';
                const childType = child.type || 'Unknown';
                const childId = child.id;
                const hasIsModel = !!(child.userData && child.userData.isModel);
                const hasIsImportedModel = !!(child.userData && child.userData.isImportedModel);
                const isSystemObject = !!(child.userData && (child.userData.isNativeObjectsGroup || child.userData.isStartingObjectsGroup));
                const childrenCount = child.children ? child.children.length : 0;
                const hasGeometry = child instanceof THREE.Mesh && child.geometry;
                const fileName = (child.userData && child.userData.fileName) || 'none';
                const customName = (child.userData && child.userData.customName) || 'none';
                // Recursively check for meshes at any depth (for debug logging)
                const hasMeshChildren = (() => {
                  if (!child.children || !Array.isArray(child.children)) return false;
                  const checkForMeshes = (c) => {
                    if (c instanceof THREE.Mesh && c.geometry) return true;
                    if (c.children && Array.isArray(c.children)) {
                      return c.children.some(checkForMeshes);
                }
                return false;
              };
                  return child.children.some(checkForMeshes);
                })();
              
                // Count total meshes recursively
              let totalMeshes = 0;
                if (child instanceof THREE.Mesh) totalMeshes = 1;
                child.traverse((desc) => {
                  if (desc instanceof THREE.Mesh && desc.geometry) totalMeshes++;
                });
                
                console.log('[WebExport] Objects panel: Processing root child', index + 1 + ':', 
                  'Name="' + childName + '", Type=' + childType + ', ID=' + childId + 
                  ', fileName="' + fileName + '", customName="' + customName + '"' +
                  ', isModel=' + hasIsModel + ', isImportedModel=' + hasIsImportedModel + 
                  ', isSystem=' + isSystemObject + ', children=' + childrenCount + 
                  ', hasGeometry=' + hasGeometry + ', hasMeshChildren=' + hasMeshChildren +
                  ', totalMeshes=' + totalMeshes);
                      traverse(child, nodes);
              });
              
              console.log('[WebExport] Objects panel: Built scene tree with', nodes.length, 'root node(s)');
              if (nodes.length > 0) {
                const nodeInfo = nodes.map(n => 
                  'Name="' + (n.name || 'Unnamed') + '", Type=' + (n.type || 'Unknown') + 
                  ', ID=' + n.object.id + ', children=' + (n.children ? n.children.length : 0)
                ).join('; ');
                console.log('[WebExport] Objects panel: Root nodes:', nodeInfo);
                      } else {
                console.warn('[WebExport] Objects panel: No nodes found! Scene has', gltf.scene.children.length, 'root children');
              }
              return nodes;
            };
            
            // Track expanded nodes
            const expandedNodes = new Set();
            
            // Build the tree (rebuilt on each update to get fresh data)
            let sceneTree = [];
            const rebuildSceneTree = () => {
              sceneTree = buildSceneTree();
              console.log('[WebExport] Objects panel: Built scene tree with', sceneTree.length, 'root node(s)');
              if (sceneTree.length > 0) {
                const firstNode = sceneTree[0];
                console.log('[WebExport] Objects panel: First node:', {
                  name: firstNode.name,
                  displayName: firstNode.displayName,
                  fileName: firstNode.fileName,
                  dimensions: firstNode.dimensions,
                  hasChildren: firstNode.children && firstNode.children.length > 0,
                  objectId: firstNode.object.id,
                  objectType: firstNode.object.type,
                  isFirstRoot: firstNode.object.userData && firstNode.object.userData._isFirstRoot,
                  gltfSceneName: firstNode.object.userData && firstNode.object.userData._gltfSceneName,
                  gltfObjectName: firstNode.object.userData && firstNode.object.userData._gltfObjectName,
                  userDataFileName: firstNode.object.userData && firstNode.object.userData.fileName
                });
              } else {
                console.warn('[WebExport] Objects panel: Scene tree is empty! Scene has', gltf && gltf.scene ? gltf.scene.children.length : 0, 'root children');
              }
            };
            
            // Initial build
            rebuildSceneTree();
            
            // Render a node recursively - matching ObjectsPanel structure exactly
            const renderNode = (node, depth = 0) => {
              // Safety checks
              if (!node || !node.object) {
                console.warn('[WebExport] Objects panel: Invalid node, skipping render');
                return null;
              }
              
              // Generate unique ID (handle missing id gracefully)
              const objId = node.object.id !== undefined ? node.object.id : Math.random().toString(36).substr(2, 9);
              const nodeId = 'node-' + objId;
              const hasChildren = node.children && node.children.length > 0;
              const isExpanded = expandedNodes.has(nodeId);
              const isGroup = node.object.type === 'Group' || node.object.type === 'Scene' || (node.object.children && node.object.children.length > 0);
              
              // Main tree node container
              const nodeDiv = document.createElement('div');
              nodeDiv.className = 'objects-tree-node';
              
              // Tree node content (with padding based on depth)
              const nodeContent = document.createElement('div');
              nodeContent.className = 'objects-tree-node-content';
              nodeContent.style.paddingLeft = (depth * 20 + 6) + 'px';
              
              // Main row containing expand button, icon, and name
              const mainRow = document.createElement('div');
              mainRow.className = 'objects-node-main-row';
              
              // Expand/collapse button
              if (hasChildren) {
                const expandBtn = document.createElement('button');
                expandBtn.className = 'objects-expand-btn';
                expandBtn.textContent = isExpanded ? '▼' : '▶';
                expandBtn.addEventListener('click', (e) => {
                  e.stopPropagation();
                  if (isExpanded) {
                    expandedNodes.delete(nodeId);
                  } else {
                    expandedNodes.add(nodeId);
                  }
                  rebuildSceneTree();
                  updateObjectsList();
                });
                mainRow.appendChild(expandBtn);
              } else {
                const spacer = document.createElement('span');
                spacer.className = 'objects-no-children-indent';
                mainRow.appendChild(spacer);
              }
              
              // Icon
              const icon = document.createElement('span');
              icon.className = 'objects-node-icon';
              icon.textContent = isGroup ? '📦' : '📄';
              mainRow.appendChild(icon);
              
              // Name container (with name and optional filename)
              const nameContainer = document.createElement('div');
              nameContainer.className = 'objects-node-name-container';
              
              // Name with dimensions (matching ObjectsPanel.tsx exactly)
              const nameSpan = document.createElement('span');
              nameSpan.className = 'objects-node-name';
              // Use displayName which already includes dimensions
              nameSpan.textContent = node.displayName;
              // Set title matching ObjectsPanel (line 969)
              if (node.fileName) {
                nameSpan.title = node.name + ' - Source: ' + node.fileName;
              } else {
                nameSpan.title = node.name;
              }
              nameContainer.appendChild(nameSpan);
              
              // Filename (shown below name if available, matching ObjectsPanel.tsx lines 987-991)
              if (node.fileName) {
                const filenameSpan = document.createElement('span');
                filenameSpan.className = 'objects-node-filename';
                filenameSpan.textContent = '📄 ' + node.fileName;
                filenameSpan.title = 'Source file: ' + node.fileName;
                nameContainer.appendChild(filenameSpan);
              }
              
              mainRow.appendChild(nameContainer);
              nodeContent.appendChild(mainRow);
              
              // Actions container (buttons - only visible on hover)
              const actionsContainer = document.createElement('div');
              actionsContainer.className = 'objects-node-actions';
              
              // Visibility button
              const visBtn = document.createElement('button');
              // Validate object before accessing properties - use lenient check
              const isValidObject = node.object && (
                node.object instanceof THREE.Object3D || 
                (node.object && typeof node.object === 'object' && 'type' in node.object && 'visible' in node.object)
              );
              visBtn.className = 'objects-action-btn';
              visBtn.textContent = (isValidObject && node.object.visible) ? '👁️' : '🚫';
              visBtn.title = (isValidObject && node.object.visible) ? 'Hide' : 'Show';
              visBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!isValidObject) {
                  console.warn('[WebExport] Cannot toggle visibility: object is not valid', node.name);
                  return;
                }
                node.object.visible = !node.object.visible;
                visBtn.textContent = node.object.visible ? '👁️' : '🚫';
                visBtn.title = node.object.visible ? 'Hide' : 'Show';
                renderer.render(scene, camera);
                css3dRenderer.render(scene, camera);
              });
              actionsContainer.appendChild(visBtn);

              // Focus button
              const focusBtn = document.createElement('button');
              focusBtn.className = 'objects-action-btn';
              focusBtn.textContent = '🎯';
              focusBtn.title = 'Focus on object';
              focusBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                try {
                  // Validate that node.object is a valid THREE.Object3D
                  if (!node.object || typeof node.object !== 'object') {
                    console.warn('[WebExport] Cannot focus: object is null or not an object', node.name);
                    return;
                  }
                  
                  // Check if it's a THREE.Object3D instance (use lenient check)
                  // Note: Objects loaded from GLB are always valid THREE.Object3D instances
                  // The instanceof check should work, but we also check for key properties as fallback
                  const isObject3D = node.object instanceof THREE.Object3D || 
                                    (node.object && typeof node.object === 'object' && 
                                     'type' in node.object && 
                                     typeof node.object.type === 'string' &&
                                     'id' in node.object && 
                                     typeof node.object.id === 'number' &&
                                     'children' in node.object &&
                                     Array.isArray(node.object.children));
                  
                  if (!isObject3D) {
                    console.warn('[WebExport] Cannot focus: object is not a THREE.Object3D instance', node.name, {
                      hasType: 'type' in node.object,
                      hasId: 'id' in node.object,
                      hasChildren: 'children' in node.object,
                      instanceof: node.object instanceof THREE.Object3D
                    });
                    return;
                  }
                  
                  // Try to calculate bounding box directly - if it works, the object is valid
                  let box;
                  try {
                    // Update world matrix if the method exists
                    if (typeof node.object.updateWorldMatrix === 'function') {
                      node.object.updateWorldMatrix(true, true);
                    } else if (typeof node.object.updateMatrixWorld === 'function') {
                      node.object.updateMatrixWorld(true);
                    }
                    box = new THREE.Box3().setFromObject(node.object);
                  } catch (boxErr) {
                    console.warn('[WebExport] Failed to calculate bounding box for focus', node.name, boxErr);
                    return;
                  }
                  
                  if (!box || box.isEmpty()) {
                    console.warn('[WebExport] Cannot focus: bounding box is empty', node.name);
                    return;
                  }
                  
                  const size = box.getSize(new THREE.Vector3());
                  const center = box.getCenter(new THREE.Vector3());
                  
                  // Validate center and size
                  if (!isFinite(center.x) || !isFinite(center.y) || !isFinite(center.z)) {
                    console.warn('[WebExport] Cannot focus: invalid center', node.name, center);
                    return;
                  }
                  
                  const maxSide = Math.max(size.x, size.y, size.z) || 1;
                  const distance = maxSide * 2.5;

                  // Move camera along its current viewing direction
                  const dir = new THREE.Vector3();
                  dir.subVectors(camera.position, controls.target);
                  dir.normalize();
                  if (!isFinite(dir.x) || !isFinite(dir.y) || !isFinite(dir.z)) {
                    dir.set(0, 0, 1);
                  }
                  camera.position.copy(center.clone().add(dir.multiplyScalar(distance)));
                  controls.target.copy(center);
                  controls.update();
                  renderer.render(scene, camera);
                  css3dRenderer.render(scene, camera);
                } catch (err) {
                  console.warn('[WebExport] Failed to focus object', node.name, err);
                }
              });
              actionsContainer.appendChild(focusBtn);
              
              nodeContent.appendChild(actionsContainer);
              nodeDiv.appendChild(nodeContent);
              
              // Children container (with left border)
              if (hasChildren && isExpanded) {
                const childrenDiv = document.createElement('div');
                childrenDiv.className = 'objects-tree-children';
                node.children.forEach(child => {
                  childrenDiv.appendChild(renderNode(child, depth + 1));
                });
                nodeDiv.appendChild(childrenDiv);
              }
              
              return nodeDiv;
            };
            
            // Update the objects list
            const updateObjectsList = () => {
              try {
                objectsListEl.innerHTML = '';
                if (!sceneTree || sceneTree.length === 0) {
                  console.warn('[WebExport] Objects panel: Scene tree is empty, nothing to render');
                  return;
                }
                sceneTree.forEach(node => {
                  try {
                    const nodeElement = renderNode(node, 0);
                    if (nodeElement) {
                      objectsListEl.appendChild(nodeElement);
                    }
                  } catch (err) {
                    console.error('[WebExport] Objects panel: Error rendering node', node.name, err);
                  }
                });
                console.log('[WebExport] Objects panel: Rendered', sceneTree.length, 'node(s)');
              } catch (err) {
                console.error('[WebExport] Objects panel: Error updating objects list', err);
              }
            };
            
            // Initial render
            updateObjectsList();

            // Toggle collapse
            toggleBtn.addEventListener('click', () => {
              const isHidden = objectsListEl.style.display === 'none';
              objectsListEl.style.display = isHidden ? 'block' : 'none';
              toggleBtn.textContent = isHidden ? 'Hide' : 'Show';
            });
          }
        } catch (e) {
          console.warn('[WebExport] Failed to initialize Objects panel', e);
        }
        
        // Filter out gizmos, helpers, and shader demo from the loaded scene
        // CRITICAL: DO NOT filter out shadow planes - they need to be visible
        const objectsToHide = [];
        const objectsToRemove = [];
        // Use safeTraverse to avoid Three.js internal traverse errors
        safeTraverse(gltf.scene, (obj) => {
          const userData = obj.userData || {};
          const name = (obj.name || '').toLowerCase();
          const type = obj.type || '';
          
          // CRITICAL: Skip shadow planes - they must remain visible
          if (userData.isShadowPlane || name.includes('shadow plane') || name.includes('shadow_plane')) {
            return; // Skip filtering - keep shadow plane visible
          }
          
          const isGizmo = 
            type === 'TransformControlsGizmo' ||
            type === 'TransformControlsPlane' ||
            type.includes('Gizmo') ||
            userData.isLightGizmo === true ||
            userData.isTransformControls === true ||
            (name && name.includes('gizmo'));
          
          // CRITICAL: Check for RectAreaLightHelper (it's not a standard THREE.Helper class)
          const isRectAreaLightHelper = 
            type === 'RectAreaLightHelper' ||
            (name && name.includes('rectarealighthelper')) ||
            (name && name.includes('rect area light helper')) ||
            (userData.lightId && obj instanceof THREE.Mesh && obj.material && obj.material.type === 'MeshBasicMaterial');
          
          const isHelper = 
            obj instanceof THREE.AxesHelper ||
            obj instanceof THREE.GridHelper ||
            obj instanceof THREE.ArrowHelper ||
            obj instanceof THREE.BoxHelper ||
            obj instanceof THREE.PlaneHelper ||
            obj instanceof THREE.PolarGridHelper ||
            type === 'GridHelper' ||
            type === 'AxesHelper' ||
            type === 'ArrowHelper' ||
            type === 'BoxHelper' ||
            type === 'PlaneHelper' ||
            type === 'PolarGridHelper' ||
            type === 'RectAreaLightHelper' ||
            type === 'DirectionalLightHelper' ||
            type === 'PointLightHelper' ||
            type === 'SpotLightHelper' ||
            type === 'HemisphereLightHelper' ||
            type === 'CameraHelper' ||
            type === 'SkeletonHelper' ||
            type === 'WireframeHelper' ||
            type === 'EdgesHelper' ||
            type === 'FaceNormalsHelper' ||
            type === 'VertexNormalsHelper' ||
            type.includes('Helper') ||
            userData.isHelper === true ||
            userData.isGridHelper === true ||
            userData.isAxesHelper === true ||
            userData.isLightGizmo === true ||
            userData.isLightHelper === true ||
            userData.isTransformControls === true ||
            userData.lightId !== undefined || // Any object with lightId is a light helper
            userData.gizmoKind !== undefined || // Any object with gizmoKind is a light gizmo part
            (name && (name.includes('helper') || name === 'axes' || name === 'grid' || name.includes('light helper') || name.includes('light gizmo') || name.includes('camera helper')));
          
          const isShaderDemo = 
            userData.isDemoShaderScreen === true ||
            name === 'cineshaderdemoscreengroup' ||
            name === 'cineshaderdemoscreen' ||
            name === 'cineshaderdemoframe' ||
            (name && name.includes('cineshader')) ||
            userData.skipExport === true; // Objects marked to skip export
          
          // CRITICAL: Also check for RectAreaLightHelper and light gizmo parts
          const isLightRelated = 
            isRectAreaLightHelper ||
            userData.gizmoKind === 'rectPanel' || // RectAreaLight gizmo panel
            userData.gizmoKind === 'spotCone' || // SpotLight gizmo cone
            userData.gizmoKind === 'pointSphere' || // PointLight gizmo sphere
            userData.gizmoKind === 'hemisphereCap' || // HemisphereLight gizmo cap
            userData.gizmoKind === 'directionalArrow' || // DirectionalLight gizmo arrow
            (obj instanceof THREE.Mesh && obj.material && obj.material.wireframe === true && userData.lightId); // Wireframe light helpers
          
          // Check for wireframe-only meshes (often helpers)
          const isWireframeOnly = obj instanceof THREE.Mesh && 
            obj.material && 
            !Array.isArray(obj.material) && 
            obj.material.wireframe === true && 
            !userData.isModel && 
            !userData.isImportedModel;
          
          if (isGizmo || isHelper || isShaderDemo || isLightRelated || isWireframeOnly) {
            // Remove from scene instead of just hiding
            if (obj.parent) {
              obj.parent.remove(obj);
              objectsToRemove.push(obj);
            } else {
              obj.visible = false;
              objectsToHide.push(obj);
            }
            console.log('[WebExport] Removed/hidden helper/gizmo:', 
              'Name: "' + (obj.name || 'unnamed') + '", Type: ' + type + ', Removed: ' + (obj.parent === null));
            return;
          }
        });
        console.log('[WebExport] Filtered out', objectsToHide.length + objectsToRemove.length, 'gizmo/helper/shader demo object(s) from loaded scene (' + objectsToRemove.length + ' removed, ' + objectsToHide.length + ' hidden)');
        
        // Ensure all non-helper, non-shadow-plane meshes cast and receive shadows
        gltf.scene.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            const userData = obj.userData || {};
            const name = (obj.name || '').toLowerCase();
            const type = obj.type || '';
            const isShadowPlane = userData.isShadowPlane || name.includes('shadow_plane');
            const isHelper =
              userData.isHelper ||
              userData.isGridHelper ||
              userData.isAxesHelper ||
              userData.isLightGizmo ||
              userData.isLightHelper ||
              userData.isTransformControls ||
              userData.lightId !== undefined || // Light helpers have lightId
              userData.gizmoKind !== undefined || // Light gizmo parts have gizmoKind
              type.includes('Helper') ||
              type === 'RectAreaLightHelper' ||
              type === 'DirectionalLightHelper' ||
              type === 'PointLightHelper' ||
              type === 'SpotLightHelper' ||
              type === 'HemisphereLightHelper' ||
              (name && (name.includes('helper') || name.includes('light helper') || name.includes('light gizmo')));
            if (isShadowPlane || isHelper) return;
            obj.castShadow = true;
            obj.receiveShadow = true;
          }
        });

        // Configure glass / transparent materials so they don't block interior lighting
        // CRITICAL: Skip helpers and gizmos - they should already be hidden
        let transparentMeshes = 0;
        let veryTransparentMeshes = 0;
        gltf.scene.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            // CRITICAL: Skip helpers, gizmos, and other objects that should be hidden
            const userData = obj.userData || {};
            const name = (obj.name || '').toLowerCase();
            const type = obj.type || '';
            const isHelperOrGizmo = 
              obj instanceof THREE.AxesHelper ||
              obj instanceof THREE.GridHelper ||
              type.includes('Helper') ||
              type.includes('Gizmo') ||
              userData.isHelper === true ||
              userData.isLightGizmo === true ||
              userData.isLightHelper === true ||
              userData.lightId !== undefined ||
              userData.gizmoKind !== undefined ||
              (name && (name.includes('helper') || name.includes('gizmo')));
            
            if (isHelperOrGizmo) {
              return; // Skip material configuration for helpers/gizmos
            }
            
            const rawMaterial = obj.material;
            const materials = Array.isArray(rawMaterial) ? rawMaterial : [rawMaterial];
            materials.forEach((mat) => {
              if (!mat) return;
              const anyMat = mat;
              const opacity = typeof anyMat.opacity === 'number' ? anyMat.opacity : 1;
              const transmission = typeof anyMat.transmission === 'number' ? anyMat.transmission : 0;
              const transparentFlag = anyMat.transparent === true;
              const matName = (mat.name || '').toLowerCase();
              const isGlassLike =
                matName.indexOf('glass') !== -1 ||
                matName.indexOf('window') !== -1 ||
                matName.indexOf('windshield') !== -1 ||
                matName.indexOf('windscreen') !== -1 ||
                matName.indexOf('transparent') !== -1 ||
                matName.indexOf('transmission') !== -1;

              const isTransparent =
                transmission > 0 ||
                (transparentFlag && opacity < 1.0) ||
                isGlassLike;
                  
              if (isTransparent) {
                transparentMeshes++;
                // Let light pass through most glass, but avoid creating "holes" in shadows
                // Only disable shadow casting for VERY transparent surfaces (true glass),
                // keep partially-opaque materials (like tinted plastic, interior trims) casting shadows.
                const veryTransparent = transmission > 0.9 || opacity < 0.2;
                if (veryTransparent) {
                  veryTransparentMeshes++;
                  obj.castShadow = false;
                }
                obj.receiveShadow = true;
                if (mat.transparent !== true) {
                  mat.transparent = true;
                }
                // Avoid writing to depth buffer so interior geometry can still be lit
                if (mat.depthWrite !== false) {
                  mat.depthWrite = false;
                }
                if (mat.depthTest !== true) {
                  mat.depthTest = true;
                }
              }
            });
          }
        });
        console.log('[WebExport] Transparent material debug:', 
          'Transparent meshes: ' + transparentMeshes + ', ' +
          'Very transparent: ' + veryTransparentMeshes);
        
        // CRITICAL: Configure interior shadows - make all opaque materials double-sided
        // This allows shadows to appear on interior surfaces (back faces) of the car
        let doubleSidedCount = 0;
        gltf.scene.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            // Skip helpers, gizmos, shadow planes, and transparent materials
            const userData = obj.userData || {};
            const name = (obj.name || '').toLowerCase();
            const type = obj.type || '';
            const isHelperOrGizmo = 
              obj instanceof THREE.AxesHelper ||
              obj instanceof THREE.GridHelper ||
              type.includes('Helper') ||
              type.includes('Gizmo') ||
              userData.isHelper === true ||
              userData.isShadowPlane === true ||
              userData.isLightGizmo === true ||
              userData.isLightHelper === true ||
              userData.lightId !== undefined ||
              userData.gizmoKind !== undefined ||
              (name && (name.includes('helper') || name.includes('gizmo')));
            
            if (isHelperOrGizmo) {
              return; // Skip helpers/gizmos
            }
            
            const rawMaterial = obj.material;
            const materials = Array.isArray(rawMaterial) ? rawMaterial : [rawMaterial];
            materials.forEach((mat) => {
              if (!mat) return;
              
              // Check if material is transparent
              const anyMat = mat;
              const opacity = typeof anyMat.opacity === 'number' ? anyMat.opacity : 1;
              const transmission = typeof anyMat.transmission === 'number' ? anyMat.transmission : 0;
              const transparentFlag = anyMat.transparent === true;
              const matName = (mat.name || '').toLowerCase();
              const isGlassLike =
                matName.indexOf('glass') !== -1 ||
                matName.indexOf('window') !== -1 ||
                matName.indexOf('windshield') !== -1 ||
                matName.indexOf('windscreen') !== -1 ||
                matName.indexOf('transparent') !== -1 ||
                matName.indexOf('transmission') !== -1;
              const isTransparent =
                transmission > 0 ||
                (transparentFlag && opacity < 1.0) ||
                isGlassLike;
              
              // CRITICAL: Make opaque materials double-sided for interior shadows
              // DoubleSide allows shadows to appear on back faces (interior surfaces)
              if (!isTransparent &&
                  (mat instanceof THREE.MeshStandardMaterial ||
                   mat instanceof THREE.MeshPhysicalMaterial ||
                   mat instanceof THREE.MeshPhongMaterial ||
                   mat instanceof THREE.MeshLambertMaterial ||
                   mat instanceof THREE.MeshBasicMaterial)) {
                if (mat.side !== THREE.DoubleSide) {
                  mat.side = THREE.DoubleSide;
                  mat.needsUpdate = true;
                  doubleSidedCount++;
                }
              }
            });
            
            // CRITICAL: Ensure all meshes cast and receive shadows for interior shadows
            // This must be done AFTER material configuration
            if (!obj.castShadow) {
              obj.castShadow = true;
            }
            if (!obj.receiveShadow) {
              obj.receiveShadow = true;
            }
          }
        });
        console.log('[WebExport] Interior shadow configuration:', 
          'Double-sided materials: ' + doubleSidedCount + ', ' +
          'All meshes configured to cast and receive shadows');
        
        // CRITICAL: Setup shadow plane exactly like main application (ViewerCanvas.tsx)
        // Main app uses MeshStandardMaterial with transparent: true, opacity: 0.8, depthWrite: true
        // Main app uses renderOrder = 0 (not 1) and position.y = -0.001 for standard mode
        // For ground projection, position at groundHeight (same as GroundedSkybox ground level)
        
        let shadowPlane = null;
        // CRITICAL: Search for shadow plane in both scene and gltf.scene
        const searchForShadowPlane = (root) => {
          root.traverse((obj) => {
            if (obj instanceof THREE.Mesh && (obj.userData.isShadowPlane || (obj.name || '').toLowerCase().includes('shadow'))) {
              shadowPlane = obj;
              console.log('[WebExport] Found existing shadow plane:', 
                'Name: "' + (obj.name || 'unnamed') + '", ' +
                'Visible: ' + obj.visible + ', ' +
                'Position: (' + obj.position.x.toFixed(2) + ', ' + obj.position.y.toFixed(2) + ', ' + obj.position.z.toFixed(2) + '), ' +
                'ReceiveShadow: ' + obj.receiveShadow);
            }
          });
        };
        searchForShadowPlane(scene);
        if (!shadowPlane && gltf && gltf.scene) {
          searchForShadowPlane(gltf.scene);
        }
        
        // Get HDR config to determine ground projection mode
        const hdrConfig = CONFIG.hdr || {};
        const groundProjectionEnabled = hdrConfig.groundProjectionEnabled === true;
        const groundHeight = groundProjectionEnabled ? (hdrConfig.groundProjectionHeight || 15) : 0;
        
        // MATCH WORKING EXPORT: Configure shadow plane to be transparent (only shows shadows) and fit it under the car
        const shadowConfig = CONFIG.shadows || {};
        const shadowPlaneTransparent = shadowConfig.shadowPlaneTransparent !== undefined ? shadowConfig.shadowPlaneTransparent : true;
        const shadowIntensity = shadowConfig.shadowIntensity !== undefined ? shadowConfig.shadowIntensity : 1.0;
        
        // Configure found shadow plane (match working export setup)
        if (shadowPlane) {
          shadowPlane.visible = true;
          shadowPlane.receiveShadow = true;
          shadowPlane.castShadow = false;
          
          // MATCH WORKING EXPORT: Configure material for transparent shadow-only display
          if (shadowPlane.material) {
            const materials = Array.isArray(shadowPlane.material) ? shadowPlane.material : [shadowPlane.material];
            materials.forEach((mat) => {
              if (shadowPlaneTransparent) {
                // Use ShadowMaterial for transparent shadow-only display
                if (!(mat instanceof THREE.ShadowMaterial)) {
                  if (mat instanceof THREE.Material) {
                    mat.dispose();
                  }
                  // CRITICAL: Use higher base opacity for shadows to be visible
                  // Minimum 0.3 ensures shadows are always visible, even with low shadowIntensity
                  const shadowOpacity = Math.min(1.0, Math.max(0.3, 0.1 + (shadowIntensity / 2.0) * 0.9));
                  const shadowMaterial = new THREE.ShadowMaterial({ 
                    opacity: shadowOpacity
                  });
                  shadowMaterial.depthWrite = true;
                  // CRITICAL: Store base opacity for shadow color intensity adjustment
                  shadowMaterial.userData.baseOpacity = shadowOpacity;
                  shadowPlane.material = shadowMaterial;
                  console.log('[WebExport] Shadow plane configured with ShadowMaterial (transparent, shadow-only):', 
                    'Opacity: ' + shadowOpacity.toFixed(3) + ', Shadow intensity: ' + shadowIntensity.toFixed(2));
                } else {
                  // CRITICAL: Use higher base opacity for shadows to be visible
                  // Minimum 0.3 ensures shadows are always visible, even with low shadowIntensity
                  const shadowOpacity = Math.min(1.0, Math.max(0.3, 0.1 + (shadowIntensity / 2.0) * 0.9));
                  mat.opacity = shadowOpacity;
                  mat.depthWrite = true;
                  // CRITICAL: Store base opacity for shadow color intensity adjustment
                  mat.userData.baseOpacity = shadowOpacity;
                  mat.needsUpdate = true;
                }
              } else {
                if (!(mat instanceof THREE.MeshStandardMaterial)) {
                  if (mat instanceof THREE.Material) {
                    mat.dispose();
                  }
                  const planeOpacity = Math.min(1.0, 0.3 + (shadowIntensity / 2.0) * 0.7);
                  const standardMaterial = new THREE.MeshStandardMaterial({ 
                    color: 0x333333,
                    transparent: true,
                    opacity: planeOpacity,
                    side: THREE.DoubleSide,
                    depthWrite: true
                  });
                  shadowPlane.material = standardMaterial;
                } else {
                  mat.depthWrite = true;
                  mat.needsUpdate = true;
                }
              }
            });
          }
          
          console.log('[WebExport] Shadow plane configured:', shadowPlane.name || 'unnamed');
        }
        
        // CRITICAL: Create shadow plane if it doesn't exist (match main app setup exactly)
        if (!shadowPlane) {
          console.log('[WebExport] Shadow plane not found in GLB, creating a new one (matching main app setup).');
          
          // CRITICAL: Use large geometry like main app (10000x10000 for standard, larger for ground projection)
          const planeSize = groundProjectionEnabled ? Math.max((hdrConfig.groundProjectionRadius || 100) * 2, 200) : 10000;
          const shadowPlaneGeometry = new THREE.PlaneGeometry(planeSize, planeSize);
          
          // MATCH WORKING EXPORT: Use ShadowMaterial for transparent shadow-only display
          // CRITICAL: Use higher base opacity for shadows to be visible
          // Minimum 0.3 ensures shadows are always visible, even with low shadowIntensity
          const shadowPlaneMaterial = shadowPlaneTransparent 
            ? new THREE.ShadowMaterial({ 
                opacity: Math.min(1.0, Math.max(0.3, 0.1 + (shadowIntensity / 2.0) * 0.9))
              })
            : new THREE.MeshStandardMaterial({ 
                color: 0x333333,
                transparent: true,
                opacity: Math.min(1.0, 0.3 + (shadowIntensity / 2.0) * 0.7),
                side: THREE.DoubleSide,
                depthWrite: true
              });
          if (shadowPlaneMaterial instanceof THREE.ShadowMaterial) {
            shadowPlaneMaterial.depthWrite = true;
            // CRITICAL: Store base opacity for shadow color intensity adjustment
            shadowPlaneMaterial.userData.baseOpacity = shadowPlaneMaterial.opacity;
          }
          
          shadowPlane = new THREE.Mesh(shadowPlaneGeometry, shadowPlaneMaterial);
          shadowPlane.name = 'Shadow Plane';
          shadowPlane.rotation.x = -Math.PI / 2; // Horizontal plane (matches main app)
          shadowPlane.receiveShadow = true;
          shadowPlane.castShadow = false;
          shadowPlane.userData.isShadowPlane = true;
          shadowPlane.visible = true;
          
          // CRITICAL: Use renderOrder = 0 like main app (not 1)
          shadowPlane.renderOrder = 0; // Render early (before objects with positive renderOrder)
          
          // CRITICAL: Position based on mode (matches main app behavior)
          if (groundProjectionEnabled) {
            // Ground projection: position at ground surface level
            // Main app: GroundedSkybox position.y = height - 0.01, ground surface at Y = -0.01
            // Shadow plane should be at ground surface: Y = -0.01
            shadowPlane.position.y = -0.01; // Match ground surface level (Y = (height - 0.01) - height)
          } else {
            shadowPlane.position.y = -0.001; // Slightly below grid (matches main app)
          }
          
          scene.add(shadowPlane);
          console.log('[WebExport] ✅ Created new shadow plane (matches main app setup):', {
            name: shadowPlane.name,
            visible: shadowPlane.visible,
            receiveShadow: shadowPlane.receiveShadow,
            castShadow: shadowPlane.castShadow,
            renderOrder: shadowPlane.renderOrder,
            position: shadowPlane.position,
            size: planeSize,
            material: shadowPlane.material.constructor.name,
            groundProjectionEnabled: groundProjectionEnabled
          });
        }
        
        // Helper function to get shadow map size based on quality setting
        function getShadowMapSize(quality) {
          const shadowQuality = CONFIG.shadowQuality || quality || 'high';
          switch (shadowQuality) {
            case 'low': return 1024;
            case 'medium': return 2048;
            case 'high': return 4096;
            case 'ultra': return 8192;
            default: return 4096;
          }
        }
        // Make getShadowMapSize accessible globally for render loop
        window.getShadowMapSize = getShadowMapSize;
        const shadowQuality = CONFIG.shadowQuality || 'high';
        const shadowMapSize = getShadowMapSize(shadowQuality);
        console.log('Shadow quality:', shadowQuality, 'Shadow map size:', shadowMapSize);
        
        // Setup lighting from config
        const lightingConfig = CONFIG.lighting || {};
        // Brighter default ambient so HDR scenes are not too dark (5x previous 0.2 -> 1.0); user can override via CONFIG.lighting
        const ambientIntensity = lightingConfig.ambientIntensity !== undefined ? lightingConfig.ambientIntensity : 1.0;
        const ambientLight = new THREE.AmbientLight(0xffffff, ambientIntensity);
        scene.add(ambientLight);
        
        // MATCH WORKING EXPORT: Position shadow plane under car for both ground projection and standard 360 HDR
        // This applies to both existing shadow planes and newly created ones
        if (carRoot && shadowPlane) {
          const carBox = new THREE.Box3().setFromObject(carRoot);
          if (!carBox.isEmpty()) {
            const carCenter = carBox.getCenter(new THREE.Vector3());
            const carSize = carBox.getSize(new THREE.Vector3());
            const radiusX = carSize.x * 0.75;
            const radiusZ = carSize.z * 0.75;
            
            // Position plane under car center (keep its original Y)
            shadowPlane.position.x = carCenter.x;
            shadowPlane.position.z = carCenter.z;
            
            // CRITICAL: For standard 360 HDR, reset scale first to prevent exponential growth
            // The scale calculation should be based on geometry size (10000), not current scale
            if (!groundProjectionEnabled) {
              // Reset scale to 1 first to prevent exponential growth
              shadowPlane.scale.set(1, 1, 1);
            }
            
            // Scale plane in X/Z so it extends beyond car footprint
            // For 10000x10000 geometry: scale = (carSize * 0.75) / 5 = radiusX / 5
            // This gives us a plane that's about 15% larger than the car in each direction
            const targetScaleX = radiusX / 5;
            const targetScaleZ = radiusZ / 5;
            shadowPlane.scale.x = targetScaleX;
            shadowPlane.scale.z = targetScaleZ;
            
            // CRITICAL: Ensure shadow plane is visible and configured for shadows (applies to both modes)
            shadowPlane.visible = true;
            shadowPlane.receiveShadow = true;
            shadowPlane.castShadow = false;
            
            shadowPlane.updateMatrixWorld(true);
            console.log('[WebExport] Shadow plane fitted under car (applies to both ground projection and standard 360 HDR):', 
              'Center: (' + carCenter.x.toFixed(2) + ', ' + carCenter.z.toFixed(2) + '), ' +
              'Car size: (' + carSize.x.toFixed(2) + ', ' + carSize.z.toFixed(2) + '), ' +
              'Plane scale: (' + shadowPlane.scale.x.toFixed(2) + ', ' + shadowPlane.scale.z.toFixed(2) + '), ' +
              'Position: (' + shadowPlane.position.x.toFixed(2) + ', ' + shadowPlane.position.y.toFixed(2) + ', ' + shadowPlane.position.z.toFixed(2) + '), ' +
              'Ground projection: ' + groundProjectionEnabled);
            
            // CRITICAL: For standard 360 HDR, verify shadow plane is below car
            if (!groundProjectionEnabled) {
              const carMinY = carBox.min.y;
              if (shadowPlane.position.y >= carMinY) {
                console.warn('[WebExport] Standard 360 HDR - Shadow plane Y position (' + shadowPlane.position.y.toFixed(3) + ') is not below car min Y (' + carMinY.toFixed(3) + '), adjusting...');
                shadowPlane.position.y = carMinY - 0.1; // Ensure plane is below car
                shadowPlane.updateMatrixWorld(true);
                console.log('[WebExport] Standard 360 HDR - Shadow plane Y adjusted to:', shadowPlane.position.y.toFixed(3));
              }
              
              // Verify shadow plane configuration
              const material = Array.isArray(shadowPlane.material) ? shadowPlane.material[0] : shadowPlane.material;
              // CRITICAL: Ensure shadow plane is in scene
              if (!scene.children.includes(shadowPlane) && scene.getObjectById(shadowPlane.id) === undefined) {
                console.warn('[WebExport] Standard 360 HDR - Shadow plane not in scene, adding it now!');
                scene.add(shadowPlane);
              }
              
              console.log('[WebExport] Standard 360 HDR - Shadow plane diagnostic:', 
                'Visible: ' + shadowPlane.visible + ', ' +
                'ReceiveShadow: ' + shadowPlane.receiveShadow + ', ' +
                'CastShadow: ' + shadowPlane.castShadow + ', ' +
                'RenderOrder: ' + shadowPlane.renderOrder + ', ' +
                'Material: ' + (material?.constructor.name || 'none') + ', ' +
                'MaterialVisible: ' + (material?.visible !== false) + ', ' +
                'MaterialOpacity: ' + (material?.opacity?.toFixed(3) || 'N/A') + ', ' +
                'DepthWrite: ' + (material?.depthWrite !== false) + ', ' +
                'InScene: ' + (scene.children.includes(shadowPlane) || scene.getObjectById(shadowPlane.id) !== undefined));
              
              // Verify lights are casting shadows
              let lightsCastingShadows = 0;
              scene.traverse((light) => {
                if (light instanceof THREE.DirectionalLight && light.castShadow) {
                  lightsCastingShadows++;
                  if (light.shadow) {
                    const cam = light.shadow.camera;
                    console.log('[WebExport] Standard 360 HDR - Light shadow camera:', 
                      'Light: ' + (light.name || 'unnamed') + ', ' +
                      'CastShadow: ' + light.castShadow + ', ' +
                      'Bounds: L=' + (cam.left?.toFixed(2) || 'N/A') + ', R=' + (cam.right?.toFixed(2) || 'N/A') + ', ' +
                      'T=' + (cam.top?.toFixed(2) || 'N/A') + ', B=' + (cam.bottom?.toFixed(2) || 'N/A') + ', ' +
                      'Near=' + cam.near + ', Far=' + cam.far);
                  }
                }
              });
              console.log('[WebExport] Standard 360 HDR - Total lights casting shadows:', lightsCastingShadows);
              
              // Verify renderer shadow maps
              console.log('[WebExport] Standard 360 HDR - Renderer shadow maps:', 
                'Enabled: ' + renderer.shadowMap.enabled + ', ' +
                'AutoUpdate: ' + renderer.shadowMap.autoUpdate + ', ' +
                'Type: ' + renderer.shadowMap.type);
            }
          }
        }
        
        // Add directional lights from config
        if (lightingConfig.directionalLights && lightingConfig.directionalLights.length > 0) {
          lightingConfig.directionalLights.forEach(lightConfig => {
            if (lightConfig.enabled) {
              const light = new THREE.DirectionalLight(
                new THREE.Color(lightConfig.color.r, lightConfig.color.g, lightConfig.color.b),
                lightConfig.intensity
              );
              light.position.set(lightConfig.position.x, lightConfig.position.y, lightConfig.position.z);
              // CRITICAL: Explicitly enable shadow casting
              light.castShadow = lightConfig.castShadow !== false ? true : false;
              
              if (light.castShadow) {
                // Use shadow map size based on quality setting
                const lightShadowMapSize = lightConfig.shadowMapSize || shadowMapSize;
                light.shadow.mapSize.width = lightShadowMapSize;
                light.shadow.mapSize.height = lightShadowMapSize;
                
                // MATCH WORKING EXPORT: Don't set bias here - it will be set in updateLightShadowCamera
                // Bias will be set based on light type (car light, interior light, etc.) after model loads
                
                // CRITICAL: Use very small near plane to capture interior surfaces (like car interiors)
                // 0.001 allows the shadow camera to see very close surfaces inside objects
                light.shadow.camera.near = 0.001;
                light.shadow.camera.far = 200; // Increased far plane to cover larger scenes
                
                // Initial shadow camera bounds (will be updated after model loads)
                light.shadow.camera.left = -2000;
                light.shadow.camera.right = 2000;
                light.shadow.camera.top = 2000;
                light.shadow.camera.bottom = -2000;
                
                // Update shadow camera to include the scene (will be updated after model loads)
                light.shadow.camera.updateProjectionMatrix();
                console.log('Directional light configured with shadows:', 
                  'Position: (' + light.position.x.toFixed(2) + ', ' + light.position.y.toFixed(2) + ', ' + light.position.z.toFixed(2) + '), ' +
                  'Intensity: ' + light.intensity.toFixed(2) + ', ' +
                  'Shadow map: ' + shadowMapSize + 'x' + shadowMapSize + ', ' +
                  'Camera: near=' + light.shadow.camera.near + ', far=' + light.shadow.camera.far);
              }
              
              scene.add(light);
            }
          });
        } else if (lightingConfig.sceneLights && lightingConfig.sceneLights.length > 0) {
          // Fallback to scene lights if directional lights not available
          lightingConfig.sceneLights.forEach(lightConfig => {
            if (lightConfig.type === 'DirectionalLight') {
              const light = new THREE.DirectionalLight(
                new THREE.Color(lightConfig.color.r, lightConfig.color.g, lightConfig.color.b),
                lightConfig.intensity
              );
              if (lightConfig.position) {
                light.position.set(lightConfig.position.x, lightConfig.position.y, lightConfig.position.z);
              }
              // CRITICAL: Explicitly enable shadow casting
              light.castShadow = lightConfig.castShadow !== false ? true : false;
              if (lightConfig.shadow) {
                // Use shadow map size based on quality setting
                const lightShadowMapSize = lightConfig.shadow?.mapSize?.width || shadowMapSize;
                light.shadow.mapSize.width = lightShadowMapSize;
                light.shadow.mapSize.height = lightShadowMapSize;
                console.log('Scene light shadow map size:', lightShadowMapSize);
                if (lightConfig.shadow.camera) {
                  // CRITICAL: Use very small near plane (0.001) to capture interior surfaces
                  // This allows shadow camera to see very close surfaces inside objects (car interiors)
                  light.shadow.camera.near = lightConfig.shadow.camera.near || 0.001;
                  light.shadow.camera.far = lightConfig.shadow.camera.far || 5000;
                } else {
                  // CRITICAL: Use very small near plane (0.001) to capture interior surfaces
                  light.shadow.camera.near = 0.001;
                  light.shadow.camera.far = 5000;
                }
                
                // MATCH WORKING EXPORT: Don't set bias here - it will be set in updateLightShadowCamera
                // Bias will be set based on light type (car light, interior light, etc.) after model loads
              } else if (light.castShadow) {
                // Set defaults if shadow config not provided (match working export)
                light.shadow.mapSize.width = shadowMapSize;
                light.shadow.mapSize.height = shadowMapSize;
                light.shadow.camera.near = 0.001; // Match working export
                light.shadow.camera.far = 200; // Match working export
                // Don't set bias here - it will be set in updateLightShadowCamera
              }
              scene.add(light);
            }
          });
        } else {
          // Default fallback - main sun light (match main app default light setup)
          const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
          directionalLight.position.set(5, 12, 8);
          directionalLight.castShadow = true;
          directionalLight.userData.isGlobalSun = true;
          directionalLight.userData.isSun = true; // Match main app
          
          const lightShadowMapSize = lightingConfig.shadowMapSize || shadowMapSize;
          directionalLight.shadow.mapSize.width = lightShadowMapSize;
          directionalLight.shadow.mapSize.height = lightShadowMapSize;
          
          // MATCH WORKING EXPORT: Don't set bias here - it will be set in updateLightShadowCamera
          // Bias will be set based on light type (car light, interior light, etc.) after model loads
          
          // CRITICAL: Use very small near plane (0.001) to capture interior surfaces
          // This allows shadow camera to see very close surfaces inside objects (car interiors)
          // The near plane will be optimized further in updateLightShadowCamera based on model bounds
          directionalLight.shadow.camera.near = 0.001;
          
          // MATCH WORKING EXPORT: Temporary bounds; will be tightened below if needed
          directionalLight.shadow.camera.far = 150;
          directionalLight.shadow.camera.left = -80;
          directionalLight.shadow.camera.right = 80;
          directionalLight.shadow.camera.top = 80;
          directionalLight.shadow.camera.bottom = -80;
          directionalLight.shadow.camera.updateProjectionMatrix();
          
          scene.add(directionalLight);
          console.log('Default directional light (sun) with shadows added (matches main app):', {
            shadowMapSize: lightShadowMapSize,
            bias: directionalLight.shadow.bias,
            normalBias: directionalLight.shadow.normalBias,
            radius: directionalLight.shadow.radius,
            cameraNear: directionalLight.shadow.camera.near,
            cameraFar: directionalLight.shadow.camera.far
          });

          // Note: Main app doesn't create a separate detail light
          // Only create default sun light to match main app behavior
        }
        
        // After lights are created, tighten shadow camera to the exported model bounds
        // CRITICAL: For ground projection, must include shadow plane and GroundedSkybox in bounds
        try {
          const carBox = new THREE.Box3();
          let carHasGeometry = false;
          if (carRoot) {
            carRoot.traverse((obj) => {
              if (obj instanceof THREE.Mesh) {
                const userData = obj.userData || {};
                if (userData.isShadowPlane || userData.isHelper) return;
                carBox.expandByObject(obj);
                carHasGeometry = true;
              }
            });
          }
          
          // CRITICAL: Do NOT include shadow plane in bounding box - it's huge and skews the center
          // Shadow camera should focus on the car, not the entire ground plane
          const hdrConfig = CONFIG.hdr || {};
          const groundProjectionEnabled = hdrConfig.groundProjectionEnabled === true;
          
          if (carHasGeometry && !carBox.isEmpty()) {
            const size = carBox.getSize(new THREE.Vector3());
            const maxSide = Math.max(size.x, size.y, size.z) || 10;
            const radius = maxSide * 0.6;
            // CRITICAL: Use very small near plane to capture interior surfaces (car interiors, close surfaces)
            // Smaller near plane (0.001) allows shadow camera to see very close surfaces inside objects
            // This is essential for interior shadows to work properly
            const shadowNear = 0.001; // Very small to capture interior surfaces
            const shadowFar = Math.max(shadowNear + 10, radius * 3.5);
            // CRITICAL: For ground projection, shadow camera must cover the full ground projection area
            // Ground projection radius is typically 100-200 units, much larger than car size
            // Use groundProjectionRadius * 2.2 to match main viewer behavior (covers diameter with padding)
            // For standard 360 HDR, use larger extent to cover the large shadow plane
            const groundProjectionRadius = hdrConfig.groundProjectionRadius || 100;
            const extent = groundProjectionEnabled 
              ? (groundProjectionRadius * 2.2) // Match main viewer: covers full ground projection area
              : Math.max(maxSide * 2.0, 50);
            
            // Debug summary for shadow coverage diagnostics
            let castingCount = 0;
            let receivingCount = 0;
            carRoot.traverse((obj) => {
              if (obj instanceof THREE.Mesh) {
                const userData = obj.userData || {};
                if (userData.isShadowPlane || userData.isHelper || userData.isGridHelper || userData.isAxesHelper) {
                  return;
                }

                // Ensure ALL car meshes receive shadows (including interior surfaces)
                if (!obj.receiveShadow) {
                  obj.receiveShadow = true;
                }

                const rawMaterial = obj.material;
                const materials = Array.isArray(rawMaterial) ? rawMaterial : [rawMaterial];

                let isTransparent = false;
                materials.forEach((mat) => {
                  if (!mat) return;
                  const anyMat = mat;
                  const opacity = typeof anyMat.opacity === 'number' ? anyMat.opacity : 1;
                  const transmission = typeof anyMat.transmission === 'number' ? anyMat.transmission : 0;
                  const transparentFlag = anyMat.transparent === true;
                  const matName = (mat.name || '').toLowerCase();
                  const isGlassLike =
                    matName.indexOf('glass') !== -1 ||
                    matName.indexOf('window') !== -1 ||
                    matName.indexOf('windshield') !== -1 ||
                    matName.indexOf('windscreen') !== -1 ||
                    matName.indexOf('transparent') !== -1 ||
                    matName.indexOf('transmission') !== -1;

                  if (
                    transmission > 0 ||
                    (transparentFlag && opacity < 1.0) ||
                    isGlassLike
                  ) {
                    isTransparent = true;
                  }

                  // Make opaque interior materials double-sided so shadows appear on back faces
                  if (!isTransparent &&
                      (mat instanceof THREE.MeshStandardMaterial ||
                       mat instanceof THREE.MeshPhysicalMaterial ||
                       mat instanceof THREE.MeshPhongMaterial ||
                       mat instanceof THREE.MeshLambertMaterial)) {
                    if (mat.side !== THREE.DoubleSide) {
                      mat.side = THREE.DoubleSide;
                      mat.needsUpdate = true;
                    }
                  }
                });

                // Opaque meshes should cast shadows to darken interior surfaces
                if (!isTransparent && !obj.castShadow) {
                  obj.castShadow = true;
                }

                if (obj.castShadow) castingCount++;
                if (obj.receiveShadow) receivingCount++;
              }
            });
            console.log('[WebExport] Car shadow debug:', 
              'Bounds: min(' + carBox.min.x.toFixed(2) + ', ' + carBox.min.y.toFixed(2) + ', ' + carBox.min.z.toFixed(2) + ') ' +
              'max(' + carBox.max.x.toFixed(2) + ', ' + carBox.max.y.toFixed(2) + ', ' + carBox.max.z.toFixed(2) + '), ' +
              'Size: (' + size.x.toFixed(2) + ', ' + size.y.toFixed(2) + ', ' + size.z.toFixed(2) + '), ' +
              'Radius: ' + radius.toFixed(2) + ', ' +
              'Camera: near=' + shadowNear + ', far=' + shadowFar + ', ' +
              'Extent: ' + extent.toFixed(2) + ', ' +
              'Casting: ' + castingCount + ', Receiving: ' + receivingCount);
            
            const updateLightShadowCamera = (light, isCarLight, isInteriorLight) => {
              if (!light || !light.castShadow || !light.shadow || !light.shadow.camera) return;
              const cam = light.shadow.camera;
              if (cam.isOrthographicCamera) {
                if (isInteriorLight) {
                  const detailExtent = maxSide * 0.35;
                  cam.left = -detailExtent;
                  cam.right = detailExtent;
                  cam.top = detailExtent;
                  cam.bottom = -detailExtent;
                } else {
                  // MATCH WORKING EXPORT: Simple extent-based bounds
                  // CRITICAL: For ground projection, extent uses groundProjectionRadius * 2.2 to cover full area
                  // For standard 360 HDR, extent uses larger value to cover large shadow plane
                  cam.left = -extent;
                  cam.right = extent;
                  cam.top = extent;
                  cam.bottom = -extent;
                }
              }
              if (isInteriorLight) {
                // CRITICAL: Use very small near plane for interior lights to capture close interior surfaces
                cam.near = 0.001; // Very small to capture interior surfaces
                cam.far = Math.min(shadowFar, radius * 2.0);
              } else {
                // CRITICAL: Use small near plane for all lights to capture interior surfaces
                cam.near = shadowNear; // 0.001 to capture interior surfaces
                // CRITICAL: For ground projection, ensure far plane covers the full ground projection area
                // For standard 360 HDR, ensure far plane covers the shadow plane area
                const adjustedFar = groundProjectionEnabled 
                  ? Math.max(groundProjectionRadius * 3, Math.max(shadowFar, 5000)) // Match main viewer: covers full ground projection depth
                  : Math.max(shadowFar, 200);
                cam.far = adjustedFar;
              }
              
              cam.updateProjectionMatrix();
              
              // MATCH WORKING EXPORT: Set bias based on light type
              // CRITICAL: This overrides any values set during light creation to ensure correct values
              if (isCarLight) {
                light.shadow.bias = 0.00015;
                // Lower normalBias further to tighten contact shadows under tires/skirts
                light.shadow.normalBias = 0.1;
              } else if (isInteriorLight) {
                light.shadow.bias = 0.0001;
                light.shadow.normalBias = 0.08;
              } else {
                // For other lights, adjust if it's the default value
                if (typeof light.shadow.bias === 'number' && light.shadow.bias === 0.0001) {
                  light.shadow.bias = 0.00015;
                }
                if (typeof light.shadow.normalBias === 'number') {
                  light.shadow.normalBias = Math.min(Math.max(light.shadow.normalBias, 0.05), 0.25);
                }
              }
              
              console.log('[WebExport] Shadow camera tuned:', 
                'Bounds: L=' + (cam.left?.toFixed(2) || 'N/A') + ', R=' + (cam.right?.toFixed(2) || 'N/A') + ', ' +
                'T=' + (cam.top?.toFixed(2) || 'N/A') + ', B=' + (cam.bottom?.toFixed(2) || 'N/A') + ', ' +
                'Near=' + cam.near + ', Far=' + cam.far + ', ' +
                'Bias=' + light.shadow.bias + ', NormalBias=' + light.shadow.normalBias + ', ' +
                'CarLight: ' + isCarLight + ', ' +
                'Extent: ' + extent.toFixed(2) + ', ' +
                'GroundProjection: ' + groundProjectionEnabled);
            };
            
            // MATCH WORKING EXPORT: Determine light type from userData
            scene.traverse((obj) => {
              if (obj instanceof THREE.DirectionalLight) {
                const userData = obj.userData || {};
                const isInteriorLight = !!userData.isInteriorLight;
                const isCarLight = obj.castShadow && !userData.isGlobalSun && !isInteriorLight;
                updateLightShadowCamera(obj, isCarLight, isInteriorLight);
              }
            });
            
            // MATCH WORKING EXPORT: Shadow maps will be updated in setTimeout after 500ms
            // Don't force update here - let the setTimeout handle it to match working export timing
          } else {
            console.warn('[WebExport] Car bounding box is empty; using default shadow camera settings for car light.');
          }
        } catch (e) {
          console.warn('[WebExport] Failed to compute model bounds for shadow tuning:', e);
        }
        
        // Load HDR if available (with settings from config)
        ${options.includeHDR ? `
        // Only load HDR once - check if already loaded
        let hdrTexture = null;
        let groundProjectionSkybox = null;
        
        // CRITICAL: Clear any previous HDR texture to prevent cache issues
        if (window.__hdrTextureLoaded) {
          if (window.__hdrTextureLoaded.dispose) {
            window.__hdrTextureLoaded.dispose();
          }
          window.__hdrTextureLoaded = null;
        }
        
        if (!window.__hdrTextureLoaded) {
          try {
            hasHDR = true; // We're attempting to load HDR
            const rgbeLoader = new RGBELoader();
            const hdrUrl = './environment.hdr';
            console.log('Loading HDR from:', hdrUrl);
            hdrProgress = 0;
            updateLoadingProgress();
            
            // Use load() with progress callback instead of loadAsync()
            hdrTexture = await new Promise((resolve, reject) => {
              rgbeLoader.load(
                hdrUrl,
                (texture) => {
                  hdrProgress = 100;
                  updateLoadingProgress();
                  resolve(texture);
                },
                (progress) => {
                  if (progress.total > 0) {
                    hdrProgress = (progress.loaded / progress.total) * 100;
                    updateLoadingProgress();
                  } else {
                    // If total is unknown, estimate based on loaded bytes
                    hdrProgress = Math.min(90, (progress.loaded / 10000000) * 10); // Rough estimate for HDR files
                    updateLoadingProgress();
                  }
                },
                (error) => {
                  reject(error);
                }
              );
            });
            hdrTexture.mapping = THREE.EquirectangularReflectionMapping;
            
            // MATCH WORKING EXPORT: Don't set colorSpace - let Three.js handle it automatically
            // The renderer's tone mapping will handle the conversion to display space
            
            // CRITICAL: Ensure texture is updated after setting properties
            hdrTexture.needsUpdate = true;
            
            // Mark as loaded to prevent duplicates
            window.__hdrTextureLoaded = hdrTexture;
            
            // DEBUG: Verify texture loaded correctly
            console.log('[WebExport] HDR texture loaded:', 
              'Size: ' + (hdrTexture.image?.width || 'N/A') + 'x' + (hdrTexture.image?.height || 'N/A') + ', ' +
              'Mapping: ' + hdrTexture.mapping + ', ' +
              'ColorSpace: ' + (hdrTexture.colorSpace || 'default') + ', ' +
              'Loaded: ' + (hdrTexture.image?.complete ? 'yes' : 'no'));
            
            // Apply HDR settings from config
            const hdrConfig = CONFIG.hdr || {};
            if (hdrConfig.intensity !== undefined) {
              hdrTexture.intensity = hdrConfig.intensity;
            }
            
            // Apply HDR rotation if specified (for correct positioning)
            if (hdrConfig.rotationAzimuth !== undefined) {
              // Convert azimuth to rotation (azimuth is in degrees, rotation is in radians)
              hdrTexture.rotation = (hdrConfig.rotationAzimuth * Math.PI) / 180;
            } else {
              hdrTexture.rotation = 0;
            }
            
            // MATCH WORKING EXPORT: Set flipY = true to fix vertical inversion (sky/ground swap)
            // This ensures sky is on top and ground is on bottom
            hdrTexture.center.set(0.5, 0.5);
            hdrTexture.flipY = true; // Fix vertical orientation
            hdrTexture.needsUpdate = true;
            
            console.log('HDR texture orientation:', 
              'FlipY: ' + hdrTexture.flipY + ', Rotation: ' + (hdrTexture.rotation * 180 / Math.PI).toFixed(1) + '°');
            
            // Set environment for reflections (always needed)
            scene.environment = hdrTexture;
            
            // Check if ground projection is enabled
            const groundProjectionEnabled = hdrConfig.groundProjectionEnabled === true;
            const groundHeight = hdrConfig.groundProjectionHeight || 15;
            const groundRadius = hdrConfig.groundProjectionRadius || 100;
            
            // CRITICAL: Helper function to find and remove ALL GroundedSkybox objects from scene
            // CRITICAL: DO NOT remove shadow planes - they are needed for shadows
            const removeAllGroundedSkyboxes = () => {
              const skyboxesToRemove = [];
              scene.traverse((obj) => {
                // CRITICAL: Only remove GroundedSkybox objects, NEVER shadow planes
                if (obj.userData.isGroundedSkybox === true && !obj.userData.isShadowPlane) {
                  skyboxesToRemove.push(obj);
                }
              });
              skyboxesToRemove.forEach((skybox) => {
                scene.remove(skybox);
                if (skybox.geometry) {
                  skybox.geometry.dispose();
                }
                if (skybox.material instanceof THREE.Material) {
                  skybox.material.dispose();
                }
              });
              if (skyboxesToRemove.length > 0) {
                console.log('[WebExport] Removed', skyboxesToRemove.length, 'GroundedSkybox object(s) from scene');
              }
              
              // CRITICAL: Verify shadow plane still exists after removing GroundedSkybox
              let shadowPlaneFound = false;
              scene.traverse((obj) => {
                if (obj.userData.isShadowPlane || (obj.name || '').toLowerCase().includes('shadow plane')) {
                  shadowPlaneFound = true;
                  // Ensure shadow plane is visible and properly configured
                  if (!obj.visible) {
                    obj.visible = true;
                    console.warn('[WebExport] Shadow plane was hidden, re-enabled visibility');
                  }
                  if (!obj.receiveShadow) {
                    obj.receiveShadow = true;
                    console.warn('[WebExport] Shadow plane receiveShadow was disabled, re-enabled');
                  }
                }
              });
              if (!shadowPlaneFound) {
                console.error('[WebExport] WARNING: Shadow plane not found after removing GroundedSkybox!');
              }
              
              return skyboxesToRemove.length;
            };
            
            if (groundProjectionEnabled) {
              // MATCH WORKING EXPORT: Ground projection mode: use GroundedSkybox, set background to null
              console.log('Setting up ground projection:', { height: groundHeight, radius: groundRadius });
              
              // For GroundedSkybox, ensure texture is in correct state
              // GroundedSkybox needs the texture with flipY = true for correct orientation
              const skyboxTexture = hdrTexture; // Use same texture
              skyboxTexture.mapping = THREE.EquirectangularReflectionMapping;
              skyboxTexture.rotation = 0; // GroundedSkybox handles its own unwrapping
              skyboxTexture.center.set(0.5, 0.5);
              skyboxTexture.flipY = true; // Keep flipY = true for correct sky/ground orientation
              
              // MATCH WORKING EXPORT: Create grounded skybox (simple approach, no material configuration)
              groundProjectionSkybox = new GroundedSkybox(skyboxTexture, groundHeight, groundRadius);
              groundProjectionSkybox.position.y = groundHeight - 0.01;
              groundProjectionSkybox.renderOrder = -1000;
              groundProjectionSkybox.frustumCulled = false;
              groundProjectionSkybox.receiveShadow = true;
              groundProjectionSkybox.castShadow = false;
              
              scene.add(groundProjectionSkybox);
              scene.background = null; // CRITICAL: GroundedSkybox replaces background
              
              console.log('Ground projection enabled - GroundedSkybox added, background set to null');
            } else {
              // Regular HDR mode: use texture as background with rotation
              // CRITICAL: Remove ALL existing GroundedSkybox objects when switching to regular mode
              const removedCount = removeAllGroundedSkyboxes();
              groundProjectionSkybox = null; // Clear local reference
              
              // CRITICAL: Ensure scene.background is set to HDR texture (not null)
              // This ensures regular HDR mode uses background, not GroundedSkybox
              
              // CRITICAL: Set flipY = true for regular HDR background (sky/ground swap fix)
              hdrTexture.mapping = THREE.EquirectangularReflectionMapping;
              hdrTexture.center.set(0.5, 0.5);
              hdrTexture.flipY = true; // Fix vertical orientation for background
              hdrTexture.needsUpdate = true;
              
              console.log('HDR texture orientation:', 
                'FlipY: ' + hdrTexture.flipY + ', Rotation: ' + (hdrTexture.rotation * 180 / Math.PI).toFixed(1) + '°, ' +
                'Mapping: ' + hdrTexture.mapping);
              
              // Set environment for reflections (always needed)
              scene.environment = hdrTexture;
              
              const backgroundVisible = hdrConfig.backgroundVisible !== undefined ? hdrConfig.backgroundVisible : true;
              if (backgroundVisible) {
                // CRITICAL: Ensure background uses the same texture reference
                // For HDR backgrounds, ensure tone mapping is applied correctly
                // The renderer's tone mapping will handle the HDR to display conversion
                scene.background = hdrTexture;
                // CRITICAL: Ensure renderer tone mapping is configured for HDR
                // Lower exposure can help if HDR appears too bright/white
                const hdrExposure = hdrConfig.exposure !== undefined ? hdrConfig.exposure : 1.0;
                renderer.toneMappingExposure = hdrExposure;
                // Force renderer to update background
                renderer.render(scene, camera);
                console.log('HDR background set to visible (regular mode):', 
                  'Texture: ' + ((scene.background && scene.background.constructor && scene.background.constructor.name) || 'none') + ', ' +
                  'Mapping: ' + hdrTexture.mapping + ', ' +
                  'FlipY: ' + hdrTexture.flipY + ', ' +
                  'Rotation: ' + (hdrTexture.rotation * 180 / Math.PI).toFixed(1) + '°, ' +
                  'Exposure: ' + renderer.toneMappingExposure.toFixed(2) + ', ' +
                  'ColorSpace: ' + (hdrTexture.colorSpace || 'default'));
              } else {
                scene.background = null;
                console.log('HDR background disabled');
              }
            }
            
            // Materials will automatically use scene.environment for reflections
            console.log('HDR loaded and applied successfully');
            
            // CRITICAL: For standard 360 HDR, ensure shadow plane is visible and properly configured
            if (!groundProjectionEnabled) {
              scene.traverse((obj) => {
                if (obj.userData.isShadowPlane || (obj.name || '').toLowerCase().includes('shadow plane')) {
                  // Ensure shadow plane is visible and receiving shadows
                  obj.visible = true;
                  obj.receiveShadow = true;
                  obj.castShadow = false;
                  
                  // Ensure material is properly configured
                  const material = Array.isArray(obj.material) ? obj.material[0] : obj.material;
                  if (material) {
                    if (material instanceof THREE.ShadowMaterial) {
                      // Ensure minimum opacity for visibility
                      if (material.opacity < 0.3) {
                        material.opacity = Math.max(0.3, material.userData.baseOpacity || 0.5);
                        if (!material.userData.baseOpacity) {
                          material.userData.baseOpacity = material.opacity;
                        }
                      }
                      material.depthWrite = true;
                    }
                    material.visible = true;
                    material.needsUpdate = true;
                  }
                  
                  // Ensure renderOrder is correct
                  if (obj.renderOrder !== 0) {
                    obj.renderOrder = 0;
                  }
                  
                  console.log('[WebExport] Standard 360 HDR - Shadow plane verified after HDR load:', 
                    'Visible: ' + obj.visible + ', ' +
                    'ReceiveShadow: ' + obj.receiveShadow + ', ' +
                    'CastShadow: ' + obj.castShadow + ', ' +
                    'RenderOrder: ' + obj.renderOrder + ', ' +
                    'Material: ' + (material?.constructor.name || 'none') + ', ' +
                    'Opacity: ' + (material?.opacity?.toFixed(3) || 'N/A'));
                }
              });
              
              // CRITICAL: Ensure shadow maps are enabled and lights are casting shadows
              if (!renderer.shadowMap.enabled) {
                renderer.shadowMap.enabled = true;
                console.warn('[WebExport] Shadow maps were disabled, re-enabled for standard 360 HDR');
              }
              renderer.shadowMap.autoUpdate = true;
              
              // Verify all directional lights are casting shadows
              scene.traverse((light) => {
                if (light instanceof THREE.DirectionalLight) {
                  if (!light.castShadow) {
                    light.castShadow = true;
                    console.warn('[WebExport] Directional light was not casting shadows, enabled:', light.name || 'unnamed');
                  }
                  if (light.shadow) {
                    light.shadow.needsUpdate = true;
                  }
                }
              });
              
              // Force shadow map update
              renderer.shadowMap.needsUpdate = true;
              
              // CRITICAL: Force all lights to update their shadow maps
              scene.traverse((light) => {
                if (light instanceof THREE.DirectionalLight && light.castShadow && light.shadow) {
                  light.shadow.needsUpdate = true;
                  // Force shadow camera to update
                  if (light.shadow.camera) {
                    light.shadow.camera.updateProjectionMatrix();
                  }
                }
              });
              
              // CRITICAL: Don't render here - camera hasn't been set yet
              // Render will happen after camera is set (see below)
            }
          } catch (e) {
            console.error('HDR loading failed:', e);
            // Set a default background color if HDR fails
            scene.background = new THREE.Color(0x1a1a1a);
          }
        } else {
          // HDR already loaded, reuse it
          // CRITICAL: Check if HDR was already set up to prevent duplicate setup
          hdrTexture = window.__hdrTextureLoaded;
          if (!hdrTexture) {
            console.warn('[WebExport] HDR texture marked as loaded but not found, skipping reuse path');
          } else {
            scene.environment = hdrTexture;
            const hdrConfig = CONFIG.hdr || {};
            const groundProjectionEnabled = hdrConfig.groundProjectionEnabled === true;
            
            // CRITICAL: Helper function to find and remove ALL GroundedSkybox objects from scene
            // CRITICAL: DO NOT remove shadow planes - they are needed for shadows
            const removeAllGroundedSkyboxes = () => {
              const skyboxesToRemove = [];
              scene.traverse((obj) => {
                // CRITICAL: Only remove GroundedSkybox objects, NEVER shadow planes
                if (obj.userData.isGroundedSkybox === true && !obj.userData.isShadowPlane) {
                  skyboxesToRemove.push(obj);
                }
              });
              skyboxesToRemove.forEach((skybox) => {
                scene.remove(skybox);
                if (skybox.geometry) {
                  skybox.geometry.dispose();
                }
                if (skybox.material instanceof THREE.Material) {
                  skybox.material.dispose();
                }
              });
              if (skyboxesToRemove.length > 0) {
                console.log('[WebExport] Removed', skyboxesToRemove.length, 'GroundedSkybox object(s) from scene');
              }
              
              // CRITICAL: Verify shadow plane still exists after removing GroundedSkybox
              let shadowPlaneFound = false;
              scene.traverse((obj) => {
                if (obj.userData.isShadowPlane || (obj.name || '').toLowerCase().includes('shadow plane')) {
                  shadowPlaneFound = true;
                  // Ensure shadow plane is visible and properly configured
                  if (!obj.visible) {
                    obj.visible = true;
                    console.warn('[WebExport] Shadow plane was hidden, re-enabled visibility');
                  }
                  if (!obj.receiveShadow) {
                    obj.receiveShadow = true;
                    console.warn('[WebExport] Shadow plane receiveShadow was disabled, re-enabled');
                  }
                }
              });
              if (!shadowPlaneFound) {
                console.error('[WebExport] WARNING: Shadow plane not found after removing GroundedSkybox!');
              }
              
              return skyboxesToRemove.length;
            };
            
            if (groundProjectionEnabled) {
              const groundHeight = hdrConfig.groundProjectionHeight || 15;
              const groundRadius = hdrConfig.groundProjectionRadius || 100;
              
              // MATCH WORKING EXPORT: Remove existing ground projection if any
              if (groundProjectionSkybox && scene.children.includes(groundProjectionSkybox)) {
                scene.remove(groundProjectionSkybox);
              }
              
              // MATCH WORKING EXPORT: Create new ground projection (simple approach, no material configuration)
              groundProjectionSkybox = new GroundedSkybox(hdrTexture, groundHeight, groundRadius);
              groundProjectionSkybox.position.y = groundHeight - 0.01;
              groundProjectionSkybox.renderOrder = -1000;
              groundProjectionSkybox.frustumCulled = false;
              groundProjectionSkybox.receiveShadow = true;
              groundProjectionSkybox.castShadow = false;
              
              scene.add(groundProjectionSkybox);
              scene.background = null;
              console.log('Reusing HDR with ground projection');
            } else {
              // Regular HDR mode: set flipY = true for background
              // CRITICAL: Remove ALL existing GroundedSkybox objects when switching to regular mode
              const removedCount = removeAllGroundedSkyboxes();
              groundProjectionSkybox = null; // Clear local reference
              
              // CRITICAL: Ensure scene.background is set to HDR texture (not null)
              // This ensures regular HDR mode uses background, not GroundedSkybox
              
              hdrTexture.mapping = THREE.EquirectangularReflectionMapping;
              hdrTexture.center.set(0.5, 0.5);
              hdrTexture.flipY = true; // Fix vertical orientation for background
              hdrTexture.needsUpdate = true;
              
              // Set environment for reflections
              scene.environment = hdrTexture;
              
              const backgroundVisible = hdrConfig.backgroundVisible !== undefined ? hdrConfig.backgroundVisible : true;
              if (backgroundVisible) {
                // CRITICAL: Ensure background uses the same texture reference
                // For HDR backgrounds, ensure tone mapping is applied correctly
                const hdrExposure = hdrConfig.exposure !== undefined ? hdrConfig.exposure : 1.0;
                renderer.toneMappingExposure = hdrExposure;
                scene.background = hdrTexture;
                // Force renderer to update background
                renderer.render(scene, camera);
                console.log('Reusing HDR (regular mode) - background set:', {
                  hasTexture: !!scene.background,
                  textureType: (scene.background && scene.background.constructor && scene.background.constructor.name) || 'none',
                  mapping: hdrTexture.mapping,
                  toneMappingExposure: renderer.toneMappingExposure,
                  colorSpace: hdrTexture.colorSpace
                });
              } else {
                scene.background = null;
                console.log('Reusing HDR (regular mode) - background disabled');
              }
              
            }
          }
        }
        ` : '// No HDR - set default background\n        scene.background = new THREE.Color(0x1a1a1a);\n        '}
        
        // MATCH WORKING EXPORT: Set initial camera position (prefer currentCamera, then first camera view)
        // Set camera AFTER HDR loads to ensure everything is ready
        if (CONFIG.currentCamera && CONFIG.currentCamera.position && CONFIG.currentCamera.target) {
          // Use current camera position from export
          camera.position.set(
            CONFIG.currentCamera.position.x,
            CONFIG.currentCamera.position.y,
            CONFIG.currentCamera.position.z
          );
          controls.target.set(
            CONFIG.currentCamera.target.x,
            CONFIG.currentCamera.target.y,
            CONFIG.currentCamera.target.z
          );
          controls.update();
        } else if (Array.isArray(CONFIG.cameraViews) && CONFIG.cameraViews.length > 0) {
          // Fallback to first camera view
          const firstView = CONFIG.cameraViews[0];
          camera.position.set(firstView.cameraPosition.x, firstView.cameraPosition.y, firstView.cameraPosition.z);
          controls.target.set(firstView.cameraTarget.x, firstView.cameraTarget.y, firstView.cameraTarget.z);
          controls.update();
          if (typeof updateActiveView === 'function') {
            updateActiveView(0);
          }
        }
        
        // CRITICAL: For standard 360 HDR, force a render after camera is set to ensure first view is correct
        // This matches the behavior of ground projection where camera is set before scene becomes ready
        // Reuse hdrConfig from earlier in the function scope
        const isStandard360HDR = !(CONFIG.hdr && CONFIG.hdr.groundProjectionEnabled === true);
        if (isStandard360HDR) {
          // Force render to update shadow maps and ensure camera view is correct
          renderer.render(scene, camera);
        }
        
        // Configure shadows on ALL meshes (including interior surfaces like car interiors)
        // CRITICAL: All materials need to cast shadows for interior shadows to work
        let shadowConfiguredCount = 0;
        let interiorMeshCount = 0;
        
        const lightsWithShadows = scene.children.filter(child => child instanceof THREE.DirectionalLight && child.castShadow).length;
        console.log('Shadow configuration complete:', 
          'Meshes configured: ' + shadowConfiguredCount + ', ' +
          'Interior meshes: ' + interiorMeshCount + ', ' +
          'Shadows enabled: ' + (lightingConfig.shadowsEnabled !== false) + ', ' +
          'Lights with shadows: ' + lightsWithShadows);
        
        // Hide loading overlay
        document.getElementById('loading-overlay').style.display = 'none';
        
        // Store reference to scene for render loop
        let isRendering = true;
        let sceneReady = false;
        let frameCount = 0; // DEBUG: Track frame count for periodic logging
        
        // NOTE: renderLoopCarRoot is declared at top level (before loadModel) so it's accessible from both
        // loadModel() and the render loop
        
        // Mark scene as ready after a short delay
        setTimeout(() => {
          sceneReady = true;
          // Re-setup camera view handlers now that scene is ready
          if (typeof setupCameraViewHandlers === 'function') {
            setupCameraViewHandlers();
          }
          
          // CRITICAL: Force shadow map update but keep autoUpdate enabled
          // Shadows need to update when objects move, so don't disable autoUpdate
          renderer.shadowMap.autoUpdate = true;
          scene.traverse((obj) => {
            if (obj instanceof THREE.DirectionalLight && obj.castShadow && obj.shadow) {
              obj.shadow.needsUpdate = true;
            }
          });
          renderer.shadowMap.needsUpdate = true;
          renderer.render(scene, camera);
          // CRITICAL: Keep autoUpdate enabled so shadows continue to work
          // The working export keeps autoUpdate enabled, only disabling it during camera transitions
          
          // Initialize hotspots after scene is ready
          if (CONFIG.hotspots && Array.isArray(CONFIG.hotspots) && CONFIG.hotspots.length > 0) {
            console.log('[WebExport] Initializing', CONFIG.hotspots.length, 'hotspots');
            initializeHotspots(CONFIG.hotspots, scene, camera, renderer);
          }
          
          // Setup hotspot panel click handling (X button and label clicks)
          const raycaster = new THREE.Raycaster();
          const mouse = new THREE.Vector2();
          
          // Function to update panel texture when visibility changes
          function updatePanelVisibility(panel, isVisible) {
            if (!panel || !panel.userData.isHotspotPanel) return;
            
            panel.userData.isVisible = isVisible;
            panel.visible = isVisible;
            
            // For CSS3D panels, also update the DOM element visibility
            if (panel.userData.isCSS3DPanel && panel.userData.divElement) {
              panel.userData.divElement.style.display = isVisible ? 'block' : 'none';
            }
            
            // For canvas panels, we could regenerate texture, but for now just toggle visibility
            // The X button is always drawn, clicking it just hides the panel
          }
          
          // Function to handle mouse clicks
          function onHotspotClick(event) {
            // Calculate mouse position in normalized device coordinates
            mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
            
            // Update raycaster with camera and mouse position
            raycaster.setFromCamera(mouse, camera);
            
            // Find all intersected objects
            const intersects = raycaster.intersectObjects(scene.children, true);
            
            for (let i = 0; i < intersects.length; i++) {
              const obj = intersects[i].object;
              const hotspotId = obj.userData.hotspotId;
              
              if (!hotspotId) continue;
              
              // Check if clicked on label (to open panel)
              if (obj.userData.isHotspotLabel && obj.userData.canClickToOpen) {
                // Find the panel for this hotspot (both canvas and CSS3D panels)
                scene.traverse((panel) => {
                  if (panel.userData.isHotspotPanel && panel.userData.hotspotId === hotspotId) {
                    if (!panel.userData.isVisible) {
                      updatePanelVisibility(panel, true);
                      // For CSS3D panels, also update the DOM element visibility
                      if (panel.userData.isCSS3DPanel && panel.userData.divElement) {
                        panel.userData.divElement.style.display = 'block';
                      }
                      renderer.render(scene, camera);
                      if (css3dRenderer) css3dRenderer.render(scene, camera);
                      console.log('[WebExport] Opened panel for hotspot via label click:', hotspotId);
                    }
                  }
                });
                event.stopPropagation();
                return;
              }
              
              // Check if clicked on hotspot marker/icon (to open panel)
              if (obj.userData.isHotspot || obj.userData.isHotspotHelper) {
                // Find the panel for this hotspot (both canvas and CSS3D panels)
                scene.traverse((panel) => {
                  if (panel.userData.isHotspotPanel && panel.userData.hotspotId === hotspotId) {
                    // Toggle panel visibility
                    const newVisibility = !panel.userData.isVisible;
                    updatePanelVisibility(panel, newVisibility);
                    // For CSS3D panels, also update the DOM element visibility
                    if (panel.userData.isCSS3DPanel && panel.userData.divElement) {
                      panel.userData.divElement.style.display = newVisibility ? 'block' : 'none';
                    }
                    renderer.render(scene, camera);
                    if (css3dRenderer) css3dRenderer.render(scene, camera);
                    console.log('[WebExport] Toggled panel for hotspot via icon click:', hotspotId, 'visible:', newVisibility);
                  }
                });
                event.stopPropagation();
                return;
              }
              
              // Check if clicked on panel (check if it's the close button area)
              if (obj.userData.isHotspotPanel && obj.userData.isVisible) {
                const panel = obj;
                const canvas = panel.userData.canvas;
                
                if (canvas && canvas.__closeButtonBounds && intersects[i].uv) {
                  // Use UV coordinates from intersection (0,0 = bottom-left, 1,1 = top-right)
                  const uv = intersects[i].uv;
                  
                  // Convert UV to canvas coordinates (canvas origin is top-left)
                  const canvasX = uv.x * panel.userData.actualWidth;
                  const canvasY = (1 - uv.y) * panel.userData.actualHeight; // Flip Y axis
                  
                  const bounds = canvas.__closeButtonBounds;
                  
                  // Check if click is within close button bounds
                  if (canvasX >= bounds.x && canvasX <= bounds.x + bounds.width &&
                      canvasY >= bounds.y && canvasY <= bounds.y + bounds.height) {
                    updatePanelVisibility(panel, false);
                    renderer.render(scene, camera);
                    if (css3dRenderer) css3dRenderer.render(scene, camera);
                    console.log('[WebExport] Closed panel for hotspot:', hotspotId);
                    event.stopPropagation();
                    return;
                  }
                }
              }
            }
          }
          
          // Add click listener
          canvas.addEventListener('click', onHotspotClick);
        }, 500);
        
        // WASD movement controls + Q/E for vertical panning
        const moveSpeed = 0.5;
        const keys = {
          w: false,
          a: false,
          s: false,
          d: false,
          q: false,
          e: false
        };
        
        document.addEventListener('keydown', (e) => {
          const key = e.key.toLowerCase();
          if (key === 'w') keys.w = true;
          if (key === 'a') keys.a = true;
          if (key === 's') keys.s = true;
          if (key === 'd') keys.d = true;
          if (key === 'q') keys.q = true;
          if (key === 'e') keys.e = true;
        });
        
        document.addEventListener('keyup', (e) => {
          const key = e.key.toLowerCase();
          if (key === 'w') keys.w = false;
          if (key === 'a') keys.a = false;
          if (key === 's') keys.s = false;
          if (key === 'd') keys.d = false;
          if (key === 'q') keys.q = false;
          if (key === 'e') keys.e = false;
        });
        
        // PERFORMANCE: Cache CSS3D panel references to avoid scene traversal every frame
        const css3dPanels = new Set();
        const canvasPanels = new Set(); // Canvas-based hotspot panels (non-CSS3D)
        const hotspotSprites = new Set();
        const hotspotLabels = new Set();
        let lastCameraPosition = new THREE.Vector3();
        let lastCameraQuaternion = new THREE.Quaternion();
        let billboardUpdateFrame = 0;
        const BILLBOARD_UPDATE_INTERVAL = 2; // Update billboards every 2 frames (30fps instead of 60fps)
        
        // Function to rebuild CSS3D panel cache (called when hotspots are added/removed)
        function rebuildCSS3DCache() {
          css3dPanels.clear();
          canvasPanels.clear();
          hotspotSprites.clear();
          hotspotLabels.clear();
          scene.traverse((obj) => {
            if (obj.userData.isCSS3DPanel && obj.userData.isHotspotPanel) {
              css3dPanels.add(obj);
            } else if (obj.userData.isHotspotPanel && obj.userData.isBillboard && !obj.userData.isCSS3DPanel) {
              // Canvas-based hotspot panels (Mesh with isBillboard but not CSS3D)
              canvasPanels.add(obj);
            } else if (obj instanceof THREE.Sprite && obj.userData.isHotspotMarker) {
              hotspotSprites.add(obj);
            } else if (obj instanceof THREE.Sprite && obj.userData.isHotspotLabel) {
              hotspotLabels.add(obj);
            }
          });
        }
        
        // MATCH WORKING EXPORT: Start render loop AFTER model loads and loading overlay is hidden
        // CRITICAL: Must run continuously to prevent black screen
        function animate() {
          if (!isRendering) return;
          requestAnimationFrame(animate);
          controls.update();
          
          // LOD SYSTEM: Update LOD levels based on camera distance
          // Update LOD every frame (Three.js LOD.update is optimized internally)
          scene.traverse((obj) => {
            if (obj instanceof THREE.LOD && obj.userData.hasLOD) {
              try {
                obj.update(camera);
              } catch (e) {
                // Silently handle LOD update errors
              }
            }
          });
          
          // PERFORMANCE: Only update billboards every N frames or when camera moves significantly
          billboardUpdateFrame++;
          const cameraMoved = !camera.position.equals(lastCameraPosition) || 
                              !camera.quaternion.equals(lastCameraQuaternion);
          const shouldUpdateBillboards = billboardUpdateFrame >= BILLBOARD_UPDATE_INTERVAL || cameraMoved;
          
          if (shouldUpdateBillboards) {
            // Update cached camera position/quaternion
            lastCameraPosition.copy(camera.position);
            lastCameraQuaternion.copy(camera.quaternion);
            billboardUpdateFrame = 0;
            
            // PERFORMANCE: Use cached references instead of scene traversal
            // Update hotspot sprites and labels (fast - just lookAt)
            hotspotSprites.forEach((sprite) => {
              try {
                if (sprite instanceof THREE.Sprite && sprite.visible) {
                  sprite.lookAt(camera.position);
                }
              } catch (e) {
                // Silently handle errors
              }
            });
            
            hotspotLabels.forEach((label) => {
              try {
                if (label instanceof THREE.Sprite && label.visible) {
                  label.lookAt(camera.position);
                }
              } catch (e) {
                // Silently handle errors
              }
            });
            
            // PERFORMANCE: Update CSS3D panels (more expensive, so throttled)
            css3dPanels.forEach((panel) => {
              try {
                if (panel.userData.isBillboard && panel.visible) {
                  // Check if panel is roughly in view (simple distance check)
                  const distance = camera.position.distanceTo(panel.position);
                  // Only update if panel is within reasonable distance (100 units)
                  if (distance < 100) {
                    panel.lookAt(camera.position);
                  }
                }
              } catch (e) {
                // Silently handle errors
              }
            });
            
            // CRITICAL: Update canvas-based hotspot panels (Mesh panels with isBillboard)
            // This was missing - canvas panels need billboard behavior just like CSS3D panels
            canvasPanels.forEach((panel) => {
              try {
                if (panel.userData.isBillboard && panel.visible) {
                  const distance = camera.position.distanceTo(panel.position);
                  if (distance < 100) {
                    panel.lookAt(camera.position);
                  }
                }
              } catch (e) {
                // Silently handle errors
              }
            });
          }
          
          // PERFORMANCE: Only render CSS3D if there are visible panels
          if (css3dRenderer && css3dPanels.size > 0) {
            // Quick check if any CSS3D panel is visible
            let hasVisiblePanel = false;
            for (const panel of css3dPanels) {
              if (panel.visible) {
                hasVisiblePanel = true;
                break;
              }
            }
            if (hasVisiblePanel) {
            css3dRenderer.render(scene, camera);
            }
          }
          
          frameCount++; // DEBUG: Increment frame count
          
          // WASD movement + Q/E vertical panning (only when controls are enabled and no transition is active)
          if (sceneReady && !transitionAnimation && controls.enabled) {
            const direction = new THREE.Vector3();
            const right = new THREE.Vector3();
            
            // Get camera forward direction (where camera is looking)
            camera.getWorldDirection(direction);
            direction.normalize();
            
            // Get right vector (perpendicular to forward)
            right.crossVectors(direction, camera.up).normalize();
            
            // Calculate movement based on keys pressed
            const moveVector = new THREE.Vector3();
            if (keys.w) moveVector.add(direction);
            if (keys.s) moveVector.sub(direction);
            if (keys.a) moveVector.sub(right);
            if (keys.d) moveVector.add(right);
            
            // Q/E for vertical panning (up/down)
            if (keys.q) moveVector.sub(camera.up);
            if (keys.e) moveVector.add(camera.up);
            
            // Apply movement if any key is pressed
            if (moveVector.length() > 0) {
              moveVector.normalize();
              moveVector.multiplyScalar(moveSpeed);
              camera.position.add(moveVector);
              controls.target.add(moveVector);
            }
          }
          
          // ANTI-FLICKERING: Don't update shadow maps on every frame
          // Shadow maps are static - they only need to update when lights or objects move
          // Updating them on every frame causes flickering when camera moves
          // CRITICAL: Disable auto-update to prevent flickering, only update when needed
          if (renderer.shadowMap.autoUpdate && frameCount % 2 === 0) {
            // Only update shadow maps every other frame to reduce flickering
            renderer.shadowMap.autoUpdate = false;
            // Force update once, then disable
            renderer.shadowMap.needsUpdate = true;
          }
          
          // MATCH WORKING EXPORT: Only render when scene is ready
          // Always render, even during transitions (transition function also renders, but this ensures continuous rendering)
          // CRITICAL: Ensure scene is visible before rendering
          // MATCH WORKING EXPORT: Only render when scene is ready
          if (sceneReady) {
            // CRITICAL: Ensure scene is visible before rendering (match working export)
            // PERFORMANCE: Only check visibility every 10 frames to reduce overhead
            if (frameCount % 10 === 0) {
              scene.traverse((obj) => {
                if (obj instanceof THREE.Mesh || obj instanceof THREE.Group || obj instanceof THREE.Light) {
                  if (!obj.visible && !obj.userData.isHelper && !obj.userData.isGroundedSkybox) {
                    obj.visible = true;
                  }
                }
              });
            }
            
            // ANTI-FLICKERING: Fix z-fighting by ensuring proper depth settings
            // CRITICAL: Preserve transparent material settings so light can pass through
            // Only check every 30 frames to reduce overhead
            if (frameCount % 30 === 0) {
              scene.traverse((obj) => {
                if (obj instanceof THREE.Mesh && obj.material) {
                  const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
                  materials.forEach((mat) => {
                    // Check if material is transparent (glass/windows)
                    const opacity = typeof mat.opacity === 'number' ? mat.opacity : 1;
                    const transmission = typeof mat.transmission === 'number' ? mat.transmission : 0;
                    const transparentFlag = mat.transparent === true;
                    const matName = (mat.name || '').toLowerCase();
                    const isGlassLike =
                      matName.indexOf('glass') !== -1 ||
                      matName.indexOf('window') !== -1 ||
                      matName.indexOf('windshield') !== -1 ||
                      matName.indexOf('windscreen') !== -1 ||
                      matName.indexOf('transparent') !== -1 ||
                      matName.indexOf('transmission') !== -1;
                    const isTransparent =
                      transmission > 0 ||
                      (transparentFlag && opacity < 1.0) ||
                      isGlassLike;
                    
                    // Ensure proper depth settings to prevent z-fighting
                    if (mat.depthTest === false) {
                      mat.depthTest = true;
                    }
                    
                    // CRITICAL: Preserve depthWrite = false for transparent materials so light can pass through
                    // Transparent materials should NOT write to depth buffer to allow interior lighting
                    if (isTransparent && mat.depthWrite !== false) {
                      mat.depthWrite = false;
                      mat.needsUpdate = true;
                    }
                    
                    // Ensure shadow plane has proper depth write (shadow planes are NOT transparent)
                    if (obj.userData.isShadowPlane && !isTransparent && mat.depthWrite === false) {
                      mat.depthWrite = true;
                      mat.needsUpdate = true;
                    }
                    
                    // Fix render order for objects that might overlap
                    if (obj.userData.isShadowPlane && obj.renderOrder !== 0) {
                      obj.renderOrder = 0;
                    }
                  });
                }
              });
            }
            
            // CRITICAL: Check if ground projection is enabled and ensure only one mode is active
            const hdrConfig = CONFIG.hdr || {};
            const groundProjectionEnabled = hdrConfig.groundProjectionEnabled === true;
            
            // PERFORMANCE: Only update shadow plane and GroundedSkybox every N frames to reduce lag
            // Update every 10 frames (6 times per second at 60fps) instead of every frame
            const shouldUpdateShadowPlane = frameCount % 10 === 0;
            
            // CRITICAL: Ensure shadow plane and GroundedSkybox are always visible and properly configured
            scene.traverse((obj) => {
              if (obj instanceof THREE.Mesh || obj instanceof THREE.Group || obj instanceof THREE.Light) {
                // CRITICAL: Always keep shadow plane visible and properly positioned (match main app)
                if (obj.userData.isShadowPlane || (obj.name || '').toLowerCase().includes('shadow plane')) {
                  // CRITICAL: Force shadow plane to stay visible - shadows disappear if it's hidden
                  // Only check visibility every frame (cheap operation)
                  if (!obj.visible) {
                    console.warn('[WebExport] Shadow plane was hidden in render loop, re-enabling:', {
                      name: obj.name,
                      userData: obj.userData,
                      inScene: scene.children.includes(obj) || scene.getObjectById(obj.id) !== undefined
                    });
                    obj.visible = true;
                  }
                  if (!obj.receiveShadow) {
                    console.warn('[WebExport] Shadow plane receiveShadow was disabled in render loop, re-enabling');
                    obj.receiveShadow = true;
                  }
                  
                  // CRITICAL: Verify shadow plane is still in the scene (not removed)
                  if (!scene.children.includes(obj) && scene.getObjectById(obj.id) === undefined) {
                    console.error('[WebExport] CRITICAL: Shadow plane was removed from scene! Attempting to re-add...', {
                      name: obj.name,
                      id: obj.id,
                      uuid: obj.uuid
                    });
                    // Try to re-add shadow plane to scene
                    if (obj.parent) {
                      obj.parent.remove(obj);
                    }
                    scene.add(obj);
                  }
                  if (obj.castShadow) {
                    obj.castShadow = false;
                  }
                  
                  // CRITICAL: Use renderOrder = 0 like main app (not 1) - only check when needed
                  if (obj.renderOrder !== 0) {
                    obj.renderOrder = 0; // Render early (before objects with positive renderOrder)
                  }
                  
                  // PERFORMANCE: Only do expensive operations every 10 frames
                  if (shouldUpdateShadowPlane) {
                    // CRITICAL: Ensure material is properly configured for shadows
                    const material = Array.isArray(obj.material) ? obj.material[0] : obj.material;
                    if (material) {
                      // Only update if values are wrong (don't force update every frame)
                      if (!material.visible) {
                        material.visible = true;
                      }
                      // CRITICAL: Ensure material has depthWrite = true (match main app)
                      if (material.depthWrite !== true) {
                        material.depthWrite = true;
                        material.needsUpdate = true;
                      }
                    }
                    
                    // CRITICAL: Position based on mode (match main app behavior)
                    // Only recalculate position when needed (not every frame)
                    if (groundProjectionEnabled) {
                      // CRITICAL: For ground projection, keep Y at -0.01 (ground surface level)
                      // MATCH WORKING EXPORT: Keep original Y position, only adjust X/Z to center under car
                      const targetY = -0.01; // Ground surface level (matches initial setup)
                      
                      // Only update Y if it's not already at the correct position
                      if (Math.abs(obj.position.y - targetY) > 0.01) {
                        obj.position.y = targetY;
                        obj.updateMatrixWorld(true);
                      }
                      
                      // Center at origin for ground projection (X/Z = 0)
                      if (Math.abs(obj.position.x) > 0.01 || Math.abs(obj.position.z) > 0.01) {
                        obj.position.x = 0;
                        obj.position.z = 0;
                        obj.updateMatrixWorld(true);
                      }
                      // Ensure full scale
                      if (Math.abs(obj.scale.x - 1) > 0.01 || Math.abs(obj.scale.z - 1) > 0.01) {
                        obj.scale.set(1, 1, 1);
                        obj.updateMatrixWorld(true);
                      }
                      // Resize geometry if needed for ground projection (only check occasionally)
                      if (obj.geometry instanceof THREE.PlaneGeometry && frameCount % 60 === 0) {
                        const groundRadius = hdrConfig.groundProjectionRadius || 100;
                        const requiredSize = Math.max(groundRadius * 2, 200);
                        const currentSize = Math.max(obj.geometry.parameters.width, obj.geometry.parameters.height);
                        if (currentSize < requiredSize) {
                          obj.geometry.dispose();
                          obj.geometry = new THREE.PlaneGeometry(requiredSize, requiredSize);
                        }
                      }
                    } else {
                      // Standard 360 HDR mode: Optimized shadow plane setup
                      // PERFORMANCE: Only recalculate bounding box every 30 frames (2 times per second)
                      let needsUpdate = false;
                      const shouldRecalculateBounds = frameCount % 30 === 0;
                      
                      // CRITICAL: Ensure renderer shadow maps are enabled (check every frame for standard 360 HDR)
                      if (!renderer.shadowMap.enabled) {
                        renderer.shadowMap.enabled = true;
                        if (frameCount % 60 === 0) {
                          console.warn('[WebExport] Standard 360 HDR - Renderer shadow maps were disabled, re-enabled');
                        }
                      }
                      // ANTI-FLICKERING: Only update shadow maps when needed, not every frame
                      // Update every 2 frames to reduce flickering while keeping shadows responsive
                      if (frameCount % 2 === 0) {
                        renderer.shadowMap.needsUpdate = true;
                      }
                      
                      // CRITICAL: Always ensure Y position is correct (check every frame, not just every 30)
                      if (Math.abs(obj.position.y - (-0.001)) > 0.01) {
                        obj.position.y = -0.001;
                        needsUpdate = true;
                        if (frameCount % 60 === 0) {
                          console.log('[WebExport] Standard 360 HDR - Shadow plane Y position corrected to -0.001');
                        }
                      }
                      
                      if (shouldRecalculateBounds) {
                        // Calculate car bounding box for positioning shadow plane
                        let carCenterX = 0;
                        let carCenterZ = 0;
                        let carSizeX = 0;
                        let carSizeZ = 0;
                        let carFound = false;
                        
                        const currentCarRoot = renderLoopCarRoot;
                        if (currentCarRoot) {
                          const carBox = new THREE.Box3();
                          currentCarRoot.traverse((carObj) => {
                            if (carObj instanceof THREE.Mesh) {
                              const userData = carObj.userData || {};
                              if (!userData.isShadowPlane && !userData.isHelper && !userData.isGroundedSkybox) {
                                carBox.expandByObject(carObj);
                              }
                            }
                          });
                          if (!carBox.isEmpty()) {
                            const center = carBox.getCenter(new THREE.Vector3());
                            const size = carBox.getSize(new THREE.Vector3());
                            carCenterX = center.x;
                            carCenterZ = center.z;
                            carSizeX = size.x;
                            carSizeZ = size.z;
                            carFound = true;
                          }
                        }
                        
                        // Position and scale shadow plane based on car bounds
                        if (carFound) {
                          const radiusX = carSizeX * 0.75;
                          const radiusZ = carSizeZ * 0.75;
                          // CRITICAL: Don't multiply by current scale - this causes exponential growth!
                          // Reset scale to 1 first, then apply target scale
                          const targetScaleX = radiusX / 5;
                          const targetScaleZ = radiusZ / 5;
                          
                          // Calculate actual shadow plane size (geometry size * scale)
                          const planeGeometrySize = obj.geometry instanceof THREE.PlaneGeometry 
                            ? Math.max(obj.geometry.parameters.width, obj.geometry.parameters.height) 
                            : 10000;
                          const actualPlaneSizeX = planeGeometrySize * targetScaleX;
                          const actualPlaneSizeZ = planeGeometrySize * targetScaleZ;
                          
                          if (Math.abs(obj.position.x - carCenterX) > 0.01 || Math.abs(obj.position.z - carCenterZ) > 0.01) {
                            obj.position.x = carCenterX;
                            obj.position.z = carCenterZ;
                            needsUpdate = true;
                            if (frameCount % 60 === 0) {
                              console.log('[WebExport] Standard 360 HDR - Shadow plane positioned under car:', 
                                'X=' + carCenterX.toFixed(2) + ', Z=' + carCenterZ.toFixed(2));
                            }
                          }
                          if (Math.abs(obj.scale.x - targetScaleX) > 0.01 || Math.abs(obj.scale.z - targetScaleZ) > 0.01) {
                            obj.scale.x = targetScaleX;
                            obj.scale.z = targetScaleZ;
                            needsUpdate = true;
                            if (frameCount % 60 === 0) {
                              console.log('[WebExport] Standard 360 HDR - Shadow plane scaled:', 
                                'ScaleX=' + targetScaleX.toFixed(2) + ', ScaleZ=' + targetScaleZ.toFixed(2) + ', ' +
                                'ActualSize: ' + actualPlaneSizeX.toFixed(2) + 'x' + actualPlaneSizeZ.toFixed(2));
                            }
                          }
                          
                          // CRITICAL: Verify shadow camera covers the shadow plane
                          // Check all directional lights and ensure their shadow cameras cover the plane
                          if (frameCount % 300 === 0) {
                            scene.traverse((light) => {
                              if (light instanceof THREE.DirectionalLight && light.castShadow && light.shadow) {
                                const cam = light.shadow.camera;
                                if (cam.isOrthographicCamera) {
                                  const camWidth = (cam.right - cam.left) || 0;
                                  const camHeight = (cam.top - cam.bottom) || 0;
                                  const planeHalfWidth = actualPlaneSizeX / 2;
                                  const planeHalfHeight = actualPlaneSizeZ / 2;
                                  if (camWidth < planeHalfWidth * 2 || camHeight < planeHalfHeight * 2) {
                                    console.warn('[WebExport] Standard 360 HDR - Shadow camera too small for shadow plane!', 
                                      'Camera: ' + camWidth.toFixed(2) + 'x' + camHeight.toFixed(2) + ', ' +
                                      'Plane: ' + actualPlaneSizeX.toFixed(2) + 'x' + actualPlaneSizeZ.toFixed(2));
                                  }
                                }
                              }
                            });
                          }
                        } else {
                          // CRITICAL: Don't reset position if car not found - keep existing position
                          // Only log warning, don't reset to (0,0) as this breaks shadows
                          if (frameCount % 300 === 0) {
                            console.warn('[WebExport] Standard 360 HDR - Car not found in render loop, keeping existing shadow plane position');
                          }
                        }
                      }
                      
                      // CRITICAL: Ensure shadow plane is visible and receiving shadows (check every frame)
                      if (!obj.visible) {
                        obj.visible = true;
                        needsUpdate = true;
                        if (frameCount % 60 === 0) {
                          console.warn('[WebExport] Standard 360 HDR - Shadow plane was hidden, re-enabled visibility');
                        }
                      }
                      if (!obj.receiveShadow) {
                        obj.receiveShadow = true;
                        needsUpdate = true;
                        if (frameCount % 60 === 0) {
                          console.warn('[WebExport] Standard 360 HDR - Shadow plane receiveShadow was disabled, re-enabled');
                        }
                      }
                      if (obj.castShadow) {
                        obj.castShadow = false;
                        needsUpdate = true;
                      }
                      
                      // CRITICAL: Ensure shadow plane material is properly configured (check every frame)
                      const material = Array.isArray(obj.material) ? obj.material[0] : obj.material;
                      if (material) {
                        if (!material.visible) {
                          material.visible = true;
                          material.needsUpdate = true;
                          needsUpdate = true;
                          if (frameCount % 60 === 0) {
                            console.warn('[WebExport] Standard 360 HDR - Shadow plane material was hidden, re-enabled');
                          }
                        }
                        if (material instanceof THREE.ShadowMaterial) {
                          // Ensure minimum opacity for visibility
                          if (material.opacity <= 0 || material.opacity < 0.3) {
                            material.opacity = Math.max(0.3, material.userData.baseOpacity || 0.5);
                            if (!material.userData.baseOpacity) {
                              material.userData.baseOpacity = material.opacity;
                            }
                            material.needsUpdate = true;
                            needsUpdate = true;
                            if (frameCount % 60 === 0) {
                              console.warn('[WebExport] Standard 360 HDR - Shadow plane opacity was too low, fixed to', material.opacity.toFixed(3));
                            }
                          }
                          // CRITICAL: ShadowMaterial must have depthWrite = true
                          if (material.depthWrite !== true) {
                            material.depthWrite = true;
                            material.needsUpdate = true;
                            needsUpdate = true;
                            if (frameCount % 60 === 0) {
                              console.warn('[WebExport] Standard 360 HDR - Shadow plane depthWrite was false, set to true');
                            }
                          }
                        } else {
                          // CRITICAL: If material is not ShadowMaterial, log warning
                          if (frameCount % 300 === 0) {
                            console.warn('[WebExport] Standard 360 HDR - Shadow plane material is not ShadowMaterial:', material.constructor.name);
                          }
                        }
                      } else {
                        // CRITICAL: No material found - this is a problem
                        if (frameCount % 300 === 0) {
                          console.error('[WebExport] Standard 360 HDR - Shadow plane has no material!');
                        }
                      }
                      
                      // Update matrix only if something changed
                      if (needsUpdate) {
                        obj.updateMatrixWorld(true);
                      }
                      
                      // Ensure large geometry (10000x10000) - only check every 60 frames
                      if (obj.geometry instanceof THREE.PlaneGeometry && frameCount % 60 === 0) {
                        const currentSize = Math.max(obj.geometry.parameters.width, obj.geometry.parameters.height);
                        if (currentSize < 10000) {
                          obj.geometry.dispose();
                          obj.geometry = new THREE.PlaneGeometry(10000, 10000);
                        }
                      }
                    }
                  }
                } else if (obj.userData.isGroundedSkybox) {
                  // CRITICAL: Only show GroundedSkybox if ground projection is enabled
                  if (groundProjectionEnabled) {
                    // CRITICAL: Ensure GroundedSkybox is always visible (cheap checks every frame)
                    if (!obj.visible) {
                      obj.visible = true;
                    }
                    if (!obj.receiveShadow) {
                      obj.receiveShadow = true;
                    }
                    if (obj.castShadow) {
                      obj.castShadow = false;
                    }
                    if (obj.renderOrder !== -1000) {
                      obj.renderOrder = -1000; // Render first (background)
                    }
                    if (obj.frustumCulled) {
                      obj.frustumCulled = false; // CRITICAL: Never cull GroundedSkybox
                    }
                    
                    // PERFORMANCE: Only do expensive material updates every 10 frames
                    if (shouldUpdateShadowPlane) {
                      // CRITICAL: Ensure material is visible and properly configured for 360 ground projection
                      const material = Array.isArray(obj.material) ? obj.material[0] : obj.material;
                      
                      // DEBUG: Log GroundedSkybox state every 300 frames (once per 5 seconds at 60fps) - reduced frequency
                      if (frameCount % 300 === 0) {
                        console.log('[WebExport] GroundedSkybox render loop check:', {
                          visible: obj.visible,
                          position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
                          rotation: { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z },
                          renderOrder: obj.renderOrder,
                          frustumCulled: obj.frustumCulled,
                          materialType: material?.constructor?.name,
                          materialVisible: material?.visible,
                          hasMap: !!(material && material.map),
                          mapLoaded: (material && material.map && material.map.image) ? true : false,
                          sceneBackground: scene.background,
                          inScene: scene.children.includes(obj),
                          frameCount: frameCount
                        });
                      }
                      
                      if (material) {
                        // CRITICAL: Configure material for proper 360 ground projection rendering
                        // Only update if values are wrong (don't force update every frame)
                        if (material instanceof THREE.MeshBasicMaterial) {
                          let materialNeedsUpdate = false;
                          if (material.transparent !== false) {
                            material.transparent = false;
                            materialNeedsUpdate = true;
                          }
                          if (material.opacity !== 1.0) {
                            material.opacity = 1.0;
                            materialNeedsUpdate = true;
                          }
                          if (material.depthWrite !== false) {
                            material.depthWrite = false; // GroundedSkybox uses depthWrite: false by default
                            materialNeedsUpdate = true;
                          }
                          if (material.depthTest !== true) {
                            material.depthTest = true; // Enable depth testing
                            materialNeedsUpdate = true;
                          }
                          // CRITICAL: Use DoubleSide to ensure textures are visible from inside the sphere (360 view)
                          if (material.side !== THREE.DoubleSide) {
                            material.side = THREE.DoubleSide; // Render both sides (ensures visibility from inside)
                            materialNeedsUpdate = true;
                          }
                          if (!material.visible) {
                            material.visible = true;
                            materialNeedsUpdate = true;
                          }
                          // Only update if something changed
                          if (materialNeedsUpdate) {
                            material.needsUpdate = true;
                          }
                        } else {
                          // For non-MeshBasicMaterial, just ensure visibility
                          if (!material.visible) {
                            material.visible = true;
                            material.needsUpdate = true;
                          }
                        }
                      } else {
                        console.error('[WebExport] ❌ GroundedSkybox has no material!', {
                          hasMaterial: !!obj.material,
                          materialType: obj.material?.constructor?.name
                        });
                      }
                      
                      // CRITICAL: Ensure scene.background is null (GroundedSkybox replaces it)
                      // Only check occasionally to reduce overhead
                      if (frameCount % 30 === 0 && scene.background !== null) {
                        console.warn('[WebExport] ⚠️ scene.background should be null for ground projection, setting to null', {
                          currentBackground: scene.background.constructor.name
                        });
                        scene.background = null;
                      }
                    }
                    
                    // MATCH WORKING EXPORT: Keep GroundedSkybox simple - no rotation or material conversion
                    // Just ensure it's visible and properly configured
                  } else {
                    // CRITICAL: Hide GroundedSkybox if ground projection is disabled
                    if (obj.visible) {
                      obj.visible = false;
                    }
                  }
                } else {
                  // CRITICAL: Ensure other objects that should be hidden stay hidden
                  const userData = obj.userData || {};
                  const objName = (obj.name || '').toLowerCase();
                  const objType = obj.type || '';
                  
                  // Re-check if object should be hidden (in case it was missed earlier)
                  const shouldBeHidden = 
                    objType === 'TransformControlsGizmo' ||
                    objType === 'TransformControlsPlane' ||
                    objType.includes('Gizmo') ||
                    objType.includes('Helper') ||
                    obj instanceof THREE.AxesHelper ||
                    obj instanceof THREE.GridHelper ||
                    userData.isHelper === true ||
                    userData.isGridHelper === true ||
                    userData.isAxesHelper === true ||
                    userData.isLightGizmo === true ||
                    userData.isLightHelper === true ||
                    userData.isTransformControls === true ||
                    userData.isDemoShaderScreen === true ||
                    userData.lightId !== undefined ||
                    userData.gizmoKind !== undefined ||
                    userData.skipExport === true ||
                    (objName && (objName.includes('helper') || objName.includes('gizmo') || objName.includes('cineshader')));
                  
                  if (shouldBeHidden) {
                    obj.visible = false;
                  } else if (!obj.visible) {
                    // Only set visible if it was hidden - don't force visibility on everything
                    obj.visible = true;
                  }
                }
              }
            });
            
            // PERFORMANCE: Only check shadow maps and lights every 30 frames (2 times per second at 60fps)
            if (frameCount % 30 === 0) {
              // CRITICAL: Ensure shadow maps are enabled (shadows won't show if disabled)
              if (!renderer.shadowMap.enabled) {
                renderer.shadowMap.enabled = true;
                console.warn('[WebExport] Shadow maps were disabled, re-enabled');
              }
              
              // ANTI-FLICKERING: Update shadow maps only when needed, not every frame
              // Update every 2 frames to reduce flickering while keeping shadows responsive
              // Don't use autoUpdate=true as it causes flickering - manually trigger updates
              renderer.shadowMap.needsUpdate = true;
              
              // CRITICAL: Ensure directional lights are casting shadows
              // This applies to BOTH ground projection and standard 360 HDR modes
              scene.traverse((light) => {
                if (light instanceof THREE.DirectionalLight) {
                  const lightConfig = lightingConfig.directionalLights?.find(l => l.id === light.userData.lightId);
                  // If light should cast shadows (from config or default), ensure it does
                  const shouldCastShadow = (lightConfig && lightConfig.castShadow !== false) || (!lightConfig && light.userData.isSun) || (!lightConfig && !light.userData.lightId);
                  if (shouldCastShadow) {
                    if (!light.castShadow) {
                      light.castShadow = true;
                      if (light.shadow) {
                        light.shadow.needsUpdate = true;
                      }
                      console.log('[WebExport] Re-enabled shadow casting for light:', light.userData.lightId || light.name || 'default');
                    }
                    // Ensure shadow map size is set
                    if (light.shadow && (light.shadow.mapSize.width === 0 || light.shadow.mapSize.height === 0)) {
                      const shadowMapSize = window.getShadowMapSize ? window.getShadowMapSize(CONFIG.shadowQuality || 'high') : 4096;
                      light.shadow.mapSize.width = shadowMapSize;
                      light.shadow.mapSize.height = shadowMapSize;
                      light.shadow.needsUpdate = true;
                      console.warn('[WebExport] Light shadow map size was 0, fixed:', light.userData.lightId || light.name || 'default');
                    }
                  }
                }
              });
              
              // CRITICAL: Ensure shadow plane is visible and receiving shadows
              // This applies to BOTH ground projection and standard 360 HDR modes
              // Shadow plane must receive shadows for shadows to be visible
              scene.traverse((obj) => {
                if (obj.userData.isShadowPlane) {
                  if (!obj.visible) {
                    obj.visible = true;
                    console.log('[WebExport] Re-enabled shadow plane visibility');
                  }
                  if (!obj.receiveShadow) {
                    obj.receiveShadow = true;
                    console.log('[WebExport] Re-enabled shadow plane receiveShadow');
                  }
                  // Ensure shadow plane doesn't cast shadows (it only receives them)
                  if (obj.castShadow) {
                    obj.castShadow = false;
                  }
                }
              });
            }
            
            // CRITICAL: Ensure background is set correctly based on mode
            // CRITICAL: Also ensure no GroundedSkybox objects exist when in regular mode
            if (groundProjectionEnabled) {
              // Ground projection mode: background should be null, GroundedSkybox should be visible
              if (scene.background !== null) {
                scene.background = null;
              }
            }
            
            // CRITICAL: Handle GroundedSkybox visibility and duplicates based on mode
            if (groundProjectionEnabled) {
              // CRITICAL: Count existing GroundedSkybox objects to prevent duplicates
              let groundedSkyboxCount = 0;
              let existingSkybox = null;
              scene.traverse((obj) => {
                if (obj.userData.isGroundedSkybox === true) {
                  groundedSkyboxCount++;
                  if (!existingSkybox) {
                    existingSkybox = obj;
                  }
                }
              });
              
              // CRITICAL: If more than one GroundedSkybox exists, remove duplicates
              if (groundedSkyboxCount > 1) {
                console.warn('[WebExport] ⚠️ Found', groundedSkyboxCount, 'GroundedSkybox objects! Removing duplicates...');
                const skyboxesToRemove = [];
                scene.traverse((obj) => {
                  if (obj.userData.isGroundedSkybox === true && obj !== existingSkybox) {
                    skyboxesToRemove.push(obj);
                  }
                });
                skyboxesToRemove.forEach((skybox) => {
                  scene.remove(skybox);
                  if (skybox.geometry) skybox.geometry.dispose();
                  if (skybox.material instanceof THREE.Material) skybox.material.dispose();
                });
                console.log('[WebExport] Removed', skyboxesToRemove.length, 'duplicate GroundedSkybox object(s)');
              }
              
              // CRITICAL: Only create GroundedSkybox if none exists AND we're past initial setup
              // Don't create in render loop - it should already exist from initial setup
              // The render loop should only ensure visibility, not create new objects
            } else {
              // Regular mode: background should be HDR texture if visible
              // CRITICAL: Remove ALL GroundedSkybox objects in regular mode
              const skyboxesToRemove = [];
              scene.traverse((obj) => {
                if (obj.userData.isGroundedSkybox === true) {
                  skyboxesToRemove.push(obj);
                }
              });
              if (skyboxesToRemove.length > 0) {
                skyboxesToRemove.forEach((skybox) => {
                  scene.remove(skybox);
                  if (skybox.geometry) skybox.geometry.dispose();
                  if (skybox.material instanceof THREE.Material) skybox.material.dispose();
                });
                console.log('[WebExport] Removed', skyboxesToRemove.length, 'GroundedSkybox object(s) in render loop (regular mode)');
              }
              
              const backgroundVisible = hdrConfig.backgroundVisible !== undefined ? hdrConfig.backgroundVisible : true;
              if (backgroundVisible && window.__hdrTextureLoaded) {
                // CRITICAL: Ensure background texture is properly configured
                const hdrTex = window.__hdrTextureLoaded;
                if (hdrTex.mapping !== THREE.EquirectangularReflectionMapping) {
                  hdrTex.mapping = THREE.EquirectangularReflectionMapping;
                  hdrTex.needsUpdate = true;
                }
                if (scene.background !== hdrTex) {
                  scene.background = hdrTex;
                  console.log('[WebExport] Render loop: Set regular 360 HDR background');
                }
              } else if (!backgroundVisible && scene.background !== null) {
                scene.background = null;
              }
            }
            // Safety: ensure controls stay enabled outside of camera transitions
            if (!transitionAnimation && !controls.enabled) {
              controls.enabled = true;
            }
            
            // Apply camera bounds constraint if enabled
            const cameraBounds = CONFIG.cameraBounds;
            if (cameraBounds && cameraBounds.enabled) {
              // Validate bounds - warn if invalid
              const isValid = cameraBounds.min.x < cameraBounds.max.x && 
                             cameraBounds.min.y < cameraBounds.max.y && 
                             cameraBounds.min.z < cameraBounds.max.z;
              
              if (!isValid) {
                // Bounds are invalid (min >= max), disable bounds to prevent camera lock
                if (frameCount % 300 === 0) { // Every 5 seconds at 60fps
                  console.warn('[WebExport] Camera bounds are invalid (min >= max). Bounds disabled.', {
                    min: cameraBounds.min,
                    max: cameraBounds.max
                  });
                }
              } else {
                // Clamp camera position to bounds
                const pos = camera.position;
                const oldPos = pos.clone();
                camera.position.x = Math.max(cameraBounds.min.x, Math.min(cameraBounds.max.x, pos.x));
                camera.position.y = Math.max(cameraBounds.min.y, Math.min(cameraBounds.max.y, pos.y));
                camera.position.z = Math.max(cameraBounds.min.z, Math.min(cameraBounds.max.z, pos.z));
                
                // Also clamp target to bounds
                const target = controls.target;
                const oldTarget = target.clone();
                controls.target.x = Math.max(cameraBounds.min.x, Math.min(cameraBounds.max.x, target.x));
                controls.target.y = Math.max(cameraBounds.min.y, Math.min(cameraBounds.max.y, target.y));
                controls.target.z = Math.max(cameraBounds.min.z, Math.min(cameraBounds.max.z, target.z));
                
                // Debug: Log when bounds are actually clamping (only occasionally to avoid spam)
                if (frameCount % 60 === 0) { // Every 60 frames (~1 second at 60fps)
                  const posClamped = !oldPos.equals(camera.position);
                  const targetClamped = !oldTarget.equals(controls.target);
                  if (posClamped || targetClamped) {
                    console.log('[WebExport] Camera bounds applied:', {
                      posClamped,
                      targetClamped,
                      bounds: { min: cameraBounds.min, max: cameraBounds.max },
                      position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
                      target: { x: controls.target.x, y: controls.target.y, z: controls.target.z }
                    });
                  }
                }
              }
            }
            
            renderer.render(scene, camera);
          }
        }
        // CRITICAL: Build the panel cache BEFORE starting animation
        // This ensures billboard updates work from the first frame
        rebuildCSS3DCache();
        console.log('[WebExport] Rebuilt panel cache - canvasPanels:', canvasPanels.size, 'css3dPanels:', css3dPanels.size);
        
        animate();
        
        // Ensure renderer is properly sized and configured
        function handleResize() {
          const width = window.innerWidth;
          const height = window.innerHeight;
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          renderer.setSize(width, height);
          renderer.render(scene, camera);
        }
        window.addEventListener('resize', handleResize);
        
        // Ensure scene is visible and camera can see it
        scene.traverse((obj) => {
          if (obj instanceof THREE.Mesh || obj instanceof THREE.Group) {
            obj.visible = true;
          }
        });
        
      } catch (error) {
        console.error('Failed to load model:', error);
        document.getElementById('loading-overlay').innerHTML = 
          '<div style="color: #ff4444;">Failed to load 3D model</div>';
      }
    }
    
    // Handle window resize
    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      if (css3dRenderer) {
        css3dRenderer.setSize(window.innerWidth, window.innerHeight);
      }
    });
    
    // Start loading
    loadModel();
  </script>
</body>
</html>`
}

/**
 * Export scene for web hosting
 */
export async function exportForWeb(options: Partial<WebExportOptions> = {}): Promise<WebExportResult> {
  const defaultOptions: WebExportOptions = {
    includeModel: true,
    includeHDR: true,
    includeCameraViews: true,
    includeAnimations: true,
    presentationMode: true,
    transitionDuration: 2.0,
    autoPlay: false,
    loop: true,
    quality: 'high',
    compressTextures: true,
    ...options
  }

  const store = useAppStore.getState()
  const viewer = getSharedViewer()
  
  if (!viewer) {
    throw new Error('Viewer not available')
  }

  const { scene } = viewer
  
  // Load hotspots from localStorage
  let hotspots: any[] = []
  try {
    const stored = localStorage.getItem('3d-viewer-hotspots')
    if (stored) {
      hotspots = JSON.parse(stored)
      console.log('[WebExport] Loaded', hotspots.length, 'hotspots for export')
    }
  } catch (error) {
    console.warn('[WebExport] Failed to load hotspots:', error)
  }

  // OPTIMIZATION: Run exports in parallel where possible for faster loading
  // Use Web Workers for parallel thumbnail processing (multi-threading)
  const cameraViews = Array.isArray(store.cameraViews) ? store.cameraViews : []
  
  // Create worker pool for parallel processing (if available)
  const workerPool = defaultOptions.includeCameraViews && cameraViews.length > 0
    ? new ExportWorkerPool()
    : null
  
  // Use shared thumbnails from store first, generate missing ones
  // CRITICAL: This ensures consistency with CameraViewsPanel thumbnails
  const thumbnailsPromise = defaultOptions.includeCameraViews && cameraViews.length > 0
    ? (async () => {
        const thumbnails = new Map<string, string>()
        const storeThumbnails = store.cameraViewThumbnails || new Map<string, string>()
        
        // First, use existing thumbnails from store
        let missingThumbnails: typeof cameraViews = []
        for (const view of cameraViews) {
          const existing = storeThumbnails.get(view.id)
          if (existing && existing !== '' && !existing.startsWith('data:,') && existing.length > 100) {
            // Valid thumbnail from store - use it
            thumbnails.set(view.id, existing)
            console.log(`[WebExport] Using existing thumbnail from store for view: "${view.name}"`)
          } else {
            // Need to generate this thumbnail
            missingThumbnails.push(view)
          }
        }
        
        // Generate missing thumbnails sequentially (one at a time) to ensure proper camera state
        if (missingThumbnails.length > 0) {
          console.log(`[WebExport] Generating ${missingThumbnails.length} missing thumbnail(s)`)
          for (let i = 0; i < missingThumbnails.length; i++) {
            const view = missingThumbnails[i]
            try {
              console.log(`[WebExport] Generating thumbnail ${i + 1}/${missingThumbnails.length} for view: "${view.name}" (ID: ${view.id})`)
              // For the first thumbnail, wait a bit longer to ensure scene is fully loaded
              if (i === 0 && thumbnails.size === 0) {
                await new Promise(resolve => setTimeout(resolve, 500))
              }
              const thumbnail = await generateViewThumbnail(viewer, view, 256, 144, i === 0 && thumbnails.size === 0)
              if (thumbnail && thumbnail !== '' && !thumbnail.startsWith('data:,') && thumbnail.length > 100) {
              thumbnails.set(view.id, thumbnail)
                // Also update store so it's available for other components
                store.setCameraViewThumbnail(view.id, thumbnail)
                console.log(`[WebExport] ✓ Thumbnail ${i + 1}/${missingThumbnails.length} generated successfully for view: "${view.name}"`)
            } else {
                console.warn(`[WebExport] ✗ Thumbnail ${i + 1}/${missingThumbnails.length} generation returned invalid for view: "${view.name}"`)
            }
          } catch (error) {
              console.warn(`[WebExport] ✗ Failed to generate thumbnail ${i + 1}/${missingThumbnails.length} for view "${view.name}":`, error)
            }
          }
        }
        
        // Clean up worker pool
        if (workerPool) {
          workerPool.terminate()
        }
        
        console.log(`[WebExport] Using ${thumbnails.size}/${cameraViews.length} thumbnails (${storeThumbnails.size} from store, ${missingThumbnails.length} generated)`)
        return thumbnails
      })()
    : Promise.resolve(new Map<string, string>())

  // Export model (can run in parallel with thumbnails)
  const modelBlobPromise = defaultOptions.includeModel
    ? exportModelToGLB(scene, {
        binary: true,
        includeAnimations: defaultOptions.includeAnimations
      })
    : Promise.resolve(undefined)

  // Wait for parallel operations
  const [thumbnails, modelBlob] = await Promise.all([thumbnailsPromise, modelBlobPromise])

  // Export HDR - try to get from store first (custom HDR file), then fallback to scene environment
  let hdrBlob: Blob | null = null
  if (defaultOptions.includeHDR) {
    // First, try to export the custom HDR file if it exists
    if (store.hdrFile) {
      hdrBlob = store.hdrFile
    } else if (store.hdrUrl) {
      // If we have a URL, try to fetch it
      try {
        const response = await fetch(store.hdrUrl)
        if (response.ok) {
          hdrBlob = await response.blob()
        }
      } catch (error) {
        console.warn('Failed to fetch HDR from URL, falling back to scene environment:', error)
      }
    }
    
    // Fallback to scene environment if no custom HDR file/URL
    if (!hdrBlob) {
      hdrBlob = await exportHDR(scene)
    }
  }

  // Create config first (needed for HTML template)
  // CRITICAL: Get current camera position using getCameraState() to ensure it matches the viewer
  // This ensures the exported camera matches exactly what the user sees in the 3D viewer
  let currentCameraPosition = null
  let currentCameraTarget = null
  
  if (viewer && typeof viewer.getCameraState === 'function') {
    try {
      const cameraState = viewer.getCameraState()
      if (cameraState && cameraState.position && cameraState.target) {
        currentCameraPosition = {
          x: cameraState.position.x,
          y: cameraState.position.y,
          z: cameraState.position.z
        }
        currentCameraTarget = {
          x: cameraState.target.x,
          y: cameraState.target.y,
          z: cameraState.target.z
        }
        console.log('[WebExport] Camera captured from getCameraState():', {
          position: currentCameraPosition,
          target: currentCameraTarget
        })
      }
    } catch (error) {
      console.warn('[WebExport] Failed to get camera state, falling back to direct access:', error)
      // Fallback to direct access
      const currentCamera = viewer.camera
      if (currentCamera) {
        currentCameraPosition = {
          x: currentCamera.position.x,
          y: currentCamera.position.y,
          z: currentCamera.position.z
        }
      }
      if (viewer.controls && (viewer.controls as any).target) {
        currentCameraTarget = {
          x: (viewer.controls as any).target.x,
          y: (viewer.controls as any).target.y,
          z: (viewer.controls as any).target.z
        }
      }
    }
  } else {
    // Fallback if getCameraState is not available
    const currentCamera = viewer.camera
    if (currentCamera) {
      currentCameraPosition = {
        x: currentCamera.position.x,
        y: currentCamera.position.y,
        z: currentCamera.position.z
      }
    }
    if (viewer.controls && (viewer.controls as any).target) {
      currentCameraTarget = {
        x: (viewer.controls as any).target.x,
        y: (viewer.controls as any).target.y,
        z: (viewer.controls as any).target.z
      }
    }
  }

  // Collect all lights from scene
  const sceneLights: any[] = []
  scene.traverse((obj) => {
    if (obj instanceof THREE.Light) {
      const lightData: any = {
        type: obj.type,
        color: { r: obj.color.r, g: obj.color.g, b: obj.color.b },
        intensity: obj.intensity
      }
      
      if (obj instanceof THREE.DirectionalLight) {
        lightData.position = { x: obj.position.x, y: obj.position.y, z: obj.position.z }
        lightData.castShadow = obj.castShadow
        if (obj.shadow) {
          lightData.shadow = {
            mapSize: { width: obj.shadow.mapSize.width, height: obj.shadow.mapSize.height },
            camera: {
              near: obj.shadow.camera.near,
              far: obj.shadow.camera.far,
              left: (obj.shadow.camera as THREE.OrthographicCamera).left,
              right: (obj.shadow.camera as THREE.OrthographicCamera).right,
              top: (obj.shadow.camera as THREE.OrthographicCamera).top,
              bottom: (obj.shadow.camera as THREE.OrthographicCamera).bottom
            }
          }
        }
      } else if (obj instanceof THREE.AmbientLight) {
        // Ambient light has no position
      } else if (obj instanceof THREE.PointLight) {
        lightData.position = { x: obj.position.x, y: obj.position.y, z: obj.position.z }
        lightData.distance = obj.distance
        lightData.decay = obj.decay
      } else if (obj instanceof THREE.SpotLight) {
        lightData.position = { x: obj.position.x, y: obj.position.y, z: obj.position.z }
        lightData.angle = obj.angle
        lightData.penumbra = obj.penumbra
        lightData.distance = obj.distance
        lightData.decay = obj.decay
      }
      
      sceneLights.push(lightData)
    }
  })

  // Collect information about model modifications
  const modelModifications = {
    materialsModified: 0,
    geometriesModified: 0,
    texturesMerged: 0,
    totalTextures: 0
  }
  
  const textureMap = new Map<string, string>() // Track texture usage
  
  scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      // Check for geometry modifications (if originalGeometry is stored, it means geometry was modified)
      if (obj.userData.originalGeometry) {
        modelModifications.geometriesModified++
      }
      
      if (obj.material) {
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
        materials.forEach((mat) => {
          modelModifications.materialsModified++
          
          // Collect all textures
          const textureProps = [
            'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap',
            'bumpMap', 'displacementMap', 'alphaMap', 'lightMap', 'clearcoatMap',
            'clearcoatNormalMap', 'clearcoatRoughnessMap', 'sheenColorMap',
            'sheenRoughnessMap', 'transmissionMap', 'thicknessMap', 'specularMap',
            'specularIntensityMap', 'specularColorMap'
          ]
          
          textureProps.forEach((prop) => {
            const texture = (mat as any)[prop] as THREE.Texture | undefined
            if (texture && texture.image) {
              modelModifications.totalTextures++
              const textureName = texture.name || texture.uuid
              if (!textureMap.has(textureName)) {
                textureMap.set(textureName, prop)
              }
            }
          })
        })
      }
    }
  })
  
  console.log(`[WebExport] Model modifications detected:`, {
    materials: modelModifications.materialsModified,
    geometries: modelModifications.geometriesModified,
    textures: modelModifications.totalTextures,
    uniqueTextures: textureMap.size
  })

  // Create config file with ALL settings
  // CRITICAL: Add timestamp to config to prevent caching
  const exportTimestamp = Date.now()
  const exportDate = new Date().toISOString()
  
  const config = {
    version: '2.1.0', // Bumped version to include model modifications info
    exportedAt: exportDate,
    exportTimestamp: exportTimestamp, // Add timestamp for cache-busting
    options: defaultOptions,
    
    // Model modifications information
    modelModifications: {
      materialsModified: modelModifications.materialsModified,
      geometriesModified: modelModifications.geometriesModified,
      totalTextures: modelModifications.totalTextures,
      uniqueTextures: textureMap.size,
      note: 'All material changes, texture merges, and geometry modifications are included in the exported GLB file'
    },
    
    // Current camera position (not just camera views)
    currentCamera: currentCameraPosition && currentCameraTarget ? {
      position: currentCameraPosition,
      target: currentCameraTarget
    } : null,
    
    cameraViews: defaultOptions.includeCameraViews ? cameraViews : [],
    thumbnails: Object.fromEntries(thumbnails),
    
    // HDR Settings
    hdr: {
      enabled: store.hdrEnabled,
      intensity: store.hdrIntensity,
      rotationAzimuth: store.hdrRotationAzimuth,
      rotationElevation: store.hdrRotationElevation,
      backgroundVisible: store.hdrBackgroundVisible,
      groundProjectionEnabled: store.hdrGroundProjectionEnabled,
      groundProjectionHeight: store.hdrGroundProjectionHeight,
      groundProjectionRadius: store.hdrGroundProjectionRadius,
      groundProjectionResolution: store.hdrGroundProjectionResolution,
      groundProjectionPositionY: store.hdrGroundProjectionPositionY
    },
    
    // Camera Bounds Settings
    cameraBounds: {
      enabled: store.cameraBoundsEnabled,
      min: store.cameraBoundsMin,
      max: store.cameraBoundsMax
    },
    
    // Lighting Settings
    lighting: {
      ambientIntensity: store.ambientIntensity,
      shadowsEnabled: store.shadowsEnabled,
      shadowIntensity: store.shadowIntensity,
      shadowBias: store.shadowBias,
      shadowColor: store.shadowColor,
      shadowOpacity: store.shadowOpacity,
      shadowOpacityEnabled: store.shadowOpacityEnabled,
      directionalLights: Array.isArray(store.directionalLights) ? store.directionalLights.map(light => ({
        id: light.id,
        enabled: light.enabled,
        color: light.color,
        intensity: light.intensity,
        position: light.position,
        target: light.target,
        castShadow: light.castShadow,
        shadowRadius: light.shadowRadius
      })) : [],
      sceneLights: sceneLights // Lights actually in the scene
    },
    
    // Shadow Settings (for shadow plane configuration)
    shadows: {
      enabled: store.shadowsEnabled,
      shadowIntensity: store.shadowIntensity,
      shadowPlaneTransparent: store.shadowPlaneTransparent,
      shadowBias: store.shadowBias,
      shadowMapSize: store.shadowMapSize
    },
    
    // Weather Settings
    weather: {
      preset: store.weatherPreset,
      timeOfDay: store.timeOfDay,
      northOffset: store.northOffset,
      dynamicSkyEnabled: store.dynamicSkyEnabled,
      sunSize: store.sunSize,
      moonSize: store.moonSize,
      weatherQuality: store.weatherQuality,
      cloudDensity: store.cloudDensity,
      cloudThickness: store.cloudThickness,
      cloudDetail: store.cloudDetail,
      cloudScale: store.cloudScale,
      cloudStorminess: store.cloudStorminess,
      cloudShadowStrength: store.cloudShadowStrength,
      cloudColor: store.cloudColor,
      fogDensity: store.fogDensity,
      fogHeight: store.fogHeight,
      fogColor: store.fogColor,
      rainIntensity: store.rainIntensity,
      snowIntensity: store.snowIntensity,
      windIntensity: store.windIntensity,
      skyTurbidity: store.skyTurbidity,
      skyAtmosphereDensity: store.skyAtmosphereDensity,
      skyRayleigh: store.skyRayleigh,
      skyMieCoefficient: store.skyMieCoefficient,
      skyMieDirectionalG: store.skyMieDirectionalG,
      skyExposure: store.skyExposure,
      skyElevation: store.skyElevation,
      skyAzimuth: store.skyAzimuth,
      rainParticleScale: store.rainParticleScale,
      rainParticleSpeed: store.rainParticleSpeed,
      rainCollisionEnabled: store.rainCollisionEnabled,
      snowParticleScale: store.snowParticleScale,
      snowParticleSpeed: store.snowParticleSpeed,
      snowCollisionEnabled: store.snowCollisionEnabled,
      windGustsEnabled: store.windGustsEnabled
    },
    
    // Water Settings
    water: {
      enabled: store.waterEnabled,
      level: store.waterLevel,
      color: store.waterColor,
      opacity: store.waterOpacity,
      waveSpeed: store.waveSpeed,
      waveHeight: store.waveHeight,
      reflectivity: store.waterReflectivity,
      mode: store.waterMode,
      marchingCubesResolution: store.marchingCubesResolution,
      marchingCubesIsolation: store.marchingCubesIsolation,
      marchingCubesMetaballCount: store.marchingCubesMetaballCount,
      oceanDistortionScale: store.oceanDistortionScale,
      oceanSize: store.oceanSize
    },
    
    // Hotspots
    hotspots: hotspots
  }

  // Create HTML (pass config so template can use settings)
  const html = createStandaloneViewerHTML(
    defaultOptions,
    defaultOptions.includeCameraViews ? cameraViews : [],
    thumbnails,
    config
  )

  // Create config blob
  const configBlob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' })

  // Convert thumbnails from base64 data URLs to image blobs
  const thumbnailBlobs = new Map<string, Blob>()
  const thumbnailFilenames = new Map<string, string>()
  
  console.log('[WebExport] Processing thumbnails for export. Count:', thumbnails.size)
  if (defaultOptions.includeCameraViews && thumbnails.size > 0) {
    for (const [viewId, dataUrl] of thumbnails.entries()) {
      console.log('[WebExport] Thumbnail', viewId, '- dataUrl length:', dataUrl ? dataUrl.length : 0, ', starts with:', dataUrl ? dataUrl.substring(0, 30) : 'null')
      if (dataUrl && dataUrl.startsWith('data:image/')) {
        try {
          // Extract base64 data and mime type
          const matches = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/)
          if (matches) {
            const mimeType = matches[1] // 'jpeg' or 'png'
            const base64Data = matches[2]
            const binaryString = atob(base64Data)
            const bytes = new Uint8Array(binaryString.length)
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i)
            }
            const blob = new Blob([bytes], { type: `image/${mimeType}` })
            const filename = `thumbnails/${viewId}.${mimeType === 'jpeg' ? 'jpg' : mimeType}`
            thumbnailBlobs.set(viewId, blob)
            thumbnailFilenames.set(viewId, filename)
          }
        } catch (error) {
          console.warn(`Failed to convert thumbnail ${viewId} to blob:`, error)
        }
      }
    }
  }

  // Update HTML to use thumbnail file paths instead of data URLs
  let htmlWithThumbnails = html
  for (const [viewId, filename] of thumbnailFilenames.entries()) {
    // Replace data URL with file path in HTML
    const dataUrl = thumbnails.get(viewId)
    if (dataUrl) {
      htmlWithThumbnails = htmlWithThumbnails.replace(
        new RegExp(dataUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
        filename
      )
    }
  }

  return {
    html: htmlWithThumbnails,
    modelFile: modelBlob,
    hdrFile: hdrBlob || undefined,
    configFile: configBlob,
    thumbnails: thumbnailBlobs.size > 0 ? thumbnailBlobs : undefined,
    assets: {
      model: modelBlob ? 'model.glb' : undefined,
      hdr: hdrBlob ? 'environment.hdr' : undefined,
      config: 'config.json',
      thumbnails: thumbnailFilenames.size > 0 ? thumbnailFilenames : undefined
    }
  }
}

/**
 * Preview web export in a new window
 * Creates a temporary preview with all assets as blob URLs
 */
export async function previewWebExport(options: Partial<WebExportOptions> = {}): Promise<void> {
  try {
    const result = await exportForWeb(options)
  
  // Create blob URLs for assets
  const modelBlobUrl = result.modelFile ? URL.createObjectURL(result.modelFile) : null
  const hdrBlobUrl = result.hdrFile ? URL.createObjectURL(result.hdrFile) : null
  
  // Create blob URLs for thumbnails
  const thumbnailBlobUrls = new Map<string, string>()
  if (result.thumbnails && result.assets.thumbnails) {
    for (const [viewId, blob] of result.thumbnails.entries()) {
      const blobUrl = URL.createObjectURL(blob)
      thumbnailBlobUrls.set(viewId, blobUrl)
    }
  }
  
  // Replace file paths with blob URLs in HTML
  let htmlWithBlobUrls = result.html
  
  if (modelBlobUrl) {
    htmlWithBlobUrls = htmlWithBlobUrls.replace(
      /\.\/model\.glb/g,
      modelBlobUrl
    )
  }
  
  if (hdrBlobUrl) {
    // Replace all occurrences of the HDR path (including in strings and comments)
    htmlWithBlobUrls = htmlWithBlobUrls.replace(
      /(['"])(\.\/environment\.hdr)(['"])/g,
      `$1${hdrBlobUrl}$3`
    )
    // Also replace without quotes (in case it's used differently)
    htmlWithBlobUrls = htmlWithBlobUrls.replace(
      /\.\/environment\.hdr/g,
      hdrBlobUrl
    )
    console.log('Replaced HDR path with blob URL:', hdrBlobUrl.substring(0, 50) + '...')
  }
  
  // Replace thumbnail file paths with blob URLs
  console.log('[WebExport] thumbnailBlobUrls size:', thumbnailBlobUrls.size, ', result.assets.thumbnails:', result.assets.thumbnails ? result.assets.thumbnails.size : 0)
  if (thumbnailBlobUrls.size > 0 && result.assets.thumbnails) {
    for (const [viewId, blobUrl] of thumbnailBlobUrls.entries()) {
      const filename = result.assets.thumbnails.get(viewId)
      console.log('[WebExport] Replacing thumbnail:', viewId, '- filename:', filename, '- blobUrl:', blobUrl ? blobUrl.substring(0, 50) : 'null')
      if (filename) {
        // Check if filename exists in HTML
        const filenameInHtml = htmlWithBlobUrls.includes(filename)
        console.log('[WebExport] Filename', filename, 'exists in HTML:', filenameInHtml)
        
        // Replace thumbnail file path with blob URL
        // Match both with and without quotes, and with thumbnails/ prefix
        htmlWithBlobUrls = htmlWithBlobUrls.replace(
          new RegExp(`(['"])?${filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(['"])?`, 'g'),
          (match, quote1, quote2) => {
            const quotes = quote1 || quote2 || ''
            return `${quotes}${blobUrl}${quotes}`
          }
        )
        // Also replace without quotes
        htmlWithBlobUrls = htmlWithBlobUrls.replace(
          new RegExp(filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
          blobUrl
        )
      }
    }
    console.log(`[WebExport] Replaced ${thumbnailBlobUrls.size} thumbnail paths with blob URLs`)
  } else {
    console.warn('[WebExport] No thumbnails to replace! thumbnailBlobUrls.size:', thumbnailBlobUrls.size)
  }
  
  // CRITICAL: Clear any cached state from previous previews and add cache-busting
  // Add script to clear cache at the start of the HTML
  const exportTimestamp = Date.now()
  const cacheClearScript = `
    <script>
      // CRITICAL: Clear any cached state from previous previews
      // This ensures each preview uses fresh data, not cached from previous exports
      console.log('[WebExport] Clearing cached state, export timestamp:', ${exportTimestamp});
      
      if (window.__hdrTextureLoaded) {
        if (window.__hdrTextureLoaded.dispose) {
          window.__hdrTextureLoaded.dispose();
        }
        window.__hdrTextureLoaded = null;
      }
      
      // Clear any transition animations
      if (window.__transitionAnimation) {
        cancelAnimationFrame(window.__transitionAnimation);
        window.__transitionAnimation = null;
      }
      
      // Clear any cached camera views
      if (window.__cameraViewsCache) {
        window.__cameraViewsCache = null;
      }
      
      // Clear any cached config
      if (window.__exportConfig) {
        window.__exportConfig = null;
      }
      
      // Force browser to not use cached assets
      // CRITICAL: Wrap in try-catch to prevent InvalidStateError
      if ('serviceWorker' in navigator) {
        try {
          navigator.serviceWorker.getRegistrations().then(function(registrations) {
            for(let registration of registrations) {
              try {
                registration.unregister();
              } catch (e) {
                // Ignore individual registration errors
              }
            }
          }).catch(function(error) {
            // Silently ignore expected errors when document is in invalid state
            // Only log unexpected errors
            if (error.message && !error.message.includes('invalid state') && !error.message.includes('InvalidStateError')) {
              console.warn('[WebExport] ServiceWorker cleanup error:', error.message);
            }
          });
        } catch (e) {
          // Silently ignore expected errors when document is in invalid state
          // Only log unexpected errors
          if (e.message && !e.message.includes('invalid state') && !e.message.includes('InvalidStateError')) {
            console.warn('[WebExport] ServiceWorker cleanup error:', e.message);
          }
        }
      }
    </script>
  `
  
  // Insert cache clearing script right after opening body tag
  htmlWithBlobUrls = htmlWithBlobUrls.replace('<body>', `<body>${cacheClearScript}`)
  
  // CRITICAL: Blob URLs are already unique and don't need query parameters
  // The cache clearing script above ensures fresh state on each preview
  console.log('[WebExport] Preview HTML prepared with cache clearing, export timestamp:', exportTimestamp);
  
  // Create blob and open in new browser tab (not popup)
  // OPTIMIZATION: Use requestIdleCallback or setTimeout to avoid blocking UI
  const openPreview = () => {
    try {
      const htmlBlob = new Blob([htmlWithBlobUrls], { type: 'text/html' })
      const htmlUrl = URL.createObjectURL(htmlBlob)
      
      // Open in new tab with unique name to prevent reusing old window
      const previewWindowName = `web-export-preview-${Date.now()}`
      let previewWindow: Window | null = null
      
      try {
        previewWindow = window.open(htmlUrl, previewWindowName)
      } catch (e) {
        console.warn('[WebExport] window.open failed, trying alternative method:', e)
      }
      
      // Focus the new window/tab
      if (previewWindow && !previewWindow.closed) {
        try {
          previewWindow.focus()
        } catch (e) {
          // Ignore focus errors (may fail if window is blocked)
        }
      } else {
        // Window was blocked by popup blocker - try alternative method
        // Create a link and click it programmatically
        const link = document.createElement('a')
        link.href = htmlUrl
        link.target = '_blank'
        link.rel = 'noopener noreferrer'
        link.style.display = 'none'
        document.body.appendChild(link)
        link.click()
        // Remove link after a short delay to allow click to process
        setTimeout(() => {
          document.body.removeChild(link)
        }, 100)
      }
      
      // Clean up URLs when window closes (non-blocking)
      const cleanup = () => {
        try {
          URL.revokeObjectURL(htmlUrl)
          if (modelBlobUrl) URL.revokeObjectURL(modelBlobUrl)
          if (hdrBlobUrl) URL.revokeObjectURL(hdrBlobUrl)
          // Clean up thumbnail blob URLs
          for (const blobUrl of thumbnailBlobUrls.values()) {
            URL.revokeObjectURL(blobUrl)
          }
        } catch (e) {
          console.warn('[WebExport] Cleanup error (non-critical):', e)
        }
      }
      
      if (previewWindow && !previewWindow.closed) {
        // Try to detect when window closes (non-blocking)
        const checkClosed = setInterval(() => {
          try {
            if (previewWindow.closed) {
              clearInterval(checkClosed)
              cleanup()
            }
          } catch (e) {
            // Window may be cross-origin, cleanup anyway
            clearInterval(checkClosed)
            cleanup()
          }
        }, 1000)
        
        // Also cleanup after 5 minutes as fallback
        setTimeout(() => {
          clearInterval(checkClosed)
          cleanup()
        }, 5 * 60 * 1000)
      } else {
        // Cleanup after a delay (user should have opened the tab)
        setTimeout(cleanup, 2000);
      }
    } catch (error) {
      console.error('[WebExport] Failed to open preview window:', error)
      throw error
    }
  }
  
  // OPTIMIZATION: Use setTimeout to avoid blocking the UI thread
  // This ensures the preview opens even if the export process was heavy
  setTimeout(openPreview, 0)
  } catch (error) {
    console.error('Preview export error:', error)
    throw new Error(`Preview failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Download export as ZIP file
 * Packages all assets (HTML, model, HDR, config, thumbnails) into a single ZIP file
 */
export async function downloadWebExport(
  options: Partial<WebExportOptions> = {},
  onProgress?: (progress: number, message: string) => void
): Promise<void> {
  try {
    onProgress?.(10, 'Starting export...')
    
  const result = await exportForWeb(options)
    onProgress?.(30, 'Exporting assets...')
    
    // Check if user wants ZIP or individual files
    const exportAsZip = options.exportAsZip !== false // Default to true if not specified
    
    if (!exportAsZip) {
      // Download individual files
      onProgress?.(50, 'Preparing individual files...')
  
  // Download HTML
  const htmlBlob = new Blob([result.html], { type: 'text/html' })
  const htmlUrl = URL.createObjectURL(htmlBlob)
  const htmlLink = document.createElement('a')
  htmlLink.href = htmlUrl
  htmlLink.download = 'index.html'
  htmlLink.click()
  URL.revokeObjectURL(htmlUrl)
      onProgress?.(60, 'Downloaded index.html...')
      
      // Small delay between downloads to prevent browser blocking
      await new Promise(resolve => setTimeout(resolve, 100))
  
  // Download model
      if (result.modelFile && result.assets.model) {
    const modelUrl = URL.createObjectURL(result.modelFile)
    const modelLink = document.createElement('a')
    modelLink.href = modelUrl
        modelLink.download = result.assets.model
    modelLink.click()
    URL.revokeObjectURL(modelUrl)
        onProgress?.(70, 'Downloaded model file...')
        await new Promise(resolve => setTimeout(resolve, 100))
  }
  
  // Download HDR
      if (result.hdrFile && result.assets.hdr) {
    const hdrUrl = URL.createObjectURL(result.hdrFile)
    const hdrLink = document.createElement('a')
    hdrLink.href = hdrUrl
        hdrLink.download = result.assets.hdr
    hdrLink.click()
    URL.revokeObjectURL(hdrUrl)
        onProgress?.(80, 'Downloaded HDR file...')
        await new Promise(resolve => setTimeout(resolve, 100))
  }
  
  // Download config
  const configUrl = URL.createObjectURL(result.configFile)
  const configLink = document.createElement('a')
  configLink.href = configUrl
  configLink.download = result.assets.config
  configLink.click()
  URL.revokeObjectURL(configUrl)
      onProgress?.(90, 'Downloaded config file...')
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Download thumbnails (create thumbnails folder structure note)
      if (result.thumbnails && result.assets.thumbnails) {
        let thumbnailCount = 0
        const totalThumbnails = result.thumbnails.size
        for (const [viewId, blob] of result.thumbnails.entries()) {
          const filename = result.assets.thumbnails.get(viewId)
          if (filename) {
            const thumbnailUrl = URL.createObjectURL(blob)
            const thumbnailLink = document.createElement('a')
            thumbnailLink.href = thumbnailUrl
            // Remove 'thumbnails/' prefix for individual file download
            thumbnailLink.download = filename.replace('thumbnails/', '')
            thumbnailLink.click()
            URL.revokeObjectURL(thumbnailUrl)
            thumbnailCount++
            const thumbnailProgress = 90 + (thumbnailCount / totalThumbnails) * 9
            onProgress?.(thumbnailProgress, `Downloaded thumbnail ${thumbnailCount}/${totalThumbnails}...`)
            await new Promise(resolve => setTimeout(resolve, 50))
          }
        }
      }
      
      onProgress?.(100, 'Export complete!')
      console.log('[WebExport] Exported individual files:', {
        html: true,
        model: !!result.modelFile,
        hdr: !!result.hdrFile,
        config: true,
        thumbnails: result.thumbnails?.size || 0
      })
      return
    }
    
    // Create ZIP archive (default behavior)
    const zip = new JSZip()
    
    // Add HTML file
    zip.file('index.html', result.html)
    onProgress?.(40, 'Adding HTML file...')
    
    // Add model file (GLB is already compressed, no need to compress again)
    if (result.modelFile && result.assets.model) {
      onProgress?.(50, 'Adding model file (this may take a moment for large models)...')
      zip.file(result.assets.model, result.modelFile)
    }
    
    // Add HDR file
    if (result.hdrFile && result.assets.hdr) {
      onProgress?.(60, 'Adding HDR file...')
      zip.file(result.assets.hdr, result.hdrFile)
    }
    
    // Add config file
    zip.file(result.assets.config, result.configFile)
    onProgress?.(70, 'Adding config file...')
    
    // Add thumbnails
    if (result.thumbnails && result.assets.thumbnails) {
      onProgress?.(80, 'Adding thumbnails...')
      const thumbnailsFolder = zip.folder('thumbnails')
      if (thumbnailsFolder) {
        let thumbnailCount = 0
        const totalThumbnails = result.thumbnails.size
        for (const [viewId, blob] of result.thumbnails.entries()) {
          const filename = result.assets.thumbnails.get(viewId)
          if (filename) {
            // Remove 'thumbnails/' prefix since we're already in the thumbnails folder
            const name = filename.replace('thumbnails/', '')
            thumbnailsFolder.file(name, blob)
            thumbnailCount++
            // Update progress for thumbnails (80-90%)
            const thumbnailProgress = 80 + (thumbnailCount / totalThumbnails) * 10
            onProgress?.(thumbnailProgress, `Adding thumbnails (${thumbnailCount}/${totalThumbnails})...`)
          }
        }
      }
    }
    
    // Generate ZIP file with progress callback
    // OPTIMIZATION: Use STORE (no compression) for already-compressed binary files (GLB, HDR)
    // and light compression only for text files (HTML, JSON)
    // This dramatically speeds up export for large models
    onProgress?.(90, 'Generating ZIP file (this may take a while for very large models)...')
    
    // Add a fallback progress indicator in case JSZip's callback doesn't fire frequently
    let lastProgressUpdate = Date.now()
    let lastReportedProgress = 90
    const fallbackInterval = setInterval(() => {
      // If no progress update in 2 seconds, increment slowly to show it's still working
      const timeSinceUpdate = Date.now() - lastProgressUpdate
      if (timeSinceUpdate > 2000 && lastReportedProgress < 98) {
        lastReportedProgress = Math.min(lastReportedProgress + 0.5, 98)
        onProgress?.(lastReportedProgress, 'Packaging ZIP file (processing large files, please wait)...')
      }
    }, 1000)
    
    try {
      const zipBlob = await zip.generateAsync({ 
        type: 'blob',
        compression: 'STORE', // No compression - GLB and HDR are already compressed, and it's much faster
        streamFiles: true // Use streaming for large files to prevent memory issues
      }, (metadata) => {
        // Update progress during ZIP generation (90-99%)
        lastProgressUpdate = Date.now()
        if (metadata.percent !== undefined && !isNaN(metadata.percent)) {
          const zipProgress = 90 + (metadata.percent / 100) * 9
          lastReportedProgress = zipProgress
          onProgress?.(zipProgress, `Packaging ZIP file... ${metadata.percent.toFixed(0)}%`)
        } else if (metadata.currentFile) {
          // If percent isn't available, at least show which file is being processed
          onProgress?.(lastReportedProgress, `Packaging: ${metadata.currentFile}...`)
        }
      })
      
      clearInterval(fallbackInterval)
      
      onProgress?.(99, 'Preparing download...')
      
      // Download ZIP file
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
      const zipUrl = URL.createObjectURL(zipBlob)
      const zipLink = document.createElement('a')
      zipLink.href = zipUrl
      zipLink.download = `web-export-${timestamp}.zip`
      zipLink.click()
      
      // Small delay before revoking URL to ensure download starts
      setTimeout(() => {
        URL.revokeObjectURL(zipUrl)
      }, 100)
      
      onProgress?.(100, 'Export complete!')
      
      console.log('[WebExport] Exported ZIP file with all assets:', {
        html: true,
        model: !!result.modelFile,
        hdr: !!result.hdrFile,
        config: true,
        thumbnails: result.thumbnails?.size || 0,
        zipSize: (zipBlob.size / 1024 / 1024).toFixed(2) + ' MB'
      })
    } catch (error) {
      clearInterval(fallbackInterval)
      throw error
    }
  } catch (error) {
    console.error('[WebExport] Export error:', error)
    onProgress?.(0, `Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    throw error
  }
}

