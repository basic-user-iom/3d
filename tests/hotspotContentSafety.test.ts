import { describe, expect, it } from 'vitest'
import {
  encodeJsonForScriptTag,
  escapeHtmlAttr,
  escapeHtmlText,
  getSafeHotspotIframeUrl,
  sanitizeHotspotHtml
} from '../src/utils/hotspotContentSafety'
import { createStandaloneViewerHTML, type WebExportOptions } from '../src/utils/webExport'

describe('hotspot content safety', () => {
  it('strips script and event-handler payloads from hotspot HTML', () => {
    const dirty = `
      <p>Hello <strong>world</strong></p>
      <img src=x onerror="alert(1)">
      <a href="javascript:alert(1)">click</a>
      <svg onload="alert(1)"></svg>
      <script>alert(1)</script>
    `
    const clean = sanitizeHotspotHtml(dirty)

    expect(clean).toContain('Hello')
    expect(clean).toContain('<strong>world</strong>')
    expect(clean.toLowerCase()).not.toContain('<script')
    expect(clean.toLowerCase()).not.toContain('onerror')
    expect(clean.toLowerCase()).not.toContain('onload')
    expect(clean.toLowerCase()).not.toContain('javascript:')
    expect(clean.toLowerCase()).not.toContain('<svg')
  })

  it('allows only http(s) interactive iframe URLs', () => {
    expect(getSafeHotspotIframeUrl('https://example.com/embed')).toBe('https://example.com/embed')
    expect(getSafeHotspotIframeUrl('http://localhost:8081/')).toMatch(/^http:\/\/localhost:8081\/?$/)
    expect(getSafeHotspotIframeUrl('javascript:alert(1)')).toBeNull()
    expect(getSafeHotspotIframeUrl('file:///C:/Windows/System32/cmd.exe')).toBeNull()
    expect(getSafeHotspotIframeUrl('data:text/html,<script>alert(1)</script>')).toBeNull()
  })
})

describe('web export HTML encoding', () => {
  const baseOptions = (): WebExportOptions => ({
    includeModel: true,
    includeHDR: false,
    includeCameraViews: true,
    includeAnimations: false,
    presentationMode: true,
    transitionDuration: 2,
    viewHoldDuration: 1,
    autoPlay: false,
    loop: true,
    quality: 'high',
    compressTextures: false
  })

  it('keeps hostile camera names inert in exported markup', () => {
    const hostileName = `</div><img src=x onerror=alert(1)>"'><script>alert(1)</script>`
    const html = createStandaloneViewerHTML(
      baseOptions(),
      [
        {
          id: 'view-1',
          name: hostileName,
          position: { x: 0, y: 0, z: 0 },
          target: { x: 0, y: 0, z: 0 },
          fov: 50
        } as any
      ],
      new Map([['view-1', 'data:image/png;base64,xx']])
    )

    expect(html).toContain(escapeHtmlText(hostileName))
    expect(html).toContain(`alt="${escapeHtmlAttr(hostileName)}"`)
    // Payload may appear as escaped text, but must not form a live HTML tag/handler.
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).not.toContain('<img src=x onerror=alert(1)>')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).not.toContain("parentElement.innerHTML=")
    expect(html).toMatch(/onerror="this\.style\.display='none'"/)
  })

  it('encodes config so </script> and line separators cannot break the script tag', () => {
    const payload = {
      note: '</script><script>alert(1)</script>',
      line: 'a\u2028b\u2029c',
      amp: 'a&b'
    }
    const encoded = encodeJsonForScriptTag(payload)
    expect(encoded).not.toContain('</script>')
    expect(encoded).toContain('\\u003c/script\\u003e')
    expect(JSON.parse(encoded)).toEqual(payload)

    const html = createStandaloneViewerHTML(baseOptions(), [], new Map(), {
      version: '2.1.0',
      cameraViews: [],
      evil: '</script><script>alert(1)</script>'
    })

    const match = html.match(/const CONFIG = (\{[\s\S]*?\});/)
    expect(match).toBeTruthy()
    const config = JSON.parse(match![1])
    expect(config.evil).toBe('</script><script>alert(1)</script>')
    expect(html).toContain('Content-Security-Policy')
  })
})
