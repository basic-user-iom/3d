import fs from 'fs'
import path from 'path'
import pipeline from 'gltf-pipeline'
const { glbToGltf } = pipeline

async function inspect(glbPath) {
  const resolved = path.resolve(glbPath)
  const glb = fs.readFileSync(resolved)
  const { gltf } = await glbToGltf(glb)

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


