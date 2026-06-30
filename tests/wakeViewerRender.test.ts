import { describe, it, expect } from 'vitest'
import { wakeViewerRender } from '../src/viewer/utils/wakeViewerRender'

describe('wakeViewerRender', () => {
  it('invokes requestRender when the viewer exposes it', () => {
    let called = false
    wakeViewerRender({ requestRender: () => { called = true } })
    expect(called).toBe(true)
  })

  it('is a no-op when viewer or requestRender is missing', () => {
    expect(() => wakeViewerRender(null)).not.toThrow()
    expect(() => wakeViewerRender({})).not.toThrow()
  })
})
