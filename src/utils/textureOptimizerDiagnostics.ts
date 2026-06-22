/**
 * Diagnostic utility for texture optimization
 * Tests if textures can be optimized and identifies potential issues
 */

import { optimizeTexture, TextureFormat } from './textureOptimizer'

export interface TextureDiagnosticResult {
  fileName: string
  fileSize: number
  canOptimize: boolean
  issues: string[]
  recommendations: string[]
  estimatedTime?: number // in seconds
  estimatedMemoryMB?: number
}

/**
 * Diagnose a single texture file to check if it can be optimized
 */
export async function diagnoseTexture(
  file: File,
  format: TextureFormat = 'webp'
): Promise<TextureDiagnosticResult> {
  const issues: string[] = []
  const recommendations: string[] = []
  let canOptimize = true
  let estimatedTime: number | undefined
  let estimatedMemoryMB: number | undefined

  // Check file size
  const fileSizeMB = file.size / (1024 * 1024)
  if (fileSizeMB > 100) {
    issues.push(`Very large file size: ${fileSizeMB.toFixed(2)} MB`)
    recommendations.push('Consider using WebP instead of KTX2 for faster processing')
    estimatedTime = fileSizeMB * 2 // Rough estimate: 2 seconds per MB
  } else if (fileSizeMB > 50) {
    issues.push(`Large file size: ${fileSizeMB.toFixed(2)} MB`)
    recommendations.push('Processing may take 30-60 seconds')
    estimatedTime = fileSizeMB * 1.5
  }

  // Check file extension
  const ext = file.name.toLowerCase().split('.').pop()
  if (!ext || !['png', 'jpg', 'jpeg', 'tga', 'bmp'].includes(ext)) {
    issues.push(`Unsupported file format: .${ext || 'unknown'}`)
    canOptimize = false
  }

  // Try to load image dimensions (without full load)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      const objectUrl = URL.createObjectURL(file)
      const timeout = setTimeout(() => {
        URL.revokeObjectURL(objectUrl)
        reject(new Error('Image load timeout'))
      }, 10000) // 10 second timeout for diagnostics

      img.onload = () => {
        clearTimeout(timeout)
        URL.revokeObjectURL(objectUrl)
        resolve(img)
      }
      img.onerror = () => {
        clearTimeout(timeout)
        URL.revokeObjectURL(objectUrl)
        reject(new Error('Failed to load image'))
      }
      img.src = objectUrl
    })

    const width = image.width
    const height = image.height
    const pixelCount = width * height
    estimatedMemoryMB = (pixelCount * 4) / (1024 * 1024) // RGBA

    if (width === 0 || height === 0) {
      issues.push('Invalid image dimensions (0x0)')
      canOptimize = false
    } else if (pixelCount > 268435456) {
      // > 16384x16384
      issues.push(`Extremely large dimensions: ${width}x${height} (~${estimatedMemoryMB.toFixed(1)}MB in memory)`)
      recommendations.push('Image is too large. Consider downscaling before optimization.')
      recommendations.push('Use maxResolution option to limit size to 2048x2048 or 4096x4096')
      canOptimize = false
    } else if (pixelCount > 67108864) {
      // > 8192x8192
      issues.push(`Very large dimensions: ${width}x${height} (~${estimatedMemoryMB.toFixed(1)}MB in memory)`)
      recommendations.push('Processing will be slow. Consider using WebP format.')
      estimatedTime = (estimatedTime || 0) + 30
    } else if (pixelCount > 16777216) {
      // > 4096x4096
      issues.push(`Large dimensions: ${width}x${height} (~${estimatedMemoryMB.toFixed(1)}MB in memory)`)
      recommendations.push('Processing may take 10-30 seconds')
      estimatedTime = (estimatedTime || 0) + 15
    }

    // Check if dimensions are valid for KTX2 (must be divisible by 4)
    if (format === 'ktx2') {
      if (width % 4 !== 0 || height % 4 !== 0) {
        recommendations.push('Image dimensions will be rounded to nearest multiple of 4 for KTX2')
      }
    }
  } catch (error) {
    issues.push(`Failed to load image: ${error instanceof Error ? error.message : String(error)}`)
    canOptimize = false
  }

  // Format-specific recommendations
  if (format === 'ktx2') {
    recommendations.push('KTX2 encoding can be slow for large textures. WebP is faster.')
    if (!estimatedTime) estimatedTime = 5
  } else {
    if (!estimatedTime) estimatedTime = 2
  }

  return {
    fileName: file.name,
    fileSize: file.size,
    canOptimize,
    issues,
    recommendations,
    estimatedTime,
    estimatedMemoryMB
  }
}

/**
 * Diagnose multiple texture files
 */
export async function diagnoseTextures(
  files: File[],
  format: TextureFormat = 'webp'
): Promise<{
  results: TextureDiagnosticResult[]
  summary: {
    total: number
    canOptimize: number
    hasIssues: number
    totalSizeMB: number
    estimatedTotalTime: number
  }
}> {
  const results: TextureDiagnosticResult[] = []
  let totalSizeMB = 0
  let estimatedTotalTime = 0

  for (const file of files) {
    const result = await diagnoseTexture(file, format)
    results.push(result)
    totalSizeMB += file.size / (1024 * 1024)
    if (result.estimatedTime) {
      estimatedTotalTime += result.estimatedTime
    }
  }

  const canOptimize = results.filter(r => r.canOptimize).length
  const hasIssues = results.filter(r => r.issues.length > 0).length

  return {
    results,
    summary: {
      total: files.length,
      canOptimize,
      hasIssues,
      totalSizeMB,
      estimatedTotalTime
    }
  }
}

























