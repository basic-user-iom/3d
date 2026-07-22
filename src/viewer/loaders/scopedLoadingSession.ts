import * as THREE from 'three'
import { registerBlobUrls } from './blobUrlRegistry'

export type ScopedLoadingDisposeOptions = {
  /**
   * When true (default), revoke all Blob URLs owned by this session.
   * On successful loads, pass false and rely on blobUrlRegistry / model lifecycle cleanup.
   */
  revokeBlobs?: boolean
}

/**
 * DATA-3: Per-load LoadingManager + Blob URL scope.
 * Isolates URL modifiers, error handlers, progress, and Blob URL lifetime
 * so concurrent/sequential loads cannot contaminate each other via
 * THREE.DefaultLoadingManager.
 */
export class ScopedLoadingSession {
  readonly manager: THREE.LoadingManager
  readonly failedUrls = new Set<string>()

  private readonly blobUrls = new Set<string>()
  private readonly fileToUrl = new WeakMap<Blob, string>()
  private disposed = false

  constructor() {
    this.manager = new THREE.LoadingManager()
    this.manager.onError = (url: string) => {
      this.failedUrls.add(url)
    }
  }

  getOrCreateBlobUrl(file: Blob): string {
    this.assertOpen()
    const existing = this.fileToUrl.get(file)
    if (existing) return existing
    const url = URL.createObjectURL(file)
    this.fileToUrl.set(file, url)
    this.blobUrls.add(url)
    return url
  }

  registerBlobUrl(url: string): void {
    this.assertOpen()
    if (url.startsWith('blob:')) {
      this.blobUrls.add(url)
    }
  }

  setURLModifier(transform: ((url: string) => string) | null): void {
    this.assertOpen()
    this.manager.setURLModifier(transform ?? ((url: string) => url))
  }

  resolveURL(url: string): string {
    return this.manager.resolveURL(url)
  }

  /** Clear manager hooks and optionally revoke or adopt Blob URLs. */
  dispose(options: ScopedLoadingDisposeOptions = {}): void {
    if (this.disposed) return
    this.disposed = true

    const revokeBlobs = options.revokeBlobs !== false

    this.manager.setURLModifier((url: string) => url)
    this.manager.onStart = undefined
    this.manager.onLoad = undefined
    this.manager.onProgress = undefined
    this.manager.onError = undefined

    if (revokeBlobs) {
      for (const url of this.blobUrls) {
        URL.revokeObjectURL(url)
      }
    } else if (this.blobUrls.size > 0) {
      // Keep URLs alive for decoded textures; registry owns later cleanup.
      registerBlobUrls(this.blobUrls)
    }

    this.blobUrls.clear()
  }

  get isDisposed(): boolean {
    return this.disposed
  }

  get blobUrlCount(): number {
    return this.blobUrls.size
  }

  private assertOpen(): void {
    if (this.disposed) {
      throw new Error('ScopedLoadingSession is disposed')
    }
  }
}

export function createScopedLoadingSession(): ScopedLoadingSession {
  return new ScopedLoadingSession()
}

/**
 * Probe whether DefaultLoadingManager resolves `probeUrl` differently from identity.
 * Used by tests to ensure scoped sessions never contaminate the global manager.
 */
export function defaultLoadingManagerResolvesDifferently(probeUrl: string): boolean {
  return THREE.DefaultLoadingManager.resolveURL(probeUrl) !== probeUrl
}
