/**
 * Path-tracer lifecycle helpers (LIFE-2).
 * Keeps controls listeners and owned GPU resources from leaking across
 * preview/export/open/close cycles.
 */

export type ControlsLike = {
  addEventListener: (type: string, listener: (...args: unknown[]) => void) => void
  removeEventListener: (type: string, listener: (...args: unknown[]) => void) => void
}

export type DisposableLike = {
  dispose?: () => void
}

/**
 * Bind a named controls `change` listener that updates the path tracer camera.
 * Returns an unbind function, or null when controls are absent.
 */
export function bindPathTracerControlsChange(
  controls: ControlsLike | null | undefined,
  onChange: () => void
): (() => void) | null {
  if (!controls) return null

  const handler = () => {
    onChange()
  }

  controls.addEventListener('change', handler)
  return () => {
    controls.removeEventListener('change', handler)
  }
}

/** Dispose a resource if it exposes dispose(); never throws. */
export function safeDispose(resource: DisposableLike | null | undefined): boolean {
  if (!resource || typeof resource.dispose !== 'function') return false
  try {
    resource.dispose()
    return true
  } catch {
    return false
  }
}

export type PathTracerOwnedResources = {
  pathTracer?: DisposableLike | null
  gradientMap?: DisposableLike | null
  maskedHDRTexture?: DisposableLike | null
  colorTexture?: DisposableLike | null
  /** When true, maskedHDRTexture is owned elsewhere (e.g. HDRSystem) and must not be disposed. */
  maskedHDRIsManaged?: boolean
}

/**
 * Dispose path-tracer owned GPU resources. Idempotent w.r.t. missing/null entries.
 * Call after detaching controls listeners and stopping the render loop.
 */
export function disposePathTracerOwnedResources(resources: PathTracerOwnedResources): void {
  safeDispose(resources.pathTracer)

  if (!resources.maskedHDRIsManaged) {
    safeDispose(resources.maskedHDRTexture)
  }

  safeDispose(resources.colorTexture)
  safeDispose(resources.gradientMap)
}
