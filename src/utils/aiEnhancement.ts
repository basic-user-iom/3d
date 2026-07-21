/**
 * AI Image Enhancement Utilities
 * Integrates with Real-ESRGAN via Replicate API for image enhancement.
 * Auth stays on the server/Electron main process (see replicateClient).
 */

import { replicateApiRequest } from './replicateClient'

export type EnhancementMode = 'upscale' | 'detail' | 'texture' | 'edges' | 'all'

export interface EnhancementResult {
  enhancedImageUrl: string
  processingTime: number
  scale?: number
}

export interface EnhancementProgress {
  progress: number
  status: string
  stage?: string
}

/**
 * Enhance image using Replicate Real-ESRGAN API (proxied; no client token).
 */
export async function enhanceWithReplicate(
  imageDataUrl: string,
  mode: EnhancementMode,
  onProgress?: (progress: EnhancementProgress) => void
): Promise<EnhancementResult> {
  const startTime = Date.now()

  try {
    // Real-ESRGAN x4plus on Replicate - all modes use 4x upscaling
    let outscale = 4

    switch (mode) {
      case 'upscale':
      case 'detail':
      case 'texture':
      case 'edges':
      case 'all':
        outscale = 4
        break
    }

    let versionId: string

    try {
      const versions = (await replicateApiRequest({
        method: 'GET',
        path: '/v1/models/xinntao/realesrgan/versions'
      })) as { results?: Array<{ id?: string }> }

      const latestVersion = versions.results?.[0]
      if (latestVersion?.id) {
        versionId = latestVersion.id
        console.log('[AIEnhancement] Found Real-ESRGAN version ID:', versionId)
      } else {
        throw new Error('No version ID found in API response')
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.warn('[AIEnhancement] Failed to lookup version ID dynamically:', errorMsg)

      if (
        errorMsg.includes('Connection failed') ||
        errorMsg.includes('401') ||
        errorMsg.includes('403') ||
        errorMsg.includes('REPLICATE_API_TOKEN')
      ) {
        throw new Error(
          'Failed to connect to Replicate API. Check that REPLICATE_API_TOKEN is set in .env (server/Electron) and restart the editor.'
        )
      }

      throw new Error(
        'Failed to get Real-ESRGAN version ID. Check REPLICATE_API_TOKEN or try again later.'
      )
    }

    onProgress?.({ progress: 10, status: 'Preparing image...', stage: 'upload' })
    onProgress?.({ progress: 20, status: 'Starting enhancement...', stage: 'init' })

    const prediction = (await replicateApiRequest({
      method: 'POST',
      path: '/v1/predictions',
      body: {
        version: versionId,
        input: {
          image: imageDataUrl,
          scale: outscale
        }
      }
    })) as { id?: string }

    const predictionId = prediction.id

    if (!predictionId) {
      throw new Error('Failed to create prediction - no ID returned')
    }

    onProgress?.({ progress: 30, status: 'Processing image...', stage: 'processing' })

    let result: {
      status?: string
      error?: string
      output?: unknown
    } | null = null
    let attempts = 0
    const maxAttempts = 120 // 2 minutes max (1s intervals)

    while (attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 1000))

      result = (await replicateApiRequest({
        method: 'GET',
        path: `/v1/predictions/${predictionId}`
      })) as { status?: string; error?: string; output?: unknown }

      if (result.status === 'processing' || result.status === 'starting') {
        const progress = Math.min(30 + (attempts / maxAttempts) * 60, 90)
        onProgress?.({
          progress,
          status: result.status === 'starting' ? 'Initializing...' : 'Enhancing image...',
          stage: 'processing'
        })
      } else if (result.status === 'succeeded') {
        onProgress?.({ progress: 100, status: 'Complete!', stage: 'complete' })
        break
      } else if (result.status === 'failed' || result.status === 'canceled') {
        throw new Error(`Enhancement ${result.status}: ${result.error || 'Unknown error'}`)
      }

      attempts++
    }

    if (!result || result.status !== 'succeeded') {
      throw new Error('Enhancement timed out or failed')
    }

    if (!result.output || typeof result.output !== 'string') {
      throw new Error('Invalid response format - no output URL')
    }

    onProgress?.({ progress: 95, status: 'Downloading enhanced image...', stage: 'download' })

    const { fetchWithRetry } = await import('./networkUtils')
    const enhancedImageResponse = await fetchWithRetry(
      result.output,
      {},
      {
        maxRetries: 3,
        retryDelay: 2000,
        timeout: 60000
      }
    )

    const enhancedBlob = await enhancedImageResponse.blob()
    const enhancedDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(enhancedBlob)
    })

    const processingTime = (Date.now() - startTime) / 1000

    return {
      enhancedImageUrl: enhancedDataUrl,
      processingTime,
      scale: outscale
    }
  } catch (error) {
    console.error('[AIEnhancement] Replicate API error:', error)
    throw error
  }
}

/**
 * Alternative: Enhance using TensorFlow.js (placeholder for future implementation)
 */
export async function enhanceWithTensorFlow(
  imageDataUrl: string,
  mode: EnhancementMode,
  onProgress?: (progress: EnhancementProgress) => void
): Promise<EnhancementResult> {
  onProgress?.({ progress: 0, status: 'Loading model...', stage: 'loading' })
  throw new Error('TensorFlow.js enhancement not yet implemented. Use Replicate API instead.')
}

/**
 * Fallback: Simple image processing (used when API is not available)
 * This applies basic sharpening and upscaling without AI
 */
export async function enhanceWithFallback(
  imageDataUrl: string,
  mode: EnhancementMode
): Promise<EnhancementResult> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')!

        const scale = mode === 'upscale' || mode === 'all' ? 2 : 1
        canvas.width = img.width * scale
        canvas.height = img.height * scale

        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

        const enhancedDataUrl = canvas.toDataURL('image/jpeg', 0.95)

        resolve({
          enhancedImageUrl: enhancedDataUrl,
          processingTime: 0.1,
          scale
        })
      } catch (error) {
        reject(error)
      }
    }
    img.onerror = reject
    img.src = imageDataUrl
  })
}
