import { describe, expect, test, beforeEach, vi } from 'vitest'

describe('useAppStore path tracer adaptive targets', () => {
  let useAppStore: typeof import('../src/store/useAppStore').useAppStore

  beforeEach(async () => {
    vi.resetModules()
    ;({ useAppStore } = await import('../src/store/useAppStore'))
  })

  test('setPathTracerSampleTarget disables auto targeting for that mode', () => {
    const { setPathTracerSampleTarget, pathTracerMode } = useAppStore.getState()
    expect(pathTracerMode).toBe('gpu')

    setPathTracerSampleTarget('gpu', 256)

    const state = useAppStore.getState()
    expect(state.pathTracerSampleTargets.gpu).toBe(256)
    expect(state.pathTracerAutoEnabled.gpu).toBe(false)
    expect(state.pathTracerAutoTarget.gpu).toBeNull()
  })

  test('setPathTracerAutoTarget stores auto samples without changing active target', () => {
    const state = useAppStore.getState()
    expect(state.pathTracerMode).toBe('gpu')

    state.setPathTracerAutoTarget('gpu', 96)

    const next = useAppStore.getState()
    expect(next.pathTracerAutoTarget.gpu).toBe(96)
    expect(next.pathTracerSettings.samples).toBe(next.pathTracerSampleTargets[next.pathTracerMode])
  })

  test('setPathTracerAutoTargetEnabled toggles auto target and updates samples', () => {
    const state = useAppStore.getState()
    state.setPathTracerMode('cpu')

    state.setPathTracerAutoTargetEnabled('cpu', false)
    let next = useAppStore.getState()
    expect(next.pathTracerAutoEnabled.cpu).toBe(false)
    expect(next.pathTracerAutoTarget.cpu).toBeNull()
    expect(next.pathTracerSettings.samples).toBe(next.pathTracerSampleTargets.cpu)

    state.setPathTracerAutoTargetEnabled('cpu', true)
    next = useAppStore.getState()
    expect(next.pathTracerAutoEnabled.cpu).toBe(true)
    expect(next.pathTracerAutoTarget.cpu).toBe(next.pathTracerSampleTargets.cpu)
    expect(next.pathTracerSettings.samples).toBe(next.pathTracerSampleTargets.cpu)
  })

  test('setPathTracerMode applies auto target when available', () => {
    const state = useAppStore.getState()
    state.setPathTracerAutoTarget('gpu', 80)
    state.setPathTracerMode('cpu')
    state.setPathTracerAutoTarget('cpu', 72)

    const next = useAppStore.getState()
    expect(next.pathTracerMode).toBe('cpu')
    expect(next.pathTracerSettings.samples).toBe(next.pathTracerSampleTargets.cpu)
  })
})


