/**
 * Creates a transform/gizmo icon showing 3D coordinate axes (X, Y, Z)
 * Similar to the gizmo icon from the online example
 * Returns a data URL that can be used as an img src
 */
export function createTransformIconDataUrl(size: number = 64): string {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, size, size)

  const cx = size / 2
  const cy = size / 2
  
  // Colors matching the standard 3D gizmo colors
  const xColor = '#ff0000' // Red for X-axis
  const yColor = '#00ff00' // Green for Y-axis  
  const zColor = '#0000ff' // Blue for Z-axis
  
  // Arrow properties
  const arrowLength = size * 0.35
  const arrowWidth = size * 0.08
  const arrowheadSize = size * 0.12
  
  // Draw with 3D perspective (isometric view)
  // Y-axis (vertical, up)
  ctx.save()
  ctx.translate(cx, cy)
  ctx.strokeStyle = yColor
  ctx.fillStyle = yColor
  ctx.lineWidth = arrowWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  
  // Y arrow shaft (vertical)
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(0, -arrowLength)
  ctx.stroke()
  
  // Y arrowhead (pointing up)
  ctx.beginPath()
  ctx.moveTo(0, -arrowLength)
  ctx.lineTo(-arrowheadSize * 0.4, -arrowLength + arrowheadSize)
  ctx.lineTo(arrowheadSize * 0.4, -arrowLength + arrowheadSize)
  ctx.closePath()
  ctx.fill()
  
  ctx.restore()
  
  // X-axis (horizontal, right, with perspective)
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(Math.PI / 6) // Rotate for perspective
  ctx.strokeStyle = xColor
  ctx.fillStyle = xColor
  ctx.lineWidth = arrowWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  
  // X arrow shaft
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(arrowLength * 0.9, 0)
  ctx.stroke()
  
  // X arrowhead
  ctx.beginPath()
  ctx.moveTo(arrowLength * 0.9, 0)
  ctx.lineTo(arrowLength * 0.9 - arrowheadSize * 0.7, -arrowheadSize * 0.4)
  ctx.lineTo(arrowLength * 0.9 - arrowheadSize * 0.7, arrowheadSize * 0.4)
  ctx.closePath()
  ctx.fill()
  
  ctx.restore()
  
  // Z-axis (diagonal, forward-left, with perspective)
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(-Math.PI / 6) // Rotate for perspective
  ctx.strokeStyle = zColor
  ctx.fillStyle = zColor
  ctx.lineWidth = arrowWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  
  // Z arrow shaft
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(-arrowLength * 0.8, -arrowLength * 0.3)
  ctx.stroke()
  
  // Z arrowhead
  ctx.beginPath()
  ctx.moveTo(-arrowLength * 0.8, -arrowLength * 0.3)
  ctx.lineTo(-arrowLength * 0.8 + arrowheadSize * 0.6, -arrowLength * 0.3 - arrowheadSize * 0.5)
  ctx.lineTo(-arrowLength * 0.8 + arrowheadSize * 0.6, -arrowLength * 0.3 + arrowheadSize * 0.3)
  ctx.closePath()
  ctx.fill()
  
  ctx.restore()
  
  // Add subtle shadow/glow for depth
  ctx.save()
  ctx.globalCompositeOperation = 'multiply'
  ctx.fillStyle = 'rgba(0, 0, 0, 0.1)'
  ctx.beginPath()
  ctx.arc(cx, cy, size * 0.15, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  
  return canvas.toDataURL('image/png')
}
















