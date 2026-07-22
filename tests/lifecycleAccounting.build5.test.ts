import * as THREE from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPanoramaAnimationLoop } from '../src/panorama/panoramaAnimationLoop'
import {
  __resetViewerLoadSessionForTests,
  beginViewerLoad,
  bumpViewerSessionGeneration,
  discardStaleLoadedModel
} from '../src/viewer/viewerLoadSession'
import { createScopedLoadingSession } from '../src/viewer/loaders/scopedLoadingSession'
import {
  createDisposalLedger,
  createFakeRaf,
  createListenerAccounting
} from './helpers/lifecycleAccounting'

afterEach(() => {
  __resetViewerLoadSessionForTests()
})

describe('BUILD-5 lifecycle accounting (fake RAF / listeners / disposal)', () => {
  it('keeps RAF pending count bounded across start/stop cycles', () => {
    const raf = createFakeRaf()
    const onFrame = vi.fn()

    for (let cycle = 0; cycle < 8; cycle++) {
      const loop = createPanoramaAnimationLoop(onFrame, {
        schedule: raf.schedule,
        cancel: raf.cancel
      })
      loop.start()
      expect(raf.pendingCount()).toBe(1)
      raf.flush(cycle * 16)
      expect(raf.pendingCount()).toBe(1)
      loop.stop()
      expect(raf.pendingCount()).toBe(0)
      expect(loop.isDisposed()).toBe(true)
    }

    expect(onFrame).toHaveBeenCalledTimes(8)
  })

  it('listener accounting returns to zero after matching removeEventListener', () => {
    const listeners = createListenerAccounting()
    const target = {
      addEventListener: listeners.addEventListener,
      removeEventListener: listeners.removeEventListener
    }

    const onChange = () => undefined
    const onEnd = () => undefined

    target.addEventListener('change', onChange)
    target.addEventListener('end', onEnd)
    expect(listeners.activeCount()).toBe(2)
    expect(listeners.activeTypes()).toEqual(['change', 'end'])

    target.removeEventListener('change', onChange)
    expect(listeners.activeCount()).toBe(1)

    target.removeEventListener('end', onEnd)
    expect(listeners.activeCount()).toBe(0)
    expect(listeners.activeTypes()).toEqual([])
  })

  it('stale viewer loads dispose owned geometry/materials exactly once', () => {
    const ledger = createDisposalLedger()
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    const material = new THREE.MeshBasicMaterial()
    const mesh = new THREE.Mesh(geometry, material)
    const root = new THREE.Group()
    root.add(mesh)

    vi.spyOn(geometry, 'dispose').mockImplementation(() => ledger.record('geometry'))
    vi.spyOn(material, 'dispose').mockImplementation(() => ledger.record('material'))

    const handle = beginViewerLoad()
    bumpViewerSessionGeneration('unmount during load')
    discardStaleLoadedModel({ scene: root })

    expect(ledger.counts()).toEqual({ geometry: 1, material: 1 })
    expect(ledger.total()).toBe(2)
    void handle
  })

  it('scoped loading sessions clear hooks and revoke Blob URLs on dispose', () => {
    const session = createScopedLoadingSession()
    const blob = new Blob(['x'], { type: 'text/plain' })
    const url = session.getOrCreateBlobUrl(blob)
    expect(session.blobUrlCount).toBe(1)
    expect(url.startsWith('blob:')).toBe(true)

    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    session.dispose({ revokeBlobs: true })

    expect(session.isDisposed).toBe(true)
    expect(session.blobUrlCount).toBe(0)
    expect(revoke).toHaveBeenCalledWith(url)
    expect(() => session.getOrCreateBlobUrl(blob)).toThrow(/disposed/i)

    revoke.mockRestore()
  })
})
