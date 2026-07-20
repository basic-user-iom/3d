import { describe, expect, it } from 'vitest'
import {
  webExportIqCloudBand,
  webExportIqRaymarchSteps,
  webExportIqSkyExposure,
  webExportIqWindSpeed,
  WEB_EXPORT_IQ_CLOUD_FRAGMENT_SHADER,
  WEB_EXPORT_IQ_CLOUD_VERTEX_SHADER
} from '../src/utils/webExportIqCloudSky'

describe('webExportIqCloudSky', () => {
  it('embeds iq cloud sky shaders with volumetric raymarch', () => {
    expect(WEB_EXPORT_IQ_CLOUD_VERTEX_SHADER).toContain('vWorldPosition')
    expect(WEB_EXPORT_IQ_CLOUD_FRAGMENT_SHADER).toContain('uniform float cloudScale')
    expect(WEB_EXPORT_IQ_CLOUD_FRAGMENT_SHADER).toContain('uniform float cloudDetail')
    expect(WEB_EXPORT_IQ_CLOUD_FRAGMENT_SHADER).toContain('raymarchClouds')
    expect(WEB_EXPORT_IQ_CLOUD_FRAGMENT_SHADER).toContain('iqCoverageCutoff')
  })

  it('maps weather quality to raymarch steps like editor', () => {
    expect(webExportIqRaymarchSteps('high', 0)).toBe(24)
    expect(webExportIqRaymarchSteps('high', 0.1)).toBeGreaterThanOrEqual(64)
    expect(webExportIqRaymarchSteps('low', 0.5)).toBeGreaterThanOrEqual(32)
  })

  it('computes camera-relative cloud band', () => {
    const band = webExportIqCloudBand(0)
    expect(band.top).toBeGreaterThan(band.base)
    expect(band.base).toBeGreaterThan(300)
  })

  it('derives wind speed and exposure from weather config', () => {
    expect(webExportIqWindSpeed(0)).toBeCloseTo(0.05)
    expect(webExportIqSkyExposure({ skyExposure: 0.7 })).toBe(0.85)
    expect(webExportIqSkyExposure({ skyExposure: 1.2 })).toBe(1.2)
  })
})
