import { describe, it, expect, beforeEach } from 'vitest'
import {
  requestViewerRenderFrames,
  hasPendingViewerRenderFrames,
  consumeViewerRenderFrame,
  clearViewerRenderFrames
} from '../src/viewer/utils/renderRequestQueue'

describe('renderRequestQueue', () => {
  beforeEach(() => {
    clearViewerRenderFrames()
  })

  it('starts empty', () => {
    expect(hasPendingViewerRenderFrames()).toBe(false)
  })

  it('queues frames and drains them one at a time', () => {
    requestViewerRenderFrames(2)
    expect(hasPendingViewerRenderFrames()).toBe(true)
    consumeViewerRenderFrame()
    expect(hasPendingViewerRenderFrames()).toBe(true)
    consumeViewerRenderFrame()
    expect(hasPendingViewerRenderFrames()).toBe(false)
  })

  it('never drops below zero when over-consumed', () => {
    requestViewerRenderFrames(1)
    consumeViewerRenderFrame()
    consumeViewerRenderFrame()
    expect(hasPendingViewerRenderFrames()).toBe(false)
  })

  it('raises the pending count but does not lower an existing larger burst', () => {
    requestViewerRenderFrames(3)
    requestViewerRenderFrames(1)
    consumeViewerRenderFrame()
    consumeViewerRenderFrame()
    // 3 requested, 2 consumed -> still 1 pending (the later 1-frame request did not shrink it)
    expect(hasPendingViewerRenderFrames()).toBe(true)
    consumeViewerRenderFrame()
    expect(hasPendingViewerRenderFrames()).toBe(false)
  })

  it('defaults to a 2-frame burst', () => {
    requestViewerRenderFrames()
    consumeViewerRenderFrame()
    expect(hasPendingViewerRenderFrames()).toBe(true)
    consumeViewerRenderFrame()
    expect(hasPendingViewerRenderFrames()).toBe(false)
  })

  it('clear empties the queue', () => {
    requestViewerRenderFrames(5)
    clearViewerRenderFrames()
    expect(hasPendingViewerRenderFrames()).toBe(false)
  })
})
