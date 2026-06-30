import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  applyHdrGroundShadowCatcherMaterial,
  effectiveShadowPlaneVisible,
  shadowCatcherOpacity,
  shouldUseHdrGroundShadowCatcher
} from '../src/viewer/utils/hdrGroundShadowCatcher'

describe('hdrGroundShadowCatcher', () => {
  it('activates for HDR ground projection + shadows', () => {
    expect(
      shouldUseHdrGroundShadowCatcher({
        hdrEnabled: true,
        hdrGroundProjectionEnabled: true,
        shadowsEnabled: true
      })
    ).toBe(true)

    expect(
      shouldUseHdrGroundShadowCatcher({
        hdrEnabled: true,
        hdrGroundProjectionEnabled: true,
        shadowsEnabled: false
      })
    ).toBe(false)

    expect(
      shouldUseHdrGroundShadowCatcher({
        hdrEnabled: false,
        hdrGroundProjectionEnabled: true,
        shadowsEnabled: true
      })
    ).toBe(false)
  })

  it('activates for standard 360 HDR when shadow plane is toggled on', () => {
    expect(
      shouldUseHdrGroundShadowCatcher({
        hdrEnabled: true,
        hdrGroundProjectionEnabled: false,
        shadowsEnabled: true,
        showShadowPlane: true
      })
    ).toBe(true)

    expect(
      shouldUseHdrGroundShadowCatcher({
        hdrEnabled: true,
        hdrGroundProjectionEnabled: false,
        shadowsEnabled: true,
        showShadowPlane: false
      })
    ).toBe(false)
  })

  it('shows shadow plane when HDR catcher is active even if toggle is off (ground projection)', () => {
    expect(
      effectiveShadowPlaneVisible(false, {
        hdrEnabled: true,
        hdrGroundProjectionEnabled: true,
        shadowsEnabled: true
      })
    ).toBe(true)

    expect(
      effectiveShadowPlaneVisible(false, {
        hdrEnabled: true,
        hdrGroundProjectionEnabled: true,
        shadowsEnabled: false
      })
    ).toBe(false)
  })

  it('shows shadow plane for standard HDR when user toggle is on', () => {
    expect(
      effectiveShadowPlaneVisible(true, {
        hdrEnabled: true,
        hdrGroundProjectionEnabled: false,
        shadowsEnabled: true
      })
    ).toBe(true)
  })

  it('applies ShadowMaterial to the shadow plane', () => {
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 10),
      new THREE.MeshStandardMaterial({ color: 0x333333 })
    )

    applyHdrGroundShadowCatcherMaterial(plane, 1.0)

    const material = plane.material
    expect(material).toBeInstanceOf(THREE.ShadowMaterial)
    if (!(material instanceof THREE.ShadowMaterial)) {
      throw new Error('expected ShadowMaterial')
    }
    expect(material.depthWrite).toBe(true)
    expect(material.transparent).toBe(true)
    expect(material.side).toBe(THREE.DoubleSide)
    expect(material.opacity).toBe(shadowCatcherOpacity(1.0))
    expect(plane.receiveShadow).toBe(true)
    expect(plane.castShadow).toBe(false)
    expect(plane.renderOrder).toBe(100)
  })
})
