import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  applyHdrGroundShadowCatcherMaterial,
  effectiveShadowPlaneVisible,
  HDR_SHADOW_CATCHER_PLANE_Y,
  shadowCatcherOpacity,
  shouldAutoShowShadowPlaneForHdr,
  shouldUseHdrGroundShadowCatcher
} from '../src/viewer/utils/hdrGroundShadowCatcher'

describe('hdrGroundShadowCatcher', () => {
  it('auto-shows shadow plane when HDR and shadows are both on', () => {
    expect(
      shouldAutoShowShadowPlaneForHdr({
        hdrEnabled: true,
        hdrGroundProjectionEnabled: false,
        shadowsEnabled: true
      })
    ).toBe(true)

    expect(
      effectiveShadowPlaneVisible(false, {
        hdrEnabled: true,
        hdrGroundProjectionEnabled: false,
        shadowsEnabled: true
      })
    ).toBe(true)
  })

  it('activates catcher for HDR ground projection + shadows', () => {
    expect(
      shouldUseHdrGroundShadowCatcher(
        {
          hdrEnabled: true,
          hdrGroundProjectionEnabled: true,
          shadowsEnabled: true
        },
        false
      )
    ).toBe(true)

    expect(
      shouldUseHdrGroundShadowCatcher(
        {
          hdrEnabled: true,
          hdrGroundProjectionEnabled: true,
          shadowsEnabled: false
        },
        false
      )
    ).toBe(false)
  })

  it('uses ShadowMaterial catcher whenever HDR and shadows are on', () => {
    expect(
      shouldUseHdrGroundShadowCatcher(
        {
          hdrEnabled: true,
          hdrGroundProjectionEnabled: false,
          shadowsEnabled: true
        },
        true
      )
    ).toBe(true)

    expect(
      shouldUseHdrGroundShadowCatcher(
        {
          hdrEnabled: true,
          hdrGroundProjectionEnabled: true,
          shadowsEnabled: true
        },
        false
      )
    ).toBe(true)
  })

  it('skips catcher when shadows are off', () => {
    expect(
      shouldUseHdrGroundShadowCatcher(
        {
          hdrEnabled: true,
          hdrGroundProjectionEnabled: true,
          shadowsEnabled: false
        },
        true
      )
    ).toBe(false)
  })

  it('shows shadow plane when HDR ground catcher is active even if toggle is off', () => {
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
    expect(material.depthWrite).toBe(false)
    expect(material.transparent).toBe(true)
    expect(material.side).toBe(THREE.DoubleSide)
    expect(material.opacity).toBe(shadowCatcherOpacity(1.0))
    expect(plane.receiveShadow).toBe(true)
    expect(plane.castShadow).toBe(false)
    expect(plane.position.y).toBe(HDR_SHADOW_CATCHER_PLANE_Y)
    expect(plane.renderOrder).toBe(100)
  })
})
