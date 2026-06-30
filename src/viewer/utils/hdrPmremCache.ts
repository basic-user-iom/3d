import * as THREE from 'three'

/** Max cached HDR entries (URL/file → textures + PMREM). */
export const HDR_PMREM_CACHE_MAX = 4

export interface HdrPmremCacheEntry {
  cacheKey: string
  originalTexture: THREE.Texture
  pmremTexture: THREE.Texture
  /** Null for pre-baked FastHDR / cubemap-only entries (probe uses equirect fallback). */
  pmremRenderTarget: THREE.WebGLCubeRenderTarget | null
  isFastHdr: boolean
}

const cache = new Map<string, HdrPmremCacheEntry>()

/**
 * Stable cache key for HDR sources. URLs are normalized; Files use name+size+lastModified.
 */
export function getHdrCacheKey(url: string | File, normalizedUrl?: string): string {
  if (url instanceof File) {
    return `file:${url.name}:${url.size}:${url.lastModified}`
  }
  const key = normalizedUrl ?? url
  return `url:${key}`
}

export function getCachedHdrPmrem(cacheKey: string): HdrPmremCacheEntry | undefined {
  const entry = cache.get(cacheKey)
  if (entry) {
    // LRU: move to end
    cache.delete(cacheKey)
    cache.set(cacheKey, entry)
  }
  return entry
}

export function setCachedHdrPmrem(entry: HdrPmremCacheEntry): void {
  if (cache.has(entry.cacheKey)) {
    cache.delete(entry.cacheKey)
  }
  cache.set(entry.cacheKey, entry)

  while (cache.size > HDR_PMREM_CACHE_MAX) {
    const oldestKey = cache.keys().next().value
    if (oldestKey === undefined) break
    disposeCacheEntry(cache.get(oldestKey)!)
    cache.delete(oldestKey)
  }
}

export function isTextureOwnedByCache(texture: THREE.Texture | null): boolean {
  if (!texture) return false
  for (const entry of cache.values()) {
    if (entry.originalTexture === texture || entry.pmremTexture === texture) {
      return true
    }
  }
  return false
}

export function isRenderTargetOwnedByCache(rt: THREE.WebGLCubeRenderTarget | null): boolean {
  if (!rt) return false
  for (const entry of cache.values()) {
    if (entry.pmremRenderTarget === rt) {
      return true
    }
  }
  return false
}

function disposeCacheEntry(entry: HdrPmremCacheEntry): void {
  entry.pmremRenderTarget?.dispose()
  if (entry.originalTexture !== entry.pmremTexture) {
    entry.originalTexture.dispose()
  }
}

/** Test helper — clears module cache without disposing GPU resources. */
export function clearHdrPmremCacheForTests(): void {
  cache.clear()
}

export function getHdrPmremCacheSize(): number {
  return cache.size
}
