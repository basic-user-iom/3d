import { describe, expect, it } from 'vitest'
import { shouldLoadStreetsGLIframe } from '../src/utils/streetsGLIframeLifecycle'

describe('shouldLoadStreetsGLIframe', () => {
  it('loads in city/hybrid when overlay is on', () => {
    expect(shouldLoadStreetsGLIframe(true, 'city')).toBe(true)
    expect(shouldLoadStreetsGLIframe(true, 'hybrid')).toBe(true)
  })

  it('does not load in product mode or when overlay is off', () => {
    expect(shouldLoadStreetsGLIframe(true, 'product')).toBe(false)
    expect(shouldLoadStreetsGLIframe(false, 'city')).toBe(false)
    expect(shouldLoadStreetsGLIframe(false, 'hybrid')).toBe(false)
  })

  it('must not depend on tab visibility (document.hidden)', () => {
    // Regression: gating load on Page Visibility previously set iframe src to
    // about:blank on tab hide, which restarted Streets GL and dropped imports.
    // shouldLoadStreetsGLIframe intentionally has no visibility parameter.
    expect(shouldLoadStreetsGLIframe.length).toBe(2)
    expect(shouldLoadStreetsGLIframe(true, 'city')).toBe(true)
  })
})
