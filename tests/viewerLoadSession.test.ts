import * as THREE from 'three'
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  ViewerLoadAbortedError,
  __resetViewerLoadSessionForTests,
  assertViewerLoadCurrent,
  assertViewerSessionCurrent,
  beginViewerLoad,
  bumpViewerSessionGeneration,
  discardStaleLoadedModel,
  endViewerLoad,
  getViewerSessionGeneration,
  isViewerLoadCurrent,
  isViewerSessionCurrent
} from '../src/viewer/viewerLoadSession'

afterEach(() => {
  __resetViewerLoadSessionForTests()
})

describe('viewerLoadSession (LIFE-1)', () => {
  test('bump aborts in-flight loads and advances generation', () => {
    const handle = beginViewerLoad()
    expect(isViewerSessionCurrent(handle)).toBe(true)
    expect(getViewerSessionGeneration()).toBe(0)

    const next = bumpViewerSessionGeneration('viewer replaced')
    expect(next).toBe(1)
    expect(handle.signal.aborted).toBe(true)
    expect(isViewerSessionCurrent(handle)).toBe(false)
  })

  test('stale viewer identity fails current check even without bump', () => {
    const handle = beginViewerLoad()
    const viewerA = { id: 'a' }
    const viewerB = { id: 'b' }

    expect(isViewerLoadCurrent(handle, viewerA, viewerA)).toBe(true)
    expect(isViewerLoadCurrent(handle, viewerA, viewerB)).toBe(false)
    expect(isViewerLoadCurrent(handle, viewerA, null)).toBe(false)

    endViewerLoad(handle)
  })

  test('assertViewerLoadCurrent disposes stale model and throws', () => {
    const handle = beginViewerLoad()
    const viewer = { id: 'v1' }
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    const material = new THREE.MeshBasicMaterial()
    const mesh = new THREE.Mesh(geometry, material)
    const root = new THREE.Group()
    root.add(mesh)
    const disposeGeo = vi.spyOn(geometry, 'dispose')
    const disposeMat = vi.spyOn(material, 'dispose')

    bumpViewerSessionGeneration('unmount')

    expect(() =>
      assertViewerLoadCurrent(handle, viewer, viewer, { scene: root })
    ).toThrow(ViewerLoadAbortedError)

    expect(disposeGeo).toHaveBeenCalled()
    expect(disposeMat).toHaveBeenCalled()
  })

  test('assertViewerSessionCurrent allows city-mode null viewer until bump', () => {
    const handle = beginViewerLoad()
    expect(() => assertViewerSessionCurrent(handle)).not.toThrow()

    bumpViewerSessionGeneration('mode switch')
    expect(() => assertViewerSessionCurrent(handle)).toThrow(ViewerLoadAbortedError)
  })

  test('discardStaleLoadedModel removes from parent and disposes subtree', () => {
    const parent = new THREE.Scene()
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    const material = new THREE.MeshBasicMaterial()
    const mesh = new THREE.Mesh(geometry, material)
    const root = new THREE.Group()
    root.add(mesh)
    parent.add(root)

    const disposeGeo = vi.spyOn(geometry, 'dispose')
    discardStaleLoadedModel({ scene: root })

    expect(parent.children).not.toContain(root)
    expect(disposeGeo).toHaveBeenCalled()
  })

  test('endViewerLoad does not abort; later bump still invalidates by generation', () => {
    const handle = beginViewerLoad()
    endViewerLoad(handle)
    expect(handle.signal.aborted).toBe(false)
    expect(isViewerSessionCurrent(handle)).toBe(true)

    bumpViewerSessionGeneration('later')
    expect(isViewerSessionCurrent(handle)).toBe(false)
  })
})
