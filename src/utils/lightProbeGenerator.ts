import * as THREE from 'three'
import { PROBE_CUBEMAP_SIZE } from './lightProbeUtils'

const _coord = new THREE.Vector3()
const _dir = new THREE.Vector3()
const _color = new THREE.Color()
const shBasis = [0, 0, 0, 0, 0, 0, 0, 0, 0]

export interface EquirectCpuData {
  data: ArrayLike<number>
  width: number
  height: number
  channels: number
  isHalfFloat: boolean
}

/** Extract CPU-side pixel data from an equirectangular DataTexture when available. */
export function getEquirectCpuData(texture: THREE.Texture): EquirectCpuData | null {
  if (!(texture instanceof THREE.DataTexture)) return null

  const image = texture.image as { data?: ArrayLike<number>; width?: number; height?: number }
  const data = image?.data ?? texture.source?.data?.data
  const width = image?.width ?? texture.image?.width ?? 0
  const height = image?.height ?? texture.image?.height ?? 0

  if (!data || width <= 0 || height <= 0) return null

  const channels =
    texture.format === THREE.RGBAFormat || texture.format === THREE.RGBAIntegerFormat
      ? 4
      : 3

  return {
    data,
    width,
    height,
    channels,
    isHalfFloat: texture.type === THREE.HalfFloatType
  }
}

function halfToFloat(h: number): number {
  const sign = (h & 0x8000) >> 15
  const exponent = (h & 0x7c00) >> 10
  const fraction = h & 0x03ff

  if (exponent === 0) {
    return (sign ? -1 : 1) * 2 ** -14 * (fraction / 1024)
  }
  if (exponent === 0x1f) {
    return fraction ? NaN : (sign ? -1 : 1) * Infinity
  }
  return (sign ? -1 : 1) * 2 ** (exponent - 15) * (1 + fraction / 1024)
}

function readChannel(
  data: ArrayLike<number>,
  index: number,
  isHalfFloat: boolean
): number {
  if (isHalfFloat) {
    const raw = data[index] as number
    return halfToFloat(raw > 0xffff ? raw : raw)
  }
  return data[index] as number
}

/** Bilinear-ish nearest sample from equirect CPU data along a world direction. */
export function sampleEquirectDirection(
  dir: THREE.Vector3,
  cpu: EquirectCpuData,
  target: THREE.Color
): THREE.Color {
  const phi = Math.acos(THREE.MathUtils.clamp(dir.y, -1, 1))
  const theta = Math.atan2(dir.x, dir.z)
  const u = (theta + Math.PI) / (2 * Math.PI)
  const v = phi / Math.PI

  const x = Math.min(cpu.width - 1, Math.max(0, Math.floor(u * cpu.width)))
  const y = Math.min(cpu.height - 1, Math.max(0, Math.floor(v * cpu.height)))
  const base = (y * cpu.width + x) * cpu.channels

  const r = readChannel(cpu.data, base, cpu.isHalfFloat)
  const g = readChannel(cpu.data, base + 1, cpu.isHalfFloat)
  const b = readChannel(cpu.data, base + 2, cpu.isHalfFloat)
  return target.setRGB(r, g, b)
}

/**
 * Build a LightProbe SH from equirectangular HDR CPU data (no GPU readback).
 * Uses the same cubemap-face sampling grid as three.js LightProbeGenerator.
 */
export function generateLightProbeFromEquirect(
  texture: THREE.Texture,
  faceSize = PROBE_CUBEMAP_SIZE
): THREE.LightProbe | null {
  const cpu = getEquirectCpuData(texture)
  if (!cpu) return null

  let totalWeight = 0
  const sh = new THREE.SphericalHarmonics3()
  const shCoefficients = sh.coefficients
  const pixelSize = 2 / faceSize

  for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
    for (let py = 0; py < faceSize; py++) {
      for (let px = 0; px < faceSize; px++) {
        const col = -1 + (px + 0.5) * pixelSize
        const row = 1 - (py + 0.5) * pixelSize

        switch (faceIndex) {
          case 0:
            _coord.set(1, row, -col)
            break
          case 1:
            _coord.set(-1, row, col)
            break
          case 2:
            _coord.set(col, 1, -row)
            break
          case 3:
            _coord.set(col, -1, row)
            break
          case 4:
            _coord.set(col, row, 1)
            break
          default:
            _coord.set(-col, row, -1)
            break
        }

        const lengthSq = _coord.lengthSq()
        const weight = 4 / (Math.sqrt(lengthSq) * lengthSq)
        totalWeight += weight
        _dir.copy(_coord).normalize()

        sampleEquirectDirection(_dir, cpu, _color)

        THREE.SphericalHarmonics3.getBasisAt(_dir, shBasis)
        for (let j = 0; j < 9; j++) {
          shCoefficients[j].x += shBasis[j] * _color.r * weight
          shCoefficients[j].y += shBasis[j] * _color.g * weight
          shCoefficients[j].z += shBasis[j] * _color.b * weight
        }
      }
    }
  }

  const norm = (4 * Math.PI) / totalWeight
  for (let j = 0; j < 9; j++) {
    shCoefficients[j].x *= norm
    shCoefficients[j].y *= norm
    shCoefficients[j].z *= norm
  }

  return new THREE.LightProbe(sh)
}

/**
 * Fallback: read a cube render target with the correct typed buffer for its format.
 * PMREM targets use HalfFloatType — requires Uint16Array, not Uint8Array.
 */
export function generateLightProbeFromCubeRenderTarget(
  renderer: THREE.WebGLRenderer,
  cubeRenderTarget: THREE.WebGLCubeRenderTarget,
  faceSize?: number
): THREE.LightProbe | null {
  const imageWidth = faceSize ?? cubeRenderTarget.width
  const textureType = cubeRenderTarget.texture.type

  let data: Uint8Array | Uint16Array | Float32Array
  if (textureType === THREE.HalfFloatType) {
    data = new Uint16Array(imageWidth * imageWidth * 4)
  } else if (textureType === THREE.FloatType) {
    data = new Float32Array(imageWidth * imageWidth * 4)
  } else {
    data = new Uint8Array(imageWidth * imageWidth * 4)
  }

  let totalWeight = 0
  const sh = new THREE.SphericalHarmonics3()
  const shCoefficients = sh.coefficients
  const pixelSize = 2 / imageWidth
  const isHalf = textureType === THREE.HalfFloatType
  const isFloat = textureType === THREE.FloatType

  for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
    renderer.readRenderTargetPixels(
      cubeRenderTarget,
      0,
      0,
      imageWidth,
      imageWidth,
      data,
      faceIndex
    )

    for (let i = 0, il = data.length; i < il; i += 4) {
      if (isHalf) {
        const u16 = data as Uint16Array
        _color.setRGB(
          halfToFloat(u16[i]),
          halfToFloat(u16[i + 1]),
          halfToFloat(u16[i + 2])
        )
      } else if (isFloat) {
        const f32 = data as Float32Array
        _color.setRGB(f32[i], f32[i + 1], f32[i + 2])
      } else {
        const u8 = data as Uint8Array
        _color.setRGB(u8[i] / 255, u8[i + 1] / 255, u8[i + 2] / 255)
      }

      if ('colorSpace' in cubeRenderTarget.texture) {
        if (cubeRenderTarget.texture.colorSpace === THREE.SRGBColorSpace) {
          _color.convertSRGBToLinear()
        }
      }

      const pixelIndex = i / 4
      const col = -1 + ((pixelIndex % imageWidth) + 0.5) * pixelSize
      const row = 1 - (Math.floor(pixelIndex / imageWidth) + 0.5) * pixelSize

      switch (faceIndex) {
        case 0:
          _coord.set(1, row, -col)
          break
        case 1:
          _coord.set(-1, row, col)
          break
        case 2:
          _coord.set(col, 1, -row)
          break
        case 3:
          _coord.set(col, -1, row)
          break
        case 4:
          _coord.set(col, row, 1)
          break
        default:
          _coord.set(-col, row, -1)
          break
      }

      const lengthSq = _coord.lengthSq()
      const weight = 4 / (Math.sqrt(lengthSq) * lengthSq)
      totalWeight += weight
      _dir.copy(_coord).normalize()

      THREE.SphericalHarmonics3.getBasisAt(_dir, shBasis)
      for (let j = 0; j < 9; j++) {
        shCoefficients[j].x += shBasis[j] * _color.r * weight
        shCoefficients[j].y += shBasis[j] * _color.g * weight
        shCoefficients[j].z += shBasis[j] * _color.b * weight
      }
    }
  }

  if (totalWeight <= 0) return null

  const norm = (4 * Math.PI) / totalWeight
  for (let j = 0; j < 9; j++) {
    shCoefficients[j].x *= norm
    shCoefficients[j].y *= norm
    shCoefficients[j].z *= norm
  }

  return new THREE.LightProbe(sh)
}
