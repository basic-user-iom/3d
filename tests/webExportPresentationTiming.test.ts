import { describe, expect, it } from 'vitest'
import { createStandaloneViewerHTML, type WebExportOptions } from '../src/utils/webExport'

function baseOptions(overrides: Partial<WebExportOptions> = {}): WebExportOptions {
  return {
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
    compressTextures: false,
    ...overrides
  }
}

describe('web export presentation timing', () => {
  it('embeds transitionDuration and viewHoldDuration at CONFIG top-level when a full config is passed', () => {
    const html = createStandaloneViewerHTML(
      baseOptions({ transitionDuration: 20, viewHoldDuration: 5, autoPlay: true }),
      [],
      new Map(),
      // Simulates exportForWeb: nested options alone used to be ignored by the player
      {
        version: '2.1.0',
        options: { transitionDuration: 20, viewHoldDuration: 5, autoPlay: true, loop: true },
        cameraViews: []
      }
    )

    const match = html.match(/const CONFIG = ({[\s\S]*?});/)
    expect(match).toBeTruthy()
    const config = JSON.parse(match![1])
    expect(config.transitionDuration).toBe(20)
    expect(config.viewHoldDuration).toBe(5)
    expect(config.autoPlay).toBe(true)
    expect(config.loop).toBe(true)
  })

  it('falls back to defaults when timing options are missing', () => {
    const html = createStandaloneViewerHTML(
      baseOptions({
        // Force through partial cast like older callers
        transitionDuration: undefined as unknown as number,
        viewHoldDuration: undefined as unknown as number
      }),
      [],
      new Map()
    )

    const match = html.match(/const CONFIG = ({[\s\S]*?});/)
    expect(match).toBeTruthy()
    const config = JSON.parse(match![1])
    expect(config.transitionDuration).toBe(2)
    expect(config.viewHoldDuration).toBe(1)
  })

  it('defers autoplay until scene ready and starts from camera view 1', () => {
    const html = createStandaloneViewerHTML(
      baseOptions({ autoPlay: true }),
      [
        {
          id: 'v1',
          name: 'Cam 1',
          cameraPosition: { x: 0, y: 1, z: 2 },
          cameraTarget: { x: 0, y: 0, z: 0 },
          createdAt: 1,
          type: 'static'
        },
        {
          id: 'v2',
          name: 'Cam 2',
          cameraPosition: { x: 3, y: 1, z: 2 },
          cameraTarget: { x: 0, y: 0, z: 0 },
          createdAt: 2,
          type: 'static'
        }
      ],
      new Map()
    )

    expect(html).toContain('beginPresentationPlayback')
    expect(html).toContain('goToFirstCameraViewImmediate')
    expect(html).toContain('preferFirstCameraForAutoPlay')
    expect(html).toMatch(/Do not start here[\s\S]*beginPresentationPlayback/)
    expect(html).toMatch(/beginPresentationPlayback\(\)/)
  })
})
