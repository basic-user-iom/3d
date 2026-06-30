/**
 * Helper Visibility Hook
 * 
 * Manages visibility of scene helpers (grid, axes, shadow plane, gizmos, etc.)
 * Extracted from App.tsx to improve code organization.
 */

import { useEffect } from 'react'
import type { ViewerInstance } from '../viewer/ViewerCanvas'
import { useAppStore } from '../store/useAppStore'
import { applySceneHelperVisibility } from '../viewer/utils/sceneHelperVisibility'
import { wakeViewerRender } from '../viewer/utils/wakeViewerRender'

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

    applySceneHelperVisibility(viewer.scene, {
      showGrid,
      showAxes,
      showShadowPlane,
      showLightHelpers,
      showShaderEditorPanel,
      streetsGLIframeOverlay,
      hdrEnabled,
      hdrGroundProjectionEnabled,
      shadowsEnabled
    })
    
    // Update bounding boxes
    if ((viewer as any).updateBoundingBoxes) {
      (viewer as any).updateBoundingBoxes()
    }

    // Idle render pause may be active; repaint after visibility mutations.
    wakeViewerRender(viewer)
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


