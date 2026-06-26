import { describe, expect, it } from 'vitest'
import { boxCloudAlphaScale, boxCloudCoverage } from '../src/viewer/utils/boxCloudCoverage'

describe('boxCloudCoverage', () => {
  it('returns zero when UI density is disabled', () => {
    expect(boxCloudCoverage(0)).toBe(0)
  })

  it('maps 1% slider to visible box coverage wisps', () => {
    const atOnePercent = boxCloudCoverage(0.01)
    expect(atOnePercent).toBeGreaterThan(0.12)
    expect(atOnePercent).toBeLessThan(0.35)
  })

  it('ramps smoothly toward full coverage at 100%', () => {
    expect(boxCloudCoverage(0.25)).toBeLessThan(boxCloudCoverage(0.75))
    expect(boxCloudCoverage(1)).toBeCloseTo(1, 2)
  })

  it('provides measurable alpha scale at 1%', () => {
    expect(boxCloudAlphaScale(0.01)).toBeGreaterThan(0.5)
  })
})
