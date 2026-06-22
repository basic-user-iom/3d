#!/usr/bin/env node
/** Quick GLTF vertex/triangle count (no GPU). Usage: node scripts/count-gltf-verts.mjs path/to/model.gltf */
import fs from 'fs'
import path from 'path'

const gltfPath = process.argv[2]
if (!gltfPath) {
  console.error('Usage: node scripts/count-gltf-verts.mjs <file.gltf>')
  process.exit(1)
}

const gltf = JSON.parse(fs.readFileSync(gltfPath, 'utf8'))
let verts = 0
let tris = 0
let meshes = 0

for (const m of gltf.meshes || []) {
  meshes++
  for (const p of m.primitives || []) {
    const posAcc = gltf.accessors[p.attributes.POSITION]
    if (posAcc) verts += posAcc.count
    if (p.indices != null) {
      const idxAcc = gltf.accessors[p.indices]
      if (idxAcc) tris += idxAcc.count / 3
    } else if (posAcc) {
      tris += posAcc.count / 3
    }
  }
}

const binName = gltf.buffers?.[0]?.uri
const binPath = binName ? path.join(path.dirname(gltfPath), binName) : null
const binSize = binPath && fs.existsSync(binPath) ? fs.statSync(binPath).size : 0
const estPayloadMB = ((verts * 3 * 4 * 3) / (1024 * 1024)).toFixed(2) // positions+normals+uvs rough

console.log(JSON.stringify({
  file: gltfPath,
  meshes,
  vertices: verts,
  triangles: Math.round(tris),
  binSizeMB: (binSize / 1024 / 1024).toFixed(2),
  exceedsStreetsGLBudget: verts > 200_000,
  autoSimplifyRatio: verts > 200_000 ? (200_000 / verts).toFixed(3) : 1,
  estBridgePayloadMB: estPayloadMB
}, null, 2))
