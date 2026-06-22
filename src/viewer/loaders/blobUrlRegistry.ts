/**
 * Tracks blob URLs created by loaders so they can be revoked on model replace/unmount.
 */

const activeUrls = new Set<string>()

export function registerBlobUrl(url: string): void {
  if (url.startsWith('blob:')) {
    activeUrls.add(url)
  }
}

export function registerBlobUrls(urls: Iterable<string>): void {
  for (const url of urls) {
    registerBlobUrl(url)
  }
}

export function revokeBlobUrl(url: string): void {
  if (activeUrls.has(url)) {
    URL.revokeObjectURL(url)
    activeUrls.delete(url)
  }
}

export function revokeAllLoaderBlobUrls(): void {
  for (const url of activeUrls) {
    URL.revokeObjectURL(url)
  }
  activeUrls.clear()
}

export function trackBlobUrlMap(map: Map<unknown, string>): () => void {
  for (const url of map.values()) {
    registerBlobUrl(url)
  }
  return () => {
    for (const url of map.values()) {
      revokeBlobUrl(url)
    }
  }
}
