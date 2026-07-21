/**
 * Phase 1: ResyncCoordinator single-flight + one follow-up.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { StreetsGLBridge } from '../src/utils/streetsGLBridge'
import {
  __isResyncInFlightForTests,
  __resetResyncCoordinatorForTests,
  bindResyncRunner,
  requestRegistryResync
} from '../src/viewer/streetsGLResyncCoordinator'

function readyBridge(): StreetsGLBridge {
  return { isReady: true } as unknown as StreetsGLBridge
}

describe('StreetsGL ResyncCoordinator', () => {
  beforeEach(() => {
    __resetResyncCoordinatorForTests()
  })

  afterEach(() => {
    __resetResyncCoordinatorForTests()
  })

  it('joins concurrent callers into one in-flight pass (no parallel heals)', async () => {
    let active = 0
    let maxActive = 0
    let runs = 0

    bindResyncRunner(async () => {
      active++
      maxActive = Math.max(maxActive, active)
      runs++
      await new Promise((r) => setTimeout(r, 30))
      active--
      return runs
    })

    const bridge = readyBridge()
    const [a, b, c] = await Promise.all([
      requestRegistryResync(bridge, 'bridge-ready'),
      requestRegistryResync(bridge, 'mode-enter'),
      requestRegistryResync(bridge, 'iframe-reload')
    ])

    expect(maxActive).toBe(1)
    // First pass + one coalesced follow-up (callers arrived during flight).
    expect(runs).toBe(2)
    expect(a).toBe(2)
    expect(b).toBe(2)
    expect(c).toBe(2)
    expect(__isResyncInFlightForTests()).toBe(false)
  })

  it('queues exactly one follow-up when requests arrive during an in-flight pass', async () => {
    const order: string[] = []
    let pass = 0

    bindResyncRunner(async () => {
      pass++
      const id = `pass-${pass}`
      order.push(`start:${id}`)
      await new Promise((r) => setTimeout(r, 20))
      order.push(`end:${id}`)
      return pass
    })

    const bridge = readyBridge()
    const first = requestRegistryResync(bridge, 'bridge-ready')
    // Arrive while first is in flight
    await new Promise((r) => setTimeout(r, 5))
    const second = requestRegistryResync(bridge, 'mode-enter')
    const third = requestRegistryResync(bridge, 'iframe-reload')

    const results = await Promise.all([first, second, third])
    expect(results).toEqual([2, 2, 2])
    expect(order).toEqual([
      'start:pass-1',
      'end:pass-1',
      'start:pass-2',
      'end:pass-2'
    ])
  })

  it('returns 0 when bridge is not ready', async () => {
    const runner = vi.fn(async () => 5)
    bindResyncRunner(runner)
    const n = await requestRegistryResync(
      { isReady: false } as unknown as StreetsGLBridge,
      'manual'
    )
    expect(n).toBe(0)
    expect(runner).not.toHaveBeenCalled()
  })

  it('returns 0 when no runner is bound', async () => {
    const n = await requestRegistryResync(readyBridge(), 'manual')
    expect(n).toBe(0)
  })
})
