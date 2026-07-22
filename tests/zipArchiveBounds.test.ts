import { describe, expect, test } from 'vitest'
import JSZip from 'jszip'
import {
  ZIP_ARCHIVE_BOUNDS,
  ZipBoundsError,
  assertSafeZipEntryPath,
  assertZipArchiveBounds,
  collectReferencedPathsFromModelText,
  mapPool,
  selectZipEntriesForExtraction
} from '../src/utils/zipArchiveBounds'

async function zipWithEntries(
  files: Array<{ name: string; data: string | Uint8Array }>
): Promise<{ zip: JSZip; buffer: ArrayBuffer }> {
  const zip = new JSZip()
  for (const file of files) {
    zip.file(file.name, file.data)
  }
  const buffer = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })
  const loaded = await JSZip.loadAsync(buffer)
  return { zip: loaded, buffer }
}

describe('zipArchiveBounds (DATA-5)', () => {
  test('assertSafeZipEntryPath rejects zip-slip and absolute paths', () => {
    expect(() => assertSafeZipEntryPath('../evil.bin')).toThrow(ZipBoundsError)
    expect(() => assertSafeZipEntryPath('foo/../../evil.bin')).toThrow(ZipBoundsError)
    expect(() => assertSafeZipEntryPath('/etc/passwd')).toThrow(ZipBoundsError)
    expect(() => assertSafeZipEntryPath('C:/Windows/system32')).toThrow(ZipBoundsError)
    expect(() => assertSafeZipEntryPath('models/car.glb')).not.toThrow()
  })

  test('assertZipArchiveBounds accepts a normal small archive', async () => {
    const { zip, buffer } = await zipWithEntries([
      { name: 'model.glb', data: new Uint8Array([1, 2, 3, 4]) },
      { name: 'textures/albedo.png', data: new Uint8Array([9, 9, 9]) }
    ])
    const result = assertZipArchiveBounds(zip, buffer.byteLength)
    expect(result.entries).toHaveLength(2)
    expect(result.totalUncompressed).toBeGreaterThan(0)
  })

  test('assertZipArchiveBounds rejects too many entries', async () => {
    const zip = new JSZip()
    for (let i = 0; i < 6; i++) {
      zip.file(`f${i}.bin`, 'x')
    }
    const buffer = await zip.generateAsync({ type: 'arraybuffer' })
    const loaded = await JSZip.loadAsync(buffer)
    expect(() =>
      assertZipArchiveBounds(loaded, buffer.byteLength, {
        ...ZIP_ARCHIVE_BOUNDS,
        maxEntries: 5
      })
    ).toThrow(/too many entries/i)
  })

  test('assertZipArchiveBounds rejects oversized compressed archive buffer', async () => {
    const { zip } = await zipWithEntries([{ name: 'a.txt', data: 'hi' }])
    expect(() =>
      assertZipArchiveBounds(zip, ZIP_ARCHIVE_BOUNDS.maxCompressedBytes + 1)
    ).toThrow(/too large/i)
  })

  test('assertZipArchiveBounds rejects high expansion ratio zip bombs', async () => {
    // Highly compressible payload: tiny compressed size, large declared uncompressed.
    const zeros = new Uint8Array(64 * 1024).fill(0)
    const { zip, buffer } = await zipWithEntries([{ name: 'bomb.bin', data: zeros }])

    // Force a tiny ratio base by claiming a tiny archive size while entries expand huge.
    expect(() =>
      assertZipArchiveBounds(zip, 64, {
        ...ZIP_ARCHIVE_BOUNDS,
        maxExpansionRatio: 10,
        maxEntryUncompressedBytes: 16 * 1024 * 1024,
        maxTotalUncompressedBytes: 16 * 1024 * 1024
      })
    ).toThrow(/expansion ratio/i)

    // Incompressible-ish payload should pass with the real buffer size.
    const randomish = Uint8Array.from({ length: 2048 }, (_, i) => (i * 17 + 3) & 0xff)
    const normal = await zipWithEntries([{ name: 'data.bin', data: randomish }])
    expect(() => assertZipArchiveBounds(normal.zip, normal.buffer.byteLength)).not.toThrow()
    expect(buffer.byteLength).toBeGreaterThan(0)
  })

  test('selectZipEntriesForExtraction prefers referenced + same-folder assets', async () => {
    const { zip } = await zipWithEntries([
      { name: 'scene/model.gltf', data: '{"buffers":[{"uri":"model.bin"}],"images":[{"uri":"tex.png"}]}' },
      { name: 'scene/model.bin', data: new Uint8Array([1]) },
      { name: 'scene/tex.png', data: new Uint8Array([2]) },
      { name: 'unrelated/huge.bin', data: new Uint8Array([3]) },
      { name: 'readme.txt', data: 'notes' }
    ])
    const entries = Object.keys(zip.files)
      .map((n) => zip.files[n])
      .filter((e) => !e.dir) as any[]

    const refs = collectReferencedPathsFromModelText(
      'scene/model.gltf',
      '{"buffers":[{"uri":"model.bin"}],"images":[{"uri":"tex.png"}]}'
    )
    expect(refs).toEqual(expect.arrayContaining(['model.bin', 'tex.png']))

    const selected = selectZipEntriesForExtraction(entries, 'scene/model.gltf', refs)
    const names = selected.map((e) => e.name).sort()
    expect(names).toEqual(['scene/model.bin', 'scene/model.gltf', 'scene/tex.png'])
    expect(names).not.toContain('unrelated/huge.bin')
    expect(names).not.toContain('readme.txt')
  })

  test('mapPool respects concurrency and preserves order', async () => {
    let live = 0
    let maxLive = 0
    const items = [1, 2, 3, 4, 5, 6]
    const results = await mapPool(items, 2, async (n) => {
      live++
      maxLive = Math.max(maxLive, live)
      await new Promise((r) => setTimeout(r, 5))
      live--
      return n * 10
    })
    expect(results).toEqual([10, 20, 30, 40, 50, 60])
    expect(maxLive).toBeLessThanOrEqual(2)
  })

  test('collectReferencedPathsFromModelText reads OBJ mtllib / MTL maps', () => {
    const objRefs = collectReferencedPathsFromModelText(
      'car.obj',
      'mtllib car.mtl\nv 0 0 0\n'
    )
    expect(objRefs).toContain('car.mtl')

    const mtlRefs = collectReferencedPathsFromModelText(
      'car.mtl',
      'newmtl x\nmap_Kd textures/albedo.png\n'
    )
    expect(mtlRefs).toContain('textures/albedo.png')
  })
})
