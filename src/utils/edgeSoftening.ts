import * as THREE from 'three'
import { EdgeSplitModifier } from 'three/addons/modifiers/EdgeSplitModifier.js'

/**
 * Creates a beveled/chamfered box geometry with softened edges
 * Uses a simpler approach: modifies vertex positions near edges
 * @param width Width of the box
 * @param height Height of the box
 * @param depth Depth of the box
 * @param bevelSize Size of the bevel (0-0.5, where 0 = sharp, 0.5 = max bevel)
 * @param segments Number of segments for the bevel (higher = smoother)
 * @returns Beveled BoxGeometry
 */
export function createBeveledBoxGeometry(
  width: number,
  height: number,
  depth: number,
  bevelSize: number = 0.1,
  segments: number = 2
): THREE.BufferGeometry {
  // Clamp bevelSize
  const bevel = Math.max(0, Math.min(bevelSize, 0.5))
  
  if (bevel <= 0.001) {
    // No bevel, return regular box
    return new THREE.BoxGeometry(width, height, depth)
  }

  // Create geometry with extra segments for smoother beveling
  const geometry = new THREE.BoxGeometry(
    width,
    height,
    depth,
    Math.max(2, segments),
    Math.max(2, segments),
    Math.max(2, segments)
  )

  const positions = geometry.attributes.position
  const uvs = geometry.attributes.uv
  const newPositions = new Float32Array(positions.array.length)
  newPositions.set(positions.array)
  
  // Preserve UVs - they should match vertex count
  const newUvs = uvs ? new Float32Array(uvs.array.length) : null
  if (newUvs && uvs) {
    newUvs.set(uvs.array)
  }

  const halfWidth = width / 2
  const halfHeight = height / 2
  const halfDepth = depth / 2
  const bevelAmount = bevel * Math.min(halfWidth, halfHeight, halfDepth)

  // Process each vertex to create beveled edges
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i)
    const y = positions.getY(i)
    const z = positions.getZ(i)
    
    // Calculate distance from each face (0 = on face, positive = inside)
    const distX = halfWidth - Math.abs(x)
    const distY = halfHeight - Math.abs(y)
    const distZ = halfDepth - Math.abs(z)
    
    // Find minimum distance (closest to an edge/corner)
    const minDist = Math.min(distX, distY, distZ)
    
    // If vertex is near an edge or corner, move it inward
    if (minDist < bevelAmount) {
      const factor = 1 - (bevelAmount - minDist) / bevelAmount
      const bevelFactor = Math.max(0, Math.min(1, factor))
      
      // Calculate direction to move vertex (toward center)
      const dirX = x > 0 ? -1 : 1
      const dirY = y > 0 ? -1 : 1
      const dirZ = z > 0 ? -1 : 1
      
      // Apply bevel
      const newX = x + dirX * bevelAmount * (1 - bevelFactor) * 0.5
      const newY = y + dirY * bevelAmount * (1 - bevelFactor) * 0.5
      const newZ = z + dirZ * bevelAmount * (1 - bevelFactor) * 0.5
      
      newPositions[i * 3] = newX
      newPositions[i * 3 + 1] = newY
      newPositions[i * 3 + 2] = newZ
    }
  }

  // Create new geometry with modified positions
  const beveledGeometry = new THREE.BufferGeometry()
  beveledGeometry.setAttribute('position', new THREE.BufferAttribute(newPositions, 3))
  
  // Copy UVs - CRITICAL: Preserve UVs for textures (must match vertex count)
  if (newUvs) {
    beveledGeometry.setAttribute('uv', new THREE.BufferAttribute(newUvs, 2))
  } else {
    // If no UVs exist, create default ones
    const uvCount = beveledGeometry.attributes.position.count
    const defaultUvs = new Float32Array(uvCount * 2)
    for (let i = 0; i < uvCount; i++) {
      defaultUvs[i * 2] = 0
      defaultUvs[i * 2 + 1] = 0
    }
    beveledGeometry.setAttribute('uv', new THREE.BufferAttribute(defaultUvs, 2))
  }
  
  // Copy other attributes
  if (geometry.attributes.normal) {
    beveledGeometry.setAttribute('normal', geometry.attributes.normal.clone())
  }
  if (geometry.index) {
    beveledGeometry.setIndex(geometry.index.clone())
  }
  
  // Recompute normals for smooth lighting
  beveledGeometry.computeVertexNormals()
  
  return beveledGeometry
}

/**
 * Applies edge softening to an existing mesh using a shader-based approach
 * This creates a visual softening effect without modifying geometry
 */
export function applyEdgeSofteningShader(material: THREE.Material, intensity: number = 0.5): THREE.ShaderMaterial {
  const vertexShader = `
    varying vec3 vNormal;
    varying vec3 vPosition;
    
    void main() {
      vNormal = normalize(normalMatrix * normal);
      vPosition = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `
  
  const fragmentShader = `
    uniform float edgeSoftness;
    uniform vec3 color;
    varying vec3 vNormal;
    varying vec3 vPosition;
    
    void main() {
      // Calculate edge factor based on normal
      float edgeFactor = 1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0)));
      edgeFactor = pow(edgeFactor, 1.0 / (edgeSoftness + 0.1));
      
      // Soften edges
      vec3 finalColor = mix(color, color * 1.2, edgeFactor * edgeSoftness);
      
      gl_FragColor = vec4(finalColor, 1.0);
    }
  `
  
  const shaderMaterial = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      edgeSoftness: { value: intensity },
      color: { value: new THREE.Color(0x888888) }
    }
  })
  
  return shaderMaterial
}

/**
 * Simple edge softening using geometry modification
 * Uses EdgeSplit modifier approach combined with vertex smoothing for beveled edges
 * Modifies the mesh's geometry to have beveled edges
 */
export function softenEdges(mesh: THREE.Mesh, bevelSize: number = 0.1): void {
  // Check if we have stored original parameters (for re-applying beveling)
  let width = mesh.userData.originalWidth
  let height = mesh.userData.originalHeight
  let depth = mesh.userData.originalDepth
  
  // If not stored, try to get from BoxGeometry
  if (!width || !height || !depth) {
    if (mesh.geometry instanceof THREE.BoxGeometry) {
      const params = (mesh.geometry as THREE.BoxGeometry).parameters
      width = params.width || 1
      height = params.height || 1
      depth = params.depth || 1
      
      // Store original parameters for future re-applications
      mesh.userData.originalWidth = width
      mesh.userData.originalHeight = height
      mesh.userData.originalDepth = depth
    } else {
      // Try to get dimensions from bounding box
      mesh.geometry.computeBoundingBox()
      const bbox = mesh.geometry.boundingBox
      if (bbox) {
        width = bbox.max.x - bbox.min.x || 1
        height = bbox.max.y - bbox.min.y || 1
        depth = bbox.max.z - bbox.min.z || 1
        
        // Store for future use
        mesh.userData.originalWidth = width
        mesh.userData.originalHeight = height
        mesh.userData.originalDepth = depth
      } else {
        console.warn('Edge softening: Could not determine geometry dimensions')
        return
      }
    }
  }
  
  // Dispose old geometry
  const oldGeometry = mesh.geometry
  const material = mesh.material // Preserve material
  
  // Use EdgeSplit modifier approach (like Three.js example)
  // Split edges at sharp angles, then apply beveling for smoother results
  const modifier = new EdgeSplitModifier()
  
  // Convert bevelSize (0-0.5) to cutoff angle
  // Higher bevelSize = more softening = lower cutoff angle (more edges split)
  // Range: Math.PI/6 (30°) for max softening to Math.PI/2 (90°) for minimal softening
  const cutoffAngle = Math.PI / 2 - (bevelSize * Math.PI / 3)
  
  try {
    // Apply EdgeSplit modifier to create split edges (like the Three.js example)
    // This duplicates vertices at edges, allowing independent smoothing
    const splitGeometry = modifier.modify(oldGeometry.clone(), cutoffAngle, true)
    
    // Now apply beveling to the split geometry for smoother edges
    const beveledGeometry = createBeveledBoxGeometryFromGeometry(splitGeometry, width, height, depth, bevelSize)
    
    mesh.geometry = beveledGeometry
  } catch (error) {
    console.warn('[EdgeSoftening] EdgeSplit modifier failed, using direct beveling:', error)
    // Fallback to direct beveling if EdgeSplit fails
    mesh.geometry = createBeveledBoxGeometry(width, height, depth, bevelSize, 2)
  }
  
  // Preserve material and ensure it's still applied
  if (material) {
    mesh.material = material
  }
  
  // Dispose old geometry after new one is created
  oldGeometry.dispose()
  
  // Update normals and bounding volumes
  mesh.geometry.computeVertexNormals()
  mesh.geometry.computeBoundingSphere()
  mesh.geometry.computeBoundingBox()
  
  // Mark for update
  if (mesh.geometry.attributes.position) {
    mesh.geometry.attributes.position.needsUpdate = true
  }
  if (mesh.geometry.attributes.normal) {
    mesh.geometry.attributes.normal.needsUpdate = true
  }
}

/**
 * Creates beveled geometry from an existing geometry (like EdgeSplit result)
 * This allows us to bevel already-split edges for smoother results
 */
function createBeveledBoxGeometryFromGeometry(
  geometry: THREE.BufferGeometry,
  width: number,
  height: number,
  depth: number,
  bevelSize: number = 0.1
): THREE.BufferGeometry {
  const bevel = Math.max(0, Math.min(bevelSize, 0.5))
  
  if (bevel <= 0.001) {
    return geometry.clone()
  }

  const positions = geometry.attributes.position
  const uvs = geometry.attributes.uv
  const newPositions = new Float32Array(positions.array.length)
  newPositions.set(positions.array)
  
  // Preserve UVs
  const newUvs = uvs ? new Float32Array(uvs.array.length) : null
  if (newUvs && uvs) {
    newUvs.set(uvs.array)
  }

  const halfWidth = width / 2
  const halfHeight = height / 2
  const halfDepth = depth / 2
  const bevelAmount = bevel * Math.min(halfWidth, halfHeight, halfDepth)

  // Process each vertex to create beveled edges
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i)
    const y = positions.getY(i)
    const z = positions.getZ(i)
    
    // Calculate distance from each face
    const distX = halfWidth - Math.abs(x)
    const distY = halfHeight - Math.abs(y)
    const distZ = halfDepth - Math.abs(z)
    
    // Find minimum distance (closest to an edge/corner)
    const minDist = Math.min(distX, distY, distZ)
    
    // If vertex is near an edge or corner, move it inward
    if (minDist < bevelAmount) {
      const factor = 1 - (bevelAmount - minDist) / bevelAmount
      const bevelFactor = Math.max(0, Math.min(1, factor))
      
      // Calculate direction to move vertex (toward center)
      const dirX = x > 0 ? -1 : 1
      const dirY = y > 0 ? -1 : 1
      const dirZ = z > 0 ? -1 : 1
      
      // Apply bevel
      const newX = x + dirX * bevelAmount * (1 - bevelFactor) * 0.5
      const newY = y + dirY * bevelAmount * (1 - bevelFactor) * 0.5
      const newZ = z + dirZ * bevelAmount * (1 - bevelFactor) * 0.5
      
      newPositions[i * 3] = newX
      newPositions[i * 3 + 1] = newY
      newPositions[i * 3 + 2] = newZ
    }
  }

  // Create new geometry with modified positions
  const beveledGeometry = new THREE.BufferGeometry()
  beveledGeometry.setAttribute('position', new THREE.BufferAttribute(newPositions, 3))
  
  // Copy UVs
  if (newUvs) {
    beveledGeometry.setAttribute('uv', new THREE.BufferAttribute(newUvs, 2))
  } else {
    const uvCount = beveledGeometry.attributes.position.count
    const defaultUvs = new Float32Array(uvCount * 2)
    for (let i = 0; i < uvCount; i++) {
      defaultUvs[i * 2] = 0
      defaultUvs[i * 2 + 1] = 0
    }
    beveledGeometry.setAttribute('uv', new THREE.BufferAttribute(defaultUvs, 2))
  }
  
  // Copy other attributes
  if (geometry.attributes.normal) {
    beveledGeometry.setAttribute('normal', geometry.attributes.normal.clone())
  }
  if (geometry.index) {
    beveledGeometry.setIndex(geometry.index.clone())
  }
  
  // Recompute normals for smooth lighting
  beveledGeometry.computeVertexNormals()
  
  return beveledGeometry
}

