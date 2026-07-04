import * as THREE from 'three'

/**
 * Create a canvas texture for hotspot label text
 * This creates a billboarded text label that always faces the camera
 */
export function createHotspotLabelTexture(
  text: string,
  options: {
    fontSize?: number
    fontFamily?: string
    color?: string
    backgroundColor?: string
    padding?: number
    borderRadius?: number
    borderWidth?: number
    borderColor?: string
  } = {}
): THREE.CanvasTexture {
  const {
    fontSize = 16,
    fontFamily = 'Arial, sans-serif',
    color = '#ffffff',
    backgroundColor = 'rgba(40, 40, 45, 0.95)', // Dark grey matching bottom label
    padding = 10,
    borderRadius = 6,
    borderWidth = 2,
    borderColor = '#00AAFF' // Cyan - same as panel border for consistency
  } = options

  // Use 12x resolution to match content panel quality
  // This ensures consistent border thickness and crisp text rendering
  const scale = 12 // Match content panel resolution (12x)

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  
  // Enable high-quality text rendering
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  
  // Measure text at base size
  ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', ${fontFamily}, sans-serif`
  const metrics = ctx.measureText(text)
  const textWidth = metrics.width
  const textHeight = fontSize
  
  // Calculate base dimensions with padding
  const baseWidth = textWidth + padding * 2
  const baseHeight = textHeight + padding * 2
  
  // Set canvas size with device pixel ratio scaling
  canvas.width = baseWidth * scale
  canvas.height = baseHeight * scale
  
  // Scale context for high-DPI
  ctx.scale(scale, scale)
  
  // Clear and redraw
  ctx.clearRect(0, 0, baseWidth, baseHeight)
  
  // Modern glass morphism background with gradient and shadow
  if (backgroundColor) {
    const x = padding / 2
    const y = padding / 2
    const w = baseWidth - padding
    const h = baseHeight - padding
    const cornerRadius = borderRadius // Use different variable name to avoid conflicts
    
    // Minimal shadow for depth (matching bottom label)
    ctx.save()
    ctx.shadowColor = 'rgba(0, 0, 0, 0.2)'
    ctx.shadowBlur = 4
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 1
    
    // Parse backgroundColor to create modern gradient
    if (backgroundColor.includes('rgba')) {
      const rgbaMatch = backgroundColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+),?\s*([\d.]+)?\)/)
      if (rgbaMatch) {
        const red = parseInt(rgbaMatch[1])
        const g = parseInt(rgbaMatch[2])
        const b = parseInt(rgbaMatch[3])
        const a = rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 1
        
        // Modern gradient background
        const bgGradient = ctx.createLinearGradient(x, y, x, y + h)
        bgGradient.addColorStop(0, `rgba(${Math.min(red + 10, 255)}, ${Math.min(g + 10, 255)}, ${Math.min(b + 10, 255)}, ${a * 0.95})`)
        bgGradient.addColorStop(1, `rgba(${Math.max(red - 5, 0)}, ${Math.max(g - 5, 0)}, ${Math.max(b - 5, 0)}, ${a * 0.9})`)
        ctx.fillStyle = bgGradient
      } else {
        ctx.fillStyle = backgroundColor
      }
    } else {
      ctx.fillStyle = backgroundColor
    }
    
    // Draw rounded rectangle with proper rounded corners
    ctx.beginPath()
    ctx.moveTo(x + cornerRadius, y)
    ctx.lineTo(x + w - cornerRadius, y)
    ctx.quadraticCurveTo(x + w, y, x + w, y + cornerRadius)
    ctx.lineTo(x + w, y + h - cornerRadius)
    ctx.quadraticCurveTo(x + w, y + h, x + w - cornerRadius, y + h)
    ctx.lineTo(x + cornerRadius, y + h)
    ctx.quadraticCurveTo(x, y + h, x, y + h - cornerRadius)
    ctx.lineTo(x, y + cornerRadius)
    ctx.quadraticCurveTo(x, y, x + cornerRadius, y)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
    
    // Customizable outline border
    // Now using same 12x resolution as content panel
    // Scale border based on relative element sizes:
    // Label sprite: 0.8 world units, Panel mesh: 1.5 world units
    // Scale factor: 0.8 / 1.5 ≈ 0.53
    if (borderWidth > 0 && borderColor) {
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(x + cornerRadius, y)
      ctx.lineTo(x + w - cornerRadius, y)
      ctx.quadraticCurveTo(x + w, y, x + w, y + cornerRadius)
      ctx.lineTo(x + w, y + h - cornerRadius)
      ctx.quadraticCurveTo(x + w, y + h, x + w - cornerRadius, y + h)
      ctx.lineTo(x + cornerRadius, y + h)
      ctx.quadraticCurveTo(x, y + h, x, y + h - cornerRadius)
      ctx.lineTo(x, y + cornerRadius)
      ctx.quadraticCurveTo(x, y, x + cornerRadius, y)
      ctx.closePath()
      ctx.strokeStyle = borderColor
      // Scale border proportionally to element size ratio (label/panel = 0.8/1.5 ≈ 0.5)
      const scaledBorderWidth = Math.max(0.5, borderWidth * 0.5)
      ctx.lineWidth = scaledBorderWidth
      ctx.stroke()
      ctx.restore()
    }
  }
  
  // Modern typography with subtle shadow for readability
  ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', ${fontFamily}, sans-serif`
  
  // Minimal text shadow for readability (matching bottom label)
  ctx.shadowColor = 'rgba(0, 0, 0, 0.3)'
  ctx.shadowBlur = 1
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 0.5
  
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, baseWidth / 2, baseHeight / 2)
  
  // Reset shadow
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 0
  
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  // Disable mipmaps for crisp text rendering (prevents blurriness)
  texture.generateMipmaps = false
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.needsUpdate = true
  
  // Store base dimensions (before device pixel ratio scaling) for proper sprite scaling
  ;(texture.image as any).__baseWidth = baseWidth
  ;(texture.image as any).__baseHeight = baseHeight
  
  return texture
}

export type HotspotLabelOptions = {
  fontSize?: number
  fontFamily?: string
  color?: string
  backgroundColor?: string
  offsetX?: number
  offsetY?: number
  borderWidth?: number
  borderColor?: string
  borderRadius?: number
  scale?: number
  faceCamera?: boolean
}

function applyHotspotLabelScale(
  object: THREE.Object3D,
  texture: THREE.CanvasTexture,
  scale: number
): void {
  const baseWidth = (texture.image as HTMLCanvasElement & { __baseWidth?: number }).__baseWidth || texture.image.width
  const baseHeight = (texture.image as HTMLCanvasElement & { __baseHeight?: number }).__baseHeight || texture.image.height
  const aspectRatio = baseWidth / baseHeight
  object.userData.labelScale = scale
  if (object instanceof THREE.Mesh) {
    object.geometry.dispose()
    object.geometry = new THREE.PlaneGeometry(scale * aspectRatio, scale)
    object.scale.set(1, 1, 1)
  } else {
    object.scale.set(scale * aspectRatio, scale, 1)
  }
}

/**
 * Create a fixed-orientation mesh label (does not auto-billboard)
 */
export function createHotspotLabelMesh(
  position: THREE.Vector3,
  text: string,
  options: HotspotLabelOptions = {}
): THREE.Mesh {
  const {
    fontSize = 16,
    fontFamily = 'Arial',
    color = '#ffffff',
    backgroundColor = 'rgba(25, 25, 30, 0.95)',
    offsetX = 0,
    offsetY = 0,
    borderWidth = 2,
    borderColor = '#00AAFF',
    borderRadius = 6,
    scale = 0.4
  } = options

  const texture = createHotspotLabelTexture(text, {
    fontSize,
    fontFamily,
    color,
    backgroundColor,
    borderWidth,
    borderColor,
    borderRadius
  })

  const baseWidth = (texture.image as HTMLCanvasElement & { __baseWidth?: number }).__baseWidth || texture.image.width
  const baseHeight = (texture.image as HTMLCanvasElement & { __baseHeight?: number }).__baseHeight || texture.image.height
  const aspectRatio = baseWidth / baseHeight
  const geometry = new THREE.PlaneGeometry(scale * aspectRatio, scale)
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.copy(position)
  mesh.position.x += offsetX
  mesh.position.y += offsetY
  mesh.userData.labelScale = scale
  mesh.renderOrder = 1001
  mesh.userData.isHotspotLabel = true
  mesh.userData.faceCamera = false
  mesh.userData.labelText = text
  mesh.visible = true

  return mesh
}

/**
 * Create floating label as sprite (billboard) or mesh (fixed orientation)
 */
export function createHotspotLabelObject(
  position: THREE.Vector3,
  text: string,
  options: HotspotLabelOptions = {}
): THREE.Object3D {
  if (options.faceCamera === false) {
    return createHotspotLabelMesh(position, text, options)
  }
  return createHotspotLabelSprite(position, text, options)
}

/**
 * Create a 3D sprite with text label that always faces camera
 */
export function createHotspotLabelSprite(
  position: THREE.Vector3,
  text: string,
  options: HotspotLabelOptions = {}
): THREE.Sprite {
  const {
    fontSize = 16,
    fontFamily = 'Arial',
    color = '#ffffff',
    backgroundColor = 'rgba(25, 25, 30, 0.95)',
    offsetX = 0, // Horizontal offset (can be overridden)
    offsetY = 0, // Vertical offset (can be overridden)
    borderWidth = 2,
    borderColor = '#00AAFF',
    borderRadius = 6,
    scale = 0.4 // Default label scale - smaller to fit better with content panel
  } = options

  const texture = createHotspotLabelTexture(text, {
    fontSize,
    fontFamily,
    color,
    backgroundColor,
    borderWidth,
    borderColor,
    borderRadius
  })

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    sizeAttenuation: true,
    opacity: 1.0 // Full opacity for crisp appearance
  })

  const sprite = new THREE.Sprite(material)
  sprite.position.copy(position)
  sprite.position.x += offsetX // Horizontal offset relative to hotspot icon
  sprite.position.y += offsetY // Vertical offset relative to hotspot icon
  
  applyHotspotLabelScale(sprite, texture, scale)
  
  sprite.renderOrder = 1001 // Render above hotspot icons
  sprite.userData.isHotspotLabel = true
  sprite.userData.faceCamera = true
  sprite.userData.labelText = text
  sprite.visible = true

  return sprite
}

/**
 * Update an existing hotspot label texture (sprite or mesh)
 */
export function updateHotspotLabelTexture(
  label: THREE.Object3D,
  text: string,
  options: {
    fontSize?: number
    color?: string
    backgroundColor?: string
    borderWidth?: number
    borderColor?: string
    borderRadius?: number
    widthPixels?: number | null
    heightPixels?: number | null
  }
): THREE.CanvasTexture {
  const newTexture = createHotspotLabelTexture(text, {
    fontSize: options.fontSize,
    color: options.color,
    backgroundColor: options.backgroundColor,
    borderWidth: options.borderWidth,
    borderColor: options.borderColor,
    borderRadius: options.borderRadius
  })

  const material = label instanceof THREE.Sprite
    ? label.material as THREE.SpriteMaterial
    : (label as THREE.Mesh).material as THREE.MeshBasicMaterial

  const oldTexture = material.map
  material.map = newTexture
  material.needsUpdate = true
  if (oldTexture) oldTexture.dispose()

  const dimensionsChanged =
    label.userData.labelWidthPixels !== options.widthPixels ||
    label.userData.labelHeightPixels !== options.heightPixels

  if (dimensionsChanged) {
    const pixelsToWorldUnits = 0.01
    let labelScale: number
    if (options.heightPixels !== null && options.heightPixels !== undefined) {
      labelScale = options.heightPixels * pixelsToWorldUnits
    } else if (options.widthPixels !== null && options.widthPixels !== undefined) {
      labelScale = (options.widthPixels / 3) * pixelsToWorldUnits
    } else {
      labelScale = 80 * pixelsToWorldUnits
    }
    applyHotspotLabelScale(label, newTexture, labelScale)
  } else {
    const preservedScale = label.userData.labelScale || label.scale.y
    applyHotspotLabelScale(label, newTexture, preservedScale)
  }

  return newTexture
}

