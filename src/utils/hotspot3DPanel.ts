import * as THREE from 'three'
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js'
import { extractYouTubeId, extractYouTubeSi } from './hotspotUtils'
import { useAppStore } from '../store/useAppStore'

// Video manager to handle video element lifecycle and frame updates
const videoManager = new Map<string, {
  video: HTMLVideoElement
  texture: THREE.CanvasTexture
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  animationFrameId: number | null
}>()

/**
 * Clean up video resources for a specific video ID
 */
export function cleanupVideoResources(videoId: string): void {
  const videoData = videoManager.get(videoId)
  if (videoData) {
    // Cancel animation frame if active
    if (videoData.animationFrameId !== null) {
      cancelAnimationFrame(videoData.animationFrameId)
    }
    // Pause and clean up video element
    if (videoData.video) {
      videoData.video.pause()
      videoData.video.src = ''
      videoData.video.load()
    }
    // Dispose texture
    if (videoData.texture) {
      videoData.texture.dispose()
    }
    // Remove from manager
    videoManager.delete(videoId)
  }
}

/**
 * Clean up all video resources (for cleanup on hotspot removal)
 */
export function cleanupAllVideoResources(): void {
  videoManager.forEach((videoData, videoId) => {
    cleanupVideoResources(videoId)
  })
  videoManager.clear()
}

/**
 * Clean up video resources associated with a canvas
 */
export function cleanupVideoResourcesForCanvas(canvas: HTMLCanvasElement): void {
  const videoId = (canvas as any).__videoId
  if (videoId) {
    cleanupVideoResources(videoId)
    delete (canvas as any).__video
    delete (canvas as any).__videoId
  }
}

/**
 * Get YouTube thumbnail URL from video ID
 */
function getYouTubeThumbnail(videoId: string, quality: 'maxresdefault' | 'hqdefault' | 'mqdefault' = 'maxresdefault'): string {
  return `https://img.youtube.com/vi/${videoId}/${quality}.jpg`
}

export interface Hotspot3DPanelConfig {
  title: string
  content?: string
  contentType?: 'text' | 'image' | 'youtube' | 'video' | 'interactive' | 'html'
  contentData?: string
  isOpen: boolean
  backgroundColor?: string
  textColor?: string
  fontSize?: number
  fontFamily?: string // Font family for text content
  bold?: boolean // Bold text
  italic?: boolean // Italic text
  underline?: boolean // Underline text
  borderRadius?: number
  padding?: number
  maxWidth?: number
  maxHeight?: number
  iconUrl?: string // Custom icon URL or data URL
  iconSymbol?: string // Symbol like '+', '-', or emoji
  textAlign?: 'left' | 'center' | 'right' // Text alignment for content
  titleAlign?: 'left' | 'center' | 'right' // Text alignment for title
  borderWidth?: number // Panel border width (default: 2)
  borderColor?: string // Panel border color (default: '#00AAFF')
  labelBorderWidth?: number // Label border width (default: 2)
  labelBorderColor?: string // Label border color (default: '#00AAFF')
  labelBorderRadius?: number // Label border radius (default: 6)
  panelWidthPixels?: number | null // Panel width in pixels (null = auto based on content)
  panelHeightPixels?: number | null // Panel height in pixels (null = auto based on content)
}

/**
 * Create a 3D floating panel texture for hotspots
 * Matches the design shown in the user's images: rounded rectangle with semi-transparent background
 * Dynamically scales based on content size
 */
export function createHotspot3DPanelTexture(config: Hotspot3DPanelConfig): THREE.CanvasTexture {
  // Reduced logging to prevent console spam and flickering
  // Only log on first creation, not on every update
  // if (config.contentType === 'youtube' || config.contentType === 'video') {
  //   console.log('[hotspot3DPanel] Creating video panel texture:', {
  //     title: config.title,
  //     contentType: config.contentType,
  //     hasContentData: !!config.contentData
  //   })
  // }
  const {
    title,
    content,
    contentType = 'text',
    contentData,
    isOpen,
    backgroundColor = 'rgba(25, 25, 30, 0.98)', // Modern dark theme with glass morphism - more opaque
    textColor = '#ffffff', // Bright white text for better contrast
    fontSize = 17, // Slightly larger for readability
    fontFamily = 'Arial, sans-serif', // Font family for text
    bold = false, // Bold text
    italic = false, // Italic text
    underline = false, // Underline text
    borderRadius = 12, // More modern, rounded corners (fixed value)
    padding = 16,
    maxWidth = 400, // Increased default max width for better scalability
    maxHeight = 600, // Increased default max height
    textAlign = 'left', // Default text alignment
    titleAlign = 'left', // Default title alignment
    borderWidth = 2, // Panel border width
    borderColor = '#00AAFF' // Panel border color (matches CSS3D default)
  } = config
  

  // For closed state, use minimal size
  const isClosed = !isOpen

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!

  // Measure title
  ctx.font = `bold ${fontSize + 4}px Arial, sans-serif`
  const titleMetrics = ctx.measureText(title || 'Untitled')
  const titleWidth = titleMetrics.width
  const titleHeight = fontSize + 8
  const titlePadding = padding // Space after title

  let contentHeight = 0
  let contentWidth = titleWidth
  let calculatedMaxWidth = maxWidth

  // For all content types, always show content (regardless of isOpen state)
  // Use 12x size like HTML content, and no titles
  if (content && contentType === 'text') {
    // Measure content text (wrapped) - use 12x size like HTML
    ctx.font = `${fontSize}px Arial, sans-serif`
    
    // First, measure the longest single line to determine if we need wrapping
    const singleLineWidth = ctx.measureText(content).width
    
    // Calculate available width (account for padding) - use 12x size
    const availableWidth = Math.max((maxWidth * 12) - padding * 2, 2400) // 12x width, minimum 2400px
    
    // If text fits on one line, use that width; otherwise wrap
    let lines: string[]
    let maxLineWidth: number
    
    if (singleLineWidth <= availableWidth) {
      // Text fits on one line - use actual text width (no artificial cap)
      lines = [content]
      maxLineWidth = singleLineWidth
      
      // For single-line text, contentWidth should be the actual text width (no title needed)
      contentWidth = Math.max(
        maxLineWidth, // Actual text width
        300 // Minimum readable width (no title needed)
      )
      
      // Panel width should accommodate content (no title)
      calculatedMaxWidth = Math.max(
        contentWidth + padding * 2, // Content + padding
        singleLineWidth + padding * 2, // Ensure single-line text fits with padding
        Math.min(maxWidth * 12, 1200) // 12x max width
      )
      
    } else {
      // Text needs wrapping - use maxWidth constraint
      lines = wrapText(ctx, content, availableWidth)
      maxLineWidth = Math.max(...lines.map(line => ctx.measureText(line).width))
      
      // For wrapped text, contentWidth should be based on wrapped lines (up to availableWidth)
      contentWidth = Math.max(
        maxLineWidth, // Actual max line width from wrapping
        300 // Minimum readable width (no title needed)
      )
      
      // Don't exceed available width for wrapped text
      contentWidth = Math.min(contentWidth, availableWidth)
      
      // Panel width should accommodate content (no title), use 12x size
      calculatedMaxWidth = Math.max(
        contentWidth + padding * 2, // Content + padding
        Math.min(maxWidth * 12, 1200) // 12x max width
      )
      
      // Cap at 12x maxWidth for wrapped text
      calculatedMaxWidth = Math.min(calculatedMaxWidth, maxWidth * 12)
    }
    
    // FIXED: Use fixed canvas height based on maxHeight, NOT fontSize
    // This ensures panel size stays constant when font size changes
    // Larger fonts will simply take up more space within the fixed panel
    const baseCanvasHeight = maxHeight * 12 // Fixed canvas height at 12x resolution
    contentHeight = Math.max(lines.length * (fontSize * 1.4), baseCanvasHeight * 0.8) // 80% of max for content
    contentHeight = Math.min(contentHeight, baseCanvasHeight - padding * 2)
    
    // Ensure minimum width for readability
    calculatedMaxWidth = Math.max(calculatedMaxWidth, 300)
    
  } else if (contentType === 'image') {
    // For images, calculate size based on image aspect ratio - use 12x size
    // We'll load the image to get its actual dimensions (async, but for now use placeholder)
    // Always calculate size, even if contentData is not set
    const imageAspectRatio = 16 / 9 // Default aspect ratio
    const maxImageWidth = Math.min((maxWidth * 12) - padding * 2, 4800) // 12x width
    const maxImageHeight = (maxHeight * 12) - padding * 2 // 12x height, no title space
    
    let imageWidth = maxImageWidth
    let imageHeight = imageWidth / imageAspectRatio
    
    // Ensure image fits within max height
    if (imageHeight > maxImageHeight) {
      imageHeight = maxImageHeight
      imageWidth = imageHeight * imageAspectRatio
    }
    
    // Ensure minimum size (larger for 12x scale)
    imageWidth = Math.max(imageWidth, 600)
    imageHeight = Math.max(imageHeight, 450)
    
    contentWidth = imageWidth
    contentHeight = imageHeight
    
    calculatedMaxWidth = Math.max(imageWidth + padding * 2, Math.min(maxWidth * 12, 4800)) // 12x max width, no title
    
  } else if (contentType === 'youtube' || contentType === 'video') {
    // For video, use standard video aspect ratio (16:9) - use 12x size
    // Always calculate size for video/youtube, regardless of contentData
    const videoAspectRatio = 16 / 9
    const maxVideoWidth = Math.min((maxWidth * 12) - padding * 2, 4800) // 12x width
    const maxVideoHeight = (maxHeight * 12) - padding * 2 // 12x height, no title space
    
    let videoWidth = maxVideoWidth
    let videoHeight = videoWidth / videoAspectRatio
    
    // Ensure video fits within max height
    if (videoHeight > maxVideoHeight) {
      videoHeight = maxVideoHeight
      videoWidth = videoHeight * videoAspectRatio
    }
    
    // Ensure minimum size (larger for 12x scale)
    videoWidth = Math.max(videoWidth, 960)
    videoHeight = Math.max(videoHeight, 540)
    
    contentWidth = videoWidth
    contentHeight = videoHeight
    
    calculatedMaxWidth = Math.max(videoWidth + padding * 2, Math.min(maxWidth * 12, 4800)) // 12x max width, no title
    
  } else if (contentType === 'interactive') {
    // For interactive content (iframe), use 12x size
    contentWidth = Math.min((maxWidth * 12) - padding * 2, 4800) // 12x width
    contentHeight = Math.min(3600, (maxHeight * 12) - padding * 2) // 12x height, no title space
    calculatedMaxWidth = Math.max(contentWidth + padding * 2, Math.min(maxWidth * 12, 4800)) // 12x max width, no title
  }
  
  // For HTML content, always show preview (regardless of isOpen state)
  // This allows users to see HTML content in the 3D panel even when closed
  if (contentType === 'html') {
    // For HTML content, show preview of content (2x bigger than before)
    // Strip HTML tags to get text preview
    const htmlText = contentData ? stripHtmlTags(contentData) : ''
    if (htmlText) {
      // Measure content text (wrapped) - use 12x the size for very large panel
      ctx.font = `${fontSize}px Arial, sans-serif`
      
      // Use 12x the width and height for HTML content (always show, even when closed)
      const availableWidth = Math.max((maxWidth * 12) - padding * 2, 2400) // 12x width
      const singleLineWidth = ctx.measureText(htmlText).width
      
      let lines: string[]
      let maxLineWidth: number
      
      if (singleLineWidth <= availableWidth) {
        lines = [htmlText]
        maxLineWidth = singleLineWidth
      } else {
        lines = wrapText(ctx, htmlText, availableWidth)
        maxLineWidth = Math.max(...lines.map(line => ctx.measureText(line).width))
      }
      
      contentWidth = Math.max(
        maxLineWidth,
        300 // Minimum width (no title needed)
      )
      contentWidth = Math.min(contentWidth, availableWidth)
      
      // 12x the height for very large panel
      contentHeight = Math.max(lines.length * (fontSize * 1.4), fontSize * 1.4 * 12)
      contentHeight = Math.min(contentHeight, (maxHeight * 12) - padding * 2) // 12x max height, no title space needed
      
      calculatedMaxWidth = Math.max(
        contentWidth + padding * 2,
        Math.min(maxWidth * 12, 1200) // 12x max width, no title width needed
      )
      calculatedMaxWidth = Math.min(calculatedMaxWidth, maxWidth * 12)
    } else {
      // Fallback if no content
      contentWidth = Math.min((maxWidth * 12) - padding * 2, 4800) // 12x width
      contentHeight = Math.min(3000, (maxHeight * 12) - padding * 2) // 12x height, no title space
      calculatedMaxWidth = Math.max(contentWidth + padding * 2, 1200)
    }
  }

  // Calculate final canvas size with proper scaling
  // For all content types, use 12x maxWidth (always show, regardless of isOpen)
  let finalPanelWidth: number
  
  if (contentType === 'text' && content) {
    // Check if text fits on one line
    ctx.font = `${fontSize}px Arial, sans-serif`
    const singleLineWidth = ctx.measureText(content).width
    const availableWidth = Math.max((maxWidth * 12) - padding * 2, 2400)
    
    if (singleLineWidth <= availableWidth) {
      // Text fits on one line - use calculated width (12x size)
      finalPanelWidth = Math.max(
        calculatedMaxWidth,
        singleLineWidth + padding * 2
      )
      // Cap at 12x maxWidth
      finalPanelWidth = Math.min(finalPanelWidth, maxWidth * 12)
    } else {
      // Text needs wrapping - cap at 12x maxWidth
      finalPanelWidth = Math.min(
        calculatedMaxWidth,
        maxWidth * 12
      )
    }
  } else {
    // For all other content types (html, image, video, interactive), use 12x maxWidth
    finalPanelWidth = Math.min(calculatedMaxWidth, maxWidth * 12)
  }
  
  // Ensure minimum width
  finalPanelWidth = Math.max(finalPanelWidth, titleWidth + padding * 2, 200)
  
  // For HTML content, always show content (regardless of isOpen state)
  // For all content types, always show content (regardless of isOpen state)
  // Don't include title height (no title shown)
  // For all content types, if we calculated contentHeight, use it (even if content/contentData is empty)
  const hasContent = contentHeight > 0
  let panelHeight = hasContent
    ? contentHeight + padding * 2 // All types: just content + padding (no title)
    : Math.max(titleHeight + padding * 2, 200) // Fallback: minimum height for visibility
  
  // Override with user-specified dimensions if provided
  // Use 2x resolution for retina displays (not 12x which creates huge textures)
  const userDimensionScale = 2
  if (config.panelWidthPixels !== null && config.panelWidthPixels !== undefined) {
    finalPanelWidth = config.panelWidthPixels * userDimensionScale
  }
  if (config.panelHeightPixels !== null && config.panelHeightPixels !== undefined) {
    panelHeight = config.panelHeightPixels * userDimensionScale
  }

  // Use power-of-2 dimensions for better GPU performance (optional, but helpful)
  const powerOfTwoWidth = Math.pow(2, Math.ceil(Math.log2(finalPanelWidth)))
  const powerOfTwoHeight = Math.pow(2, Math.ceil(Math.log2(panelHeight)))
  
  // Use power-of-2 only if it's not too much larger (max 1.5x larger)
  const finalWidth = (powerOfTwoWidth / finalPanelWidth <= 1.5) ? powerOfTwoWidth : Math.ceil(finalPanelWidth)
  const finalHeight = (powerOfTwoHeight / panelHeight <= 1.5) ? powerOfTwoHeight : Math.ceil(panelHeight)

  canvas.width = finalWidth
  canvas.height = finalHeight
  
  // Store actual panel size on canvas for proper rendering (using property on canvas element)
  ;(canvas as any).__actualWidth = finalPanelWidth
  ;(canvas as any).__actualHeight = panelHeight

  // Clear and redraw
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  
  // Get actual panel dimensions (may differ from canvas size if using power-of-2)
  const actualPanelWidth = (canvas as any).__actualWidth || finalPanelWidth
  const actualPanelHeight = (canvas as any).__actualHeight || panelHeight
  
  // Scale context to match actual panel dimensions (important for power-of-2 canvas)
  // Scale UP so logical coordinates (0 to actualPanelWidth) map correctly to canvas
  const scaleX = canvas.width / actualPanelWidth
  const scaleY = canvas.height / actualPanelHeight
  ctx.save()
  ctx.scale(scaleX, scaleY)

  // Draw modern card background with glass morphism effect
  const cornerRadius = borderRadius // Use different variable name to avoid conflicts
  
  // Helper function to parse any color format to RGB
  const parseColorToRGB = (color: string): { r: number, g: number, b: number, a: number } | null => {
    // Handle hex colors (#rgb, #rrggbb, #rrggbbaa)
    if (color.startsWith('#')) {
      let hex = color.slice(1)
      if (hex.length === 3) {
        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
      }
      if (hex.length === 6 || hex.length === 8) {
        const r = parseInt(hex.slice(0, 2), 16)
        const g = parseInt(hex.slice(2, 4), 16)
        const b = parseInt(hex.slice(4, 6), 16)
        const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1
        return { r, g, b, a }
      }
    }
    // Handle rgba/rgb colors
    const rgbaMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+),?\s*([\d.]+)?\)/)
    if (rgbaMatch) {
      return {
        r: parseInt(rgbaMatch[1]),
        g: parseInt(rgbaMatch[2]),
        b: parseInt(rgbaMatch[3]),
        a: rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 1
      }
    }
    return null
  }
  
  // Create gradient background (modern glass morphism style)
  let bgGradient: CanvasGradient
  const parsedBg = backgroundColor && backgroundColor !== 'transparent' ? parseColorToRGB(backgroundColor) : null
  
  if (parsedBg) {
    const { r, g, b, a } = parsedBg
    // Create subtle gradient for depth
    bgGradient = ctx.createLinearGradient(0, 0, 0, actualPanelHeight)
    bgGradient.addColorStop(0, `rgba(${Math.min(r + 10, 255)}, ${Math.min(g + 10, 255)}, ${Math.min(b + 10, 255)}, ${a * 0.98})`)
    bgGradient.addColorStop(1, `rgba(${Math.max(r - 5, 0)}, ${Math.max(g - 5, 0)}, ${Math.max(b - 5, 0)}, ${a * 0.95})`)
  } else {
    // Default modern gradient for dark theme - MORE VISIBLE
    bgGradient = ctx.createLinearGradient(0, 0, 0, actualPanelHeight)
    bgGradient.addColorStop(0, 'rgba(35, 35, 42, 0.98)')
    bgGradient.addColorStop(0.5, 'rgba(25, 25, 30, 0.96)')
    bgGradient.addColorStop(1, 'rgba(20, 20, 25, 0.94)')
  }
  
  // Draw enhanced shadow first (for dramatic depth - MORE VISIBLE)
  ctx.save()
  ctx.shadowColor = 'rgba(0, 0, 0, 0.7)'
  ctx.shadowBlur = 35
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 15
  
  // Draw background with rounded corners (properly rounded)
  ctx.fillStyle = bgGradient
  ctx.beginPath()
  ctx.moveTo(cornerRadius, 0)
  ctx.lineTo(actualPanelWidth - cornerRadius, 0)
  ctx.quadraticCurveTo(actualPanelWidth, 0, actualPanelWidth, cornerRadius)
  ctx.lineTo(actualPanelWidth, actualPanelHeight - cornerRadius)
  ctx.quadraticCurveTo(actualPanelWidth, actualPanelHeight, actualPanelWidth - cornerRadius, actualPanelHeight)
  ctx.lineTo(cornerRadius, actualPanelHeight)
  ctx.quadraticCurveTo(0, actualPanelHeight, 0, actualPanelHeight - cornerRadius)
  ctx.lineTo(0, cornerRadius)
  ctx.quadraticCurveTo(0, 0, cornerRadius, 0)
  ctx.closePath()
  ctx.fill()
  
  // Draw modern glowing border with rounded corners (customizable)
  if (borderWidth > 0 && borderColor) {
    // Parse border color (support hex, rgb, rgba)
    let strokeColor = borderColor
    let shadowColor = borderColor
    
    if (borderColor.startsWith('#')) {
      // Convert hex to rgba for glow effect
      const hex = borderColor.slice(1)
      const r = parseInt(hex.slice(0, 2), 16)
      const g = parseInt(hex.slice(2, 4), 16)
      const b = parseInt(hex.slice(4, 6), 16)
      strokeColor = `rgba(${r}, ${g}, ${b}, 0.8)`
      shadowColor = `rgba(${r}, ${g}, ${b}, 0.3)`
    } else if (borderColor.startsWith('rgba')) {
      // Extract rgba values and adjust opacity for shadow
      const rgbaMatch = borderColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+),?\s*([\d.]+)?\)/)
      if (rgbaMatch) {
        const r = parseInt(rgbaMatch[1])
        const g = parseInt(rgbaMatch[2])
        const b = parseInt(rgbaMatch[3])
        shadowColor = `rgba(${r}, ${g}, ${b}, 0.3)`
      }
    }
    
    ctx.strokeStyle = strokeColor
    ctx.lineWidth = borderWidth
    ctx.shadowColor = shadowColor
    ctx.shadowBlur = 8
    ctx.beginPath()
    ctx.moveTo(cornerRadius, 0)
    ctx.lineTo(actualPanelWidth - cornerRadius, 0)
    ctx.quadraticCurveTo(actualPanelWidth, 0, actualPanelWidth, cornerRadius)
    ctx.lineTo(actualPanelWidth, actualPanelHeight - cornerRadius)
    ctx.quadraticCurveTo(actualPanelWidth, actualPanelHeight, actualPanelWidth - cornerRadius, actualPanelHeight)
    ctx.lineTo(cornerRadius, actualPanelHeight)
    ctx.quadraticCurveTo(0, actualPanelHeight, 0, actualPanelHeight - cornerRadius)
    ctx.lineTo(0, cornerRadius)
    ctx.quadraticCurveTo(0, 0, cornerRadius, 0)
    ctx.closePath()
    ctx.stroke()
  }
  
  // Reset shadow after border
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  
  // Draw close button (X) in top-right corner
  // Get x button settings from store
  const store = useAppStore.getState()
  const closeButtonSize = store.xButtonSize || 32 // Use store value or default
  const closeButtonPadding = 12 // More padding from edge
  const closeButtonX = actualPanelWidth - closeButtonSize - closeButtonPadding
  const closeButtonY = closeButtonPadding
  
  // Parse color from store (supports rgba, rgb, hex, etc.)
  let closeButtonColor = store.xButtonColor || 'rgba(255, 0, 0, 0.9)'
  // If color is in hex format, convert to rgba
  if (closeButtonColor.startsWith('#')) {
    const hex = closeButtonColor.replace('#', '')
    const r = parseInt(hex.substring(0, 2), 16)
    const g = parseInt(hex.substring(2, 4), 16)
    const b = parseInt(hex.substring(4, 6), 16)
    const a = hex.length === 8 ? parseInt(hex.substring(6, 8), 16) / 255 : 0.9
    closeButtonColor = `rgba(${r}, ${g}, ${b}, ${a})`
  }
  
  // Draw close button background (circular with shadow for visibility)
  ctx.save()
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)'
  ctx.shadowBlur = 4
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 2
  ctx.fillStyle = closeButtonColor // Use store color
  ctx.beginPath()
  ctx.arc(closeButtonX + closeButtonSize / 2, closeButtonY + closeButtonSize / 2, closeButtonSize / 2, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  
  // Draw X icon (thicker and more visible)
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 3 // Thicker line
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const iconPadding = 8 // More padding inside circle
  ctx.beginPath()
  ctx.moveTo(closeButtonX + iconPadding, closeButtonY + iconPadding)
  ctx.lineTo(closeButtonX + closeButtonSize - iconPadding, closeButtonY + closeButtonSize - iconPadding)
  ctx.moveTo(closeButtonX + closeButtonSize - iconPadding, closeButtonY + iconPadding)
  ctx.lineTo(closeButtonX + iconPadding, closeButtonY + closeButtonSize - iconPadding)
  ctx.stroke()
  
  // Store close button bounds for click detection (relative to panel top-left)
  ;(canvas as HTMLCanvasElement & {
    __closeButtonBounds?: { x: number; y: number; width: number; height: number }
  }).__closeButtonBounds = {
    x: closeButtonX,
    y: closeButtonY,
    width: closeButtonSize,
    height: closeButtonSize
  }
  
  // Draw prominent highlight on top edge (for glass effect)
  const highlightGradient = ctx.createLinearGradient(0, 0, 0, cornerRadius * 3)
  highlightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.25)')
  highlightGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.1)')
  highlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = highlightGradient
  ctx.beginPath()
  ctx.moveTo(cornerRadius, 0)
  ctx.lineTo(actualPanelWidth - cornerRadius, 0)
  ctx.quadraticCurveTo(actualPanelWidth, 0, actualPanelWidth, cornerRadius)
  ctx.lineTo(actualPanelWidth, 0)
  ctx.lineTo(0, 0)
  ctx.lineTo(0, cornerRadius)
  ctx.quadraticCurveTo(0, 0, cornerRadius, 0)
  ctx.closePath()
  ctx.fill()

  // Draw title with modern typography (improved font and styling)
  // Skip title for all content types (user requested no title for content panels)
  if (false) { // Never show title for content panels
    const titleFontSize = fontSize + 4
    ctx.font = `600 ${titleFontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif`
    
    // Modern title styling with subtle shadow for readability
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)'
    ctx.shadowBlur = 2
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 1
    
    ctx.fillStyle = textColor
    ctx.textAlign = titleAlign
    ctx.textBaseline = 'top'
    
    let titleX = padding
    if (titleAlign === 'center') {
      titleX = actualPanelWidth / 2
    } else if (titleAlign === 'right') {
      titleX = actualPanelWidth - padding
    }
    
    ctx.fillText(title || 'Untitled', titleX, padding)
  }
  
  // Reset shadow for content
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 0

  // Draw content for all types (always show, regardless of isOpen state)
  if (content && contentType === 'text') {
    // Build font string with formatting options
    let fontStyle = ''
    let fontWeight = 'normal'
    if (bold) {
      fontWeight = 'bold'
    }
    if (italic) {
      fontStyle = 'italic'
    }
    
    // Construct font string: [style] [weight] size fontFamily
    const fontParts: string[] = []
    if (fontStyle) fontParts.push(fontStyle)
    if (fontWeight !== 'normal') fontParts.push(fontWeight)
    fontParts.push(`${fontSize}px`)
    fontParts.push(fontFamily || 'Arial, sans-serif')
    
    ctx.font = fontParts.join(' ')
    
    // Subtle shadow for text readability
    ctx.shadowColor = 'rgba(0, 0, 0, 0.2)'
    ctx.shadowBlur = 1
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 0.5
    
    ctx.fillStyle = textColor
    ctx.textAlign = textAlign
    ctx.textBaseline = 'top'
    
    // Set underline if needed (will be drawn manually)
    if (underline) {
      ctx.strokeStyle = textColor
      ctx.lineWidth = Math.max(1, fontSize / 20) // Underline thickness based on font size
    }
    
    // Use actual panel width minus padding for text wrapping
    const textWidth = actualPanelWidth - padding * 2
    
    // Calculate text X position based on alignment
    let textX = padding
    if (textAlign === 'center') {
      textX = actualPanelWidth / 2
    } else if (textAlign === 'right') {
      textX = actualPanelWidth - padding
    }
    
    // Measure if text fits on one line
    const singleLineWidth = ctx.measureText(content).width
    let lines: string[]
    
    if (singleLineWidth <= textWidth) {
      // Text fits on one line - draw it directly
      lines = [content]
    } else {
      // Text needs wrapping - wrap based on available width
      lines = wrapText(ctx, content, textWidth)
    }
    
    // For all content types, start from top (no title offset)
    let y = padding
    lines.forEach((line) => {
      // Ensure text doesn't overflow - clip if necessary
      const lineWidth = ctx.measureText(line).width
      let displayLine = line
      if (lineWidth > textWidth) {
        // Text is too long, draw with ellipsis
        while (ctx.measureText(displayLine + '...').width > textWidth && displayLine.length > 0) {
          displayLine = displayLine.slice(0, -1)
        }
        displayLine = displayLine + '...'
      }
      
      // Draw text
      ctx.fillText(displayLine, textX, y)
      
      // Draw underline if needed
      if (underline) {
        const metrics = ctx.measureText(displayLine)
        const underlineY = y + fontSize + 2 // Position underline below text
        const underlineStartX = textAlign === 'center' 
          ? textX - metrics.width / 2 
          : textAlign === 'right'
          ? textX - metrics.width
          : textX
        ctx.beginPath()
        ctx.moveTo(underlineStartX, underlineY)
        ctx.lineTo(underlineStartX + metrics.width, underlineY)
        ctx.stroke()
      }
      
      y += fontSize * 1.4
    })
    
    // Reset shadow and stroke
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 0
    if (underline) {
      ctx.strokeStyle = 'transparent'
      ctx.lineWidth = 1
    }
  } else if (contentType === 'image') {
    // Draw image placeholder (centered if image is narrower than panel) - no title offset
    // Always render image placeholder, even if contentData is not set
    if (contentWidth > 0 && contentHeight > 0) {
      const imageX = padding + Math.max(0, (actualPanelWidth - padding * 2 - contentWidth) / 2)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.1)'
      ctx.fillRect(
        imageX,
        padding,
        contentWidth,
        contentHeight
      )
      ctx.fillStyle = textColor
      ctx.font = `${fontSize}px Arial, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(
        '[Image]',
        imageX + contentWidth / 2,
        padding + contentHeight / 2
      )
    }
  } else if (contentType === 'youtube' || contentType === 'video') {
    // Draw video content (centered if video is narrower than panel) - no title offset
    // Always render video content, even if contentData is not set
    // If contentWidth/contentHeight weren't calculated, use defaults
    const videoWidth = contentWidth > 0 ? contentWidth : Math.min((maxWidth * 12) - padding * 2, 4800)
    const videoHeight = contentHeight > 0 ? contentHeight : videoWidth / (16 / 9)
    
    const videoX = padding + Math.max(0, (actualPanelWidth - padding * 2 - videoWidth) / 2)
    const videoY = padding
    
    // Ensure coordinates are within bounds
    const clampedVideoX = Math.max(0, Math.min(videoX, actualPanelWidth - videoWidth))
    const clampedVideoY = Math.max(0, Math.min(videoY, actualPanelHeight - videoHeight))
    const clampedVideoWidth = Math.min(videoWidth, actualPanelWidth - clampedVideoX)
    const clampedVideoHeight = Math.min(videoHeight, actualPanelHeight - clampedVideoY)
    
    // Draw background
    ctx.fillStyle = 'rgba(20, 30, 50, 1.0)'
    ctx.fillRect(
      clampedVideoX,
      clampedVideoY,
      clampedVideoWidth,
      clampedVideoHeight
    )
    
    // Try to load and draw actual video content asynchronously
    if (contentData) {
      // Calculate scale values (same as in main drawing code)
      const scaleX = canvas.width / actualPanelWidth
      const scaleY = canvas.height / actualPanelHeight
      
      // Store drawing parameters for async callbacks
      const drawParams = {
        canvas,
        ctx,
        texture: null as THREE.CanvasTexture | null,
        videoX: clampedVideoX,
        videoY: clampedVideoY,
        videoWidth: clampedVideoWidth,
        videoHeight: clampedVideoHeight,
        scaleX,
        scaleY
      }
      
      // Function to draw image/video frame with proper scaling
      const drawFrame = (image: HTMLImageElement | HTMLVideoElement, showPlayButton: boolean = true) => {
        if (!drawParams.texture) {
          drawParams.texture = (drawParams.canvas as any).__texture as THREE.CanvasTexture
        }
        if (!drawParams.texture) return
        
        // Save context state
        drawParams.ctx.save()
        
        // Apply scaling (same as in main drawing code)
        drawParams.ctx.scale(drawParams.scaleX, drawParams.scaleY)
        
        // Clear the video area first
        drawParams.ctx.fillStyle = 'rgba(20, 30, 50, 1.0)'
        drawParams.ctx.fillRect(
          drawParams.videoX,
          drawParams.videoY,
          drawParams.videoWidth,
          drawParams.videoHeight
        )
        
        // Draw the image/video frame
        drawParams.ctx.drawImage(
          image,
          drawParams.videoX,
          drawParams.videoY,
          drawParams.videoWidth,
          drawParams.videoHeight
        )
        
        // Draw border on top of video content
        drawParams.ctx.strokeStyle = '#00AAFF'
        drawParams.ctx.lineWidth = 4 / drawParams.scaleX // Adjust line width for scaling
        drawParams.ctx.strokeRect(
          drawParams.videoX,
          drawParams.videoY,
          drawParams.videoWidth,
          drawParams.videoHeight
        )
        
        // Only draw play button if video is paused or it's a thumbnail
        if (showPlayButton) {
          const iconSize = Math.min(drawParams.videoWidth, drawParams.videoHeight) * 0.15
          const iconX = drawParams.videoX + drawParams.videoWidth / 2
          const iconY = drawParams.videoY + drawParams.videoHeight / 2
          
          // Draw semi-transparent circle background for play button
          drawParams.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
          drawParams.ctx.beginPath()
          drawParams.ctx.arc(iconX, iconY, iconSize * 0.8, 0, Math.PI * 2)
          drawParams.ctx.fill()
          
          // Draw play icon triangle
          drawParams.ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
          drawParams.ctx.shadowColor = 'rgba(0, 0, 0, 0.5)'
          drawParams.ctx.shadowBlur = 4 / drawParams.scaleX // Adjust shadow for scaling
          drawParams.ctx.beginPath()
          drawParams.ctx.moveTo(iconX - iconSize / 3, iconY - iconSize / 2)
          drawParams.ctx.lineTo(iconX - iconSize / 3, iconY + iconSize / 2)
          drawParams.ctx.lineTo(iconX + iconSize / 2, iconY)
          drawParams.ctx.closePath()
          drawParams.ctx.fill()
          drawParams.ctx.shadowBlur = 0
        }
        
        // Restore context
        drawParams.ctx.restore()
        
        // Update texture
        drawParams.texture.needsUpdate = true
      }
      
      if (contentType === 'youtube') {
        // For YouTube, load and draw thumbnail
        const videoId = extractYouTubeId(contentData)
        if (videoId) {
          const thumbnailUrl = getYouTubeThumbnail(videoId, 'maxresdefault')
          const img = new Image()
          img.crossOrigin = 'anonymous'
          img.onload = () => {
            drawFrame(img)
          }
          img.onerror = () => {
            // Fallback to hqdefault if maxresdefault fails
            const fallbackImg = new Image()
            fallbackImg.crossOrigin = 'anonymous'
            fallbackImg.onload = () => {
              drawFrame(fallbackImg)
            }
            fallbackImg.onerror = () => {
              console.warn('[hotspot3DPanel] Failed to load YouTube thumbnail:', videoId)
            }
            fallbackImg.src = getYouTubeThumbnail(videoId, 'hqdefault')
          }
          img.src = thumbnailUrl
        }
      } else if (contentType === 'video') {
        // For regular video, create video element and draw frames
        const video = document.createElement('video')
        video.crossOrigin = 'anonymous'
        video.src = contentData
        video.muted = true
        video.loop = true
        video.playsInline = true
        
        let animationFrameId: number | null = null
        
        video.onloadedmetadata = () => {
          // Seek to first frame
          video.currentTime = 0.1
        }
        
        video.onseeked = () => {
          // Draw first frame
          drawFrame(video)
          // Start playing and updating frames
          video.play().catch(() => {
            // Auto-play may be blocked, that's okay - just show first frame
          })
        }
        
        video.onplay = () => {
          // Set up frame update loop (hide play button when playing)
          const updateFrame = () => {
            if (!video.paused && !video.ended && drawParams.texture) {
              drawFrame(video, false) // Don't show play button when playing
              animationFrameId = requestAnimationFrame(updateFrame)
            }
          }
          animationFrameId = requestAnimationFrame(updateFrame)
        }
        
        video.onpause = () => {
          // Show play button when paused
          if (drawParams.texture) {
            drawFrame(video, true)
          }
          if (animationFrameId !== null) {
            cancelAnimationFrame(animationFrameId)
            animationFrameId = null
          }
        }
        
        video.onended = () => {
          // Show play button when video ends
          if (drawParams.texture) {
            drawFrame(video, true)
          }
          if (animationFrameId !== null) {
            cancelAnimationFrame(animationFrameId)
            animationFrameId = null
          }
        }
        
        // Store video reference for cleanup and playback control
        ;(canvas as any).__video = video
        ;(canvas as any).__videoId = `video-${Date.now()}-${Math.random()}`
        
        // Store video in manager for click handling
        const videoId = (canvas as any).__videoId
        videoManager.set(videoId, {
          video,
          texture: drawParams.texture!,
          canvas,
          ctx: drawParams.ctx,
          animationFrameId: null
        })
        
        video.load()
      }
    }
    
    // Draw border (will be redrawn on top when video content loads)
    ctx.strokeStyle = '#00AAFF'
    ctx.lineWidth = 4
    ctx.strokeRect(clampedVideoX, clampedVideoY, clampedVideoWidth, clampedVideoHeight)
  } else if (contentType === 'interactive') {
    // Draw interactive content placeholder - no title offset
    // Always render interactive placeholder
    if (contentWidth > 0 && contentHeight > 0) {
      const interactiveX = padding + Math.max(0, (actualPanelWidth - padding * 2 - contentWidth) / 2)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.12)'
      ctx.fillRect(
        interactiveX,
        padding,
        contentWidth,
        contentHeight
      )
      ctx.fillStyle = textColor
      ctx.font = `${fontSize}px Arial, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(
        '[Interactive Content]',
        interactiveX + contentWidth / 2,
        padding + contentHeight / 2
      )
    }
  } else if (contentType === 'html') {
    // Draw HTML content preview (strip tags and show text)
    // Always show HTML content, regardless of isOpen state
    const htmlText = contentData ? stripHtmlTags(contentData) : ''
    if (htmlText) {
      // Draw actual HTML content preview (text only, no tags)
      ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif`
      
      ctx.shadowColor = 'rgba(0, 0, 0, 0.2)'
      ctx.shadowBlur = 1
      ctx.shadowOffsetX = 0
      ctx.shadowOffsetY = 0.5
      
      ctx.fillStyle = textColor
      ctx.textAlign = textAlign
      ctx.textBaseline = 'top'
      
      const textWidth = actualPanelWidth - padding * 2
      let textX = padding
      if (textAlign === 'center') {
        textX = actualPanelWidth / 2
      } else if (textAlign === 'right') {
        textX = actualPanelWidth - padding
      }
      
      const singleLineWidth = ctx.measureText(htmlText).width
      let lines: string[]
      
      if (singleLineWidth <= textWidth) {
        lines = [htmlText]
      } else {
        lines = wrapText(ctx, htmlText, textWidth)
      }
      
      // For HTML content, start from top (no title offset)
      let y = padding
      const maxLines = Math.floor(contentHeight / (fontSize * 1.4))
      const displayLines = lines.slice(0, maxLines)
      
      displayLines.forEach((line) => {
        const lineWidth = ctx.measureText(line).width
        if (lineWidth > textWidth) {
          let displayLine = line
          while (ctx.measureText(displayLine + '...').width > textWidth && displayLine.length > 0) {
            displayLine = displayLine.slice(0, -1)
          }
          ctx.fillText(displayLine + '...', textX, y)
        } else {
          ctx.fillText(line, textX, y)
        }
        y += fontSize * 1.4
      })
      
      // Show indicator if content is truncated
      if (lines.length > maxLines) {
        ctx.font = `${fontSize - 4}px Arial, sans-serif`
        ctx.textAlign = 'center'
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
        ctx.fillText(
          'Click to view full content...',
          actualPanelWidth / 2,
          padding + contentHeight - fontSize
        )
      }
      
      ctx.shadowColor = 'transparent'
      ctx.shadowBlur = 0
      ctx.shadowOffsetX = 0
      ctx.shadowOffsetY = 0
    } else {
      // Fallback if no content (no title offset for HTML)
      const htmlX = padding + Math.max(0, (actualPanelWidth - padding * 2 - contentWidth) / 2)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.1)'
      ctx.fillRect(
        htmlX,
        padding,
        contentWidth,
        contentHeight
      )
      ctx.fillStyle = textColor
      ctx.font = `${fontSize - 2}px Arial, sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText(
        '[No HTML Content]',
        htmlX + contentWidth / 2,
        padding + contentHeight / 2
      )
    }
  }

  // Restore context after scaling
  ctx.restore()

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.generateMipmaps = true
  texture.needsUpdate = true
  // Three.js textures are flipped by default (flipY = true)
  // Canvas coordinates have (0,0) at top-left, Three.js has (0,0) at bottom-left
  texture.flipY = true // Use default Three.js behavior
  
  // Don't use texture repeat - the mesh should be sized to match actualPanelWidth/actualPanelHeight
  // The scaling in the canvas context handles the coordinate mapping
  texture.offset.set(0, 0)
  texture.repeat.set(1, 1)
  
  // Store texture reference on canvas for async updates (video/image loading)
  ;(canvas as any).__texture = texture
  
  return texture
}

/**
 * Helper function to wrap text to fit within maxWidth
 */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let currentLine = ''

  words.forEach((word) => {
    const testLine = currentLine ? `${currentLine} ${word}` : word
    const metrics = ctx.measureText(testLine)

    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine)
      currentLine = word
    } else {
      currentLine = testLine
    }
  })

  if (currentLine) {
    lines.push(currentLine)
  }

  return lines
}

/**
 * Strip HTML tags from content to get plain text preview
 */
function stripHtmlTags(html: string): string {
  if (!html || typeof html !== 'string') {
    console.warn('[hotspot3DPanel] stripHtmlTags: Invalid HTML input', html)
    return ''
  }
  try {
    // Create a temporary div element to parse HTML
    const tmp = document.createElement('div')
    tmp.innerHTML = html
    // Get text content and clean up whitespace
    let text = tmp.textContent || tmp.innerText || ''
    // Replace multiple whitespace with single space
    text = text.replace(/\s+/g, ' ').trim()
    // Limit length for preview (first 500 characters)
    if (text.length > 500) {
      text = text.substring(0, 500) + '...'
    }
    return text
  } catch (error) {
    console.error('[hotspot3DPanel] stripHtmlTags error:', error, html)
    return ''
  }
}

/**
 * Create a CSS3D panel with YouTube iframe for hotspots
 * This allows the YouTube player to work directly in 3D space
 */
export function createHotspotCSS3DPanel(
  position: THREE.Vector3,
  config: Hotspot3DPanelConfig
): THREE.Object3D {
  const { contentData, title } = config
  
  // Extract YouTube video ID and share identifier (si parameter)
  const videoId = extractYouTubeId(contentData || '')
  if (!videoId) {
    console.warn('[hotspot3DPanel] Invalid YouTube video ID:', contentData)
    // Fallback to regular texture-based panel (don't call createHotspot3DPanel to avoid recursion)
    // Create a simple texture panel with error message
    const fallbackConfig = { ...config, contentType: 'text' as const, contentData: `Invalid YouTube URL: ${contentData || 'empty'}` }
    const texture = createHotspot3DPanelTexture(fallbackConfig)
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true })
    const geometry = new THREE.PlaneGeometry(2, 2)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.copy(position)
    return mesh
  }
  
  // Extract si parameter from original URL if present, otherwise use default
  const siParam = extractYouTubeSi(contentData || '') || 'TRivzqXJKfnNdTo6'
  
  // Calculate panel dimensions - use provided pixel dimensions or calculate from defaults
  const maxWidth = config.maxWidth || 400
  const maxHeight = config.maxHeight || 600
  const padding = config.padding || 16
  
  // Use provided pixel dimensions if available, otherwise calculate from defaults
  let panelWidth: number
  let panelHeight: number
  let videoWidth: number
  let videoHeight: number
  
  if (config.panelWidthPixels !== null && config.panelWidthPixels !== undefined) {
    // Use provided width
    panelWidth = config.panelWidthPixels
    if (config.panelHeightPixels !== null && config.panelHeightPixels !== undefined) {
      // Use provided height
      panelHeight = config.panelHeightPixels
    } else {
      // Calculate height from width using 16:9 aspect ratio
      panelHeight = (panelWidth - padding * 2) / (16 / 9) + padding * 2
    }
    // Calculate video dimensions from panel dimensions (subtract padding)
    videoWidth = panelWidth - padding * 2
    videoHeight = panelHeight - padding * 2
  } else {
    // Calculate from defaults (3x multiplier for CSS3D panels)
    const sizeMultiplier = 3
    videoWidth = Math.min((maxWidth * sizeMultiplier) - padding * 2, 1200)
    videoHeight = videoWidth / (16 / 9)
    panelWidth = videoWidth + padding * 2
    panelHeight = config.panelHeightPixels ?? (videoHeight + padding * 2) // Use provided height or calculate
    // If height was provided, recalculate video height
    if (config.panelHeightPixels !== null && config.panelHeightPixels !== undefined) {
      videoHeight = panelHeight - padding * 2
    }
  }
  
  // Create container div
  const div = document.createElement('div')
  div.style.width = `${panelWidth}px`
  div.style.height = `${panelHeight}px`
  // Use semi-transparent background so iframe is clearly visible
  div.style.backgroundColor = config.backgroundColor || 'rgba(25, 25, 30, 0.95)'
  div.style.borderRadius = `${config.borderRadius || 12}px`
  div.style.padding = `${padding}px`
  div.style.boxSizing = 'border-box'
  div.style.overflow = 'visible' // Changed from 'hidden' to 'visible' to ensure YouTube controls are not clipped
  // Use customizable border settings
  const borderWidth = config.borderWidth ?? 2
  const borderColor = config.borderColor || '#00AAFF'
  div.style.border = `${borderWidth}px solid ${borderColor}`
  // CSS3D specific styles for visibility and pointer events
  div.style.position = 'absolute' // Required for CSS3D
  div.style.transformStyle = 'preserve-3d' // Required for CSS3D
  div.style.backfaceVisibility = 'visible' // Ensure both sides are visible
  // CRITICAL: Enable pointer events on the div so it can receive clicks
  // The CSS3DRenderer container has pointer-events: none, so we need to enable it here
  div.style.pointerEvents = 'auto'
  // Mark div for easy detection
  div.setAttribute('data-css3d-panel', 'true')
  div.style.webkitBackfaceVisibility = 'visible' // Safari support
  // CRITICAL: Allow pointer events on the div so iframe can receive clicks
  // Even though parent CSS3D renderer has pointer-events: none,
  // setting auto on children allows them to receive events
  div.style.pointerEvents = 'auto'
  div.style.touchAction = 'auto' // Allow touch events
  div.style.userSelect = 'none' // Prevent text selection
  div.style.webkitUserSelect = 'none'
  // Ensure div doesn't clip iframe content (YouTube controls need space)
  div.style.overflow = 'visible'
  // Note: The div has pointer-events: auto, and the iframe also has pointer-events: auto
  // This ensures clicks on the iframe work. The parent CSS3D renderer has pointer-events: none
  // which allows navigation elsewhere, but children with pointer-events: auto still receive events
  
  // Don't add title to CSS3D panels - title is shown in the label above
  // This keeps the video panel clean and focused on the content
  
  // Create YouTube iframe with the exact attributes from user's request
  const iframe = document.createElement('iframe')
  iframe.width = `${videoWidth}`
  iframe.height = `${videoHeight}`
  // Add controls=1 to ensure YouTube controls are always visible
  iframe.src = `https://www.youtube.com/embed/${videoId}?si=${siParam}&controls=1`
  iframe.title = title || 'YouTube video player'
  iframe.setAttribute('frameborder', '0')
  iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share'
  iframe.referrerPolicy = 'strict-origin-when-cross-origin'
  iframe.allowFullscreen = true
  iframe.style.width = '100%'
  iframe.style.height = '100%'
  iframe.style.border = 'none'
  iframe.style.borderRadius = '8px'
  // CRITICAL: Ensure iframe is clickable and receives all pointer events
  iframe.style.pointerEvents = 'auto'
  iframe.style.touchAction = 'auto' // Allow touch events
  iframe.style.display = 'block' // Ensure iframe is displayed as block element
  iframe.style.position = 'relative' // Ensure proper positioning
  // Ensure iframe is not clipped and can show all controls
  iframe.style.overflow = 'visible'
  
  div.appendChild(iframe)
  
  // Allow pointer events on the div and iframe, but not on the CSS3D renderer container
  // This allows YouTube controls to work while letting mouse navigation pass through elsewhere
  div.style.pointerEvents = 'auto'
  // Make sure the iframe can receive clicks
  iframe.style.pointerEvents = 'auto'
  
  // Add click handler to div to debug if clicks are reaching it
  div.addEventListener('click', (e) => {
    console.log('[hotspot3DPanel] CSS3D div clicked:', {
      target: e.target,
      currentTarget: e.currentTarget,
      clientX: e.clientX,
      clientY: e.clientY,
      isIframe: e.target === iframe
    })
    // Don't prevent default - let the iframe handle it
  }, true) // Use capture phase to catch early
  
  // Add click handler to iframe to debug if clicks are reaching it
  iframe.addEventListener('click', (e) => {
    console.log('[hotspot3DPanel] CSS3D iframe clicked:', {
      target: e.target,
      currentTarget: e.currentTarget,
      clientX: e.clientX,
      clientY: e.clientY
    })
    // Don't prevent default - let YouTube handle it
  }, true) // Use capture phase to catch early
  
  // YouTube iframe handles all controls natively (play/pause/stop)
  // Don't intercept clicks - let the iframe handle everything
  // The iframe's built-in controls will work automatically
  
  // Create CSS3D object
  // NOTE: CSS3D panels are DOM elements and cannot use WebGL depth testing
  // They will always render on top and cannot be partially occluded by 3D geometry
  // For depth-aware panels, use regular mesh panels instead
  const css3dObject = new CSS3DObject(div)
  css3dObject.position.copy(position)
  
  // CSS3D scale calculation:
  // CSS3DObject scale: 1 unit in 3D = scale * 1 pixel in CSS
  // For CSS3D, we want the panel to maintain a consistent visible size regardless of camera distance
  // CSS3D elements work differently than regular 3D - they're more like 2D overlays positioned in 3D space
  // Use a fixed, larger scale to ensure visibility at all camera distances, especially when close
  
  // CSS3D scale calculation - all in pixels
  // CSS3DObject scale: scale value means the CSS element's pixel size is multiplied by scale to get 3D size
  // Formula: 3D size (in units) = CSS pixel size * scale
  // 
  // To match regular mesh panels: they use pixelsToWorldUnits = 0.01 (100px = 1 unit)
  // For CSS3D, we want smaller panels, so we'll use a smaller target height
  // 
  // Example: If panelHeight = 600px and we want it to appear as 1.5 units tall:
  //   600 * scale = 1.5
  //   scale = 1.5 / 600 = 0.0025
  
  // Target height in 3D units (smaller = smaller panel)
  // Increased to 2.0 units to ensure YouTube controls are visible and clickable
  // YouTube controls need a minimum size to be usable
  const targetHeight3DUnits = 2.0 // Target height in 3D units (increased for better visibility)
  
  // Calculate scale: scale = targetHeight3DUnits / panelHeightPixels
  // This ensures: panelHeight * scale = targetHeight3DUnits
  let scale = targetHeight3DUnits / panelHeight
  
  // Ensure minimum scale for very large panels (prevents panels from being too small)
  // Minimum: even 2000px panels should appear at least 1.5 units tall (for YouTube controls)
  const minHeight3DUnits = 1.5 // Minimum height in 3D units (increased for controls)
  const minScale = minHeight3DUnits / panelHeight
  if (scale < minScale) {
    scale = minScale
  }
  
  // Cap maximum scale to prevent very small panels from being too huge
  // Maximum: 200px panels shouldn't appear larger than 3 units tall
  const maxHeight3DUnits = 3.0 // Maximum height in 3D units
  const maxScale = maxHeight3DUnits / panelHeight
  if (scale > maxScale) {
    scale = maxScale
  }
  
  // Use uniform scale to maintain aspect ratio
  css3dObject.scale.set(scale, scale, 1)
  
  // Store the scale for future reference to prevent unwanted growth
  css3dObject.userData.css3dScale = scale
  css3dObject.userData.panelHeightPixels = panelHeight
  
  // Make div visible for debugging
  div.style.visibility = 'visible'
  div.style.display = 'block'
  
  console.log('[hotspot3DPanel] Created CSS3D panel:', {
    videoId,
    position: { x: position.x, y: position.y, z: position.z },
    panelSizePixels: { width: panelWidth, height: panelHeight },
    scale: scale,
    actualSize3D: { width: (panelWidth * scale).toFixed(2), height: (panelHeight * scale).toFixed(2) },
    divStyle: {
      width: div.style.width,
      height: div.style.height,
      visibility: div.style.visibility,
      display: div.style.display,
      backgroundColor: div.style.backgroundColor
    },
    iframeSrc: iframe.src,
    iframeWidth: iframe.width,
    iframeHeight: iframe.height
  })
  
  // Store metadata
  css3dObject.userData.isHotspotPanel = true
  css3dObject.userData.isCSS3DPanel = true
  css3dObject.userData.panelConfig = config
  css3dObject.userData.actualWidth = panelWidth
  css3dObject.userData.actualHeight = panelHeight
  css3dObject.userData.panelWidthPixels = panelWidth
  css3dObject.userData.panelHeightPixels = panelHeight
  // Store reference to div for click handling
  css3dObject.userData.divElement = div
  css3dObject.userData.iframeElement = iframe
  
  return css3dObject
}

/**
 * Create a 3D mesh panel for hotspots that floats in 3D space
 * Scales dynamically based on content
 * For YouTube videos, uses CSS3D panel with iframe for full YouTube player functionality
 */
export function createHotspot3DPanel(
  position: THREE.Vector3,
  config: Hotspot3DPanelConfig
): THREE.Object3D {
  // For YouTube videos, use CSS3D panel with iframe
  if (config.contentType === 'youtube' && config.contentData) {
    return createHotspotCSS3DPanel(position, config)
  }
  
  const texture = createHotspot3DPanelTexture(config)

  // Get actual panel dimensions from canvas (accounting for power-of-2 padding)
  // The texture.image is the canvas element, so we can access the stored dimensions
  const canvas = texture.image as HTMLCanvasElement
  const actualWidth = (canvas as any).__actualWidth || canvas.width
  const actualHeight = (canvas as any).__actualHeight || canvas.height
  
  // Reduced logging
  // console.log('[hotspot3DPanel] Creating 3D mesh:', {
  //   canvasWidth: canvas.width,
  //   canvasHeight: canvas.height,
  //   actualWidth,
  //   actualHeight
  // })
  
  // Calculate scale based on actual dimensions or use provided pixel dimensions
  // Convert pixels to 3D world units (1 pixel = 0.01 units by default, making 100px = 1 unit)
  const pixelsToWorldUnits = 0.01 // Conversion factor: 1 pixel = 0.01 world units
  
  let panelHeight: number
  let panelWidth: number
  
  // Handle user-specified dimensions
  const contentAspect = actualWidth / actualHeight
  
  if (config.panelWidthPixels !== null && config.panelWidthPixels !== undefined) {
    // User specified width
    panelWidth = config.panelWidthPixels * pixelsToWorldUnits
    if (config.panelHeightPixels !== null && config.panelHeightPixels !== undefined) {
      // User specified both width and height - use exact dimensions
      panelHeight = config.panelHeightPixels * pixelsToWorldUnits
    } else {
      // Only width specified - calculate height from content aspect ratio
      panelHeight = panelWidth / contentAspect
    }
  } else if (config.panelHeightPixels !== null && config.panelHeightPixels !== undefined) {
    // User specified height only - scale width to maintain aspect ratio
    panelHeight = config.panelHeightPixels * pixelsToWorldUnits
    panelWidth = panelHeight * contentAspect
  } else {
    // Default: fixed height of 1.5 world units, width based on content aspect ratio
    const baseHeightWorldUnits = 1.5
    panelHeight = baseHeightWorldUnits
    panelWidth = panelHeight * contentAspect
  }

  const geometry = new THREE.PlaneGeometry(panelWidth, panelHeight)
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthTest: true, // Enable depth testing so panels are occluded by objects in front (like labels)
    depthWrite: false, // Don't write to depth buffer (for transparency, allows partial occlusion)
    side: THREE.DoubleSide,
    opacity: 0.95
  })

  const panel = new THREE.Mesh(geometry, material)
  panel.position.copy(position)
  
  // Store actual dimensions in userData for reference
  panel.userData.isHotspotPanel = true
  panel.userData.isBillboard = true
  panel.userData.panelConfig = config
  panel.userData.actualWidth = actualWidth
  panel.userData.actualHeight = actualHeight
  panel.userData.panelWidthPixels = config.panelWidthPixels
  panel.userData.panelHeightPixels = config.panelHeightPixels
  panel.userData.panelWidth = panelWidth
  panel.userData.panelHeight = panelHeight
  panel.userData.canvas = canvas // Store canvas reference for close button detection
  // Use renderOrder 0 (same as car model) so panels render together with other objects
  // This allows depthTest to work properly - panels will be occluded by objects in front
  // depthTest: true will handle proper occlusion (partial hiding behind car)
  panel.renderOrder = 0 // Render with other objects to allow proper depth testing

  return panel
}

/**
 * Create a custom icon texture for hotspot markers
 */
export function createHotspotIconTexture(
  iconType: 'default' | 'custom' | 'symbol',
  value: string, // URL for custom, symbol character for symbol
  size: number = 64
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  ctx.clearRect(0, 0, size, size)

  if (iconType === 'custom' && value.startsWith('http')) {
    // For custom URLs, we'll need to load the image
    // For now, draw a placeholder
    ctx.fillStyle = '#4a9eff'
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.font = `${size / 3}px Arial`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('IMG', size / 2, size / 2)
  } else if (iconType === 'symbol') {
    // Draw symbol (like '+', '-', emoji)
    ctx.fillStyle = '#ffffff'
    ctx.font = `${size / 2}px Arial`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(value, size / 2, size / 2)
  } else {
    // Default icon (circular with dot)
    ctx.fillStyle = '#ff4444'
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size / 4, 0, Math.PI * 2)
    ctx.fill()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.generateMipmaps = true
  texture.needsUpdate = true
  return texture
}

/**
 * Update CSS3D panel border and styling without recreating the panel
 */
export function updateHotspotCSS3DPanelStyle(
  panel: THREE.Object3D,
  config: Hotspot3DPanelConfig
): void {
  if (!panel.userData.isCSS3DPanel) return
  
  const div = panel.userData.divElement as HTMLDivElement
  if (!div) {
    console.warn('[hotspot3DPanel] updateHotspotCSS3DPanelStyle: div element not found')
    return
  }
  
  // Check if panel dimensions changed - only recalculate scale if they did
  const currentPanelHeight = panel.userData.panelHeightPixels
  const newPanelHeight = config.panelHeightPixels ?? panel.userData.actualHeight ?? 150
  
  // Only recalculate scale if dimensions actually changed
  if (currentPanelHeight !== newPanelHeight) {
    const targetHeight3DUnits = 2.0
    let scale = targetHeight3DUnits / newPanelHeight
    
    const minHeight3DUnits = 1.5
    const minScale = minHeight3DUnits / newPanelHeight
    if (scale < minScale) {
      scale = minScale
    }
    
    const maxHeight3DUnits = 3.0
    const maxScale = maxHeight3DUnits / newPanelHeight
    if (scale > maxScale) {
      scale = maxScale
    }
    
    // Update scale only if dimensions changed
    panel.scale.set(scale, scale, 1)
    panel.userData.css3dScale = scale
    panel.userData.panelHeightPixels = newPanelHeight
  } else {
    // Preserve existing scale to prevent unwanted growth
    const preservedScale = panel.userData.css3dScale || panel.scale.x
    if (preservedScale && panel.scale.x !== preservedScale) {
      panel.scale.set(preservedScale, preservedScale, 1)
    }
  }
  
  // Update border
  const borderWidth = config.borderWidth ?? 2
  const borderColor = config.borderColor || '#00AAFF'
  div.style.border = `${borderWidth}px solid ${borderColor}`
  
  // Update border radius
  const borderRadius = config.borderRadius ?? 12
  div.style.borderRadius = `${borderRadius}px`
  
  // Update background color
  const backgroundColor = config.backgroundColor || 'rgba(25, 25, 30, 0.95)'
  div.style.backgroundColor = backgroundColor
  
  // Also update iframe border radius to match
  const iframe = panel.userData.iframeElement as HTMLIFrameElement | undefined
  if (iframe) {
    // Iframe border radius should be slightly smaller to account for padding
    const iframeBorderRadius = Math.max(0, borderRadius - 2)
    iframe.style.borderRadius = `${iframeBorderRadius}px`
  }
  
  // Log updates for debugging (only if values changed from defaults)
  if (borderWidth !== 2 || borderColor !== '#00AAFF' || borderRadius !== 12) {
    console.log('[hotspot3DPanel] ✅ Updated CSS3D panel style:', {
      borderWidth,
      borderColor,
      borderRadius,
      backgroundColor,
      scale: panel.scale.x,
      preservedScale: currentPanelHeight === newPanelHeight
    })
  }
}

/**
 * Update an existing panel texture with new config
 * Dynamically resizes panel based on new content
 * For CSS3D panels, updates the DOM element styles instead
 */
export function updateHotspot3DPanelTexture(
  panel: THREE.Object3D,
  config: Hotspot3DPanelConfig
): void {
  // CSS3D panels don't have materials/textures - they're DOM elements
  // Update CSS3D panel styles directly
  if (panel.userData.isCSS3DPanel) {
    updateHotspotCSS3DPanelStyle(panel, config)
    return
  }

  // Regular mesh panels with textures
  if (!(panel instanceof THREE.Mesh)) {
    console.warn('[hotspot3DPanel] updateHotspot3DPanelTexture: Panel is not a Mesh', panel)
    return
  }

  const material = panel.material as THREE.MeshBasicMaterial
  if (!material) {
    console.warn('[hotspot3DPanel] updateHotspot3DPanelTexture: Panel has no material', panel)
    return
  }

  const oldTexture = material.map

  // Create new texture with updated content
  const newTexture = createHotspot3DPanelTexture(config)

  // Dispose old texture
  if (oldTexture) {
    oldTexture.dispose()
  }

  // Update material
  material.map = newTexture
  material.needsUpdate = true

  // Get actual dimensions from canvas (accounting for power-of-2 padding)
  const canvas = newTexture.image as HTMLCanvasElement
  const actualWidth = (canvas as any).__actualWidth || canvas.width
  const actualHeight = (canvas as any).__actualHeight || canvas.height
  
  // Use provided pixel dimensions or calculate from defaults (same logic as createHotspot3DPanel)
  const pixelsToWorldUnits = 0.01 // Conversion factor: 1 pixel = 0.01 world units
  
  let panelHeight: number
  let panelWidth: number
  
  // Handle user-specified dimensions
  const contentAspect = actualWidth / actualHeight
  
  if (config.panelWidthPixels !== null && config.panelWidthPixels !== undefined) {
    // User specified width
    panelWidth = config.panelWidthPixels * pixelsToWorldUnits
    if (config.panelHeightPixels !== null && config.panelHeightPixels !== undefined) {
      // User specified both width and height - use exact dimensions
      panelHeight = config.panelHeightPixels * pixelsToWorldUnits
    } else {
      // Only width specified - calculate height from content aspect ratio
      panelHeight = panelWidth / contentAspect
    }
  } else if (config.panelHeightPixels !== null && config.panelHeightPixels !== undefined) {
    // User specified height only - scale width to maintain aspect ratio
    panelHeight = config.panelHeightPixels * pixelsToWorldUnits
    panelWidth = panelHeight * contentAspect
  } else {
    // Default: fixed height of 1.5 world units, width based on content aspect ratio
    const baseHeightWorldUnits = 1.5
    panelHeight = baseHeightWorldUnits
    panelWidth = panelHeight * contentAspect
  }

  // Update geometry if size changed (compare with current size)
  const currentSize = new THREE.Vector2()
  if (panel.geometry instanceof THREE.PlaneGeometry) {
    panel.geometry.computeBoundingBox()
    const bbox = panel.geometry.boundingBox
    if (bbox) {
      currentSize.set(
        bbox.max.x - bbox.min.x,
        bbox.max.y - bbox.min.y
      )
    }
  }
  
  // Only recreate geometry if size changed significantly (> 5% difference)
  const sizeChanged = !currentSize.x || 
    Math.abs(currentSize.x - panelWidth) / panelWidth > 0.05 ||
    Math.abs(currentSize.y - panelHeight) / panelHeight > 0.05
  
  if (sizeChanged) {
    panel.geometry.dispose()
    panel.geometry = new THREE.PlaneGeometry(panelWidth, panelHeight)
  }

  // Update user data
  panel.userData.panelConfig = config
  panel.userData.actualWidth = actualWidth
  panel.userData.actualHeight = actualHeight
  panel.userData.panelWidthPixels = config.panelWidthPixels
  panel.userData.panelHeightPixels = config.panelHeightPixels
  panel.userData.panelWidth = panelWidth
  panel.userData.panelHeight = panelHeight
}

