import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  generateLightProbeFromEquirect,
  getEquirectCpuData,
  sampleEquirectDirection
} from '../src/utils/lightProbeGenerator'
import { PROBE_CUBEMAP_SIZE } from '../src/utils/lightProbeUtils'

function makeTestEquirect(w = 64, h = 32): THREE.DataTexture {
  const data = new Float32Array(w * h * 3)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3
      const u = x / w
      data[i] = u
      data[i + 1] = 0.5
      data[i + 2] = 1 - u
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBFormat, THREE.FloatType)
  tex.needsUpdate = true
  return tex
}

describe('lightProbeGenerator', () => {
  it('extracts CPU data from DataTexture equirect', () => {
    const tex = makeTestEquirect()
    const cpu = getEquirectCpuData(tex)
    expect(cpu).not.toBeNull()
    expect(cpu!.width).toBe(64)
    expect(cpu!.height).toBe(32)
    expect(cpu!.channels).toBe(3)
    expect(cpu!.isHalfFloat).toBe(false)
  })

  it('samples equirect direction without GPU readback', () => {
    const tex = makeTestEquirect()
    const cpu = getEquirectCpuData(tex)!
    const color = sampleEquirectDirection(new THREE.Vector3(0, 1, 0), cpu, new THREE.Color())
    expect(color.r).toBeGreaterThanOrEqual(0)
    expect(color.g).toBeCloseTo(0.5, 1)
  })

  it('generates non-zero SH light probe from equirect CPU data', () => {
    const tex = makeTestEquirect()
    const probe = generateLightProbeFromEquirect(tex, PROBE_CUBEMAP_SIZE)
    expect(probe).not.toBeNull()
    const c0 = probe!.sh.coefficients[0]
    const magnitude = c0.x * c0.x + c0.y * c0.y + c0.z * c0.z
    expect(magnitude).toBeGreaterThan(0)
  })

  it('returns null when texture has no CPU pixel data', () => {
    const tex = new THREE.Texture()
    expect(generateLightProbeFromEquirect(tex)).toBeNull()
  })
})
