import * as THREE from 'three'

/**
 * Marching Cubes implementation for creating dynamic water surfaces
 * Based on Three.js marching cubes example
 */
export class MarchingCubes extends THREE.Mesh {
  public isolation: number = 80
  public enableColors: boolean = false
  private resolution: number
  private size: number
  private size2: number
  private size3: number
  private halfSize: number
  private delta: number
  private field: Float32Array
  private maxPolyCount: number
  private vertexCount: number = 0
  private posArray: Float32Array
  private normArray: Float32Array
  private colArray: Float32Array
  private positions: THREE.BufferAttribute
  private normals: THREE.BufferAttribute
  private colors: THREE.BufferAttribute
  private metaballs: Array<{ x: number; y: number; z: number; strength: number; subtract: number }> = []
  private time: number = 0

  constructor(resolution: number, material: THREE.Material, isolation: number = 80) {
    const geometry = new THREE.BufferGeometry()
    super(geometry, material)

    // CRITICAL: Limit resolution to prevent out-of-memory errors
    // Resolution 50 = 125,000 grid points, 625,000 max polygons = ~22.5 MB
    // Resolution 100 = 1,000,000 grid points, 5,000,000 max polygons = ~180 MB (too much!)
    const maxSafeResolution = 60 // Cap at 60 to prevent memory issues
    const limitedResolution = Math.min(resolution, maxSafeResolution)
    
    if (resolution > maxSafeResolution) {
      console.warn(`[MarchingCubes] Resolution ${resolution} is too high and may cause out-of-memory. Limiting to ${maxSafeResolution}.`)
    }

    this.resolution = limitedResolution
    this.isolation = isolation
    this.size = limitedResolution
    this.size2 = this.size * this.size
    this.size3 = this.size2 * this.size
    
    // Memory check: Calculate estimated memory usage
    const estimatedMemoryMB = (this.size3 * 4 * 2 + this.size3 * 5 * 3 * 4 * 3) / 1024 / 1024
    if (estimatedMemoryMB > 100) {
      console.warn(`[MarchingCubes] Warning: Estimated memory usage is ${estimatedMemoryMB.toFixed(1)} MB. This may cause performance issues.`)
    }
    
    this.halfSize = this.size / 2
    this.delta = 2 / this.size
    this.field = new Float32Array(this.size3)

    // Estimate max polygon count (more conservative)
    this.maxPolyCount = Math.min(this.size3 * 3, 500000) // Cap at 500k polygons

    this.posArray = new Float32Array(this.maxPolyCount * 3)
    this.normArray = new Float32Array(this.maxPolyCount * 3)
    this.colArray = new Float32Array(this.maxPolyCount * 3)

    this.positions = new THREE.BufferAttribute(this.posArray, 3)
    this.normals = new THREE.BufferAttribute(this.normArray, 3)
    this.colors = new THREE.BufferAttribute(this.colArray, 3)

    this.geometry.setAttribute('position', this.positions)
    this.geometry.setAttribute('normal', this.normals)
    if (this.enableColors) {
      this.geometry.setAttribute('color', this.colors)
    }
  }

  addBall(x: number, y: number, z: number, strength: number, subtract: number) {
    this.metaballs.push({ x, y, z, strength, subtract })
  }

  reset() {
    this.metaballs = []
    this.vertexCount = 0
    this.posArray.fill(0)
    this.normArray.fill(0)
    this.colArray.fill(0)
  }

  update(time: number) {
    this.time = time
    this.reset()
    this.generateField()
    this.generateGeometry()
  }

  private generateField() {
    // Optimized: Pre-calculate grid positions to avoid repeated calculations
    const gridPositions = new Array(this.size3)
    for (let i = 0; i < this.size3; i++) {
      const x = (i % this.size) / this.halfSize - 1
      const y = ((i / this.size) % this.size) / this.halfSize - 1
      const z = (i / this.size2) / this.halfSize - 1
      gridPositions[i] = { x, y, z }
    }

    // Initialize field
    for (let i = 0; i < this.size3; i++) {
      this.field[i] = 0
    }

    // Optimized: Limit metaball influence radius to reduce computation
    const maxInfluenceRadius = 2.0 // Metaballs only affect nearby grid points

    for (const ball of this.metaballs) {
      // Animate ball position for water-like motion
      const animatedX = ball.x + Math.sin(this.time * 0.5 + ball.x) * 0.1
      const animatedY = ball.y + Math.cos(this.time * 0.3 + ball.y) * 0.1
      const animatedZ = ball.z + Math.sin(this.time * 0.4 + ball.z) * 0.1

      // Optimized: Only process grid points within influence radius
      for (let i = 0; i < this.size3; i++) {
        const pos = gridPositions[i]
        const dx = pos.x - animatedX
        const dy = pos.y - animatedY
        const dz = pos.z - animatedZ
        const d2 = dx * dx + dy * dy + dz * dz
        
        // Early exit if too far (significant optimization)
        if (d2 > maxInfluenceRadius * maxInfluenceRadius) continue

        const d = Math.sqrt(d2)
        if (d < ball.strength && d > 0.001) { // Avoid division by zero
          const val = ball.strength / d2
          this.field[i] += val
        }
      }
    }
  }

  private generateGeometry() {
    this.vertexCount = 0
    const threshold = this.isolation

    for (let i = 0; i < this.size3 - this.size2 - this.size - 1; i++) {
      const x = (i % this.size)
      const y = Math.floor(i / this.size) % this.size
      const z = Math.floor(i / this.size2)

      if (x === 0 || x >= this.size - 1 || y === 0 || y >= this.size - 1 || z === 0 || z >= this.size - 1) continue

      const cubeindex = this.getCubeIndex(x, y, z, threshold)
      if (cubeindex === 0 || cubeindex === 255) continue

      const vertlist = this.getVertexList(x, y, z, threshold, cubeindex)
      const triangles = this.getTriangles(cubeindex)

      for (let j = 0; j < triangles.length; j += 3) {
        if (this.vertexCount + 3 > this.maxPolyCount) return

        const v1 = vertlist[triangles[j]]
        const v2 = vertlist[triangles[j + 1]]
        const v3 = vertlist[triangles[j + 2]]

        if (!v1 || !v2 || !v3) continue

        this.addVertex(v1, x, y, z)
        this.addVertex(v2, x, y, z)
        this.addVertex(v3, x, y, z)
      }
    }

    this.positions.needsUpdate = true
    this.normals.needsUpdate = true
    if (this.enableColors) {
      this.colors.needsUpdate = true
    }

    this.geometry.setDrawRange(0, this.vertexCount)
  }

  private getCubeIndex(x: number, y: number, z: number, threshold: number): number {
    let cubeindex = 0
    const offsets = [
      [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
      [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]
    ]

    for (let i = 0; i < 8; i++) {
      const [dx, dy, dz] = offsets[i]
      const idx = (z + dz) * this.size2 + (y + dy) * this.size + (x + dx)
      if (this.field[idx] >= threshold) {
        cubeindex |= 1 << i
      }
    }

    return cubeindex
  }

  private getVertexList(x: number, y: number, z: number, threshold: number, cubeindex: number): THREE.Vector3[] {
    const vertlist: THREE.Vector3[] = new Array(12)
    const offsets = [
      [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
      [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]
    ]
    const edges = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7]
    ]

    for (let i = 0; i < 12; i++) {
      const edge = edges[i]
      const [a, b] = edge
      const bita = 1 << a
      const bitb = 1 << b

      if ((cubeindex & bita) !== (cubeindex & bitb)) {
        const [dx1, dy1, dz1] = offsets[a]
        const [dx2, dy2, dz2] = offsets[b]
        const idx1 = (z + dz1) * this.size2 + (y + dy1) * this.size + (x + dx1)
        const idx2 = (z + dz2) * this.size2 + (y + dy2) * this.size + (x + dx2)
        const val1 = this.field[idx1]
        const val2 = this.field[idx2]
        
        if (Math.abs(val2 - val1) < 0.0001) continue
        
        const mu = (threshold - val1) / (val2 - val1)

        const px = ((x + dx1) + mu * (dx2 - dx1)) / this.halfSize - 1
        const py = ((y + dy1) + mu * (dy2 - dy1)) / this.halfSize - 1
        const pz = ((z + dz1) + mu * (dz2 - dz1)) / this.halfSize - 1

        vertlist[i] = new THREE.Vector3(px, py, pz)
      }
    }

    return vertlist
  }

  private getTriangles(cubeindex: number): number[] {
    // Marching cubes lookup table (simplified - for production use full 256-entry table)
    // This is a basic implementation - the full table maps all 256 cube configurations
    const triTable: { [key: number]: number[] } = {
      0: [], 1: [0, 8, 3], 2: [0, 1, 9], 3: [1, 8, 3, 9, 8, 1],
      4: [1, 2, 10], 5: [0, 8, 3, 1, 2, 10], 6: [9, 2, 10, 0, 2, 9],
      7: [2, 8, 3, 2, 10, 8, 10, 9, 8], 8: [3, 11, 2], 9: [0, 11, 2, 8, 11, 0],
      10: [1, 9, 0, 2, 3, 11], 11: [1, 11, 2, 1, 9, 11, 9, 8, 11],
      12: [3, 10, 1, 11, 10, 3], 13: [0, 10, 1, 0, 8, 10, 8, 11, 10],
      14: [3, 9, 0, 3, 11, 9, 11, 10, 9], 15: [9, 8, 10, 10, 8, 11]
    }

    return triTable[cubeindex] || []
  }

  private addVertex(v: THREE.Vector3, x: number, y: number, z: number) {
    const idx = this.vertexCount * 3
    this.posArray[idx] = v.x
    this.posArray[idx + 1] = v.y
    this.posArray[idx + 2] = v.z

    // Calculate normal (simplified - could be improved with gradient calculation)
    const normal = new THREE.Vector3(0, 1, 0)
    this.normArray[idx] = normal.x
    this.normArray[idx + 1] = normal.y
    this.normArray[idx + 2] = normal.z

    if (this.enableColors) {
      this.colArray[idx] = 1
      this.colArray[idx + 1] = 1
      this.colArray[idx + 2] = 1
    }

    this.vertexCount++
  }
}

