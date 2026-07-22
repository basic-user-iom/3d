import { useEffect } from 'react'
import { useAppStore } from '../store/useAppStore'
import {
  getSharedViewer,
  mergeStreetsGLObjectsIntoRegistry,
  requestRegistryResync
} from '../viewer/useViewer'
import { reconcileSceneFromRegistry } from '../viewer/objectRegistry'

/**
 * Headless component that keeps the live render targets in sync with the store-owned
 * project-object registry across render-mode switches. This is what makes objects
 * "survive" mode switches instead of being stranded in a torn-down Three.js scene.
 *
 *  - Leaving city (product / hybrid): the Three.js scene is recreated empty, so we
 *    rebuild a THREE.Mesh from every descriptor that has no live object yet.
 *  - Entering city / hybrid with Streets GL overlay: every imported/primitive
 *    descriptor is pushed into the iframe via ResyncCoordinator (covers models
 *    loaded in product mode before Streets GL was opened).
 *
 * Resync ownership (Phase 1):
 *  - This component may call requestRegistryResync with reason `'mode-enter'` only.
 *  - Bridge ready / iframe reload resync is owned by StreetsGLIframeOverlay.
 *  - Do not call resync from transform sync or visibility toggles.
 *
 * It renders nothing.
 */
export default function ObjectRegistryReconciler() {
  const renderMode = useAppStore((s) => s.renderMode)
  const streetsGLIframeOverlay = useAppStore((s) => s.streetsGLIframeOverlay)
  const streetsGLBridge = useAppStore((s) => s.streetsGLBridge)
  const updateProjectObject = useAppStore((s) => s.updateProjectObject)
  const markSceneRevision = useAppStore((s) => s.markSceneRevision)

  // Leaving city -> a fresh Three.js scene becomes available. Rebuild stranded objects.
  useEffect(() => {
    if (renderMode === 'city') return

    let cancelled = false
    let tries = 0

    const tick = () => {
      if (cancelled) return
      const viewer = getSharedViewer()
      if (viewer?.scene) {
        const descriptors = useAppStore.getState().projectObjects
        const { rebuilt } = reconcileSceneFromRegistry(viewer.scene, descriptors)
        if (rebuilt.length > 0) {
          rebuilt.forEach((mesh) => {
            const id = (mesh.userData as any).projectObjectId as string | undefined
            if (id) updateProjectObject(id, { threeObjectId: mesh.id })
          })
          // Nudge the object tree / dependent panels to refresh.
          markSceneRevision()
          console.log('[ObjectRegistry] Rebuilt stranded objects into new scene:', rebuilt.length)
        }
        return
      }
      // sharedViewer is module-level (not reactive); poll briefly until the new
      // ViewerCanvas registers its scene.
      if (tries++ < 50) {
        setTimeout(tick, 100)
      }
    }

    tick()
    return () => {
      cancelled = true
    }
  }, [renderMode, updateProjectObject, markSceneRevision])

  // Mode enter: city/hybrid + overlay → push registry into Streets GL.
  // Single owner for this trigger; overlapping bridge-ready from the overlay
  // coalesces via ResyncCoordinator (join in-flight or one follow-up).
  useEffect(() => {
    if (renderMode !== 'city' && renderMode !== 'hybrid') return
    if (!streetsGLIframeOverlay) return
    if (!streetsGLBridge) return

    let cancelled = false
    const run = () => {
      if (cancelled) return
      requestRegistryResync(streetsGLBridge, 'mode-enter')
        .then((n) => {
          if (!cancelled && n > 0) {
            console.log('[ObjectRegistry] Synced', n, 'object(s) into Streets GL')
          }
        })
        .catch((err) => {
          console.warn('[ObjectRegistryReconciler] Streets GL registry sync failed:', err)
        })
    }

    if (streetsGLBridge.isReady) {
      run()
    } else {
      streetsGLBridge.onReady(run)
    }

    return () => {
      cancelled = true
    }
  }, [renderMode, streetsGLIframeOverlay, streetsGLBridge])

  // On bridge ready: merge iframe-authored objects into the registry only.
  // Resync (re-push registry → iframe) is owned by StreetsGLIframeOverlay onReady
  // and the mode-enter effect above — do not double-fire here.
  useEffect(() => {
    if (!streetsGLBridge) return

    const mergeExisting = () => {
      mergeStreetsGLObjectsIntoRegistry(streetsGLBridge).catch((err) => {
        console.warn('[ObjectRegistry] Failed to merge Streets GL objects:', err)
      })
    }

    if (streetsGLBridge.isReady) {
      mergeExisting()
    } else {
      streetsGLBridge.onReady(mergeExisting)
    }
  }, [streetsGLBridge])

  return null
}
