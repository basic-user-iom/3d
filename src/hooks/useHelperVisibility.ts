/**
 * Helper Visibility Hook
 * 
 * Manages visibility of scene helpers (grid, axes, shadow plane, gizmos, etc.)
 * Extracted from App.tsx to improve code organization.
 */

import { useEffect } from 'react'
import * as THREE from 'three'
import type { ViewerInstance } from '../viewer/ViewerCanvas'
import { useAppStore } from '../store/useAppStore'
import {
  effectiveShadowPlaneVisible
} from '../viewer/utils/hdrGroundShadowCatcher'

interface UseHelperVisibilityProps {
  viewer: ViewerInstance | null
  showGrid: boolean
  showAxes: boolean
  showShadowPlane: boolean
  showBoundingBoxes: boolean
  showLightHelpers: boolean
  showShaderEditorPanel: boolean
  streetsGLIframeOverlay: boolean
}

export function useHelperVisibility({
  viewer,
  showGrid,
  showAxes,
  showShadowPlane,
  showBoundingBoxes,
  showLightHelpers,
  showShaderEditorPanel,
  streetsGLIframeOverlay
}: UseHelperVisibilityProps) {
  const hdrEnabled = useAppStore((state) => state.hdrEnabled)
  const hdrGroundProjectionEnabled = useAppStore((state) => state.hdrGroundProjectionEnabled)
  const shadowsEnabled = useAppStore((state) => state.shadowsEnabled)

  useEffect(() => {
    if (!viewer) return
    
    // When Streets GL overlay is active, force hide grid/axes/shadow plane (they're not synced with Streets GL coordinate system)
    const forceHideHelpers = streetsGLIframeOverlay
    const effectiveShowShadowPlane = effectiveShadowPlaneVisible(showShadowPlane, {
      hdrEnabled,
      hdrGroundProjectionEnabled,
      shadowsEnabled
    })
    
    viewer.scene.traverse((obj: THREE.Object3D) => {
      if (obj instanceof THREE.GridHelper) {
        // Force hide grid when Streets GL overlay is active - grid is not synced with Streets GL's coordinate system
        obj.visible = forceHideHelpers ? false : showGrid
      }
      if (obj instanceof THREE.AxesHelper) {
        // Force hide axes when Streets GL overlay is active
        obj.visible = forceHideHelpers ? false : showAxes
      }
      if (obj.userData.isShadowPlane) {
        // Force hide shadow plane when Streets GL overlay is active.
        // HDR ground projection auto-shows a transparent shadow catcher even when showShadowPlane is off.
        obj.visible = forceHideHelpers ? false : effectiveShowShadowPlane
      }
      // CRITICAL: Control gizmo visibility based on showLightHelpers setting
      // Both Three.js helpers and gizmos are controlled by the same setting
      if (obj.userData.isLightGizmo) {
        const light = obj.userData.light as THREE.Light | undefined
        obj.visible = showLightHelpers && (light ? light.visible : true)
      }
      // Control CineShader demo screen visibility based on shader editor panel state
      if (obj.userData.isDemoShaderScreen && obj.name === 'CineShaderDemoScreenGroup') {
        obj.visible = showShaderEditorPanel
      }
    })
    
    // Update bounding boxes
    if ((viewer as any).updateBoundingBoxes) {
      (viewer as any).updateBoundingBoxes()
    }
  }, [
    viewer,
    showGrid,
    showAxes,
    showShadowPlane,
    showBoundingBoxes,
    showLightHelpers,
    showShaderEditorPanel,
    streetsGLIframeOverlay,
    hdrEnabled,
    hdrGroundProjectionEnabled,
    shadowsEnabled
  ])
}


