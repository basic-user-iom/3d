import fs from 'fs'
import path from 'path'

/**
 * Minimal GLB parser for local inspection (JSON chunk only).
 * Avoids the unused gltf-pipeline → Cesium dependency chain.
 */
function glbToGltfJson(glb) {
  if (glb.length < 12) {
    throw new Error('GLB too small')
  }

  const magic = glb.toString('utf8', 0, 4)
  if (magic !== 'glTF') {
    throw new Error(`Not a GLB file (magic=${magic})`)
  }

  const version = glb.readUInt32LE(4)
  if (version !== 2) {
    throw new Error(`Unsupported GLB version ${version}`)
  }

  let offset = 12
  while (offset + 8 <= glb.length) {
    const chunkLength = glb.readUInt32LE(offset)
    const chunkType = glb.toString('utf8', offset + 4, offset + 8)
    offset += 8
    const chunkData = glb.subarray(offset, offset + chunkLength)
    offset += chunkLength

    if (chunkType === 'JSON') {
      const jsonText = Buffer.from(chunkData).toString('utf8').replace(/\0+$/g, '')
      return JSON.parse(jsonText)
    }
  }

  throw new Error('GLB has no JSON chunk')
}

async function inspect(glbPath) {
  const resolved = path.resolve(glbPath)
  const glb = fs.readFileSync(resolved)
  const gltf = glbToGltfJson(glb)

  console.log('File:', resolved)
  console.log('Images:', gltf.images?.length ?? 0)
  if (gltf.images) {
    gltf.images.slice(0, 5).forEach((img, index) => {
      console.log(
        `  [${index}] mime=${img.mimeType ?? 'n/a'} uri=${img.uri ? 'embedded' : 'bufferView'}`
      )
    })
  }

  console.log('Textures:', gltf.textures?.length ?? 0)
  if (gltf.textures) {
    gltf.textures.slice(0, 5).forEach((tex, index) => {
      console.log(`  [${index}] source=${tex.source ?? 'n/a'} sampler=${tex.sampler ?? 'n/a'}`)
    })
  }

  console.log('Samplers:', gltf.samplers?.length ?? 0)
  console.log('Materials:', gltf.materials?.length ?? 0)

  const extensions = new Set(gltf.extensionsUsed ?? [])
  if (gltf.materials) {
    gltf.materials.forEach((mat) => {
      if (mat.extensions) {
        Object.keys(mat.extensions).forEach((name) => extensions.add(name))
      }
    })
  }
  console.log('Extensions Used:', [...extensions])

  if (gltf.materials && gltf.materials.length > 0) {
    console.log('Sample Material:', JSON.stringify(gltf.materials[0], null, 2).slice(0, 400))
  }
}

const target = process.argv[2]
if (!target) {
  console.error('Usage: node tools/inspect-glb.js <path-to-glb>')
  process.exit(1)
}

inspect(target).catch((err) => {
  console.error('Failed to inspect GLB:', err)
  process.exit(1)
})
