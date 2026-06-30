import * as THREE from 'three'
import { effectiveShadowPlaneVisible } from './hdrGroundShadowCatcher'

export interface SceneHelperVisibilityInput {
  showGrid: boolean
  showAxes: boolean
  showShadowPlane: boolean
  showLightHelpers: boolean
  showShaderEditorPanel: boolean
  streetsGLIframeOverlay: boolean
  hdrEnabled: boolean
  hdrGroundProjectionEnabled: boolean
  shadowsEnabled: boolean
}

/** Apply grid/axes/shadow-plane/gizmo visibility from UI store state. */
export function applySceneHelperVisibility(
  scene: THREE.Object3D,
  input: SceneHelperVisibilityInput
): void {
  const forceHideHelpers = input.streetsGLIframeOverlay
  const effectiveShowShadowPlane = effectiveShadowPlaneVisible(input.showShadowPlane, {
    hdrEnabled: input.hdrEnabled,
    hdrGroundProjectionEnabled: input.hdrGroundProjectionEnabled,
    shadowsEnabled: input.shadowsEnabled
  })

  scene.traverse((obj: THREE.Object3D) => {
    if (obj.userData.isGridHelper || obj instanceof THREE.GridHelper) {
      obj.visible = forceHideHelpers ? false : input.showGrid
    }
    if (obj.userData.isAxesHelper || obj instanceof THREE.AxesHelper) {
      obj.visible = forceHideHelpers ? false : input.showAxes
    }
    if (obj.userData.isShadowPlane) {
      obj.visible = forceHideHelpers ? false : effectiveShowShadowPlane
    }
    if (obj.userData.isLightGizmo) {
      const light = obj.userData.light as THREE.Light | undefined
      obj.visible = input.showLightHelpers && (light ? light.visible : true)
    }
    if (obj.userData.isDemoShaderScreen && obj.name === 'CineShaderDemoScreenGroup') {
      obj.visible = input.showShaderEditorPanel
    }
  })
}
