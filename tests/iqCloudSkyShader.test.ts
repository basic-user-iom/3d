import { describe, expect, it } from 'vitest'
import {
  getIqCloudSkyFragmentShader,
  IQ_CLOUD_SKY_VERTEX_SHADER,
  IQ_CLOUD_BASE_OFFSET,
  IQ_CLOUD_LAYER_THICKNESS,
  IQ_CLOUD_NOISE_XZ_SCALE,
  iqCloudBandY,
  iqCoverageToThickness
} from '../src/viewer/effects/IqCloudSkyShader'

describe('IqCloudSkyShader', () => {
  it('exports shader sources with iq raymarch primitives', () => {
    const fragment = getIqCloudSkyFragmentShader()
    expect(fragment).toContain('raymarchClouds')
    expect(fragment).toContain('mapDensity')
    expect(fragment).toContain('uniform float cloudBaseY')
    expect(fragment).toContain('uniform float cloudTopY')
    expect(fragment).toContain('uniform float cloudScale')
    expect(fragment).toContain('float d = 0.2 - p.y')
    expect(fragment).toContain('pow(sun, 8.0)')
    expect(fragment).toContain('mix(1.15 * vec3(1.0, 0.95, 0.8), vec3(0.7, 0.7, 0.7), den)')
    expect(fragment).toContain('gl_FragColor = vec4(col, 1.0)')
    expect(IQ_CLOUD_SKY_VERTEX_SHADER).toContain('vWorldPosition')
  })

  it('uses Y-slab cloud intersection (not finite XZ AABB)', () => {
    const fragment = getIqCloudSkyFragmentShader()
    expect(fragment).toContain('cloudBaseY - ro.y')
    expect(fragment).toContain('cloudTopY - ro.y')
    expect(fragment).not.toContain('bmin = vec3(-25000.0')
    expect(fragment).toContain('local.xz -= cameraPosition.xz')
  })

  it('includes night sky features', () => {
    const fragment = getIqCloudSkyFragmentShader()
    expect(fragment).toContain('starField')
    expect(fragment).toContain('dayFactor')
    expect(fragment).toContain('moonDir')
  })

  it('uses iq XslGRr noise scale in generated shader', () => {
    const fragment = getIqCloudSkyFragmentShader()
    expect(fragment).toContain(IQ_CLOUD_NOISE_XZ_SCALE.toFixed(6))
  })

  it('computes camera-relative cloud band inside sky dome', () => {
    const band = iqCloudBandY(10)
    expect(band.base).toBe(10 + IQ_CLOUD_BASE_OFFSET)
    expect(band.top - band.base).toBe(IQ_CLOUD_LAYER_THICKNESS)
    expect(band.top).toBeLessThan(10 + 9000)
  })

  it('maps coverage to decreasing density threshold', () => {
    expect(iqCoverageToThickness(0)).toBeGreaterThan(iqCoverageToThickness(0.9))
    expect(iqCoverageToThickness(0.75)).toBeCloseTo(0.21, 2)
  })
})
