// @ts-nocheck

import * as THREE from 'three'
import { PLYLoader } from 'three-stdlib'
import { LoadedModel } from '../useViewer'
import { createPointCloudMaterial } from '../pointCloud/pointCloudRendering'
import { useAppStore } from '../../store/useAppStore'

export async function loadPLY(
  data: File | ArrayBuffer | string,
  _onProgress?: (progress: number) => void
): Promise<LoadedModel> {
  const loader = new PLYLoader()

  return new Promise((resolve, reject) => {
    const onLoad = (geometry: THREE.BufferGeometry) => {
      const hasVertexColors = !!geometry.getAttribute('color')
      // A PLY with no face index is a point cloud (e.g. CloudCompare / LiDAR /
      // photogrammetry exports). Rendering those as a triangle mesh stitches
      // unrelated points into garbage triangles, so they must be drawn as points.
      const hasFaces = !!geometry.index && geometry.index.count > 0

      let object: THREE.Object3D

      if (hasFaces) {
        // Ensure lighting works even when the mesh ships without normals.
        if (!geometry.getAttribute('normal')) {
          geometry.computeVertexNormals()
        }

        const material = new THREE.MeshStandardMaterial({
          color: hasVertexColors ? 0xffffff : 0xcccccc,
          vertexColors: hasVertexColors,
          depthTest: true, // Industry-standard: Enable depth masking
          depthWrite: true, // Industry-standard: Write to depth buffer
          opacity: 1.0,
          transparent: false
        })
        const mesh = new THREE.Mesh(geometry, material)

        // Enable shadows by default for imported meshes
        mesh.castShadow = true
        mesh.receiveShadow = true

        material.fog = false // Fog only affects lighting, not imported object textures
        material.needsUpdate = true

        object = mesh
      } else {
        // Point cloud: size points relative to the cloud bounds so they stay
        // visible regardless of the model's real-world scale.
        geometry.computeBoundingSphere()
        const radius = geometry.boundingSphere?.radius || 1
        const pointSize = Math.max(radius / 350, 1e-4)

        // Respect the user's current point-cloud render mode / size so reloading
        // a cloud keeps the chosen look (points vs. Gaussian-splat projection).
        let renderMode: 'points' | 'gaussian' = 'gaussian'
        let sizeScale = 1
        try {
          const store = useAppStore.getState()
          renderMode = store.pointCloudRenderMode ?? renderMode
          sizeScale = store.pointCloudPointScale ?? 1
          store.setShowPointCloudPanel?.(true)
        } catch {
          // Store not available (e.g. unit tests) — fall back to defaults.
        }

        const material = createPointCloudMaterial(renderMode, {
          hasVertexColors,
          size: Math.max(pointSize * sizeScale, 1e-5)
        })

        const points = new THREE.Points(geometry, material)
        points.userData.isPointCloud = true
        points.userData.pointCloudBaseSize = pointSize
        points.userData.pointCloudHasVertexColors = hasVertexColors
        points.userData.pointCloudRenderMode = renderMode
        object = points
      }

      // Industry-standard: Mark imported models with exclusion flags
      object.userData.isModel = true
      object.userData.isImportedModel = true
      object.userData.excludeFromSkyModifications = true
      object.userData.excludeFromWeatherModifications = true

      const group = new THREE.Group()
      group.add(object)
      group.userData.isModel = true
      group.userData.excludeFromSkyModifications = true
      group.userData.excludeFromWeatherModifications = true

      resolve({
        scene: group,
        animations: [],
        userData: {
          format: 'ply',
          isPointCloud: !hasFaces
        }
      })
    }

    const onError = (error: ErrorEvent) => {
      reject(new Error(`Failed to load PLY: ${error.message}`))
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

