import { describe, expect, it } from 'vitest'
import {
  iqCoverageAlphaScale,
  iqCoverageCutoff,
  iqCoverageFeather
} from '../src/viewer/utils/iqCloudCoverage'

describe('iqCloudCoverage', () => {
  it('maps slider tiers to expected density cutoffs', () => {
    expect(iqCoverageCutoff(0)).toBeCloseTo(0.74, 2)
    expect(iqCoverageCutoff(0.25)).toBeCloseTo(0.333, 1)
    expect(iqCoverageCutoff(0.75)).toBeCloseTo(0.112, 1)
    expect(iqCoverageCutoff(1)).toBe(0)
  })

  it('widens smoothstep feather at higher coverage', () => {
    expect(iqCoverageFeather(0.25)).toBeLessThan(iqCoverageFeather(1))
  })

  it('returns zero opacity scale when coverage is disabled', () => {
    expect(iqCoverageAlphaScale(0)).toBe(0)
  })

  it('enables full iq alpha when coverage is active', () => {
    expect(iqCoverageAlphaScale(0.01)).toBe(1)
    expect(iqCoverageAlphaScale(1)).toBe(1)
  })
})
