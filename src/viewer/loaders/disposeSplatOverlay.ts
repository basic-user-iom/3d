import type { Object3D } from 'three'

type DisposableObject = Object3D & { dispose?: () => void }

/**
 * Tears down the DOM iframe overlay (and revokes the object URL) created by the
 * Gaussian splat loader for the given object subtree.
 *
 * The splat loader appends a full-screen iframe overlay to the viewer container
 * and tracks it via module-level state. The only way to remove that overlay is
 * to call the custom `dispose()` method stored on the splat root. Scene removal
 * paths (replacing a model, deleting an object, clearing the scene) do not call
 * that method, so the overlay would otherwise stay on top of the viewport
 * forever, hiding every subsequently loaded model.
 *
 * This helper walks the removed subtree and invokes `dispose()` on any node
 * flagged as a Gaussian splat overlay. It is intentionally dependency-light so
 * it can run from any removal site without pulling in the full viewer.
 *
 * @returns true if at least one overlay was disposed.
 */
export function disposeSplatOverlay(object: Object3D | null | undefined): boolean {
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
        // Best-effort cleanup: never block model removal on overlay teardown.
      }
    }
  })

  return disposed
}
