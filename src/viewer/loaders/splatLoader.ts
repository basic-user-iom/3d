import * as THREE from 'three'
import type { LoadedModel } from '../useViewer'
import { getSharedViewer } from '../useViewer'
import type { ModelFormat } from '../../lib/detectFormat'

let activeOverlayHost: HTMLDivElement | null = null
let activeOverlayFrame: HTMLIFrameElement | null = null
let activeRequestId: string | null = null

function getSplatUrl(
  data: File | ArrayBuffer | string,
  _format: ModelFormat
): { url: string; shouldRevoke: boolean } {
  if (typeof data === 'string') {
    return { url: data, shouldRevoke: false }
  }
  if (data instanceof File) {
    return { url: URL.createObjectURL(data), shouldRevoke: true }
  }
  if (data instanceof ArrayBuffer) {
    return { url: URL.createObjectURL(new Blob([data])), shouldRevoke: true }
  }
  throw new Error('Splat loader: invalid data type')
}

function removeActiveOverlay(): void {
  activeOverlayFrame?.remove()
  activeOverlayHost?.remove()
  activeOverlayFrame = null
  activeOverlayHost = null
  activeRequestId = null
}

export async function loadSplat(
  data: File | ArrayBuffer | string,
  format: ModelFormat,
  _baseUrl?: string,
  _onProgress?: (progress: number) => void
): Promise<LoadedModel> {
  const viewer = getSharedViewer()
  if (!viewer?.renderer) {
    throw new Error(
      'Viewer not ready. The 3D viewer must be initialized before loading Gaussian splat files.'
    )
  }

  const container = viewer.renderer.domElement?.parentElement
  if (!container) {
    throw new Error('Splat loader could not find the viewer container element.')
  }

  const { url, shouldRevoke } = getSplatUrl(data, format)
  const requestId = `splat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const overlayUrl = `/splat-smoke.html?embedded=1&requestId=${encodeURIComponent(requestId)}&format=${encodeURIComponent(format)}&src=${encodeURIComponent(url)}`

  removeActiveOverlay()

  if (window.getComputedStyle(container).position === 'static') {
    container.style.position = 'relative'
  }

  const host = document.createElement('div')
  host.dataset.splatOverlayHost = 'true'
  host.style.position = 'absolute'
  host.style.inset = '0'
  host.style.zIndex = '50'
  host.style.background = '#000'

  const frame = document.createElement('iframe')
  frame.src = overlayUrl
  frame.style.width = '100%'
  frame.style.height = '100%'
  frame.style.border = '0'
  frame.style.background = '#000'
  frame.setAttribute('allow', 'fullscreen')

  host.appendChild(frame)
  container.appendChild(host)

  activeOverlayHost = host
  activeOverlayFrame = frame
  activeRequestId = requestId

  const root = new THREE.Group() as THREE.Group & {
    dispose?: () => void
  }
  root.name = 'Gaussian Splat'
  root.visible = false
  root.userData.isGaussianSplatViewer = true
  root.userData.format = format
  root.userData.gaussianSplatOverlay = true
  if (shouldRevoke) {
    root.userData.splatObjectUrl = url
  }
  root.userData.gaussianSplatBoundsCache = new THREE.Box3(
    new THREE.Vector3(-2, -2, -2),
    new THREE.Vector3(2, 2, 2)
  )
  root.userData.gaussianSplatBoundsCacheCount = 1

  root.dispose = () => {
    if (activeRequestId === requestId) {
      removeActiveOverlay()
    }
    if (shouldRevoke) {
      URL.revokeObjectURL(url)
    }
  }

  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener('message', onMessage)
      reject(new Error('Timed out waiting for the dedicated splat viewer to load.'))
    }, 120000)

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return
      }
      const payload = event.data
      if (!payload || payload.requestId !== requestId || payload.type !== 'splat-overlay-status') {
        return
      }

      if (payload.status === 'loaded') {
        window.clearTimeout(timeout)
        window.removeEventListener('message', onMessage)
        resolve()
        return
      }

      if (payload.status === 'failed') {
        window.clearTimeout(timeout)
        window.removeEventListener('message', onMessage)
        reject(new Error(payload.message || 'Dedicated splat viewer failed to load.'))
      }
    }

    window.addEventListener('message', onMessage)
  }).catch((error) => {
    root.dispose?.()
    throw error
  })

  return {
    scene: root,
    animations: [],
    userData: { format, isGaussianSplatViewer: true }
  }
}
