import type { ViewerInstance } from '../ViewerCanvas'
import { requestViewerRenderFrames } from './renderRequestQueue'

/** Wake the render loop after UI-driven scene mutations (idle pause may be active). */
export function wakeViewerRender(viewer: Pick<ViewerInstance, 'requestRender'> | null | undefined): void {
  // Queue a short render burst that the live loop honours regardless of which
  // requestRender closure is current (survives HMR re-inits of ViewerCanvas).
  requestViewerRenderFrames(2)
  viewer?.requestRender?.()
}
