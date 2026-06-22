import * as THREE from 'three'

/**
 * Icon types for hotspots
 */
export type HotspotIconType = 'default' | 'emoji' | 'custom' | 'custom-image'

/**
 * Create a hotspot icon texture from emoji
 */
export function createEmojiIconTexture(emoji: string, size: number = 256): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, size, size)

  // Modern gradient circle with enhanced shadow and glow
  ctx.save()
  ctx.translate(size / 2, size / 2)
  
  // Enhanced shadow with blur
  ctx.save()
  ctx.shadowColor = 'rgba(0, 0, 0, 0.4)'
  ctx.shadowBlur = size * 0.1
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = size * 0.03
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
  ctx.beginPath()
  ctx.arc(0, size * 0.02, size * 0.38, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  
  // Modern gradient background (glass morphism style)
  const gradient = ctx.createRadialGradient(-size * 0.2, -size * 0.2, 0, 0, 0, size * 0.4)
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.95)')
  gradient.addColorStop(0.5, 'rgba(245, 245, 250, 0.9)')
  gradient.addColorStop(1, 'rgba(235, 235, 245, 0.85)')
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(0, 0, size * 0.38, 0, Math.PI * 2)
  ctx.fill()
  
  // Modern subtle border with gradient
  const borderGradient = ctx.createLinearGradient(-size * 0.4, -size * 0.4, size * 0.4, size * 0.4)
  borderGradient.addColorStop(0, 'rgba(200, 200, 220, 0.4)')
  borderGradient.addColorStop(1, 'rgba(180, 180, 200, 0.3)')
  ctx.strokeStyle = borderGradient
  ctx.lineWidth = size * 0.025
  ctx.stroke()
  
  // Subtle highlight for depth
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'
  ctx.beginPath()
  ctx.arc(-size * 0.1, -size * 0.1, size * 0.15, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // Draw emoji
  ctx.save()
  ctx.translate(size / 2, size / 2)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `bold ${size * 0.5}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`
  ctx.fillText(emoji, 0, 0)
  ctx.restore()

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.generateMipmaps = true
  texture.needsUpdate = true
  return texture
}

/**
 * Create a hotspot icon texture from custom image URL
 */
export async function createCustomImageIconTexture(imageUrl: string, size: number = 256): Promise<THREE.CanvasTexture> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = size
      const ctx = canvas.getContext('2d')!
      ctx.clearRect(0, 0, size, size)

      // Draw shadow
      ctx.save()
      ctx.translate(size / 2, size / 2)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
      ctx.beginPath()
      ctx.arc(0, size * 0.02, size * 0.38, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      // Draw image in circle with clipping
      ctx.save()
      ctx.translate(size / 2, size / 2)
      ctx.beginPath()
      ctx.arc(0, 0, size * 0.38, 0, Math.PI * 2)
      ctx.clip()
      
      // Scale and center image
      const scale = Math.min(size / img.width, size / img.height) * 0.76
      const x = (img.width * scale) / 2
      const y = (img.height * scale) / 2
      ctx.drawImage(img, -x, -y, img.width * scale, img.height * scale)
      ctx.restore()

      // Border
      ctx.save()
      ctx.translate(size / 2, size / 2)
      ctx.strokeStyle = '#cccccc'
      ctx.lineWidth = size * 0.02
      ctx.beginPath()
      ctx.arc(0, 0, size * 0.38, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()

      const texture = new THREE.CanvasTexture(canvas)
      texture.colorSpace = THREE.SRGBColorSpace
      texture.generateMipmaps = true
      texture.needsUpdate = true
      resolve(texture)
    }
    img.onerror = reject
    img.src = imageUrl
  })
}

/**
 * Create a modern hotspot icon texture (circular badge style - clean and professional)
 * Based on modern UI design principles: minimal, clean, with subtle depth
 */
export function createHotspotIconTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  const size = 256
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, size, size)

  const cx = size / 2
  const cy = size / 2
  const radius = size * 0.35

  // Perfect circular shadow below (subtle depth)
  ctx.save()
  ctx.translate(cx, cy + size * 0.02)
  // Use perfect circle for shadow - ensure it's perfectly round
  const shadowRadius = radius * 1.2
  const shadowGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, shadowRadius)
  shadowGradient.addColorStop(0, 'rgba(0, 0, 0, 0.2)')
  shadowGradient.addColorStop(0.5, 'rgba(0, 0, 0, 0.1)')
  shadowGradient.addColorStop(0.8, 'rgba(0, 0, 0, 0.05)')
  shadowGradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = shadowGradient
  ctx.beginPath()
  // Perfect circle - ensure startAngle and endAngle create full circle
  ctx.arc(0, 0, shadowRadius, 0, Math.PI * 2, false)
  ctx.fill()
  ctx.restore()

  // Main circle - modern gradient (blue to cyan)
  ctx.save()
  ctx.translate(cx, cy)
  
  // Outer glow (subtle blue)
  const glowGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 1.3)
  glowGradient.addColorStop(0, 'rgba(74, 158, 255, 0.2)')
  glowGradient.addColorStop(0.6, 'rgba(74, 158, 255, 0.1)')
  glowGradient.addColorStop(1, 'rgba(74, 158, 255, 0)')
  ctx.fillStyle = glowGradient
  ctx.beginPath()
  ctx.arc(0, 0, radius * 1.3, 0, Math.PI * 2)
  ctx.fill()
  
  // Main circle with modern gradient
  const circleGradient = ctx.createRadialGradient(
    -radius * 0.3, -radius * 0.3, 0,
    0, 0, radius
  )
  circleGradient.addColorStop(0, '#4a9eff') // Bright blue
  circleGradient.addColorStop(0.5, '#3d8bf0') // Medium blue
  circleGradient.addColorStop(1, '#2d6cd9') // Darker blue
  ctx.fillStyle = circleGradient
  ctx.beginPath()
  ctx.arc(0, 0, radius, 0, Math.PI * 2)
  ctx.fill()
  
  // Subtle border (modern glass effect)
  const borderGradient = ctx.createLinearGradient(-radius, -radius, radius, radius)
  borderGradient.addColorStop(0, 'rgba(255, 255, 255, 0.3)')
  borderGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.1)')
  borderGradient.addColorStop(1, 'rgba(200, 220, 255, 0.2)')
  ctx.strokeStyle = borderGradient
  ctx.lineWidth = size * 0.015
  ctx.stroke()
  
  // Inner highlight (glass morphism effect)
  const highlightGradient = ctx.createRadialGradient(
    -radius * 0.4, -radius * 0.4, 0,
    -radius * 0.2, -radius * 0.2, radius * 0.5
  )
  highlightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.4)')
  highlightGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.15)')
  highlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = highlightGradient
  ctx.beginPath()
  ctx.arc(-radius * 0.2, -radius * 0.2, radius * 0.5, 0, Math.PI * 2)
  ctx.fill()
  
  // Center dot/indicator (subtle)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
  ctx.beginPath()
  ctx.arc(0, 0, radius * 0.15, 0, Math.PI * 2)
  ctx.fill()
  
  ctx.restore()

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.generateMipmaps = true
  texture.needsUpdate = true
  return texture
}

/**
 * Predefined icon types for quick selection
 */
export const HOTSPOT_ICON_TYPES = {
  default: { label: 'Default Pin', emoji: '📍' },
  info: { label: 'Info', emoji: 'ℹ️' },
  question: { label: 'Question', emoji: '❓' },
  warning: { label: 'Warning', emoji: '⚠️' },
  star: { label: 'Star', emoji: '⭐' },
  heart: { label: 'Heart', emoji: '❤️' },
  fire: { label: 'Fire', emoji: '🔥' },
  checkmark: { label: 'Checkmark', emoji: '✅' },
  exclamation: { label: 'Exclamation', emoji: '❗' },
  arrow: { label: 'Arrow', emoji: '➡️' },
  camera: { label: 'Camera', emoji: '📷' },
  video: { label: 'Video', emoji: '🎥' },
  image: { label: 'Image', emoji: '🖼️' },
  link: { label: 'Link', emoji: '🔗' },
  home: { label: 'Home', emoji: '🏠' },
  building: { label: 'Building', emoji: '🏢' },
  car: { label: 'Car', emoji: '🚗' },
  flag: { label: 'Flag', emoji: '🚩' },
  trophy: { label: 'Trophy', emoji: '🏆' },
  bell: { label: 'Bell', emoji: '🔔' },
  lock: { label: 'Lock', emoji: '🔒' },
  unlock: { label: 'Unlock', emoji: '🔓' },
  key: { label: 'Key', emoji: '🗝️' },
  search: { label: 'Search', emoji: '🔍' },
  settings: { label: 'Settings', emoji: '⚙️' },
  music: { label: 'Music', emoji: '🎵' },
  mail: { label: 'Mail', emoji: '📧' },
  phone: { label: 'Phone', emoji: '📞' },
  globe: { label: 'Globe', emoji: '🌐' },
  lightbulb: { label: 'Lightbulb', emoji: '💡' },
  gift: { label: 'Gift', emoji: '🎁' },
  tag: { label: 'Tag', emoji: '🏷️' },
  bookmark: { label: 'Bookmark', emoji: '🔖' },
  diamond: { label: 'Diamond', emoji: '💎' },
  rocket: { label: 'Rocket', emoji: '🚀' },
  thumbsUp: { label: 'Thumbs Up', emoji: '👍' },
  thumbsDown: { label: 'Thumbs Down', emoji: '👎' },
  smile: { label: 'Smile', emoji: '😊' },
  party: { label: 'Party', emoji: '🎉' },
}

/**
 * Popular emojis for hotspots
 */
export const POPULAR_EMOJIS = [
  '📍', 'ℹ️', '❓', '⚠️', '⭐', '❤️', '🔥', '✅', '❗', '➡️',
  '📷', '🎥', '🖼️', '🔗', '🏠', '🏢', '🚗', '🚩', '🏆', '🔔',
  '🔒', '🔓', '🗝️', '🔍', '⚙️', '🎵', '📧', '📞', '🌐', '💡',
  '🎁', '🏷️', '🔖', '💎', '🚀', '👍', '👎', '😊', '🎉', '🎊',
  '🌟', '✨', '🎈', '🎀', '🎂', '🍕', '☕', '🚀', '🎮', '🎯',
]

/**
 * Create a 3D hotspot marker (sprite that always faces camera with helper sphere for easier clicking)
 */
export async function createHotspotMarker(
  position: THREE.Vector3,
  id: string,
  name: string,
  icon?: { type: HotspotIconType; value: string }
): Promise<THREE.Group> {
  let texture: THREE.CanvasTexture | THREE.Texture

  if (icon) {
    if (icon.type === 'emoji') {
      texture = createEmojiIconTexture(icon.value)
    } else if (icon.type === 'custom-image') {
      texture = await createCustomImageIconTexture(icon.value)
    } else {
      // Default or custom (use default for now)
      texture = createHotspotIconTexture()
    }
  } else {
    texture = createHotspotIconTexture()
  }

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: true, // Changed to true for better visibility
    depthWrite: false,
    sizeAttenuation: true,
    opacity: 1.0 // Increased opacity for better visibility
  })

  const sprite = new THREE.Sprite(material)
  sprite.position.set(0, 0, 0) // Relative to group (group will be positioned)
  // Reasonable size to avoid taking too much space
  sprite.scale.setScalar(1.2) // Adjusted for better spacing
  sprite.renderOrder = 1000 // Render on top
  sprite.userData.isHotspot = true
  sprite.userData.hotspotId = id
  sprite.userData.hotspotName = name
  sprite.userData.baseScale = 1.2 // Store base scale for hover effects
  sprite.visible = true // Ensure visibility
  
  // Create invisible helper sphere for easier clicking (larger hit area)
  const helperGeometry = new THREE.SphereGeometry(0.3, 16, 16) // Invisible helper sphere
  const helperMaterial = new THREE.MeshBasicMaterial({
    visible: false, // Invisible but still clickable
    transparent: true,
    opacity: 0
  })
  const helperSphere = new THREE.Mesh(helperGeometry, helperMaterial)
  helperSphere.position.set(0, 0, 0) // Relative to group (group will be positioned)
  helperSphere.renderOrder = 999 // Render before sprite
  helperSphere.userData.isHotspot = true
  helperSphere.userData.hotspotId = id
  helperSphere.userData.hotspotName = name
  helperSphere.userData.isHotspotHelper = true // Mark as helper for easier detection
  helperSphere.userData.associatedSprite = sprite // Link to sprite
  sprite.userData.helperSphere = helperSphere // Link back
  
  // Create group to hold both sprite and helper
  const group = new THREE.Group()
  group.add(sprite)
  group.add(helperSphere)
  group.position.copy(position) // Group position is the absolute world position
  group.userData.isHotspot = true
  group.userData.hotspotId = id
  group.userData.hotspotName = name
  group.userData.baseScale = 1.2
  group.userData.hotspotSprite = sprite
  group.userData.hotspotHelper = helperSphere

  return group as any // Return group instead of sprite for easier interaction
}

/**
 * Extract YouTube video ID from URL or ID string
 */
export function extractYouTubeId(input: string): string | null {
  if (!input) return null
  
  // If it's already just an ID (11 characters, alphanumeric, dashes, underscores)
  if (/^[a-zA-Z0-9_-]{11}$/.test(input.trim())) {
    return input.trim()
  }
  
  // Try to extract from URL
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/, // Added /live/ support
    /youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/live\/([a-zA-Z0-9_-]{11})/ // Explicit live URL pattern
  ]
  
  for (const pattern of patterns) {
    const match = input.match(pattern)
    if (match && match[1]) {
      return match[1]
    }
  }
  
  return null
}

/**
 * Extract YouTube share identifier (si parameter) from URL if present
 */
export function extractYouTubeSi(input: string): string | null {
  if (!input) return null
  
  // Try to extract si parameter from URL
  const siMatch = input.match(/[?&]si=([a-zA-Z0-9_-]+)/)
  if (siMatch && siMatch[1]) {
    return siMatch[1]
  }
  
  return null
}

