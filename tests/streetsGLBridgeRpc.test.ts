import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { StreetsGLBridge } from '../src/utils/streetsGLBridge'

function makeIframe(): HTMLIFrameElement {
  const postMessage = vi.fn()
  return {
    contentWindow: { postMessage }
  } as unknown as HTMLIFrameElement
}

describe('StreetsGLBridge RPC races', () => {
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
      }
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('cancels a queued add when removeObject is called before bridge ready', async () => {
    const bridge = new StreetsGLBridge(makeIframe())
    const addResult = await bridge.addObject({
      id: 'obj-pending',
      type: 'box',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 }
    })
    expect(addResult.queued).toBe(true)

    const removed = await bridge.removeObject('obj-pending')
    expect(removed).toBe(true)

    bridge.dispose()
  })

  it('updateObject / removeObject resolve false on timeout instead of hanging', async () => {
    const bridge = new StreetsGLBridge(makeIframe())
    // Force ready without a real Streets GL responder
    ;(bridge as any).bridgeReady = true

    const updatePromise = bridge.updateObject('missing', { visible: false })
    const removePromise = bridge.removeObject('missing')

    await vi.advanceTimersByTimeAsync(9_000)

    await expect(updatePromise).resolves.toBe(false)
    await expect(removePromise).resolves.toBe(false)

    bridge.dispose()
  })

  it('dispose prevents later addObject from queuing', async () => {
    const bridge = new StreetsGLBridge(makeIframe())
    bridge.dispose()
    const result = await bridge.addObject({
      id: 'after-dispose',
      type: 'box',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 }
    })
    expect(result.success).toBe(false)
    expect(result.queued).toBe(false)
  })
})
