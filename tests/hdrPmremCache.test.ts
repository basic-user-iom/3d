import { describe, it, expect, afterEach } from 'vitest'
import * as THREE from 'three'
import {
  getHdrCacheKey,
  getCachedHdrPmrem,
  setCachedHdrPmrem,
  isTextureOwnedByCache,
  clearHdrPmremCacheForTests,
  getHdrPmremCacheSize,
  HDR_PMREM_CACHE_MAX
} from '../src/viewer/utils/hdrPmremCache'

describe('hdrPmremCache', () => {
  afterEach(() => {
    clearHdrPmremCacheForTests()
  })

  it('builds stable URL cache keys', () => {
    expect(getHdrCacheKey('/files-upload/hdr/test.hdr')).toBe('url:/files-upload/hdr/test.hdr')
  })

  it('builds stable File cache keys from name, size, and lastModified', () => {
    const file = new File(['x'], 'studio.hdr', { type: 'application/octet-stream' })
    Object.defineProperty(file, 'size', { value: 12345 })
    Object.defineProperty(file, 'lastModified', { value: 999 })
    expect(getHdrCacheKey(file)).toBe('file:studio.hdr:12345:999')
  })

  it('stores and retrieves cache entries (LRU touch)', () => {
    const rt = { dispose: () => {} } as unknown as THREE.WebGLCubeRenderTarget
    const tex = {} as THREE.Texture
    const entry = {
      cacheKey: 'url:/a.hdr',
      originalTexture: tex,
      pmremTexture: tex,
      pmremRenderTarget: rt,
      isFastHdr: false
    }
    setCachedHdrPmrem(entry)
    expect(getCachedHdrPmrem('url:/a.hdr')).toBe(entry)
    expect(isTextureOwnedByCache(tex)).toBe(true)
  })

  it('evicts oldest entry when max size exceeded', () => {
    for (let i = 0; i < HDR_PMREM_CACHE_MAX + 1; i++) {
      const rt = { dispose: () => {} } as unknown as THREE.WebGLCubeRenderTarget
      const tex = {} as THREE.Texture
      setCachedHdrPmrem({
        cacheKey: `url:/hdr-${i}.hdr`,
        originalTexture: tex,
        pmremTexture: tex,
        pmremRenderTarget: rt,
        isFastHdr: false
      })
    }
    expect(getHdrPmremCacheSize()).toBe(HDR_PMREM_CACHE_MAX)
    expect(getCachedHdrPmrem('url:/hdr-0.hdr')).toBeUndefined()
    expect(getCachedHdrPmrem(`url:/hdr-${HDR_PMREM_CACHE_MAX}.hdr`)).toBeDefined()
  })
})
