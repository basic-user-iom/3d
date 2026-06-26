import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  clampStandaloneSunSkyDirection,
  sunSkyDirectionToLightPosition,
  sunSkyDirectionToLightTravelDirection,
  timeOfDayToSkyAngles
} from '../src/viewer/utils/lightUtils'

describe('standalone sun lighting', () => {
  it('places noon sun above the horizon', () => {
    const { sunPosition } = timeOfDayToSkyAngles(12, 0)
    expect(sunPosition.y).toBeGreaterThan(0.5)
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

  it('clamps standalone sun below-horizon directions above the ground plane', () => {
    const belowHorizon = new THREE.Vector3(0.6, -0.4, 0.2).normalize()
    const clamped = clampStandaloneSunSkyDirection(belowHorizon)

    expect(clamped.y).toBeGreaterThan(0)
    expect(clamped.length()).toBeCloseTo(1, 5)
  })

  it('keeps stormy-preset time of day lighting from below the horizon', () => {
    const { sunPosition } = timeOfDayToSkyAngles(12, 0)
    const skyDir = clampStandaloneSunSkyDirection(sunPosition)
    const travel = sunSkyDirectionToLightTravelDirection(skyDir)

    expect(skyDir.y).toBeGreaterThan(0)
    expect(travel.y).toBeLessThan(0)
  })
})
