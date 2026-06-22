import * as THREE from 'three'
import { useAppStore } from '../../store/useAppStore'
import type { DirectionalLightConfig, LightType } from '../../store/useAppStore'

// Temporary vectors and matrices for calculations (reused to avoid allocations)
const _tempVecA = new THREE.Vector3()
const _tempVecB = new THREE.Vector3()
const _tempQuat = new THREE.Quaternion()

/**
 * Creates a texture for light icons
 */
export function createLightIconTexture(
  lightType: LightType | undefined,
  colorHex: string | undefined
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  const size = 128
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, size, size)

  const baseColor = new THREE.Color(colorHex || '#ffffff')
  const highlightColor = baseColor.clone().offsetHSL(0, 0, 0.25)
  const accentColor = baseColor.clone().offsetHSL(0, 0, -0.25)

  const cx = size / 2
  const cy = size / 2

  // outer glow
  ctx.save()
  ctx.translate(cx, cy)
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  ctx.beginPath()
  ctx.arc(0, 0, size * 0.4, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // main disk
  ctx.save()
  ctx.translate(cx, cy)
  ctx.fillStyle = highlightColor.getStyle()
  ctx.beginPath()
  ctx.arc(0, 0, size * 0.28, 0, Math.PI * 2)
  ctx.fill()
  ctx.lineWidth = 5
  ctx.strokeStyle = accentColor.getStyle()
  ctx.stroke()
  ctx.restore()

  // add rays for directional
  if (!lightType || lightType === 'directional') {
    ctx.save()
    ctx.translate(cx, cy)
    ctx.strokeStyle = accentColor.getStyle()
    ctx.lineWidth = 4
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI / 4) * i
      const r1 = size * 0.34
      const r2 = size * 0.44
      ctx.beginPath()
      ctx.moveTo(Math.cos(angle) * r1, Math.sin(angle) * r1)
      ctx.lineTo(Math.cos(angle) * r2, Math.sin(angle) * r2)
      ctx.stroke()
    }
    ctx.restore()
  } else if (lightType === 'spot') {
    ctx.save()
    ctx.translate(cx, cy + size * 0.02)
    ctx.fillStyle = accentColor.getStyle()
    ctx.beginPath()
    ctx.moveTo(-size * 0.18, -size * 0.05)
    ctx.lineTo(size * 0.18, -size * 0.05)
    ctx.lineTo(0, size * 0.25)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  } else if (lightType === 'rectarea') {
    ctx.save()
    ctx.translate(cx, cy)
    ctx.strokeStyle = accentColor.getStyle()
    ctx.lineWidth = 4
    ctx.beginPath()
    const w = size * 0.32
    const h = size * 0.22
    ctx.rect(-w / 2, -h / 2, w, h)
    ctx.stroke()
    ctx.restore()
  } else if (lightType === 'hemisphere') {
    ctx.save()
    ctx.translate(cx, cy)
    const grad = ctx.createLinearGradient(0, -size * 0.25, 0, size * 0.25)
    grad.addColorStop(0, highlightColor.getStyle())
    grad.addColorStop(1, accentColor.getStyle())
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(0, 0, size * 0.26, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  // label letter
  const labelMap: Record<LightType, string> = {
    directional: 'D',
    point: 'P',
    spot: 'S',
    rectarea: 'R',
    hemisphere: 'H'
  }
  const label = labelMap[lightType || 'directional']
  ctx.font = 'bold 46px "Segoe UI", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#111'
  ctx.fillText(label, cx, cy)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.generateMipmaps = true
  texture.needsUpdate = true
  return texture
}

/**
 * Computes the scale for a gizmo based on camera distance
 */
export function computeGizmoScale(light: THREE.Light, camera: THREE.Camera): number {
  if ((camera as any).isPerspectiveCamera) {
    const distance = camera.position.distanceTo(light.position)
    if (!isFinite(distance) || distance <= 0.001) {
      return 1
    }
    const fov = THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov)
    const worldHeight = 2 * distance * Math.tan(fov / 2)
    const scale = worldHeight * 0.02
    return THREE.MathUtils.clamp(scale, 0.5, 4)
  } else if ((camera as any).isOrthographicCamera) {
    const ortho = camera as THREE.OrthographicCamera
    const height = (ortho.top - ortho.bottom) / Math.max(ortho.zoom, 0.0001)
    const scale = height * 0.06
    return THREE.MathUtils.clamp(scale, 0.5, 4)
  }
  return 1.5
}

/**
 * Computes the direction vector of a light (for directional and spot lights)
 */
export function computeLightDirection(light: THREE.Light): THREE.Vector3 | null {
  if (light instanceof THREE.DirectionalLight || light instanceof THREE.SpotLight) {
    const lightPos = _tempVecA
    const targetPos = _tempVecB
    light.getWorldPosition(lightPos)
    light.target.updateMatrixWorld()
    light.target.getWorldPosition(targetPos)
    const direction = targetPos.sub(lightPos)
    if (direction.lengthSq() < 1e-6) {
      direction.set(0, -1, 0)
    } else {
      direction.normalize()
    }
    return direction.clone()
  }
  return null
}

/**
 * Creates a light gizmo object (visual representation of a light)
 */
export function createLightGizmoObject(
  light: THREE.Light,
  config: DirectionalLightConfig
): THREE.Object3D {
  const texture = createLightIconTexture(config.type, config.color)
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    toneMapped: false
  })
  material.sizeAttenuation = true
  material.opacity = 0.9

  const sprite = new THREE.Sprite(material)
  const baseSpriteScale = config.type === 'directional' ? 0.85 : 0.75
  sprite.scale.setScalar(baseSpriteScale)
  sprite.renderOrder = 1000
  sprite.userData.baseSpriteScale = baseSpriteScale

  const group = new THREE.Group()
  group.userData.isLightGizmo = true
  group.userData.light = light
  group.userData.lightId = config.id
  group.userData.lightType = config.type || 'directional'
  group.userData.baseSpriteScale = baseSpriteScale
  group.userData.selectionMultiplier = 1
  group.userData.baseGroupScale = 1
  group.userData.iconSprite = sprite
  group.userData.disposeTexture = texture
  group.matrixAutoUpdate = true
  group.renderOrder = 1000
  group.visible = true // Will be set correctly by ensureLightGizmo
  group.add(sprite)

  const orientationObjects: THREE.Object3D[] = []
  const colorForHelpers = new THREE.Color(config.color || '#ffffff')

  const setCommonMaterialProps = (mat: THREE.Material, baseOpacity: number) => {
    ;(mat as any).depthTest = false
    ;(mat as any).depthWrite = false
    if ('transparent' in mat) {
      ;(mat as any).transparent = true
    }
    ;(mat as any).opacity = baseOpacity
    mat.userData = mat.userData || {}
    mat.userData.lightIconBaseOpacity = baseOpacity
  }

  if (light instanceof THREE.DirectionalLight || config.type === 'directional') {
    const arrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(0, 0, 0),
      0.9,
      colorForHelpers.getHex(),
      0.28,
      0.18
    )
    const arrowLineMaterial = arrow.line.material as THREE.Material
    const arrowConeMaterial = arrow.cone.material as THREE.Material
    setCommonMaterialProps(arrowLineMaterial, 0.5)
    setCommonMaterialProps(arrowConeMaterial, 0.65)
    orientationObjects.push(arrow)
    group.add(arrow)
  } else if (light instanceof THREE.SpotLight || config.type === 'spot') {
    const coneGeometry = new THREE.ConeGeometry(0.35, 1.2, 16, 1, true)
    const coneMaterial = new THREE.MeshBasicMaterial({
      color: colorForHelpers,
      wireframe: true,
      side: THREE.DoubleSide
    })
    setCommonMaterialProps(coneMaterial, 0.45)
    const cone = new THREE.Mesh(coneGeometry, coneMaterial)
    cone.userData.gizmoKind = 'spotCone'
    cone.position.set(0, 0.55, 0)
    cone.rotation.x = Math.PI
    orientationObjects.push(cone)
    group.add(cone)
  } else if (light instanceof THREE.PointLight || config.type === 'point') {
    const sphereGeometry = new THREE.SphereGeometry(0.35, 16, 16)
    const sphereMaterial = new THREE.MeshBasicMaterial({
      color: colorForHelpers,
      wireframe: true
    })
    setCommonMaterialProps(sphereMaterial, 0.35)
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial)
    sphere.userData.gizmoKind = 'pointSphere'
    orientationObjects.push(sphere)
    group.add(sphere)
  } else if (light instanceof THREE.RectAreaLight || config.type === 'rectarea') {
    const panelGeometry = new THREE.PlaneGeometry(1.2, 1.2)
    const panelMaterial = new THREE.MeshBasicMaterial({
      color: colorForHelpers,
      wireframe: true,
      side: THREE.DoubleSide
    })
    setCommonMaterialProps(panelMaterial, 0.5)
    const panel = new THREE.Mesh(panelGeometry, panelMaterial)
    panel.userData.gizmoKind = 'rectPanel'
    orientationObjects.push(panel)
    group.add(panel)
  } else if (light instanceof THREE.HemisphereLight || config.type === 'hemisphere') {
    const capGeometry = new THREE.SphereGeometry(0.4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)
    const capMaterial = new THREE.MeshBasicMaterial({
      color: colorForHelpers,
      wireframe: true,
      side: THREE.DoubleSide
    })
    setCommonMaterialProps(capMaterial, 0.4)
    const cap = new THREE.Mesh(capGeometry, capMaterial)
    cap.userData.gizmoKind = 'hemisphereCap'
    orientationObjects.push(cap)
    group.add(cap)
  }

  group.userData.orientationObjects = orientationObjects
  return group
}

/**
 * Updates a light gizmo based on the light's current state
 */
export function updateLightGizmoFromLight(
  light: THREE.Light,
  gizmo: THREE.Object3D,
  camera?: THREE.Camera | null
): void {
  if (!gizmo) return
  gizmo.position.copy(light.position)
  // CRITICAL: Gizmo visibility is controlled by showLightHelpers setting
  const showLightHelpers = useAppStore.getState().showLightHelpers
  // Check if this gizmo has transform controls attached (is selected)
  const viewer = (window as any).__viewer
  const transformControls = viewer?.transformControls
  const isSelected = transformControls && (transformControls as any).object === gizmo
  // Keep gizmo visible if it's selected OR if showLightHelpers is enabled
  gizmo.visible = (isSelected || showLightHelpers) && light.visible

  const selectionMultiplier = gizmo.userData.selectionMultiplier ?? 1
  if (camera) {
    const baseScale = computeGizmoScale(light, camera)
    const targetScale = baseScale * selectionMultiplier
    gizmo.scale.setScalar(targetScale)
    gizmo.userData.currentScale = targetScale
  } else if (gizmo.userData.currentScale) {
    gizmo.scale.setScalar(gizmo.userData.currentScale)
  } else {
    const defaultScale = 3 * selectionMultiplier
    gizmo.scale.setScalar(defaultScale)
    gizmo.userData.currentScale = defaultScale
  }

  const sprite = gizmo.userData.iconSprite as THREE.Sprite | undefined
  const lightColor = light.color.clone()
  gizmo.userData.baseColor = lightColor.clone()
  if (sprite) {
    const spriteMaterial = sprite.material as THREE.SpriteMaterial | undefined
    if (spriteMaterial) {
      spriteMaterial.color.copy(lightColor)
      spriteMaterial.needsUpdate = true
    }
    const baseSpriteScale = sprite.userData?.baseSpriteScale ?? sprite.scale.x
    sprite.scale.setScalar(baseSpriteScale * (selectionMultiplier > 1 ? 1.05 : 1))
  }

  const orientationObjects = (gizmo.userData.orientationObjects as THREE.Object3D[]) || []
  orientationObjects.forEach((obj) => {
    if (obj instanceof THREE.ArrowHelper) {
      const dir = computeLightDirection(light)
      if (dir) {
        obj.setDirection(dir)
        obj.setColor(lightColor)
      }
      const arrowLineMaterial = obj.line.material as THREE.Material
      const arrowConeMaterial = obj.cone.material as THREE.Material
      const lineBase =
        arrowLineMaterial.userData?.lightIconBaseOpacity ??
        (arrowLineMaterial as any).opacity ??
        0.5
      const coneBase =
        arrowConeMaterial.userData?.lightIconBaseOpacity ??
        (arrowConeMaterial as any).opacity ??
        0.65
      ;(arrowLineMaterial as any).opacity = Math.min(1, lineBase * (selectionMultiplier > 1 ? 1.4 : 1))
      ;(arrowConeMaterial as any).opacity = Math.min(1, coneBase * (selectionMultiplier > 1 ? 1.4 : 1))
      arrowLineMaterial.needsUpdate = true
      arrowConeMaterial.needsUpdate = true
    } else if (obj instanceof THREE.Mesh) {
      const mat = obj.material
      const applyColor = (material: THREE.Material) => {
        if ('color' in material && material.color instanceof THREE.Color) {
          material.color.copy(lightColor)
        }
      }
      if (Array.isArray(mat)) {
        mat.forEach((m) => applyColor(m as THREE.Material))
      } else if (mat) {
        applyColor(mat as THREE.Material)
      }

      if (obj.userData.gizmoKind === 'spotCone' && light instanceof THREE.SpotLight) {
        const dir = computeLightDirection(light) ?? new THREE.Vector3(0, -1, 0)
        const baseLen = 1.2
        const radius = Math.max(0.35, Math.tan((light.angle ?? Math.PI / 6) * 0.5) * 0.9)
        obj.scale.set(radius, baseLen, radius)
        obj.position.copy(dir.clone().multiplyScalar(baseLen * 0.55))
        _tempQuat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
        obj.quaternion.copy(_tempQuat)
      } else if (obj.userData.gizmoKind === 'pointSphere') {
        const base = (obj.material as THREE.Material).userData?.lightIconBaseOpacity ?? 0.35
        const intensity = THREE.MathUtils.clamp((light as any).intensity ?? 1, 0.2, 4)
        const scale = THREE.MathUtils.clamp(0.35 * intensity, 0.3, 1)
        obj.scale.setScalar(scale)
        ;(obj.material as any).opacity = Math.min(1, base * (selectionMultiplier > 1 ? 1.35 : 1))
      } else if (obj.userData.gizmoKind === 'rectPanel' && light instanceof THREE.RectAreaLight) {
        obj.quaternion.copy(light.quaternion)
        const width = THREE.MathUtils.clamp(light.width || 1.2, 0.6, 2.5)
        const height = THREE.MathUtils.clamp(light.height || 1.2, 0.6, 2.5)
        obj.scale.set(width, height, 1)
      } else if (obj.userData.gizmoKind === 'hemisphereCap') {
        obj.rotation.x = Math.PI
      }

      const setOpacity = (material: THREE.Material) => {
        const base = material.userData?.lightIconBaseOpacity ?? (material as any).opacity ?? 0.45
        ;(material as any).opacity = Math.min(1, base * (selectionMultiplier > 1 ? 1.35 : 1))
      }
      if (Array.isArray(mat)) {
        mat.forEach((m) => setOpacity(m as THREE.Material))
      } else if (mat) {
        setOpacity(mat as THREE.Material)
      }
    }
  })
}

/**
 * Disposes of a light gizmo and its resources
 */
export function disposeLightGizmo(gizmo: THREE.Object3D): void {
  if (gizmo.userData.disposeTexture) {
    const texture = gizmo.userData.disposeTexture as THREE.Texture
    texture.dispose()
  }
  gizmo.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Sprite) {
      if (child.geometry) {
        child.geometry.dispose()
      }
      if (child.material) {
        const materials = (Array.isArray(child.material) ? child.material : [child.material]) as THREE.Material[]
        materials.forEach((mat) => {
          if (mat instanceof THREE.Material) {
            const mappedMaterial = mat as THREE.Material & { map?: THREE.Texture | null }
            if (mappedMaterial.map) {
              mappedMaterial.map.dispose()
            }
            mat.dispose()
          }
        })
      }
    } else if (child instanceof THREE.ArrowHelper) {
      if (child.line.geometry) {
        child.line.geometry.dispose()
      }
      if (child.cone.geometry) {
        child.cone.geometry.dispose()
      }
      const lineMat = child.line.material as THREE.Material
      const coneMat = child.cone.material as THREE.Material
      if (lineMat) lineMat.dispose()
      if (coneMat) coneMat.dispose()
    }
  })
}

/**
 * Ensures a light gizmo exists for a light, creating it if necessary
 */
export function ensureLightGizmo(
  scene: THREE.Scene,
  config: DirectionalLightConfig,
  light: THREE.Light,
  lightGizmos: Map<string, THREE.Object3D>,
  lightToGizmo: WeakMap<THREE.Light, THREE.Object3D>,
  gizmoToLight: WeakMap<THREE.Object3D, THREE.Light>,
  camera?: THREE.Camera | null
): THREE.Object3D | null {
  // CRITICAL: Don't create gizmos for CSM lights - they're internal system lights
  if (
    !config.id ||
    config.isSun ||
    light instanceof THREE.AmbientLight ||
    light.userData.isCSMLight ||
    light.userData.isInternal
  ) {
    return null
  }

  let gizmo = lightGizmos.get(config.id)
  const requestedType = config.type || 'directional'

  if (gizmo && gizmo.userData.lightType !== requestedType) {
    removeLightGizmo(scene, config.id, lightGizmos, lightToGizmo, gizmoToLight)
    gizmo = undefined
  }

  if (!gizmo) {
    gizmo = createLightGizmoObject(light, config)
    gizmo.userData.lightType = requestedType
    gizmoToLight.set(gizmo, light)
    lightToGizmo.set(light, gizmo)
    lightGizmos.set(config.id, gizmo)
    scene.add(gizmo)
    // CRITICAL: Set initial visibility based on showLightHelpers setting
    const showLightHelpers = useAppStore.getState().showLightHelpers
    gizmo.visible = showLightHelpers && light.visible
    // CRITICAL: Immediately update gizmo position to ensure it's correctly positioned
    updateLightGizmoFromLight(light, gizmo, camera)
  } else {
    gizmo.userData.light = light
    gizmo.userData.lightId = config.id
    gizmo.userData.lightType = requestedType
    gizmoToLight.set(gizmo, light)
    lightToGizmo.set(light, gizmo)
    // CRITICAL: Update visibility based on showLightHelpers setting
    const showLightHelpers = useAppStore.getState().showLightHelpers
    gizmo.visible = showLightHelpers && light.visible
    updateLightGizmoFromLight(light, gizmo, camera)
  }
  return gizmo
}

/**
 * Removes a light gizmo from the scene
 */
export function removeLightGizmo(
  scene: THREE.Scene,
  id: string,
  lightGizmos: Map<string, THREE.Object3D>,
  lightToGizmo: WeakMap<THREE.Light, THREE.Object3D>,
  gizmoToLight: WeakMap<THREE.Object3D, THREE.Light>
): void {
  const gizmo = lightGizmos.get(id)
  if (!gizmo) return

  // CRITICAL: Detach transform controls if they're attached to this gizmo
  const viewer = (window as any).__viewer
  if (viewer && viewer.transformControls) {
    const transformControls = viewer.transformControls
    if ((transformControls as any).object === gizmo) {
      transformControls.detach()
      // Also clear selected object if it's the linked light
      const linkedLight = gizmoToLight.get(gizmo)
      if (linkedLight && viewer.selectObject) {
        const currentSelected = useAppStore.getState().selectedObject
        if (currentSelected === linkedLight || currentSelected === gizmo) {
          viewer.selectObject(null)
        }
      }
    }
  }

  const linkedLight = gizmoToLight.get(gizmo)
  if (linkedLight) {
    lightToGizmo.delete(linkedLight)
  }
  gizmoToLight.delete(gizmo)
  disposeLightGizmo(gizmo)
  scene.remove(gizmo)
  lightGizmos.delete(id)
}

/**
 * Sets the selected state of a light gizmo
 */
export function setLightGizmoSelected(
  gizmo: THREE.Object3D | null,
  selected: boolean,
  camera?: THREE.Camera | null,
  light?: THREE.Light | null
): void {
  if (!gizmo) return
  gizmo.userData.selectionMultiplier = selected ? 1.25 : 1

  if (camera && light) {
    updateLightGizmoFromLight(light, gizmo, camera)
  } else if (gizmo.userData.light) {
    updateLightGizmoFromLight(gizmo.userData.light as THREE.Light, gizmo, camera ?? null)
  }
}

