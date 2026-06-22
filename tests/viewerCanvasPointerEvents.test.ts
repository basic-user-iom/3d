import { describe, expect, it } from 'vitest'
import {
  applyViewerCanvasPointerEvents,
  shouldViewerCanvasReceivePointerEvents,
  type ViewerCanvasPointerEventStore
} from '../src/viewer/utils/viewerCanvasPointerEvents'

const productStandard: ViewerCanvasPointerEventStore = {
  renderMode: 'product',
  streetsGLIframeOverlay: false,
  streetsGLIframeInteractive: false
}

const productWithMapOverlay: ViewerCanvasPointerEventStore = {
  renderMode: 'product',
  streetsGLIframeOverlay: true,
  streetsGLIframeInteractive: true
}

const hybridPassthrough: ViewerCanvasPointerEventStore = {
  renderMode: 'hybrid',
  streetsGLIframeOverlay: true,
  streetsGLIframeInteractive: false
}

const hybridInteractiveMap: ViewerCanvasPointerEventStore = {
  renderMode: 'hybrid',
  streetsGLIframeOverlay: true,
  streetsGLIframeInteractive: true
}

describe('viewerCanvasPointerEvents', () => {
  it('keeps standard/product mode canvas interactive even with Streets GL overlay', () => {
    expect(shouldViewerCanvasReceivePointerEvents(productStandard)).toBe(true)
    expect(shouldViewerCanvasReceivePointerEvents(productWithMapOverlay)).toBe(true)
  })

  it('allows hybrid navigation when the map underlay is non-interactive', () => {
    expect(shouldViewerCanvasReceivePointerEvents(hybridPassthrough)).toBe(true)
  })

  it('blocks hybrid canvas input when the map is interactive and no gizmo is attached', () => {
    expect(shouldViewerCanvasReceivePointerEvents(hybridInteractiveMap)).toBe(false)
  })

  it('enables canvas input when transform controls are attached in hybrid interactive mode', () => {
    const transformControls = { object: {} } as any
    expect(
      shouldViewerCanvasReceivePointerEvents(hybridInteractiveMap, transformControls)
    ).toBe(true)
  })

  it('writes pointer-events style on the canvas element', () => {
    const canvas = { style: { pointerEvents: '' } } as unknown as HTMLElement
    applyViewerCanvasPointerEvents(canvas, hybridInteractiveMap)
    expect(canvas.style.pointerEvents).toBe('none')

    applyViewerCanvasPointerEvents(canvas, productStandard)
    expect(canvas.style.pointerEvents).toBe('auto')
  })
})
