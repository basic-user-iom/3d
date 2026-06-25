import { useEffect } from 'react'
import * as THREE from 'three'
import { useAppStore } from '../store/useAppStore'
import { getSharedViewer, syncModelToStreetsGL, mergeStreetsGLObjectsIntoRegistry } from '../viewer/useViewer'
import { buildMeshFromDescriptor, reconcileSceneFromRegistry } from '../viewer/objectRegistry'
import { getCachedImportedModelScene } from '../viewer/importedModelCache'
import { latLonToStreetsGL } from '../utils/mapCoordinates'

/**
 * Headless component that keeps the live render targets in sync with the store-owned
 * project-object registry across render-mode switches. This is what makes objects
 * "survive" mode switches instead of being stranded in a torn-down Three.js scene.
 *
 *  - Leaving city (product / hybrid): the Three.js scene is recreated empty, so we
 *    rebuild a THREE.Mesh from every descriptor that has no live object yet.
 *  - Entering city: there is no Three.js scene, so we make sure every descriptor that
 *    isn't already reflected in Streets GL gets synced via the existing bridge.
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

  // Entering city -> ensure every descriptor is reflected in Streets GL. Re-runs when
  // the bridge becomes available so objects added in product mode appear on the map.
  useEffect(() => {
    if (renderMode !== 'city') return
    if (!streetsGLIframeOverlay) return
    if (!streetsGLBridge) return // wait until the bridge exists (effect re-runs on change)

    const descriptors = useAppStore.getState().projectObjects
    descriptors.forEach((descriptor) => {
      // Skip objects already reflected in Streets GL. `streetsGLPending` means a sync was
      // requested but may not have completed (e.g. bridge not ready) — retry in that case.
      if (descriptor.userData?.streetsGLAdded && !descriptor.userData?.streetsGLPending) return

      let mesh: THREE.Object3D | null = null
      if (descriptor.kind === 'imported') {
        mesh = getCachedImportedModelScene(descriptor.id) ?? null
      } else {
        mesh = buildMeshFromDescriptor(descriptor)
      }
      if (!mesh) return
      mesh.userData.streetsGLObjectId = descriptor.streetsGLObjectId || descriptor.id

      // Place using the descriptor's stored GPS when known; otherwise syncModelToStreetsGL
      // falls back to the current map center.
      if (descriptor.gps) {
        try {
          mesh.userData.streetsGLPosition = latLonToStreetsGL(descriptor.gps.lat, descriptor.gps.lon, 1.5)
        } catch {
          /* fall back to map-center placement inside sync */
        }
      }

      syncModelToStreetsGL(mesh, streetsGLBridge)
        .then(() => {
          const ud = mesh.userData as any
          updateProjectObject(descriptor.id, {
            streetsGLObjectId: ud.streetsGLObjectId,
            gps:
              typeof ud.gpsLat === 'number' && typeof ud.gpsLon === 'number'
                ? { lat: ud.gpsLat, lon: ud.gpsLon }
                : descriptor.gps,
            userData: {
              streetsGLAdded: true,
              streetsGLPending: false,
              streetsGLPosition: ud.streetsGLPosition,
              streetsGLBaseTransform: ud.streetsGLBaseTransform,
              streetsGLPlacementWorldPosition: ud.streetsGLPlacementWorldPosition
            }
          })
        })
        .catch((err) => {
          console.warn('[ObjectRegistryReconciler] Streets GL sync failed for', descriptor.id, err)
          useAppStore.getState().setError(
            `Could not sync "${descriptor.name || descriptor.id}" to Streets GL. ${err instanceof Error ? err.message : 'See console for details.'}`
          )
        })
    })
  }, [renderMode, streetsGLIframeOverlay, streetsGLBridge, updateProjectObject])

  // On bridge ready, list pre-existing external objects from the iframe and merge into the registry.
  useEffect(() => {
    if (!streetsGLBridge) return

    const syncExisting = () => {
      mergeStreetsGLObjectsIntoRegistry(streetsGLBridge).catch((err) => {
        console.warn('[ObjectRegistry] Failed to merge Streets GL objects:', err)
      })
    }

    if (streetsGLBridge.isReady) {
      syncExisting()
    } else {
      streetsGLBridge.onReady(syncExisting)
    }
  }, [streetsGLBridge])

  return null
}
