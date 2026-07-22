import type JSZip from 'jszip'

/**
 * DATA-5: Bounds for ZIP archives used by model / texture loaders.
 * Checked against central-directory metadata before expanding entry contents.
 */
export const ZIP_ARCHIVE_BOUNDS = {
  /** Maximum compressed archive byte length (input buffer). */
  maxCompressedBytes: 512 * 1024 * 1024,
  /** Maximum non-directory entries. */
  maxEntries: 8_000,
  /** Maximum uncompressed size for a single entry. */
  maxEntryUncompressedBytes: 256 * 1024 * 1024,
  /** Maximum sum of uncompressed sizes across extracted / validated entries. */
  maxTotalUncompressedBytes: 1024 * 1024 * 1024,
  /**
   * Reject archives whose declared uncompressed total exceeds this multiple of
   * the compressed archive size (classic zip-bomb ratio guard).
   */
  maxExpansionRatio: 100,
  /** Concurrent `entry.async(...)` extractions. */
  maxConcurrentExtracts: 4
} as const

/** Bounds accept any number so callers/tests can tighten limits without literal-type conflicts. */
export type ZipArchiveBounds = {
  -readonly [K in keyof typeof ZIP_ARCHIVE_BOUNDS]: number
}

export class ZipBoundsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ZipBoundsError'
  }
}

type ZipEntryData = {
  compressedSize?: number
  uncompressedSize?: number
}

type ZipEntryLike = {
  name: string
  dir: boolean
  unsafeOriginalName?: string
  _data?: ZipEntryData
}

export function getZipEntrySizes(entry: ZipEntryLike): {
  compressedSize: number
  uncompressedSize: number
} {
  const data = entry._data
  const compressedSize =
    typeof data?.compressedSize === 'number' && Number.isFinite(data.compressedSize)
      ? data.compressedSize
      : 0
  const uncompressedSize =
    typeof data?.uncompressedSize === 'number' && Number.isFinite(data.uncompressedSize)
      ? data.uncompressedSize
      : 0
  return { compressedSize, uncompressedSize }
}

/** Reject zip-slip / absolute paths before extraction. */
export function assertSafeZipEntryPath(path: string): void {
  const normalized = path.replace(/\\/g, '/')
  if (
    normalized.startsWith('/') ||
    /^[a-zA-Z]:/.test(normalized) ||
    normalized.split('/').some((part) => part === '..')
  ) {
    throw new ZipBoundsError(`ZIP entry path is unsafe: ${path}`)
  }
}

export function listZipFileEntries(zip: JSZip): Array<JSZip.JSZipObject & ZipEntryLike> {
  return Object.keys(zip.files)
    .map((name) => zip.files[name] as JSZip.JSZipObject & ZipEntryLike)
    .filter((entry) => !entry.dir)
}

/**
 * Validate archive buffer size and every non-directory entry's declared sizes
 * before any `async()` expansion. Throws {@link ZipBoundsError} on violation.
 */
export function assertZipArchiveBounds(
  zip: JSZip,
  archiveByteLength: number,
  limits: ZipArchiveBounds = ZIP_ARCHIVE_BOUNDS
): { entries: Array<JSZip.JSZipObject & ZipEntryLike>; totalUncompressed: number } {
  if (archiveByteLength > limits.maxCompressedBytes) {
    throw new ZipBoundsError(
      `ZIP archive is too large (${formatBytes(archiveByteLength)}; max ${formatBytes(limits.maxCompressedBytes)})`
    )
  }

  const entries = listZipFileEntries(zip)
  if (entries.length === 0) {
    throw new ZipBoundsError('ZIP has no files')
  }
  if (entries.length > limits.maxEntries) {
    throw new ZipBoundsError(
      `ZIP has too many entries (${entries.length}; max ${limits.maxEntries})`
    )
  }

  let totalUncompressed = 0
  for (const entry of entries) {
    assertSafeZipEntryPath(entry.name)
    if (entry.unsafeOriginalName) {
      assertSafeZipEntryPath(entry.unsafeOriginalName)
    }

    const { uncompressedSize } = getZipEntrySizes(entry)
    if (uncompressedSize > limits.maxEntryUncompressedBytes) {
      throw new ZipBoundsError(
        `ZIP entry "${entry.name}" is too large when expanded (${formatBytes(uncompressedSize)}; max ${formatBytes(limits.maxEntryUncompressedBytes)})`
      )
    }
    totalUncompressed += uncompressedSize
    if (totalUncompressed > limits.maxTotalUncompressedBytes) {
      throw new ZipBoundsError(
        `ZIP total expanded size exceeds limit (${formatBytes(totalUncompressed)}; max ${formatBytes(limits.maxTotalUncompressedBytes)})`
      )
    }
  }

  const ratioBase = Math.max(archiveByteLength, 1)
  const expansionRatio = totalUncompressed / ratioBase
  if (totalUncompressed > ratioBase && expansionRatio > limits.maxExpansionRatio) {
    throw new ZipBoundsError(
      `ZIP expansion ratio is too high (${expansionRatio.toFixed(1)}x; max ${limits.maxExpansionRatio}x)`
    )
  }

  return { entries, totalUncompressed }
}

/**
 * Ensure a selected subset of entries stays within total expanded-size budget
 * (used when extracting only referenced / same-folder files).
 */
export function assertZipExtractSelectionBounds(
  entries: Array<JSZip.JSZipObject & ZipEntryLike>,
  limits: ZipArchiveBounds = ZIP_ARCHIVE_BOUNDS
): number {
  let totalUncompressed = 0
  for (const entry of entries) {
    const { uncompressedSize } = getZipEntrySizes(entry)
    if (uncompressedSize > limits.maxEntryUncompressedBytes) {
      throw new ZipBoundsError(
        `ZIP entry "${entry.name}" is too large when expanded (${formatBytes(uncompressedSize)}; max ${formatBytes(limits.maxEntryUncompressedBytes)})`
      )
    }
    totalUncompressed += uncompressedSize
    if (totalUncompressed > limits.maxTotalUncompressedBytes) {
      throw new ZipBoundsError(
        `Selected ZIP entries exceed expanded-size limit (${formatBytes(totalUncompressed)}; max ${formatBytes(limits.maxTotalUncompressedBytes)})`
      )
    }
  }
  return totalUncompressed
}

/** Run async work over items with a concurrency cap. */
export async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return []
  const limit = Math.max(1, Math.min(concurrency, items.length))
  const results = new Array<R>(items.length)
  let nextIndex = 0

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++
      results[index] = await fn(items[index], index)
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()))
  return results
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Asset extensions typically needed as ZIP dependency sidecars. */
const ZIP_DEPENDENCY_EXTENSIONS = new Set([
  'bin',
  'gltf',
  'glb',
  'obj',
  'mtl',
  'fbx',
  'dae',
  '3ds',
  '3mf',
  'stl',
  'ply',
  'png',
  'jpg',
  'jpeg',
  'webp',
  'bmp',
  'tga',
  'tif',
  'tiff',
  'ktx',
  'ktx2',
  'basis',
  'hdr',
  'exr',
  'gif',
  'svg'
])

export function isLikelyZipDependencyPath(path: string): boolean {
  const lower = path.toLowerCase()
  const ext = lower.includes('.') ? lower.split('.').pop() || '' : ''
  return ZIP_DEPENDENCY_EXTENSIONS.has(ext)
}

/**
 * Prefer entries referenced by the main model, then same-folder dependency-looking
 * files. Falls back to all entries when the archive is small/flat.
 */
export function selectZipEntriesForExtraction(
  entries: Array<JSZip.JSZipObject & ZipEntryLike>,
  mainPath: string,
  referencedRelativePaths: string[] = []
): Array<JSZip.JSZipObject & ZipEntryLike> {
  const byLower = new Map<string, JSZip.JSZipObject & ZipEntryLike>()
  for (const entry of entries) {
    byLower.set(entry.name.replace(/\\/g, '/').toLowerCase(), entry)
  }

  const selected = new Map<string, JSZip.JSZipObject & ZipEntryLike>()
  const mainEntry = byLower.get(mainPath.replace(/\\/g, '/').toLowerCase())
  if (mainEntry) selected.set(mainEntry.name, mainEntry)

  const mainDir = mainPath.includes('/')
    ? mainPath.slice(0, mainPath.lastIndexOf('/') + 1).replace(/\\/g, '/')
    : ''

  const resolveRef = (ref: string): (JSZip.JSZipObject & ZipEntryLike) | undefined => {
    const clean = ref.replace(/\\/g, '/').replace(/^\.\//, '')
    const candidates = [
      clean,
      mainDir + clean,
      clean.split('/').pop() || clean
    ]
    for (const candidate of candidates) {
      const hit = byLower.get(candidate.toLowerCase())
      if (hit) return hit
      for (const [key, entry] of byLower) {
        if (key.endsWith('/' + candidate.toLowerCase()) || key.endsWith(candidate.toLowerCase())) {
          return entry
        }
      }
    }
    return undefined
  }

  for (const ref of referencedRelativePaths) {
    const hit = resolveRef(ref)
    if (hit) selected.set(hit.name, hit)
  }

  for (const entry of entries) {
    const normalized = entry.name.replace(/\\/g, '/')
    const inMainDir =
      !mainDir ||
      normalized.toLowerCase().startsWith(mainDir.toLowerCase()) ||
      !normalized.includes('/')
    if (inMainDir && isLikelyZipDependencyPath(normalized)) {
      selected.set(entry.name, entry)
    }
  }

  return Array.from(selected.values())
}

/**
 * Collect relative URIs from common text-based 3D side-car formats.
 * Best-effort; missing refs simply won't be pre-extracted.
 */
export function collectReferencedPathsFromModelText(mainPath: string, text: string): string[] {
  const lower = mainPath.toLowerCase()
  const refs = new Set<string>()

  const addUri = (uri: unknown) => {
    if (typeof uri !== 'string' || !uri || uri.startsWith('data:') || /^[a-z]+:\/\//i.test(uri)) {
      return
    }
    refs.add(uri.replace(/\\/g, '/'))
  }

  if (lower.endsWith('.gltf')) {
    try {
      const json = JSON.parse(text) as {
        buffers?: Array<{ uri?: string }>
        images?: Array<{ uri?: string }>
      }
      for (const buffer of json.buffers || []) addUri(buffer.uri)
      for (const image of json.images || []) addUri(image.uri)
    } catch {
      // Ignore parse errors here; the real loader will surface them.
    }
    return Array.from(refs)
  }

  if (lower.endsWith('.obj') || lower.endsWith('.mtl')) {
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim()
      const mtllib = trimmed.match(/^mtllib\s+(.+)$/i)
      if (mtllib) addUri(mtllib[1].trim().split(/\s+/)[0])
      const mapRef = trimmed.match(/^map_\w+\s+(.+)$/i)
      if (mapRef) {
        const parts = mapRef[1].trim().split(/\s+/)
        addUri(parts[parts.length - 1])
      }
    }
    return Array.from(refs)
  }

  if (lower.endsWith('.dae')) {
    const initFrom = text.matchAll(/<init_from>\s*([^<]+)\s*<\/init_from>/gi)
    for (const match of initFrom) addUri(match[1].trim())
    return Array.from(refs)
  }

  return []
}
