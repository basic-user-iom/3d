import { describe, expect, it } from 'vitest'
import {
  getIqCloudSkyFragmentShader,
  IQ_CLOUD_SKY_VERTEX_SHADER,
  IQ_CLOUD_BASE_OFFSET,
  IQ_CLOUD_GLOBAL_Y_LIFT,
  IQ_CLOUD_HORIZON_FADE_MIN,
  IQ_CLOUD_LAYER_THICKNESS,
  IQ_CLOUD_NOISE_XZ_SCALE,
  IQ_CLOUD_WORLD_TO_NOISE_Y,
  iqCloudBandY,
  iqCloudOriginY,
  iqCoverageToThickness
} from '../src/viewer/effects/IqCloudSkyShader'
import { IQ_COVERAGE_CUTOFF_CLEAR } from '../src/viewer/utils/iqCloudCoverage'

describe('IqCloudSkyShader', () => {
  it('exports shader sources with iq raymarch primitives', () => {
    const fragment = getIqCloudSkyFragmentShader()
    expect(fragment).toContain('raymarchClouds')
    expect(fragment).toContain('vec4 map(vec3 p)')
    expect(fragment).toContain('toIqWorldPos')
    expect(fragment).toContain('uniform float cloudScale')
    expect(fragment).toContain('float d = IQ_DENSITY_Y0 - p.y')
    expect(fragment).toContain('pow(sun, 8.0)')
    expect(fragment).toContain('mix(1.15 * vec3(1.0, 0.95, 0.8), vec3(0.7, 0.7, 0.7), res.x)')
    expect(fragment).toContain('col.a *= 0.35')
    expect(fragment).toContain('uniform float cloudDetail')
    expect(fragment).toContain('densitySharp')
    expect(fragment).not.toContain('0.0312 * noise')
    expect(fragment).toContain('col * (1.0 - clouds.w) + clouds.xyz')
    expect(fragment).not.toContain('sum.xyz /= (0.001 + sum.w)')
    expect(fragment).not.toContain('smoothstep(0.0, feather')
    expect(fragment).not.toContain('wispBlend')
    expect(fragment).toContain('map(lightPos).w')
    expect(fragment).toContain('cloudAlpha * 0.9')
    expect(IQ_CLOUD_SKY_VERTEX_SHADER).toContain('vWorldPosition')
  })

  it('uses world-space iq raymarch (ro + t*rd)', () => {
    const fragment = getIqCloudSkyFragmentShader()
    expect(fragment).toContain('toIqWorldPos')
    expect(fragment).toContain('iqCoverageCutoff')
    expect(fragment).not.toContain('iqCoverageFeather')
    expect(fragment).toContain('pos + 0.3 * sunDir')
    expect(fragment).not.toContain('toIqSpaceFromRay')
    expect(fragment).toContain('iqElevSampleBias')
    expect(fragment).toContain('smoothstep(IQ_HORIZON_FADE_MIN')
    expect(fragment).toContain('cloudAlpha')
    expect(fragment).toContain('gl_FragColor = vec4(col, 1.0)')
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

  it('lifts iq ray origin from cloudBaseY above default camera height', () => {
    const band = iqCloudBandY(5)
    const originY = iqCloudOriginY(5, band.base)
    expect(originY).toBeGreaterThan(1.0 + IQ_CLOUD_GLOBAL_Y_LIFT)
    expect(originY).toBeCloseTo(
      1.0 + IQ_CLOUD_BASE_OFFSET * IQ_CLOUD_WORLD_TO_NOISE_Y + IQ_CLOUD_GLOBAL_Y_LIFT,
      4
    )
  })

  it('includes horizon elevation fade in generated shader', () => {
    const fragment = getIqCloudSkyFragmentShader()
    expect(fragment).toContain(IQ_CLOUD_HORIZON_FADE_MIN.toFixed(2))
    expect(fragment).toContain('horizonFade')
  })

  it('maps coverage to decreasing density threshold', () => {
    expect(iqCoverageToThickness(0)).toBeGreaterThan(iqCoverageToThickness(0.9))
    expect(iqCoverageToThickness(0)).toBeCloseTo(IQ_COVERAGE_CUTOFF_CLEAR, 2)
    expect(iqCoverageToThickness(0.75)).toBeCloseTo(0.28, 1)
    expect(iqCoverageToThickness(0.25)).toBeCloseTo(0.45, 1)
  })

  it('can omit cloud raymarch for hybrid sky-only mode', () => {
    const skyOnly = getIqCloudSkyFragmentShader({ skyOnly: true })
    expect(skyOnly).not.toContain('raymarchClouds(rd, sunDir, dayFactor)')
    const full = getIqCloudSkyFragmentShader({ skyOnly: false })
    expect(full).toContain('raymarchClouds(rd, sunDir, dayFactor)')
  })
})
