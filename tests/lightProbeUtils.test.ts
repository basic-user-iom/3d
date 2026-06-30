import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  scaleSphericalHarmonics,
  createScaledLightProbe,
  getAmbientMultiplierWithProbe,
  INTERIOR_PROBE_SH_SCALE,
  AMBIENT_MULTIPLIER_WITH_PROBE_SHADOWS
} from '../src/utils/lightProbeUtils'

describe('lightProbeUtils', () => {
  it('scales all SH coefficients uniformly', () => {
    const sh = new THREE.SphericalHarmonics3()
    sh.coefficients[0].set(1, 2, 3)
    sh.coefficients[3].set(4, 5, 6)

    const scaled = scaleSphericalHarmonics(sh, 0.5)
    expect(scaled.coefficients[0].x).toBeCloseTo(0.5)
    expect(scaled.coefficients[0].y).toBeCloseTo(1)
    expect(scaled.coefficients[3].z).toBeCloseTo(3)
  })

  it('creates a scaled light probe with combined intensity and SH scale', () => {
    const sh = new THREE.SphericalHarmonics3()
    sh.coefficients[0].set(2, 2, 2)
    const base = new THREE.LightProbe(sh, 1)

    const probe = createScaledLightProbe(base, 0.4, INTERIOR_PROBE_SH_SCALE)
    expect(probe.intensity).toBeCloseTo(0.4)
    expect(probe.sh.coefficients[0].x).toBeCloseTo(2 * INTERIOR_PROBE_SH_SCALE)
  })

  it('reduces ambient multiplier when probe is active', () => {
    expect(getAmbientMultiplierWithProbe(false, true)).toBe(1)
    expect(getAmbientMultiplierWithProbe(true, true)).toBe(AMBIENT_MULTIPLIER_WITH_PROBE_SHADOWS)
  })
})
