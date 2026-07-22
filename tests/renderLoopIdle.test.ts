import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  createFrameMotionState,
  captureFrameMotionState,
  hasFrameMotion,
  hasOrbitControlsDamping,
  isParticleSystemActive,
  isWaterSystemActive,
  needsContinuousSceneUpdates,
  restartAnimationLoopIfIdle
} from '../src/viewer/utils/renderLoopIdle'

describe('renderLoopIdle', () => {
  it('detects camera motion between frames', () => {
    const camera = new THREE.PerspectiveCamera()
    const controls = {
      target: new THREE.Vector3(),
      enableDamping: false
    } as any

    camera.position.set(0, 0, 5)
    const previous = createFrameMotionState()
    captureFrameMotionState(previous, camera, controls)

    camera.position.x = 1
    expect(hasFrameMotion(previous, camera, controls)).toBe(true)
  })

  it('does not schedule synchronously when a frame is already pending', () => {
    let scheduleCalls = 0
    const schedule = () => { scheduleCalls++ }

    restartAnimationLoopIfIdle(42, schedule)
    expect(scheduleCalls).toBe(0)
  })

  it('schedules via rAF when idle and never calls animate synchronously', () => {
    let scheduleCalls = 0
    let woke = false
    const schedule = () => { scheduleCalls++ }

    restartAnimationLoopIfIdle(undefined, schedule, () => { woke = true })
    expect(woke).toBe(true)
    expect(scheduleCalls).toBe(1)

    restartAnimationLoopIfIdle(1, schedule)
    expect(scheduleCalls).toBe(1)
  })

  it('avoids synchronous re-entry when change fires during animate', () => {
    let pendingFrameId: number | undefined
    let animateDepth = 0
    let maxAnimateDepth = 0

    const scheduleAnimationFrame = () => {
      pendingFrameId = 1
    }

    const restartAnimationLoop = () => {
      restartAnimationLoopIfIdle(pendingFrameId, scheduleAnimationFrame)
    }

    const controls = {
      update: () => {
        restartAnimationLoop()
      }
    }

    const animate = () => {
      animateDepth++
      maxAnimateDepth = Math.max(maxAnimateDepth, animateDepth)
      pendingFrameId = undefined
      controls.update()
      animateDepth--
    }

    pendingFrameId = 1
    animate()

    expect(maxAnimateDepth).toBe(1)
  })

  it('keeps the loop alive while OrbitControls damping has pending deltas', () => {
    const controls = {
      enableDamping: true,
      sphericalDelta: { theta: 0.01, phi: 0, lengthSq: () => 0.0001 },
      panOffset: { lengthSq: () => 0 },
      zoomOffset: 0
    } as any

    expect(hasOrbitControlsDamping(controls)).toBe(true)
    expect(needsContinuousSceneUpdates(null, controls)).toBe(true)
  })

  it('allows idle pause with static standalone weather (no wind, sparse clouds)', () => {
    const viewer = { dynamicSky: {}, csmShadowSystem: { isEnabled: () => true } }
    expect(
      needsContinuousSceneUpdates(viewer, undefined, {
        enableStandaloneWeather: true,
        windIntensity: 0,
        cloudDensity: 0.13,
        rainIntensity: 0,
        snowIntensity: 0
      })
    ).toBe(false)
  })

  it('keeps animating when rain or wind is active', () => {
    const viewer = { dynamicSky: {} }
    expect(
      needsContinuousSceneUpdates(viewer, undefined, {
        enableStandaloneWeather: true,
        windIntensity: 0.5,
        cloudDensity: 0.5
      })
    ).toBe(true)
    expect(
      needsContinuousSceneUpdates(viewer, undefined, {
        enableStandaloneWeather: true,
        rainIntensity: 0.2
      })
    ).toBe(true)
  })

  it('treats disabled retained particle systems as inactive', () => {
    expect(isParticleSystemActive({ config: { enabled: false, intensity: 0.8, type: 'rain' } })).toBe(false)
    expect(isParticleSystemActive({ config: { enabled: true, intensity: 0, type: 'snow' } })).toBe(false)
    expect(isParticleSystemActive({ config: { enabled: true, intensity: 0.4, type: 'rain' } })).toBe(true)
  })

  it('allows idle after rain/snow systems are disabled but still retained', () => {
    const viewer = {
      particleSystems: [
        { config: { enabled: false, intensity: 0.5, type: 'rain' } },
        { config: { enabled: false, intensity: 0.3, type: 'snow' } }
      ]
    }
    expect(
      needsContinuousSceneUpdates(viewer, undefined, {
        rainIntensity: 0,
        snowIntensity: 0,
        waterEnabled: false
      })
    ).toBe(false)
  })

  it('keeps animating while any particle system remains active', () => {
    const viewer = {
      particleSystems: [
        { config: { enabled: false, intensity: 0.5, type: 'rain' } },
        { config: { enabled: true, intensity: 0.2, type: 'snow' } }
      ]
    }
    expect(needsContinuousSceneUpdates(viewer)).toBe(true)
  })

  it('treats disabled water systems as inactive and allows idle', () => {
    expect(isWaterSystemActive({ getConfig: () => ({ enabled: false }) })).toBe(false)
    expect(isWaterSystemActive({ isEnabled: () => false })).toBe(false)
    expect(isWaterSystemActive({ isEnabled: () => true })).toBe(true)

    const viewer = {
      waterSystem: { isEnabled: () => false },
      standaloneWaterSystem: { getConfig: () => ({ enabled: false }) }
    }
    expect(
      needsContinuousSceneUpdates(viewer, undefined, {
        rainIntensity: 0,
        snowIntensity: 0,
        waterEnabled: false
      })
    ).toBe(false)
  })

  it('keeps animating for enabled water or waterEnabled activity flag', () => {
    expect(
      needsContinuousSceneUpdates(
        { standaloneWaterSystem: { getConfig: () => ({ enabled: true }) } },
        undefined,
        { waterEnabled: false }
      )
    ).toBe(true)

    expect(
      needsContinuousSceneUpdates({}, undefined, { waterEnabled: true })
    ).toBe(true)
  })

  it('covers enable/disable combinations for weather and water idle gating', () => {
    const disabledRain = { config: { enabled: false, intensity: 0.5, type: 'rain' } }
    const activeSnow = { config: { enabled: true, intensity: 0.2, type: 'snow' } }
    const disabledWater = { isEnabled: () => false }
    const activeWater = { getConfig: () => ({ enabled: true }) }

    // All disabled → idle
    expect(
      needsContinuousSceneUpdates(
        { particleSystems: [disabledRain], waterSystem: disabledWater },
        undefined,
        { rainIntensity: 0, snowIntensity: 0, waterEnabled: false }
      )
    ).toBe(false)

    // Rain intensity alone (system not yet created) → continuous
    expect(
      needsContinuousSceneUpdates({}, undefined, { rainIntensity: 0.1, snowIntensity: 0 })
    ).toBe(true)

    // Snow active with disabled rain → continuous
    expect(
      needsContinuousSceneUpdates(
        { particleSystems: [disabledRain, activeSnow] },
        undefined,
        { rainIntensity: 0, snowIntensity: 0.2 }
      )
    ).toBe(true)

    // Water only → continuous; disable → idle
    expect(
      needsContinuousSceneUpdates(
        { standaloneWaterSystem: activeWater },
        undefined,
        { waterEnabled: true }
      )
    ).toBe(true)
    expect(
      needsContinuousSceneUpdates(
        { standaloneWaterSystem: { getConfig: () => ({ enabled: false }) } },
        undefined,
        { waterEnabled: false }
      )
    ).toBe(false)
  })
})
