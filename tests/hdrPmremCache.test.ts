import { describe, it, expect, afterEach, vi } from 'vitest'
import * as THREE from 'three'
import {
  getHdrCacheKey,
  getCachedHdrPmrem,
  setCachedHdrPmrem,
  isTextureOwnedByCache,
  disposeOwnedHdrLoadResources,
  clearHdrPmremCacheForTests,
  getHdrPmremCacheSize,
  HDR_PMREM_CACHE_MAX
} from '../src/viewer/utils/hdrPmremCache'

function mockTexture(): THREE.Texture {
  return { dispose: vi.fn() } as unknown as THREE.Texture
}

function mockRenderTarget(texture?: THREE.Texture): THREE.WebGLCubeRenderTarget {
  return {
    texture: texture ?? mockTexture(),
    dispose: vi.fn()
  } as unknown as THREE.WebGLCubeRenderTarget
}

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

  describe('disposeOwnedHdrLoadResources (LIFE-6)', () => {
    it('disposes unpublished source texture and PMREM render target', () => {
      const original = mockTexture()
      const envMap = mockTexture()
      const rt = mockRenderTarget(envMap)

      disposeOwnedHdrLoadResources({
        textures: [original, envMap],
        renderTarget: rt
      })

      expect(rt.dispose).toHaveBeenCalledTimes(1)
      expect(original.dispose).toHaveBeenCalledTimes(1)
      // envMap is owned by the render target — do not double-dispose
      expect(envMap.dispose).not.toHaveBeenCalled()
    })

    it('disposes a FastHDR-style single texture with no render target', () => {
      const tex = mockTexture()
      disposeOwnedHdrLoadResources({ textures: [tex, tex], renderTarget: null })
      expect(tex.dispose).toHaveBeenCalledTimes(1)
    })

    it('does not dispose resources owned by the PMREM cache', () => {
      const original = mockTexture()
      const envMap = mockTexture()
      const rt = mockRenderTarget(envMap)
      setCachedHdrPmrem({
        cacheKey: 'url:/cached.hdr',
        originalTexture: original,
        pmremTexture: envMap,
        pmremRenderTarget: rt,
        isFastHdr: false
      })

      disposeOwnedHdrLoadResources({
        textures: [original, envMap],
        renderTarget: rt
      })

      expect(rt.dispose).not.toHaveBeenCalled()
      expect(original.dispose).not.toHaveBeenCalled()
      expect(envMap.dispose).not.toHaveBeenCalled()
    })

    it('disposes an intermediate KTX2 source copy separately from the loaded texture', () => {
      const loaded = mockTexture()
      const sourceCopy = mockTexture()
      const envMap = mockTexture()
      const rt = mockRenderTarget(envMap)

      disposeOwnedHdrLoadResources({
        textures: [loaded, sourceCopy, envMap],
        renderTarget: rt
      })

      expect(loaded.dispose).toHaveBeenCalledTimes(1)
      expect(sourceCopy.dispose).toHaveBeenCalledTimes(1)
      expect(rt.dispose).toHaveBeenCalledTimes(1)
    })
  })
})
