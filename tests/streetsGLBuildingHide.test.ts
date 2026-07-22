import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { StreetsGLBridge } from '../src/utils/streetsGLBridge'
import {
  loadStreetsGLSessionPrefs,
  saveStreetsGLSessionPrefs,
  STREETS_GL_SESSION_STORAGE_KEY
} from '../src/utils/streetsGLSessionPersistence'

const TEST_CAPABILITY = '0123456789abcdef0123456789abcdef'
const TEST_ORIGIN = 'http://localhost:8081'

function makeIframe(): HTMLIFrameElement {
  const postMessage = vi.fn()
  return {
    src: `${TEST_ORIGIN}/?sgb=${TEST_CAPABILITY}&parent=http%3A%2F%2Flocalhost%3A3000`,
    contentWindow: { postMessage }
  } as unknown as HTMLIFrameElement
}

function makeBridge(iframe = makeIframe()) {
  return {
    iframe,
    bridge: new StreetsGLBridge(iframe, {
      capability: TEST_CAPABILITY,
      targetOrigin: TEST_ORIGIN
    })
  }
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
    removeEventListener: vi.fn(),
    location: { href: 'http://localhost:3000/' }
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
      location: { href: 'http://localhost:3000/' },
      // Expose listeners so tests can simulate iframe -> parent messages
      __listeners: listeners
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  function emitMessage(
    iframe: HTMLIFrameElement,
    type: string,
    payload: unknown,
    capability = TEST_CAPABILITY
  ) {
    const listeners = (window as any).__listeners as Map<string, Set<EventListenerOrEventListenerObject>>
    const handlers = listeners.get('message')
    if (!handlers) return
    const event = {
      origin: TEST_ORIGIN,
      source: iframe.contentWindow,
      data: { type, payload, capability }
    } as MessageEvent
    for (const handler of handlers) {
      if (typeof handler === 'function') handler(event)
      else handler.handleEvent(event)
    }
  }

  it('hideBuilding resolves true on STREETS_GL_BUILDING_HIDDEN success', async () => {
    const { iframe, bridge } = makeBridge()
    ;(bridge as any).bridgeReady = true

    const promise = bridge.hideBuilding(42)
    emitMessage(iframe, 'STREETS_GL_BUILDING_HIDDEN', { success: true, buildingId: 42 })
    await expect(promise).resolves.toBe(true)

    expect(iframe.contentWindow!.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'STREETS_GL_HIDE_BUILDING',
        payload: { buildingId: 42 },
        capability: TEST_CAPABILITY
      }),
      TEST_ORIGIN
    )
    bridge.dispose()
  })

  it('showBuilding resolves false on timeout', async () => {
    const { bridge } = makeBridge()
    ;(bridge as any).bridgeReady = true

    const promise = bridge.showBuilding(7)
    await vi.advanceTimersByTimeAsync(9_000)
    await expect(promise).resolves.toBe(false)
    bridge.dispose()
  })

  it('syncHiddenBuildings sends buildingIds payload', async () => {
    const { iframe, bridge } = makeBridge()
    ;(bridge as any).bridgeReady = true

    const promise = bridge.syncHiddenBuildings([1, 2, 3])
    emitMessage(iframe, 'STREETS_GL_HIDDEN_BUILDINGS_SYNCED', {
      success: true,
      buildingIds: [1, 2, 3]
    })
    await expect(promise).resolves.toBe(true)

    expect(iframe.contentWindow!.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'STREETS_GL_SYNC_HIDDEN_BUILDINGS',
        payload: { buildingIds: [1, 2, 3] },
        capability: TEST_CAPABILITY
      }),
      TEST_ORIGIN
    )
    bridge.dispose()
  })

  it('onBuildingSelected forwards pick and clear events', () => {
    const { iframe, bridge } = makeBridge()
    const seen: Array<number | null> = []
    const unsub = bridge.onBuildingSelected((b) => {
      seen.push(b?.buildingId ?? null)
    })

    emitMessage(iframe, 'STREETS_GL_BUILDING_SELECTED', {
      success: true,
      buildingId: 99,
      osmType: 2,
      osmId: 123
    })
    emitMessage(iframe, 'STREETS_GL_BUILDING_SELECTED', {
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