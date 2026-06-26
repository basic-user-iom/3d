import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { ParticleSystem } from '../src/viewer/particles/ParticleSystem'
import { WEATHER_GROUND_LEVEL, shouldSkipFogForObject } from '../src/viewer/utils/sceneFog'

describe('weather ground level', () => {
  it('exports ground level at y=0', () => {
    expect(WEATHER_GROUND_LEVEL).toBe(0)
  })

  it('skips fog on standalone water meshes', () => {
    const water = new THREE.Mesh()
    water.userData.isStandaloneWater = true
    expect(shouldSkipFogForObject(water)).toBe(true)
  })

  it('spawns rain particles above ground level', () => {
    const scene = new THREE.Scene()
    const system = new ParticleSystem(scene, {
      type: 'rain',
      intensity: 0.1,
      enabled: true,
      groundLevel: WEATHER_GROUND_LEVEL
    })

    const positions = system.particles?.geometry.getAttribute('position')?.array as Float32Array
    expect(positions).toBeDefined()
    for (let i = 1; i < positions.length; i += 3) {
      expect(positions[i]).toBeGreaterThanOrEqual(WEATHER_GROUND_LEVEL + 50)
    }

    system.destroy()
  })

  it('respawns rain particles before they fall far below ground', () => {
    const scene = new THREE.Scene()
    const system = new ParticleSystem(scene, {
      type: 'rain',
      intensity: 0.05,
      enabled: true,
      groundLevel: WEATHER_GROUND_LEVEL
    })

    const positions = system.particles?.geometry.getAttribute('position')?.array as Float32Array
    positions[1] = WEATHER_GROUND_LEVEL - 5

    system.update(1)

    expect(positions[1]).toBeGreaterThanOrEqual(WEATHER_GROUND_LEVEL + 50)

    system.destroy()
  })
})
