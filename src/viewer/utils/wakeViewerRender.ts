import type { ViewerInstance } from '../ViewerCanvas'

/** Wake the render loop after UI-driven scene mutations (idle pause may be active). */
export function wakeViewerRender(viewer: Pick<ViewerInstance, 'requestRender'> | null | undefined): void {
  viewer?.requestRender?.()
}
