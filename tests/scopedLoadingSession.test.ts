import * as THREE from 'three'
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  createScopedLoadingSession,
  defaultLoadingManagerResolvesDifferently
} from '../src/viewer/loaders/scopedLoadingSession'
import { revokeAllLoaderBlobUrls } from '../src/viewer/loaders/blobUrlRegistry'

const PROBE = '__data3_probe_albedo.png'

afterEach(() => {
  THREE.DefaultLoadingManager.setURLModifier((url) => url)
  revokeAllLoaderBlobUrls()
})

describe('scopedLoadingSession (DATA-3)', () => {
  test('concurrent sessions keep independent URL maps for identical filenames', () => {
    const sessionA = createScopedLoadingSession()
    const sessionB = createScopedLoadingSession()

    const fileA = new File([new Uint8Array([1, 2, 3])], 'albedo.png', { type: 'image/png' })
    const fileB = new File([new Uint8Array([4, 5, 6])], 'albedo.png', { type: 'image/png' })

    sessionA.setURLModifier((url) =>
      url.toLowerCase().includes('albedo.png') ? sessionA.getOrCreateBlobUrl(fileA) : url
    )
    sessionB.setURLModifier((url) =>
      url.toLowerCase().includes('albedo.png') ? sessionB.getOrCreateBlobUrl(fileB) : url
    )

    const resolvedA = sessionA.resolveURL('textures/albedo.png')
    const resolvedB = sessionB.resolveURL('textures/albedo.png')

    expect(resolvedA).toMatch(/^blob:/)
    expect(resolvedB).toMatch(/^blob:/)
    expect(resolvedA).not.toBe(resolvedB)
    expect(sessionA.manager).not.toBe(sessionB.manager)
    expect(sessionA.manager).not.toBe(THREE.DefaultLoadingManager)

    sessionA.dispose({ revokeBlobs: true })
    sessionB.dispose({ revokeBlobs: true })
  })

  test('scoped modifiers do not contaminate DefaultLoadingManager', () => {
    expect(defaultLoadingManagerResolvesDifferently(PROBE)).toBe(false)

    const session = createScopedLoadingSession()
    session.setURLModifier(() => 'blob:should-not-leak')

    expect(session.resolveURL(PROBE)).toBe('blob:should-not-leak')
    expect(THREE.DefaultLoadingManager.resolveURL(PROBE)).toBe(PROBE)
    expect(defaultLoadingManagerResolvesDifferently(PROBE)).toBe(false)

    session.dispose({ revokeBlobs: true })
  })

  test('failed dispose clears hooks and revokes Blob URLs', () => {
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL')
    const session = createScopedLoadingSession()
    const file = new File([new Uint8Array([9])], 'dep.bin', { type: 'application/octet-stream' })
    const blobUrl = session.getOrCreateBlobUrl(file)

    session.setURLModifier((url) => (url.includes('dep.bin') ? blobUrl : url))
    session.manager.onError?.('dep.bin')
    expect(session.failedUrls.has('dep.bin')).toBe(true)
    expect(session.blobUrlCount).toBe(1)

    session.dispose({ revokeBlobs: true })

    expect(session.isDisposed).toBe(true)
    expect(session.blobUrlCount).toBe(0)
    expect(revokeSpy).toHaveBeenCalledWith(blobUrl)
    expect(session.resolveURL('dep.bin')).toBe('dep.bin')

    revokeSpy.mockRestore()
  })

  test('successful dispose keeps Blob URLs via registry and clears manager hooks', () => {
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL')
    const session = createScopedLoadingSession()
    const file = new File([new Uint8Array([7])], 'keep.png', { type: 'image/png' })
    const blobUrl = session.getOrCreateBlobUrl(file)
    session.setURLModifier((url) => (url.includes('keep.png') ? blobUrl : url))

    session.dispose({ revokeBlobs: false })

    expect(session.isDisposed).toBe(true)
    expect(revokeSpy).not.toHaveBeenCalledWith(blobUrl)
    // Manager hooks cleared — identity resolve even though Blob URL still exists.
    expect(session.resolveURL('keep.png')).toBe('keep.png')

    revokeSpy.mockRestore()
    URL.revokeObjectURL(blobUrl)
  })
})
