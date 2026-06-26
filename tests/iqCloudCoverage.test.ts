import { describe, expect, it } from 'vitest'
import {
  iqCoverageAlphaScale,
  iqCoverageCutoff,
  iqCoverageFeather
} from '../src/viewer/utils/iqCloudCoverage'

describe('iqCloudCoverage', () => {
  it('maps slider tiers to expected density cutoffs', () => {
    expect(iqCoverageCutoff(0)).toBeCloseTo(0.76, 2)
    expect(iqCoverageCutoff(0.25)).toBeCloseTo(0.423, 1)
    expect(iqCoverageCutoff(0.75)).toBeCloseTo(0.143, 1)
    expect(iqCoverageCutoff(1)).toBe(0)
  })

  it('widens smoothstep feather at higher coverage', () => {
    expect(iqCoverageFeather(0.25)).toBeLessThan(iqCoverageFeather(1))
  })

  it('returns zero opacity scale when coverage is disabled', () => {
    expect(iqCoverageAlphaScale(0)).toBe(0)
  })

  it('provides measurable alpha scale at 1% for wisps', () => {
    expect(iqCoverageAlphaScale(0.01)).toBeGreaterThan(0.15)
    expect(iqCoverageAlphaScale(0.01)).toBeLessThan(iqCoverageAlphaScale(1))
  })

  it('ramps opacity for storm ceiling at 100%', () => {
    expect(iqCoverageAlphaScale(1)).toBeGreaterThan(iqCoverageAlphaScale(0.75))
    expect(iqCoverageAlphaScale(1)).toBeCloseTo(1.12, 2)
  })
})
