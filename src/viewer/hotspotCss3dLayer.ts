import * as THREE from 'three'
import { CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js'

export type HotspotCss3dLayer = {
  renderer: CSS3DRenderer
  domElement: HTMLElement
  rebuildCache: () => void
  render: (scene: THREE.Scene, camera: THREE.Camera) => void
  setSize: (width: number, height: number) => void
  dispose: () => void
  hasPanels: () => boolean
}

/**
 * Screen-space CSS3D layer for YouTube / interactive hotspot panels.
 * Sits above the WebGL canvas so connector lines never cover the video,
 * while the container keeps pointer-events:none (children opt back in).
 */
export function createHotspotCss3dLayer(container: HTMLElement): HotspotCss3dLayer {
  const renderer = new CSS3DRenderer()
  const domElement = renderer.domElement

  domElement.className = 'hotspot-css3d-layer'
  domElement.style.position = 'absolute'
  domElement.style.inset = '0'
  domElement.style.width = '100%'
  domElement.style.height = '100%'
  domElement.style.pointerEvents = 'none'
  // Above #viewer-canvas (20) and weather-raised canvas (30)
  domElement.style.zIndex = '40'
  domElement.style.overflow = 'hidden'

  container.appendChild(domElement)

  let cachedPanels: THREE.Object3D[] = []
  let dirty = true

  const rebuildCache = () => {
    dirty = true
  }

  const refreshCache = (scene: THREE.Scene) => {
    cachedPanels = []
    scene.traverse((obj) => {
      if (obj.userData?.isCSS3DPanel && obj.userData?.isHotspotPanel) {
        cachedPanels.push(obj)
      }
    })
    dirty = false
  }

  const hasPanels = () => {
    if (dirty) return true // assume yes until refreshed during render
    return cachedPanels.some((panel) => panel.visible && panel.parent)
  }

  const render = (scene: THREE.Scene, camera: THREE.Camera) => {
    if (dirty) {
      refreshCache(scene)
    }
    const visible = cachedPanels.some((panel) => panel.visible && panel.parent)
    domElement.style.display = visible ? 'block' : 'none'
    if (!visible) return
    renderer.render(scene, camera)
  }

  const setSize = (width: number, height: number) => {
    renderer.setSize(width, height)
  }

  const dispose = () => {
    if (domElement.parentNode) {
      domElement.parentNode.removeChild(domElement)
    }
    cachedPanels = []
    if (typeof (window as any).__rebuildCSS3DCache === 'function' &&
        (window as any).__rebuildCSS3DCache === rebuildCache) {
      delete (window as any).__rebuildCSS3DCache
    }
  }

  ;(window as any).__rebuildCSS3DCache = rebuildCache

  return {
    renderer,
    domElement,
    rebuildCache,
    render,
    setSize,
    dispose,
    hasPanels
  }
}
