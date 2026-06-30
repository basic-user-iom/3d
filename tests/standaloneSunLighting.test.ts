import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  clampStandaloneSunSkyDirection,
  computeHdrSyncedSunSkyDirection,
  computeSunLightingFromElevation,
  isNightTimeOfDay,
  standaloneLightSunDirection,
  standaloneSkySunDirection,
  sunSkyDirectionToLightPosition,
  sunSkyDirectionToLightTravelDirection,
  timeOfDayToSkyAngles
} from '../src/viewer/utils/lightUtils'

describe('standalone sun lighting', () => {
  it('places noon sun above the horizon', () => {
    const { sunPosition } = timeOfDayToSkyAngles(12, 0)
    expect(sunPosition.y).toBeGreaterThan(0.5)
  })

  it('places midnight sun below the horizon', () => {
    const { sunPosition, elevation } = timeOfDayToSkyAngles(0, 0)
    expect(elevation).toBeLessThan(0)
    expect(sunPosition.y).toBeLessThan(0)
  })

  it('detects night hours', () => {
    expect(isNightTimeOfDay(0)).toBe(true)
    expect(isNightTimeOfDay(3)).toBe(true)
    expect(isNightTimeOfDay(12)).toBe(false)
    expect(isNightTimeOfDay(21)).toBe(true)
  })

  it('maps sky sun direction to downward light travel at noon', () => {
    const { sunPosition } = timeOfDayToSkyAngles(12, 0)
    const travel = sunSkyDirectionToLightTravelDirection(sunPosition)
    expect(travel.y).toBeLessThan(-0.5)
  })

  it('positions directional sun light above the scene at noon', () => {
    const { sunPosition } = timeOfDayToSkyAngles(12, 0)
    const lightPos = sunSkyDirectionToLightPosition(sunPosition)
    const travel = sunSkyDirectionToLightTravelDirection(sunPosition)

    expect(lightPos.y).toBeGreaterThan(500)
    expect(travel.y).toBeLessThan(0)
  })

  it('clamps standalone light sun below-horizon directions above the ground plane', () => {
    const belowHorizon = new THREE.Vector3(0.6, -0.4, 0.2).normalize()
    const clamped = clampStandaloneSunSkyDirection(belowHorizon)

    expect(clamped.y).toBeGreaterThan(0)
    expect(clamped.length()).toBeCloseTo(1, 5)
  })

  it('keeps sky sun unclamped while light sun is clamped at night', () => {
    const { sunPosition } = timeOfDayToSkyAngles(0, 0)
    const skyDir = standaloneSkySunDirection(sunPosition)
    const lightDir = standaloneLightSunDirection(skyDir)

    expect(skyDir.y).toBeLessThan(0)
    expect(lightDir.y).toBeGreaterThan(0)
  })

  it('keeps stormy-preset time of day lighting from below the horizon', () => {
    const { sunPosition } = timeOfDayToSkyAngles(12, 0)
    const skyDir = standaloneSkySunDirection(sunPosition)
    const lightDir = standaloneLightSunDirection(skyDir)
    const travel = sunSkyDirectionToLightTravelDirection(lightDir)

    expect(lightDir.y).toBeGreaterThan(0)
    expect(travel.y).toBeLessThan(0)
  })

  describe('computeSunLightingFromElevation', () => {
    it('provides full sun and ambient at zenith', () => {
      const noon = computeSunLightingFromElevation(Math.PI / 2)
      expect(noon.sunIntensity).toBeCloseTo(1.0, 1)
      expect(noon.ambientIntensity).toBeCloseTo(0.6, 1)
      expect(noon.sunColor).toBe('#ffffff')
    })

    it('keeps ambient fill high at low sun for shadow detail', () => {
      const lowSun = computeSunLightingFromElevation(0.1)
      expect(lowSun.ambientIntensity).toBeGreaterThanOrEqual(0.42)
      expect(lowSun.sunIntensity).toBeLessThan(0.75)
      expect(lowSun.sunIntensity).toBeGreaterThan(0.35)
    })

    it('uses desaturated warm sun color at golden hour, not saturated orange', () => {
      const lowSun = computeSunLightingFromElevation(0.08)
      const color = lowSun.sunColor.replace('#', '')
      const r = parseInt(color.slice(0, 2), 16)
      const g = parseInt(color.slice(2, 4), 16)
      const b = parseInt(color.slice(4, 6), 16)
      expect(r).toBeGreaterThan(200)
      expect(g).toBeGreaterThan(160)
      expect(b).toBeGreaterThan(100)
      expect(r - b).toBeLessThan(120)
    })

    it('uses cool sky-tinted ambient at golden hour', () => {
      const lowSun = computeSunLightingFromElevation(0.12)
      const color = lowSun.ambientColor.replace('#', '')
      const r = parseInt(color.slice(0, 2), 16)
      const b = parseInt(color.slice(4, 6), 16)
      expect(b).toBeGreaterThan(r * 0.7)
    })

    it('dims lighting below the horizon', () => {
      const night = computeSunLightingFromElevation(-0.2)
      expect(night.sunIntensity).toBeLessThan(0.1)
      expect(night.ambientIntensity).toBeLessThan(0.25)
    })

    it('boosts tone mapping exposure slightly at golden hour', () => {
      const lowSun = computeSunLightingFromElevation(0.1)
      const highSun = computeSunLightingFromElevation(0.6)
      expect(lowSun.toneMappingExposure).toBeGreaterThan(highSun.toneMappingExposure)
    })
  })

  it('rotates sun direction with HDR azimuth to match environmentRotation', () => {
    const { sunPosition } = timeOfDayToSkyAngles(12, 0)
    const base = sunPosition.clone()
    const synced = computeHdrSyncedSunSkyDirection(base, 90, 0)

    const negated = base.clone().multiplyScalar(-1)
    expect(synced.distanceTo(negated)).toBeLessThan(0.05)

    const rotated = computeHdrSyncedSunSkyDirection(base, 45, 10)
    expect(rotated.distanceTo(base)).toBeGreaterThan(0.05)
    expect(rotated.length()).toBeCloseTo(1, 5)
  })
})
