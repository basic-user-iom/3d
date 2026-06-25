import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  PATH_TRACER_EXPORT_LOCK_ID,
  releasePathTracerLock,
  tryAcquirePathTracerLock
} from '../src/utils/pathTracerExport'

describe('pathTracerExport lock', () => {
  beforeEach(() => {
    ;(globalThis as any).window = {}
  })

  afterEach(() => {
    delete (globalThis as any).window
  })

  it('acquires and releases the export lock by owner id', () => {
    expect(tryAcquirePathTracerLock(PATH_TRACER_EXPORT_LOCK_ID)).toBe(true)
    expect((window as any).__pathTracerDemoRunning).toBe(true)
    expect((window as any).__pathTracerDemoId).toBe(PATH_TRACER_EXPORT_LOCK_ID)

    releasePathTracerLock(PATH_TRACER_EXPORT_LOCK_ID)
    expect((window as any).__pathTracerDemoRunning).toBeUndefined()
    expect((window as any).__pathTracerDemoId).toBeUndefined()
  })

  it('rejects a second lock while export is active', () => {
    expect(tryAcquirePathTracerLock(PATH_TRACER_EXPORT_LOCK_ID)).toBe(true)
    expect(tryAcquirePathTracerLock('panel-instance')).toBe(false)
  })

  it('does not clear a foreign lock on release', () => {
    ;(window as any).__pathTracerDemoRunning = true
    ;(window as any).__pathTracerDemoId = 'other-owner'

    releasePathTracerLock(PATH_TRACER_EXPORT_LOCK_ID)

    expect((window as any).__pathTracerDemoRunning).toBe(true)
    expect((window as any).__pathTracerDemoId).toBe('other-owner')
  })
})
