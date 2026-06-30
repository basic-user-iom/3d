import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  applyHdrGroundShadowCatcherMaterial,
  shadowCatcherOpacity,
  shouldUseHdrGroundShadowCatcher
} from '../src/viewer/utils/hdrGroundShadowCatcher'

describe('hdrGroundShadowCatcher', () => {
  it('activates only when HDR ground projection and shadows are both on', () => {
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

  it('applies ShadowMaterial to the shadow plane', () => {
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 10),
      new THREE.MeshStandardMaterial({ color: 0x333333 })
    )

    applyHdrGroundShadowCatcherMaterial(plane, 1.0)

    expect(plane.material).toBeInstanceOf(THREE.ShadowMaterial)
    expect((plane.material as THREE.ShadowMaterial).depthWrite).toBe(true)
    expect((plane.material as THREE.ShadowMaterial).opacity).toBe(shadowCatcherOpacity(1.0))
    expect(plane.receiveShadow).toBe(true)
    expect(plane.castShadow).toBe(false)
    expect(plane.renderOrder).toBe(100)
  })
})
