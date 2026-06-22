import { describe, expect, test } from 'vitest'

import { detectFormat, isGaussianSplatPly } from '../src/lib/detectFormat'

function toArrayBuffer(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer
}

describe('detectFormat gaussian splat ply detection', () => {
  test('detects binary ply buffers as ply', () => {
    const buffer = toArrayBuffer('ply\nformat binary_little_endian 1.0\nelement vertex 1\nend_header\n')
    expect(detectFormat(buffer)).toBe('ply')
  })

  test('recognizes gaussian splat ply headers', () => {
    const buffer = toArrayBuffer(
      [
        'ply',
        'format binary_little_endian 1.0',
        'element vertex 2',
        'property float x',
        'property float y',
        'property float z',
        'property float f_dc_0',
        'property float f_dc_1',
        'property float f_dc_2',
        'property float opacity',
        'property float scale_0',
        'property float rot_0',
        'end_header'
      ].join('\n')
    )

    expect(isGaussianSplatPly(buffer)).toBe(true)
  })

  test('does not misclassify regular mesh ply headers', () => {
    const buffer = toArrayBuffer(
      [
        'ply',
        'format ascii 1.0',
        'element vertex 3',
        'property float x',
        'property float y',
        'property float z',
        'element face 1',
        'property list uchar int vertex_indices',
        'end_header'
      ].join('\n')
    )

    expect(isGaussianSplatPly(buffer)).toBe(false)
  })
})
