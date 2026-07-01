import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  applyHdrGroundShadowCatcherMaterial,
  effectiveShadowPlaneVisible,
  groundProjectionShadowPlaneY,
  GROUND_PROJECTION_SHADOW_PLANE_Y,
  shadowCatcherOpacity,
  shadowPlaneYForHdrMode,
  shouldAutoShowShadowPlaneForHdr,
  shouldUseHdrGroundShadowCatcher,
  STANDARD_HDR_SHADOW_PLANE_Y,
  syncHdrShadowPlaneInScene
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

  it('applies ShadowMaterial to the shadow plane for standard HDR', () => {
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 10),
      new THREE.MeshStandardMaterial({ color: 0x333333 })
    )

    applyHdrGroundShadowCatcherMaterial(plane, 1.0, false, STANDARD_HDR_SHADOW_PLANE_Y)

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
    expect(plane.position.y).toBe(STANDARD_HDR_SHADOW_PLANE_Y)
    expect(plane.renderOrder).toBe(0)
  })

  it('uses projected ground Y and render order when ground projection is enabled', () => {
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 10),
      new THREE.MeshStandardMaterial({ color: 0x333333 })
    )
    const groundProjection = { height: 25, radius: 10, positionY: 2 }

    applyHdrGroundShadowCatcherMaterial(
      plane,
      1.0,
      true,
      groundProjectionShadowPlaneY(groundProjection)
    )

    expect(plane.position.y).toBe(GROUND_PROJECTION_SHADOW_PLANE_Y + 2)
    expect(plane.renderOrder).toBe(100)
    expect(shadowPlaneYForHdrMode(true, groundProjection)).toBe(1.99)
    expect(shadowPlaneYForHdrMode(false)).toBe(STANDARD_HDR_SHADOW_PLANE_Y)
  })

  it('syncHdrShadowPlaneInScene reveals hidden shadow plane under HDR + shadows', () => {
    const scene = new THREE.Scene()
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100),
      new THREE.MeshStandardMaterial({ color: 0x333333 })
    )
    plane.userData.isShadowPlane = true
    plane.visible = false
    scene.add(plane)

    syncHdrShadowPlaneInScene(scene, {
      showShadowPlane: false,
      shadowIntensity: 1,
      input: {
        hdrEnabled: true,
        hdrGroundProjectionEnabled: false,
        shadowsEnabled: true
      },
      lightweight: true,
      frameCount: 0
    })

    expect(plane.visible).toBe(true)
    expect(plane.material).toBeInstanceOf(THREE.ShadowMaterial)
    expect(plane.receiveShadow).toBe(true)
  })

  it('positions ground projection catcher under model bbox instead of world origin', () => {
    const scene = new THREE.Scene()
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(10000, 10000),
      new THREE.MeshStandardMaterial({ color: 0x333333 })
    )
    plane.userData.isShadowPlane = true
    plane.position.set(0, -0.01, 0)
    plane.scale.set(1, 1, 1)
    scene.add(plane)

    const car = new THREE.Mesh(
      new THREE.BoxGeometry(4, 2, 8),
      new THREE.MeshStandardMaterial()
    )
    car.position.set(12, 1, -6)
    car.userData.isImportedModel = true
    car.castShadow = true
    scene.add(car)

    syncHdrShadowPlaneInScene(scene, {
      showShadowPlane: false,
      shadowIntensity: 1,
      input: {
        hdrEnabled: true,
        hdrGroundProjectionEnabled: true,
        shadowsEnabled: true
      },
      groundProjection: { height: 25, radius: 10, positionY: 0 },
      lightweight: false,
      frameCount: 0
    })

    expect(plane.position.x).toBeCloseTo(12, 1)
    expect(plane.position.z).toBeCloseTo(-6, 1)
    expect(plane.position.y).toBe(GROUND_PROJECTION_SHADOW_PLANE_Y)
    expect(plane.scale.x).toBeGreaterThanOrEqual(1)
    expect(plane.scale.z).toBeGreaterThan(1)
    expect(plane.geometry.parameters.width).toBeLessThan(10000)
  })
})
