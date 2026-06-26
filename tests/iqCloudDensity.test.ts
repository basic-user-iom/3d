import { describe, expect, it } from 'vitest'
import {
  estimateIqRaymarchAlpha,
  iqCoverageCutoff,
  IQ_TEST_DIRECTIONS,
  mapIqCloudDensity
} from '../src/viewer/utils/iqCloudDensity'

describe('iqCloudDensity', () => {
  const overcast = { coverage: 0.75, cloudScale: 1, time: 12.5, windSpeed: 0.1 }

  describe('mapIqCloudDensity', () => {
    it('returns zero when coverage is near zero', () => {
      expect(mapIqCloudDensity(IQ_TEST_DIRECTIONS.zenith, 0, { coverage: 0 })).toBe(0)
    })

    it('produces visible density at zenith for overcast coverage', () => {
      const zenith = mapIqCloudDensity(IQ_TEST_DIRECTIONS.zenith, 0.2, overcast)
      expect(zenith).toBeGreaterThan(0.05)
    })

    it('produces visible density at horizon for overcast coverage', () => {
      const horizon = mapIqCloudDensity(IQ_TEST_DIRECTIONS.horizon, 0.2, overcast)
      expect(horizon).toBeGreaterThan(0.05)
    })

    it('responds to coverage slider via density cutoff', () => {
      expect(iqCoverageCutoff(0.75)).toBeLessThan(iqCoverageCutoff(0.1))
      const zenithLight = mapIqCloudDensity(IQ_TEST_DIRECTIONS.zenith, 0.3, {
        coverage: 0.1,
        cloudScale: 1
      })
      const zenithDense = mapIqCloudDensity(IQ_TEST_DIRECTIONS.zenith, 0.3, {
        coverage: 0.9,
        cloudScale: 1
      })
      expect(zenithDense).toBeGreaterThanOrEqual(zenithLight)
    })
  })

  describe('estimateIqRaymarchAlpha', () => {
    it('accumulates meaningful alpha at zenith and horizon (noon)', () => {
      const zenithAlpha = estimateIqRaymarchAlpha(IQ_TEST_DIRECTIONS.zenith, {
        ...overcast,
        steps: 64,
        dayFactor: 1
      })
      const horizonAlpha = estimateIqRaymarchAlpha(IQ_TEST_DIRECTIONS.horizon, {
        ...overcast,
        steps: 64,
        dayFactor: 1
      })
      expect(zenithAlpha).toBeGreaterThan(0.15)
      expect(horizonAlpha).toBeGreaterThan(0.12)
    })

    it('dims clouds at night but keeps some visibility when coverage is high', () => {
      const day = estimateIqRaymarchAlpha(IQ_TEST_DIRECTIONS.midSky, {
        ...overcast,
        steps: 48,
        dayFactor: 1
      })
      const night = estimateIqRaymarchAlpha(IQ_TEST_DIRECTIONS.midSky, {
        ...overcast,
        steps: 48,
        dayFactor: 0.25
      })
      expect(day).toBeGreaterThan(night)
      expect(night).toBeGreaterThan(0.02)
    })

    it('returns zero alpha when coverage is disabled', () => {
      expect(
        estimateIqRaymarchAlpha(IQ_TEST_DIRECTIONS.zenith, { coverage: 0, steps: 64 })
      ).toBe(0)
    })
  })
})
