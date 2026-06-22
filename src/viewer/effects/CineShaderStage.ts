import * as THREE from 'three'

export interface CineShaderStage {
  group: THREE.Group
  screen: THREE.Mesh<THREE.PlaneGeometry, THREE.Material>
}

/**
 * Creates a CineShader-style stage: floor, back wall, side panels, beams, lights, and a central screen.
 * The provided material is applied to the screen mesh.
 * All objects are parented under a single group so callers can position/scale the whole stage.
 */
export function createCineShaderStage(screenMaterial: THREE.Material): CineShaderStage {
  const group = new THREE.Group()
  group.name = 'CineShaderStage'

  // Floor
  const floorGeom = new THREE.PlaneGeometry(16, 16)
  floorGeom.rotateX(-Math.PI / 2)
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x050814,
    metalness: 0.4,
    roughness: 0.8
  })
  const floor = new THREE.Mesh(floorGeom, floorMat)
  floor.position.y = 0
  floor.receiveShadow = true
  group.add(floor)

  // Back wall
  const wallGeom = new THREE.PlaneGeometry(12, 6)
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x050716,
    metalness: 0.2,
    roughness: 0.9
  })
  const wall = new THREE.Mesh(wallGeom, wallMat)
  wall.position.set(0, 3, -6)
  wall.receiveShadow = true
  group.add(wall)

  // Side panels
  const sideGeom = new THREE.BoxGeometry(0.4, 4, 6)
  const sideMat = new THREE.MeshStandardMaterial({
    color: 0x0b1024,
    metalness: 0.5,
    roughness: 0.4
  })
  const leftPanel = new THREE.Mesh(sideGeom, sideMat)
  leftPanel.position.set(-3.8, 2.2, -4)
  leftPanel.castShadow = true
  leftPanel.receiveShadow = true
  group.add(leftPanel)

  const rightPanel = leftPanel.clone()
  rightPanel.position.x = 3.8
  group.add(rightPanel)

  // Overhead beams
  const beamGeom = new THREE.BoxGeometry(8, 0.25, 0.6)
  const beamMat = new THREE.MeshStandardMaterial({
    color: 0x121624,
    metalness: 0.6,
    roughness: 0.5
  })
  const beam1 = new THREE.Mesh(beamGeom, beamMat)
  beam1.position.set(0, 3.6, -3)
  beam1.castShadow = true
  group.add(beam1)
  const beam2 = beam1.clone()
  beam2.position.z = -6
  group.add(beam2)

  // Screen plane where the shader is rendered
  const screenGeom = new THREE.PlaneGeometry(4.5, 2.5)
  const screen = new THREE.Mesh(screenGeom, screenMaterial)
  screen.position.set(0, 2.3, -5.9)
  screen.castShadow = false
  screen.receiveShadow = false
  screen.name = 'CineShaderScreen'
  group.add(screen)

  // Stage lighting (ambient + two spots), all parented to the group
  const ambient = new THREE.AmbientLight(0x222839, 0.8)
  group.add(ambient)

  const keyLight = new THREE.SpotLight(0x8fb7ff, 1.6, 30, Math.PI / 6, 0.4, 1.5)
  keyLight.position.set(4, 6, 2)
  keyLight.target.position.set(0, 2.3, -5.5)
  keyLight.castShadow = true
  keyLight.shadow.mapSize.set(1024, 1024)
  group.add(keyLight)
  group.add(keyLight.target)

  const rimLight = new THREE.SpotLight(0xff8fb7, 1.0, 25, Math.PI / 5, 0.6, 1.3)
  rimLight.position.set(-4, 5, -1)
  rimLight.target.position.set(0, 2.3, -5.5)
  group.add(rimLight)
  group.add(rimLight.target)

  return { group, screen }
}














