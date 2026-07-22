import * as THREE from 'three'
import { disposeObject3DSubtree } from './utils/disposeObject3D'

/**
 * LIFE-1: Generation tokens + AbortSignal for viewer async loads.
 * Bump the session when the shared viewer is replaced/disposed or a project
 * restore begins so in-flight imports cannot mutate a stale scene.
 */

export class ViewerLoadAbortedError extends Error {
  constructor(message = 'Viewer load aborted: session is no longer current') {
    super(message)
    this.name = 'ViewerLoadAbortedError'
  }
}

export type ViewerLoadHandle = {
  readonly id: number
  readonly sessionGeneration: number
  readonly signal: AbortSignal
  abort: (reason?: string) => void
}

let sessionGeneration = 0
let nextLoadId = 1
const activeControllers = new Map<number, AbortController>()

export function getViewerSessionGeneration(): number {
  return sessionGeneration
}

/**
 * Advance the session generation and abort every in-flight load handle.
 * Call when the shared viewer identity changes or project restore starts.
 */
export function bumpViewerSessionGeneration(reason = 'viewer session changed'): number {
  sessionGeneration += 1
  for (const [id, controller] of activeControllers) {
    if (!controller.signal.aborted) {
      try {
        controller.abort(reason)
      } catch {
        // ignore
      }
    }
    activeControllers.delete(id)
  }
  return sessionGeneration
}

export function beginViewerLoad(): ViewerLoadHandle {
  const id = nextLoadId++
  const controller = new AbortController()
  const capturedGeneration = sessionGeneration
  activeControllers.set(id, controller)

  const abort = (reason?: string) => {
    if (!controller.signal.aborted) {
      try {
        controller.abort(reason ?? 'load aborted')
      } catch {
        // ignore
      }
    }
    activeControllers.delete(id)
  }

  controller.signal.addEventListener(
    'abort',
    () => {
      activeControllers.delete(id)
    },
    { once: true }
  )

  return {
    id,
    sessionGeneration: capturedGeneration,
    signal: controller.signal,
    abort
  }
}

/** Drop a finished load from the active set without aborting it. */
export function endViewerLoad(handle: ViewerLoadHandle): void {
  activeControllers.delete(handle.id)
}

export function isViewerSessionCurrent(handle: ViewerLoadHandle): boolean {
  return !handle.signal.aborted && handle.sessionGeneration === sessionGeneration
}

/**
 * True when the load handle is still current and the captured viewer is still
 * the live shared viewer (identity check).
 */
export function isViewerLoadCurrent(
  handle: ViewerLoadHandle,
  capturedViewer: unknown,
  currentViewer: unknown
): boolean {
  if (!isViewerSessionCurrent(handle)) return false
  if (capturedViewer == null) return false
  return currentViewer === capturedViewer
}

export function assertViewerLoadCurrent(
  handle: ViewerLoadHandle,
  capturedViewer: unknown,
  currentViewer: unknown,
  model?: { scene: THREE.Object3D } | null
): void {
  if (isViewerLoadCurrent(handle, capturedViewer, currentViewer)) return
  discardStaleLoadedModel(model)
  throw new ViewerLoadAbortedError()
}

export function assertViewerSessionCurrent(
  handle: ViewerLoadHandle,
  model?: { scene: THREE.Object3D } | null
): void {
  if (isViewerSessionCurrent(handle)) return
  discardStaleLoadedModel(model)
  throw new ViewerLoadAbortedError()
}

/** Remove + dispose a model that must not be attached to a live scene. */
export function discardStaleLoadedModel(model?: { scene: THREE.Object3D } | null): void {
  if (!model?.scene) return
  try {
    if (model.scene.parent) {
      model.scene.parent.remove(model.scene)
    }
  } catch {
    // ignore
  }
  try {
    disposeObject3DSubtree(model.scene)
  } catch {
    // ignore
  }
}

/** Test-only reset. */
export function __resetViewerLoadSessionForTests(): void {
  sessionGeneration = 0
  nextLoadId = 1
  for (const controller of activeControllers.values()) {
    if (!controller.signal.aborted) {
      try {
        controller.abort('test reset')
      } catch {
        // ignore
      }
    }
  }
  activeControllers.clear()
}
