import { describe, expect, it } from 'vitest'
import {
  estimateIqRaymarchAlpha,
  iqCloudElevSampleBias,
  iqCloudHorizonFade,
  iqCloudOriginY,
  iqCoverageCutoff,
  IQ_TEST_DIRECTIONS,
  mapIqCloudDensity,
  toIqWorldPos
} from '../src/viewer/utils/iqCloudDensity'
import { iqCloudBandY, IQ_CLOUD_BASE_OFFSET, IQ_CLOUD_CAMERA_Y } from '../src/viewer/effects/IqCloudSkyShader'
import { iqCoverageAlphaScale } from '../src/viewer/utils/iqCloudCoverage'

describe('iqCloudDensity', () => {
  const cameraY = 5
  const cloudBaseY = cameraY + IQ_CLOUD_BASE_OFFSET
  const overcast = {
    coverage: 0.75,
    cloudScale: 1,
    time: 12.5,
    windSpeed: 0.1,
    cameraY,
    cloudBaseY
  }

  describe('mapIqCloudDensity', () => {
    it('returns zero when coverage is near zero', () => {
      expect(mapIqCloudDensity(IQ_TEST_DIRECTIONS.zenith, 0, { coverage: 0 })).toBe(0)
    })

    it('produces visible density at zenith for overcast coverage', () => {
      const zenith = mapIqCloudDensity(IQ_TEST_DIRECTIONS.zenith, 0.2, overcast)
      expect(zenith).toBeGreaterThan(0.05)
    })

    it('keeps horizon wisps below zenith after elevation fade', () => {
      const horizon = estimateIqRaymarchAlpha(IQ_TEST_DIRECTIONS.horizon, {
        ...overcast,
        steps: 72,
        dayFactor: 1
      })
      const zenith = estimateIqRaymarchAlpha(IQ_TEST_DIRECTIONS.zenith, {
        ...overcast,
        steps: 72,
        dayFactor: 1
      })
      expect(zenith).toBeGreaterThan(0.15)
      expect(horizon).toBeLessThan(zenith * 0.58)
      expect(iqCloudHorizonFade(0.03)).toBeLessThan(0.05)
      expect(iqCloudHorizonFade(IQ_TEST_DIRECTIONS.horizon.y)).toBeGreaterThan(0.2)
      expect(iqCloudHorizonFade(0.12)).toBe(1)
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

    it('responds to cloudScale via noise-space position scaling', () => {
      const posLarge = toIqWorldPos(IQ_TEST_DIRECTIONS.zenith, 0.3, { x: 100, z: 50 }, 2)
      const posSmall = toIqWorldPos(IQ_TEST_DIRECTIONS.zenith, 0.3, { x: 100, z: 50 }, 0.5)
      expect(posLarge.x).toBeCloseTo(0.0125, 5)
      expect(posSmall.x).toBeCloseTo(0.05, 5)
      expect(posLarge.z).toBeCloseTo(0.00625, 5)
      expect(posSmall.z).toBeCloseTo(0.025, 5)
      expect(posLarge.y).toBeCloseTo(IQ_CLOUD_CAMERA_Y + 0.3 + iqCloudElevSampleBias(IQ_TEST_DIRECTIONS.zenith.y), 5)
    })
  })

  describe('estimateIqRaymarchAlpha', () => {
    it('accumulates meaningful alpha at zenith (noon) with horizon suppressed', () => {
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
      expect(horizonAlpha).toBeLessThan(zenithAlpha * 0.58)
    })

    it('produces measurable raymarch alpha at 1% coverage (zenith wisps)', () => {
      const wisps = estimateIqRaymarchAlpha(IQ_TEST_DIRECTIONS.zenith, {
        coverage: 0.01,
        cloudScale: 1,
        steps: 64,
        dayFactor: 1
      })
      expect(wisps).toBeGreaterThan(0.03)
      expect(wisps).toBeLessThan(
        estimateIqRaymarchAlpha(IQ_TEST_DIRECTIONS.zenith, {
          coverage: 0.25,
          cloudScale: 1,
          steps: 64,
          dayFactor: 1
        })
      )
    })

    it('maps slider tiers with perceptual progression', () => {
      const clear = estimateIqRaymarchAlpha(IQ_TEST_DIRECTIONS.zenith, {
        coverage: 0,
        steps: 64,
        dayFactor: 1
      })
      const scattered = estimateIqRaymarchAlpha(IQ_TEST_DIRECTIONS.zenith, {
        coverage: 0.25,
        cloudScale: 1,
        steps: 64,
        dayFactor: 1
      })
      const overcastAlpha = estimateIqRaymarchAlpha(IQ_TEST_DIRECTIONS.zenith, {
        ...overcast,
        steps: 64,
        dayFactor: 1
      })
      const storm = estimateIqRaymarchAlpha(IQ_TEST_DIRECTIONS.zenith, {
        coverage: 1,
        cloudScale: 1,
        steps: 64,
        dayFactor: 1
      })

      expect(clear).toBe(0)
      expect(scattered).toBeGreaterThan(0.04)
      expect(overcastAlpha).toBeGreaterThan(0.15)
      expect(storm).toBeGreaterThan(0.35)
      expect(storm).toBeGreaterThanOrEqual(scattered * 0.85)
    })

    it('dims clouds at night but keeps some visibility when coverage is high', () => {
      const moderate = { coverage: 0.5, cloudScale: 1, time: 12.5, windSpeed: 0.1 }
      const day = estimateIqRaymarchAlpha(IQ_TEST_DIRECTIONS.midSky, {
        ...moderate,
        steps: 48,
        dayFactor: 1
      })
      const night = estimateIqRaymarchAlpha(IQ_TEST_DIRECTIONS.midSky, {
        ...moderate,
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

    it('uses iq fixed alpha scale when coverage is active', () => {
      expect(iqCoverageAlphaScale(1)).toBe(1)
      expect(iqCoverageAlphaScale(0.25)).toBe(1)
    })
  })
})
