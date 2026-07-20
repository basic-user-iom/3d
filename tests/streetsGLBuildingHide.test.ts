import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { StreetsGLBridge } from '../src/utils/streetsGLBridge'
import {
  loadStreetsGLSessionPrefs,
  saveStreetsGLSessionPrefs,
  STREETS_GL_SESSION_STORAGE_KEY
} from '../src/utils/streetsGLSessionPersistence'

function makeIframe(): HTMLIFrameElement {
  const postMessage = vi.fn()
  return {
    contentWindow: { postMessage }
  } as unknown as HTMLIFrameElement
}

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
  vi.stubGlobal('window', {
    localStorage: memoryStorage,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  })
}

describe('StreetsGLBridge building hide/show', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>()
    vi.stubGlobal('window', {
      addEventListener: (type: string, handler: EventListenerOrEventListenerObject) => {
        if (!listeners.has(type)) listeners.set(type, new Set())
        listeners.get(type)!.add(handler)
      },
      removeEventListener: (type: string, handler: EventListenerOrEventListenerObject) => {
        listeners.get(type)?.delete(handler)
      },
      localStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {}
      },
      // Expose listeners so tests can simulate iframe → parent messages
      __listeners: listeners
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  function emitMessage(type: string, payload: unknown) {
    const listeners = (window as any).__listeners as Map<string, Set<EventListenerOrEventListenerObject>>
    const handlers = listeners.get('message')
    if (!handlers) return
    const event = { data: { type, payload } } as MessageEvent
    for (const handler of handlers) {
      if (typeof handler === 'function') handler(event)
      else handler.handleEvent(event)
    }
  }

  it('hideBuilding resolves true on STREETS_GL_BUILDING_HIDDEN success', async () => {
    const iframe = makeIframe()
    const bridge = new StreetsGLBridge(iframe)
    ;(bridge as any).bridgeReady = true

    const promise = bridge.hideBuilding(42)
    emitMessage('STREETS_GL_BUILDING_HIDDEN', { success: true, buildingId: 42 })
    await expect(promise).resolves.toBe(true)

    expect(iframe.contentWindow!.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'STREETS_GL_HIDE_BUILDING',
        payload: { buildingId: 42 }
      }),
      '*'
    )
    bridge.dispose()
  })

  it('showBuilding resolves false on timeout', async () => {
    const bridge = new StreetsGLBridge(makeIframe())
    ;(bridge as any).bridgeReady = true

    const promise = bridge.showBuilding(7)
    await vi.advanceTimersByTimeAsync(9_000)
    await expect(promise).resolves.toBe(false)
    bridge.dispose()
  })

  it('syncHiddenBuildings sends buildingIds payload', async () => {
    const iframe = makeIframe()
    const bridge = new StreetsGLBridge(iframe)
    ;(bridge as any).bridgeReady = true

    const promise = bridge.syncHiddenBuildings([1, 2, 3])
    emitMessage('STREETS_GL_HIDDEN_BUILDINGS_SYNCED', {
      success: true,
      buildingIds: [1, 2, 3]
    })
    await expect(promise).resolves.toBe(true)

    expect(iframe.contentWindow!.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'STREETS_GL_SYNC_HIDDEN_BUILDINGS',
        payload: { buildingIds: [1, 2, 3] }
      }),
      '*'
    )
    bridge.dispose()
  })

  it('onBuildingSelected forwards pick and clear events', () => {
    const bridge = new StreetsGLBridge(makeIframe())
    const seen: Array<number | null> = []
    const unsub = bridge.onBuildingSelected((b) => {
      seen.push(b?.buildingId ?? null)
    })

    emitMessage('STREETS_GL_BUILDING_SELECTED', {
      success: true,
      buildingId: 99,
      osmType: 2,
      osmId: 123
    })
    emitMessage('STREETS_GL_BUILDING_SELECTED', {
      success: true,
      buildingId: null
    })

    expect(seen).toEqual([99, null])
    unsub()
    bridge.dispose()
  })
})

describe('streetsGLSessionPersistence hiddenBuildingIds', () => {
  beforeEach(() => {
    installMemoryLocalStorage()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('round-trips hiddenBuildingIds', () => {
    saveStreetsGLSessionPrefs({
      renderMode: 'city',
      iframeOverlay: true,
      iframeInteractive: true,
      groundLat: 1,
      groundLon: 2,
      groundZoom: 14,
      hiddenBuildingIds: ['100', '200', '100']
    })

    const loaded = loadStreetsGLSessionPrefs()
    expect(loaded.hiddenBuildingIds).toEqual(['100', '200'])
    expect(localStorage.getItem(STREETS_GL_SESSION_STORAGE_KEY)).toBeTruthy()
  })
})
