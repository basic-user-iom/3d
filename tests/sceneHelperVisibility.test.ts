import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { applySceneHelperVisibility } from '../src/viewer/utils/sceneHelperVisibility'

describe('applySceneHelperVisibility', () => {
  it('toggles grid and axes via userData flags', () => {
    const scene = new THREE.Scene()
    const grid = new THREE.GridHelper(10, 10)
    grid.userData.isGridHelper = true
    const axes = new THREE.AxesHelper(5)
    axes.userData.isAxesHelper = true
    scene.add(grid, axes)

    applySceneHelperVisibility(scene, {
      showGrid: false,
      showAxes: true,
      showShadowPlane: false,
      showLightHelpers: true,
      showShaderEditorPanel: false,
      streetsGLIframeOverlay: false,
      hdrEnabled: false,
      hdrGroundProjectionEnabled: false,
      shadowsEnabled: false
    })

    expect(grid.visible).toBe(false)
    expect(axes.visible).toBe(true)
  })

  it('auto-shows shadow plane under HDR + shadows even when toggle is off', () => {
    const scene = new THREE.Scene()
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1))
    plane.userData.isShadowPlane = true
    scene.add(plane)

    applySceneHelperVisibility(scene, {
      showGrid: true,
      showAxes: true,
      showShadowPlane: false,
      showLightHelpers: true,
      showShaderEditorPanel: false,
      streetsGLIframeOverlay: false,
      hdrEnabled: true,
      hdrGroundProjectionEnabled: false,
      shadowsEnabled: true
    })

    expect(plane.visible).toBe(true)
  })

  it('forces helpers hidden when Streets GL overlay is active', () => {
    const scene = new THREE.Scene()
    const grid = new THREE.GridHelper(10, 10)
    grid.userData.isGridHelper = true
    scene.add(grid)

    applySceneHelperVisibility(scene, {
      showGrid: true,
      showAxes: true,
      showShadowPlane: true,
      showLightHelpers: true,
      showShaderEditorPanel: false,
      streetsGLIframeOverlay: true,
      hdrEnabled: false,
      hdrGroundProjectionEnabled: false,
      shadowsEnabled: false
    })

    expect(grid.visible).toBe(false)
  })
})
