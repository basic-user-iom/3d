import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import {
  loadStreetsGLSessionPrefs,
  renderModeForStreetsGLOverlay,
  saveStreetsGLSessionPrefs,
  STREETS_GL_SESSION_STORAGE_KEY
} from '../src/utils/streetsGLSessionPersistence'

function installMemoryLocalStorage() {
  const store = new Map<string, string>()
  const memoryStorage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, String(value))
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size
    }
  }
  vi.stubGlobal('localStorage', memoryStorage)
  vi.stubGlobal('window', { localStorage: memoryStorage })
}

describe('streetsGLSessionPersistence', () => {
  beforeEach(() => {
    installMemoryLocalStorage()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('upgrades product → hybrid when overlay is enabled', () => {
    expect(renderModeForStreetsGLOverlay(true, 'product')).toBe('hybrid')
    expect(renderModeForStreetsGLOverlay(true, 'city')).toBe('city')
    expect(renderModeForStreetsGLOverlay(false, 'product')).toBe('product')
  })

  it('round-trips session prefs through localStorage', () => {
    saveStreetsGLSessionPrefs({
      renderMode: 'hybrid',
      iframeOverlay: true,
      iframeInteractive: false,
      groundLat: 40.7,
      groundLon: -74.0,
      groundZoom: 16,
      showOSMGroundV2Panel: true
    })

    const loaded = loadStreetsGLSessionPrefs()
    expect(loaded.iframeOverlay).toBe(true)
    expect(loaded.renderMode).toBe('hybrid')
    expect(loaded.groundLat).toBe(40.7)
    expect(loaded.groundLon).toBe(-74.0)
    expect(loaded.showOSMGroundV2Panel).toBe(true)
    expect(localStorage.getItem(STREETS_GL_SESSION_STORAGE_KEY)).toBeTruthy()
  })

  it('normalizes overlay-on + product mode to hybrid on load', () => {
    localStorage.setItem(
      STREETS_GL_SESSION_STORAGE_KEY,
      JSON.stringify({
        renderMode: 'product',
        iframeOverlay: true,
        iframeInteractive: true,
        groundLat: 1,
        groundLon: 2,
        groundZoom: 12
      })
    )

    const loaded = loadStreetsGLSessionPrefs()
    expect(loaded.iframeOverlay).toBe(true)
    expect(loaded.renderMode).toBe('hybrid')
  })

  it('returns defaults when storage is empty or corrupt', () => {
    expect(loadStreetsGLSessionPrefs().iframeOverlay).toBe(false)
    localStorage.setItem(STREETS_GL_SESSION_STORAGE_KEY, '{not-json')
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(loadStreetsGLSessionPrefs().renderMode).toBe('product')
    spy.mockRestore()
  })

  it('project restore: explicit product + overlay must still coerce to hybrid', () => {
    // Mirrors applyRenderMode(overlay=true, mode=product) after applyStreetsGL
    expect(renderModeForStreetsGLOverlay(true, 'product')).toBe('hybrid')
  })
})
