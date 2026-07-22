import type { Object3D } from 'three'
import {
  disposeSuspendedSplatOverlay,
  resumeSplatOverlayRoot,
  suspendSplatOverlayRoot,
  type SuspendedSplatOverlay
} from './splatLoader'

type DisposableObject = Object3D & { dispose?: () => void }

/**
 * Soft-detach Gaussian splat iframe overlays in a subtree without revoking blob URLs.
 * Used by delete→undo so the overlay can be restored later.
 */
export function suspendSplatOverlaysInSubtree(
  object: Object3D | null | undefined
): SuspendedSplatOverlay[] {
  if (!object || typeof object.traverse !== 'function') {
    return []
  }

  const suspended: SuspendedSplatOverlay[] = []
  object.traverse((child: Object3D) => {
    if (child.userData?.gaussianSplatOverlay !== true) return
    const entry = suspendSplatOverlayRoot(child)
    if (entry) suspended.push(entry)
  })
  return suspended
}

/** Re-attach overlays previously returned by {@link suspendSplatOverlaysInSubtree}. */
export function resumeSplatOverlays(entries: SuspendedSplatOverlay[] | null | undefined): number {
  if (!entries?.length) return 0
  let restored = 0
  for (const entry of entries) {
    if (resumeSplatOverlayRoot(entry)) restored += 1
  }
  return restored
}

/** Irreversibly dispose suspended overlays (revoke URLs, drop DOM). */
export function disposeSuspendedSplatOverlays(
  entries: SuspendedSplatOverlay[] | null | undefined
): void {
  if (!entries?.length) return
  for (const entry of entries) {
    try {
      disposeSuspendedSplatOverlay(entry)
    } catch {
      // Best-effort cleanup.
    }
  }
}

/**
 * Permanent teardown (same as historical disposeSplatOverlay behavior).
 * Prefer {@link suspendSplatOverlaysInSubtree} when undo must remain possible.
 */
export function disposeSplatRootsInSubtree(object: Object3D | null | undefined): boolean {
  if (!object || typeof object.traverse !== 'function') {
    return false
  }

  let disposed = false
  object.traverse((child: Object3D) => {
    const candidate = child as DisposableObject
    if (child.userData?.gaussianSplatOverlay === true && typeof candidate.dispose === 'function') {
      try {
        candidate.dispose()
        disposed = true
      } catch {
        // Best-effort cleanup.
      }
    }
  })
  return disposed
}
