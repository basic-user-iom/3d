import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  createFrameMotionState,
  captureFrameMotionState,
  hasFrameMotion,
  hasOrbitControlsDamping,
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
})
