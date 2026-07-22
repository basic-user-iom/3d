import * as THREE from 'three'
import type { LoadedModel } from '../useViewer'
import { getSharedViewer } from '../useViewer'
import type { ModelFormat } from '../../lib/detectFormat'

let activeOverlayHost: HTMLDivElement | null = null
let activeOverlayFrame: HTMLIFrameElement | null = null
let activeRequestId: string | null = null

export interface SuspendedSplatOverlay {
  root: THREE.Object3D
  host: HTMLDivElement
  frame: HTMLIFrameElement
  requestId: string
  url: string
  shouldRevoke: boolean
  container: HTMLElement | null
}

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

function clearActiveIfMatches(requestId: string): void {
  if (activeRequestId === requestId) {
    activeOverlayFrame = null
    activeOverlayHost = null
    activeRequestId = null
  }
}

/**
 * Soft-detach a splat overlay from the viewer without revoking its object URL.
 * Safe for delete→undo; pair with {@link resumeSplatOverlayRoot}.
 */
export function suspendSplatOverlayRoot(root: THREE.Object3D): SuspendedSplatOverlay | null {
  if (root.userData?.gaussianSplatOverlay !== true) {
    return null
  }
  if (root.userData.splatOverlaySuspended === true) {
    // Already suspended — reconstruct from stored metadata when possible.
    const host = root.userData.splatOverlayHost as HTMLDivElement | undefined
    const frame = root.userData.splatOverlayFrame as HTMLIFrameElement | undefined
    const requestId = root.userData.splatRequestId as string | undefined
    if (!host || !frame || !requestId) return null
    return {
      root,
      host,
      frame,
      requestId,
      url: (root.userData.splatObjectUrl as string | undefined) || '',
      shouldRevoke: root.userData.splatShouldRevoke === true,
      container: root.userData.splatOverlayContainer as HTMLElement | null | undefined ?? null
    }
  }

  const host = root.userData.splatOverlayHost as HTMLDivElement | undefined
  const frame = root.userData.splatOverlayFrame as HTMLIFrameElement | undefined
  const requestId = root.userData.splatRequestId as string | undefined
  if (!host || !frame || !requestId) {
    return null
  }

  const container = host.parentElement
  root.userData.splatOverlayContainer = container
  host.remove()
  clearActiveIfMatches(requestId)
  root.userData.splatOverlaySuspended = true

  return {
    root,
    host,
    frame,
    requestId,
    url: (root.userData.splatObjectUrl as string | undefined) || '',
    shouldRevoke: root.userData.splatShouldRevoke === true,
    container
  }
}

/** Re-attach a previously suspended splat overlay. */
export function resumeSplatOverlayRoot(suspended: SuspendedSplatOverlay): boolean {
  const container =
    suspended.container ||
    (suspended.root.userData.splatOverlayContainer as HTMLElement | null | undefined) ||
    getSharedViewer()?.renderer?.domElement?.parentElement ||
    null

  if (!container) {
    return false
  }

  // Only one active overlay is supported; drop a different live overlay first.
  if (activeRequestId && activeRequestId !== suspended.requestId) {
    removeActiveOverlay()
  }

  if (window.getComputedStyle(container).position === 'static') {
    container.style.position = 'relative'
  }

  container.appendChild(suspended.host)
  activeOverlayHost = suspended.host
  activeOverlayFrame = suspended.frame
  activeRequestId = suspended.requestId
  suspended.root.userData.splatOverlaySuspended = false
  suspended.root.userData.splatOverlayContainer = container
  suspended.container = container
  return true
}

/** Irreversibly dispose a suspended overlay (DOM + optional blob URL). */
export function disposeSuspendedSplatOverlay(suspended: SuspendedSplatOverlay): void {
  clearActiveIfMatches(suspended.requestId)
  try {
    suspended.frame.remove()
  } catch {
    /* ignore */
  }
  try {
    suspended.host.remove()
  } catch {
    /* ignore */
  }
  if (suspended.shouldRevoke && suspended.url) {
    try {
      URL.revokeObjectURL(suspended.url)
    } catch {
      /* ignore */
    }
  }
  const root = suspended.root as THREE.Object3D & { dispose?: () => void }
  root.dispose = undefined
  root.userData.splatOverlaySuspended = false
  root.userData.splatOverlayHost = undefined
  root.userData.splatOverlayFrame = undefined
  root.userData.splatObjectUrl = undefined
  root.userData.splatShouldRevoke = false
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
  root.userData.splatOverlayHost = host
  root.userData.splatOverlayFrame = frame
  root.userData.splatRequestId = requestId
  root.userData.splatOverlayContainer = container
  root.userData.splatShouldRevoke = shouldRevoke
  if (shouldRevoke) {
    root.userData.splatObjectUrl = url
  }
  root.userData.gaussianSplatBoundsCache = new THREE.Box3(
    new THREE.Vector3(-2, -2, -2),
    new THREE.Vector3(2, 2, 2)
  )
  root.userData.gaussianSplatBoundsCacheCount = 1

  root.dispose = () => {
    if (root.userData.splatOverlaySuspended === true) {
      disposeSuspendedSplatOverlay({
        root,
        host,
        frame,
        requestId,
        url,
        shouldRevoke,
        container: (root.userData.splatOverlayContainer as HTMLElement | null) ?? null
      })
      return
    }
    if (activeRequestId === requestId) {
      removeActiveOverlay()
    } else {
      try {
        frame.remove()
        host.remove()
      } catch {
        /* ignore */
      }
    }
    if (shouldRevoke) {
      URL.revokeObjectURL(url)
    }
    root.userData.splatOverlayHost = undefined
    root.userData.splatOverlayFrame = undefined
    root.userData.splatObjectUrl = undefined
    root.userData.splatShouldRevoke = false
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
