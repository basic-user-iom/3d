import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  clampStandaloneSunSkyDirection,
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
})
