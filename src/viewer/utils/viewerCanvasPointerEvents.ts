import type { TransformControls } from 'three-stdlib'

export type ViewerCanvasPointerEventStore = {
  streetsGLIframeOverlay: boolean
  renderMode: 'product' | 'city' | 'hybrid'
  streetsGLIframeInteractive: boolean
}

export function shouldViewerCanvasReceivePointerEvents(
  store: ViewerCanvasPointerEventStore,
  transformControls?: TransformControls | null
): boolean {
  const hasTransformControlsAttached =
    !!transformControls && (transformControls as any).object !== undefined

  // Standard/product mode: always keep Three.js navigation (orbit/pan/zoom).
  if (store.renderMode === 'product') return true

  // No Streets GL overlay — pure Three.js viewer.
  if (!store.streetsGLIframeOverlay) return true

  if (hasTransformControlsAttached) return true

  // Hybrid with non-interactive map underlay: Three.js canvas receives input.
  if (store.renderMode === 'hybrid' && !store.streetsGLIframeInteractive) return true

  return false
}

export function applyViewerCanvasPointerEvents(
  canvas: HTMLElement,
  store: ViewerCanvasPointerEventStore,
  transformControls?: TransformControls | null
): void {
  const receiveEvents = shouldViewerCanvasReceivePointerEvents(store, transformControls)
  canvas.style.pointerEvents = receiveEvents ? 'auto' : 'none'
}
