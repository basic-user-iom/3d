/**
 * Closure-independent render-request queue.
 *
 * The viewer uses a hybrid "render-on-demand" loop that idle-pauses when nothing
 * is moving. UI-driven scene mutations (e.g. typing values into the Transform
 * panel) must wake that loop AND guarantee at least one frame is drawn after the
 * mutation lands. Relying solely on a captured `requestRender` closure is fragile
 * across Vite HMR re-inits, so we also keep a module-level counter that the live
 * render loop consults on every frame — independent of any closure identity.
 */

let pendingRenderFrames = 0

/**
 * Request that the render loop draws at least `frames` more frames, even if the
 * scene is otherwise idle. A small burst (default 2) covers post-processing /
 * shadow passes that need a follow-up frame to settle.
 */
export function requestViewerRenderFrames(frames = 2): void {
  const next = Math.max(1, Math.floor(frames))
  if (next > pendingRenderFrames) {
    pendingRenderFrames = next
  }
}

/** True when a UI-driven render was requested and not yet consumed. */
export function hasPendingViewerRenderFrames(): boolean {
  return pendingRenderFrames > 0
}

/** Consume one queued render frame. Call once per rendered frame. */
export function consumeViewerRenderFrame(): void {
  if (pendingRenderFrames > 0) {
    pendingRenderFrames -= 1
  }
}

/** Reset the queue (e.g. on viewer dispose). */
export function clearViewerRenderFrames(): void {
  pendingRenderFrames = 0
}
