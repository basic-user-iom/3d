import { describe, expect, it } from 'vitest'
import {
  DEFAULT_HOTSPOT_COLORS,
  DEFAULT_POPUP_ANCHOR,
  DEFAULT_POPUP_BORDER_COLOR,
  DEFAULT_POPUP_WIDTH,
  degToRad,
  getHotspotColor,
  getHotspotShape,
  getPopupAnchor,
  getPopupBorderColor,
  getPopupWidth,
  getUrlIframeTitle,
  hasPanoramaInitialView,
  getPanoramaInitialView,
  isLikelyIframeBlocked,
  radToDeg,
  resolvePanoramaUrl,
  type PanoramaHotspot
} from '../src/panorama/panoramaTourTypes'

const baseHotspot: PanoramaHotspot = {
  id: 'hs-1',
  label: 'Test',
  yaw: 0,
  pitch: 0,
  type: 'info'
}

describe('panoramaTourTypes defaults', () => {
  it('returns type-based color when color is unset', () => {
    expect(getHotspotColor({ ...baseHotspot, type: 'link' })).toBe(DEFAULT_HOTSPOT_COLORS.link)
    expect(getHotspotColor({ ...baseHotspot, type: 'info' })).toBe(DEFAULT_HOTSPOT_COLORS.info)
    expect(getHotspotColor({ ...baseHotspot, color: '#ff0000' })).toBe('#ff0000')
  })

  it('returns circle shape by default', () => {
    expect(getHotspotShape(baseHotspot)).toBe('circle')
    expect(getHotspotShape({ ...baseHotspot, shape: 'pin' })).toBe('pin')
  })

  it('returns popup layout defaults', () => {
    expect(getPopupWidth(baseHotspot)).toBe(DEFAULT_POPUP_WIDTH)
    expect(getPopupAnchor(baseHotspot)).toBe(DEFAULT_POPUP_ANCHOR)
    expect(getPopupBorderColor(baseHotspot)).toBe(DEFAULT_POPUP_BORDER_COLOR)
    expect(DEFAULT_POPUP_ANCHOR).toBe('above')
    expect(DEFAULT_POPUP_BORDER_COLOR).toBe('#ffb43c')
    expect(getPopupWidth({ ...baseHotspot, popupWidth: 240 })).toBe(240)
    expect(getPopupAnchor({ ...baseHotspot, popupAnchor: 'below' })).toBe('below')
    expect(getPopupBorderColor({ ...baseHotspot, popupBorderColor: '#00ff88' })).toBe('#00ff88')
  })

  it('converts degrees and radians', () => {
    expect(radToDeg(Math.PI)).toBeCloseTo(180)
    expect(degToRad(90)).toBeCloseTo(Math.PI / 2)
  })
})

describe('resolvePanoramaUrl', () => {
  it('normalizes bare hostnames to https', () => {
    expect(resolvePanoramaUrl('example.com')).toBe('https://example.com/')
  })

  it('accepts explicit http and https URLs', () => {
    expect(resolvePanoramaUrl('https://example.com/path')).toBe('https://example.com/path')
    expect(resolvePanoramaUrl('http://example.com')).toBe('http://example.com/')
  })

  it('rejects empty, invalid, and non-http schemes', () => {
    expect(resolvePanoramaUrl('')).toBeNull()
    expect(resolvePanoramaUrl('   ')).toBeNull()
    expect(resolvePanoramaUrl('not a url')).toBeNull()
    expect(resolvePanoramaUrl('javascript:alert(1)')).toBeNull()
    expect(resolvePanoramaUrl('ftp://example.com')).toBeNull()
  })
})

describe('isLikelyIframeBlocked', () => {
  it('flags known non-embeddable hosts and their subdomains', () => {
    expect(isLikelyIframeBlocked('https://en.wikipedia.org/wiki/Foo')).toBe(true)
    expect(isLikelyIframeBlocked('https://www.google.com/search?q=test')).toBe(true)
    expect(isLikelyIframeBlocked('https://facebook.com/page')).toBe(true)
  })

  it('allows hosts not on the block list', () => {
    expect(isLikelyIframeBlocked('https://example.com/')).toBe(false)
    expect(isLikelyIframeBlocked('https://codepen.io/pen/abc')).toBe(false)
  })

  it('returns false for invalid URLs', () => {
    expect(isLikelyIframeBlocked('not-a-url')).toBe(false)
  })
})

describe('getUrlIframeTitle', () => {
  it('uses a custom label when set', () => {
    expect(getUrlIframeTitle('Product page', 'https://shop.example.com/item')).toBe('Product page')
  })

  it('falls back to hostname for default or empty labels', () => {
    expect(getUrlIframeTitle('New hotspot', 'https://en.wikipedia.org/wiki/Test')).toBe('en.wikipedia.org')
    expect(getUrlIframeTitle('', 'https://www.example.com/path')).toBe('example.com')
    expect(getUrlIframeTitle(undefined, 'https://shop.example.com/')).toBe('shop.example.com')
  })
})

describe('panorama initial view helpers', () => {
  it('detects when a panorama has a custom initial view', () => {
    const pano = { id: 'p1', name: 'Room', source: 'a.jpg', hotspots: [] }
    expect(hasPanoramaInitialView(pano)).toBe(false)
    expect(getPanoramaInitialView(pano)).toEqual({ yaw: 0, pitch: 0 })
    expect(hasPanoramaInitialView({ ...pano, initialYaw: 1 })).toBe(true)
    expect(getPanoramaInitialView({ ...pano, initialYaw: 1, initialPitch: 0.5 })).toEqual({
      yaw: 1,
      pitch: 0.5
    })
  })
})
