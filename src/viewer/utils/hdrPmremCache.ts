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

export type OwnedHdrLoadResources = {
  /** Source / PMREM / intermediate textures created by an in-flight load. */
  textures?: Array<THREE.Texture | null | undefined>
  renderTarget?: THREE.WebGLCubeRenderTarget | null
}

/**
 * Dispose GPU resources from a cancelled/failed HDR load.
 * No-ops when any listed resource is owned by the shared PMREM cache
 * (superseded loads that already published stay reusable).
 */
export function disposeOwnedHdrLoadResources(resources: OwnedHdrLoadResources): void {
  const renderTarget = resources.renderTarget ?? null
  const textures = (resources.textures ?? []).filter((t): t is THREE.Texture => !!t)

  if (renderTarget && isRenderTargetOwnedByCache(renderTarget)) {
    return
  }
  if (textures.some((t) => isTextureOwnedByCache(t))) {
    return
  }

  if (renderTarget) {
    try {
      renderTarget.dispose()
    } catch {
      // already disposed
    }
  }

  const rtTexture = renderTarget?.texture ?? null
  const seen = new Set<THREE.Texture>()
  for (const texture of textures) {
    if (seen.has(texture)) continue
    seen.add(texture)
    if (rtTexture && texture === rtTexture) continue
    try {
      texture.dispose()
    } catch {
      // already disposed
    }
  }
}

function disposeCacheEntry(entry: HdrPmremCacheEntry): void {
  // Eviction always owns the entry — bypass cache-ownership guards.
  try {
    entry.pmremRenderTarget?.dispose()
  } catch {
    // already disposed
  }
  if (entry.originalTexture !== entry.pmremTexture) {
    try {
      entry.originalTexture.dispose()
    } catch {
      // already disposed
    }
  } else if (!entry.pmremRenderTarget) {
    try {
      entry.originalTexture.dispose()
    } catch {
      // already disposed
    }
  }
}

/** Test helper — clears module cache without disposing GPU resources. */
export function clearHdrPmremCacheForTests(): void {
  cache.clear()
}

export function getHdrPmremCacheSize(): number {
  return cache.size
}
