import JSZip from 'jszip'
import { LoadedModel } from '../useViewer'
import { loadGLTF } from './gltfLoader'
import { loadFBX } from './fbxLoader'
import { loadOBJ } from './objLoader'
import { loadSTL } from './stlLoader'
import { loadPLY } from './plyLoader'
import { load3MF } from './3mfLoader'
import { loadCollada } from './colladaLoader'
import { load3DS } from './3dsLoader'
import { createScopedLoadingSession } from './scopedLoadingSession'
import {
  ZIP_ARCHIVE_BOUNDS,
  assertZipArchiveBounds,
  assertZipExtractSelectionBounds,
  collectReferencedPathsFromModelText,
  mapPool,
  selectZipEntriesForExtraction
} from '../../utils/zipArchiveBounds'

function pickMainEntry(paths: string[]): string | null {
  const lower = paths.map((p) => p.toLowerCase())
  const preferOrder = ['.glb', '.gltf', '.fbx', '.obj', '.dae', '.ply', '.stl', '.3mf', '.3ds']
  for (const ext of preferOrder) {
    const idx = lower.findIndex((p) => p.endsWith(ext))
    if (idx !== -1) return paths[idx]
  }
  return null
}

async function readZipEntryText(entry: JSZip.JSZipObject): Promise<string> {
  return entry.async('string')
}

export async function loadFromZip(
  data: File | ArrayBuffer,
  onProgress?: (progress: number) => void
): Promise<LoadedModel> {
  const buffer = data instanceof File ? await data.arrayBuffer() : data

  // DATA-3: isolate ZIP dependency URLs on a dedicated LoadingManager
  const session = createScopedLoadingSession()
  let succeeded = false

  try {
    // DATA-5: reject oversized archives before expanding entry contents.
    if (buffer.byteLength > ZIP_ARCHIVE_BOUNDS.maxCompressedBytes) {
      throw new Error(
        `ZIP archive is too large (${(buffer.byteLength / (1024 * 1024)).toFixed(1)} MB; max ${Math.floor(ZIP_ARCHIVE_BOUNDS.maxCompressedBytes / (1024 * 1024))} MB)`
      )
    }

    const zip = await JSZip.loadAsync(buffer)
    const { entries } = assertZipArchiveBounds(zip, buffer.byteLength)

    const entryPaths = entries.map((e) => e.name)
    const mainPath = pickMainEntry(entryPaths)
    if (!mainPath) throw new Error('ZIP does not contain a supported 3D model file')

    const mainFile = zip.files[mainPath]
    const lower = mainPath.toLowerCase()

    // Collect text-format dependency URIs before expanding the rest.
    let referencedPaths: string[] = []
    if (lower.endsWith('.gltf') || lower.endsWith('.obj') || lower.endsWith('.dae')) {
      const mainText = await readZipEntryText(mainFile)
      referencedPaths = collectReferencedPathsFromModelText(mainPath, mainText)
      // OBJ may point at MTL which itself references textures — peek mtllib.
      if (lower.endsWith('.obj')) {
        for (const ref of [...referencedPaths]) {
          if (!ref.toLowerCase().endsWith('.mtl')) continue
          const mtlEntry =
            zip.files[ref] ||
            zip.files[mainPath.slice(0, mainPath.lastIndexOf('/') + 1) + ref]
          if (mtlEntry && !mtlEntry.dir) {
            const mtlText = await mtlEntry.async('string')
            referencedPaths = referencedPaths.concat(
              collectReferencedPathsFromModelText(ref, mtlText)
            )
          }
        }
      }
    }

    const toExtract = selectZipEntriesForExtraction(entries, mainPath, referencedPaths)
    assertZipExtractSelectionBounds(toExtract)

    const urlMap = new Map<string, string>()
    const byName = new Map<string, string>()

    await mapPool(toExtract, ZIP_ARCHIVE_BOUNDS.maxConcurrentExtracts, async (entry) => {
      const blob = await entry.async('blob')
      const url = URL.createObjectURL(blob)
      session.registerBlobUrl(url)
      const pathKey = entry.name.replace(/\\/g, '/').toLowerCase()
      urlMap.set(pathKey, url)
      const base = pathKey.split('/').pop()
      if (base) byName.set(base, url)
    })

    const caseInsensitiveMap = new Map<string, string>()
    for (const [path, url] of urlMap.entries()) {
      const parts = path.split('/')
      for (let i = 0; i < parts.length; i++) {
        const subPath = parts.slice(i).join('/').toLowerCase()
        if (!caseInsensitiveMap.has(subPath)) {
          caseInsensitiveMap.set(subPath, url)
        }
      }
    }

    const mainDir = mainPath.substring(0, mainPath.lastIndexOf('/') + 1)

    session.setURLModifier((url) => {
      if (url.startsWith('blob:')) {
        return url
      }

      let clean = url.replace(/^blob:[^/]+/, '').replace(/^\.\//, '').replace(/\\/g, '/')
      clean = clean.replace(/^\//, '')

      const urlMatch = clean.match(/\/([^/]+\/.*)$/)
      if (urlMatch) {
        clean = urlMatch[1]
      }

      const pathLower = clean.toLowerCase()

      if (urlMap.has(pathLower)) {
        return urlMap.get(pathLower)!
      }

      const withMainDir = (mainDir + clean).toLowerCase()
      if (urlMap.has(withMainDir)) {
        return urlMap.get(withMainDir)!
      }

      if (caseInsensitiveMap.has(pathLower)) {
        return caseInsensitiveMap.get(pathLower)!
      }

      const baseName = pathLower.split('/').pop()!
      if (baseName && byName.has(baseName)) {
        return byName.get(baseName)!
      }

      for (const [storedPath, blobUrl] of urlMap.entries()) {
        if (storedPath === pathLower || storedPath.endsWith('/' + pathLower) || storedPath.endsWith(pathLower)) {
          return blobUrl
        }
        if (pathLower.endsWith('/' + storedPath) || pathLower === storedPath || pathLower.endsWith(storedPath)) {
          return blobUrl
        }
        const storedBaseName = storedPath.split('/').pop()!
        if (baseName && storedBaseName === baseName) {
          return blobUrl
        }
      }

      console.warn(`✗ Could not resolve texture URL: ${url}`)
      console.warn(`  Cleaned path: ${clean}`)
      console.warn(`  Base name: ${baseName}`)
      console.warn(`  Available ZIP paths (first 15):`, Array.from(urlMap.keys()).slice(0, 15))
      console.warn(`  Available filenames (first 15):`, Array.from(byName.keys()).slice(0, 15))
      return url
    })

    const mainBytes = await mainFile.async('arraybuffer')

    let model: LoadedModel
    if (lower.endsWith('.glb') || lower.endsWith('.gltf')) {
      const dir = mainPath.substring(0, mainPath.lastIndexOf('/') + 1)

      if (lower.endsWith('.glb')) {
        model = await loadGLTF(mainBytes, dir, onProgress, undefined, undefined, session)
      } else {
        const gltfText = new TextDecoder().decode(mainBytes)
        model = await loadGLTF(gltfText, dir, onProgress, undefined, undefined, session)
      }
    } else if (lower.endsWith('.fbx')) {
      model = await loadFBX(mainBytes, onProgress, undefined, session)
    } else if (lower.endsWith('.obj')) {
      const text = new TextDecoder().decode(mainBytes)
      model = await loadOBJ(text, mainDir, onProgress)
    } else if (lower.endsWith('.stl')) {
      model = await loadSTL(mainBytes, onProgress)
    } else if (lower.endsWith('.ply')) {
      model = await loadPLY(mainBytes, onProgress)
    } else if (lower.endsWith('.3mf')) {
      model = await load3MF(mainBytes, onProgress)
    } else if (lower.endsWith('.dae')) {
      const text = new TextDecoder().decode(mainBytes)
      model = await loadCollada(text, mainDir, onProgress)
    } else if (lower.endsWith('.3ds')) {
      model = await load3DS(mainBytes, onProgress)
    } else {
      throw new Error('ZIP main file is not a supported format')
    }

    succeeded = true
    return model
  } catch (e) {
    console.error('Failed to load from ZIP:', e)
    throw e
  } finally {
    // Clear manager hooks always; revoke Blob URLs only when the load failed.
    session.dispose({ revokeBlobs: !succeeded })
  }
}
