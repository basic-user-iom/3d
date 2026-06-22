import * as THREE from 'three'
import { STLLoader } from 'three-stdlib'
import { LoadedModel } from '../useViewer'

export async function loadSTL(
  data: File | ArrayBuffer | string,
  _onProgress?: (progress: number) => void
): Promise<LoadedModel> {
  const loader = new STLLoader()

  return new Promise((resolve, reject) => {
    const onLoad = (geometry: THREE.BufferGeometry) => {
      const material = new THREE.MeshStandardMaterial({ 
        color: 0xcccccc,
        depthTest: true, // Industry-standard: Enable depth masking
        depthWrite: true, // Industry-standard: Write to depth buffer
        opacity: 1.0,
        transparent: false
      })
      const mesh = new THREE.Mesh(geometry, material)
      // Industry-standard: Mark imported models with exclusion flags
      mesh.userData.isModel = true
      mesh.userData.isImportedModel = true
      mesh.userData.excludeFromSkyModifications = true
      mesh.userData.excludeFromWeatherModifications = true
      
      // Enable shadows by default for imported models
      mesh.castShadow = true
      mesh.receiveShadow = true
      
      // Disable fog on imported models - fog should only affect lighting, not visual appearance
      if (mesh.material) {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        materials.forEach((mat: THREE.Material) => {
          if ('fog' in mat) {
            ;(mat as THREE.MeshStandardMaterial).fog = false
          }
          mat.needsUpdate = true
        })
      }
      
      const group = new THREE.Group()
      group.add(mesh)
      group.userData.isModel = true
      group.userData.excludeFromSkyModifications = true
      group.userData.excludeFromWeatherModifications = true

      resolve({
        scene: group,
        animations: [],
        userData: {
          format: 'stl'
        }
      })
    }

    const onError = (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      reject(new Error(`Failed to load STL: ${message}`))
    }

    if (data instanceof File) {
      const reader = new FileReader()
      reader.onload = (e) => {
        const arrayBuffer = e.target?.result as ArrayBuffer
        const geometry = loader.parse(arrayBuffer)
        onLoad(geometry)
      }
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsArrayBuffer(data)
    } else if (data instanceof ArrayBuffer) {
      const geometry = loader.parse(data)
      onLoad(geometry)
    } else {
      // String URL
      loader.load(data, onLoad, undefined, onError)
    }
  })
}

