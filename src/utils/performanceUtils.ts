/**
 * Performance Utilities
 * GPU detection, multi-threading support, and platform detection
 * Cross-platform support for Mac and Windows
 */

export interface GPUInfo {
  vendor: string
  renderer: string
  version: string
  shadingLanguageVersion: string
  maxTextureSize: number
  maxVertexAttribs: number
  maxVertexUniformVectors: number
  maxFragmentUniformVectors: number
  maxViewportDims: [number, number]
  maxTextureImageUnits: number
  maxCombinedTextureImageUnits: number
  maxCubeMapTextureSize: number
  maxRenderbufferSize: number
  maxColorAttachments: number
  isHighPerformance: boolean
  isIntegrated: boolean
  supportsWebGL2: boolean
  supportsOffscreenCanvas: boolean
  supportsWebWorkers: boolean
}

export interface PlatformInfo {
  os: 'windows' | 'mac' | 'linux' | 'ios' | 'android' | 'unknown'
  browser: 'chrome' | 'firefox' | 'safari' | 'edge' | 'opera' | 'unknown'
  isMobile: boolean
  isTablet: boolean
  cpuCores: number
  memoryEstimate: number | null // in MB (if available)
}

/**
 * Detect GPU information from WebGL context
 */
export function detectGPU(canvas?: HTMLCanvasElement | OffscreenCanvas): GPUInfo | null {
  try {
    const getWebGLContext = (
      source: HTMLCanvasElement | OffscreenCanvas
    ): WebGLRenderingContext | WebGL2RenderingContext | null => {
      return (
        source.getContext('webgl2') ||
        source.getContext('webgl') ||
        (source instanceof HTMLCanvasElement ? source.getContext('experimental-webgl') : null)
      ) as WebGLRenderingContext | WebGL2RenderingContext | null
    }

    // Try to get WebGL2 context first, fallback to WebGL1
    const gl = canvas
      ? getWebGLContext(canvas)
      : getWebGLContext(document.createElement('canvas'))

    if (!gl) {
      return null
    }

    const debugInfo = (gl as any).getExtension('WEBGL_debug_renderer_info')
    const vendor = debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)
    const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
    const version = gl.getParameter(gl.VERSION)
    const shadingLanguageVersion = gl.getParameter(gl.SHADING_LANGUAGE_VERSION)

    // Detect if GPU is integrated (Intel, AMD APU) or dedicated (NVIDIA, AMD discrete)
    const rendererLower = renderer.toLowerCase()
    const isIntegrated = 
      rendererLower.includes('intel') ||
      rendererLower.includes('integrated') ||
      (rendererLower.includes('amd') && (rendererLower.includes('apu') || rendererLower.includes('radeon graphics'))) ||
      rendererLower.includes('apple') // Apple Silicon (integrated)

    // Detect high-performance GPUs
    const isHighPerformance = 
      rendererLower.includes('nvidia') ||
      rendererLower.includes('geforce') ||
      rendererLower.includes('rtx') ||
      rendererLower.includes('gtx') ||
      (rendererLower.includes('amd') && (rendererLower.includes('radeon rx') || rendererLower.includes('radeon pro'))) ||
      rendererLower.includes('radeon pro') ||
      rendererLower.includes('firepro') ||
      rendererLower.includes('quadro') ||
      rendererLower.includes('tesla')

    const supportsWebGL2 = gl instanceof WebGL2RenderingContext

    return {
      vendor: vendor || 'Unknown',
      renderer: renderer || 'Unknown',
      version: version || 'Unknown',
      shadingLanguageVersion: shadingLanguageVersion || 'Unknown',
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
      maxVertexAttribs: gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
      maxVertexUniformVectors: gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS),
      maxFragmentUniformVectors: gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS),
      maxViewportDims: gl.getParameter(gl.MAX_VIEWPORT_DIMS),
      maxTextureImageUnits: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),
      maxCombinedTextureImageUnits: gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS),
      maxCubeMapTextureSize: gl.getParameter(gl.MAX_CUBE_MAP_TEXTURE_SIZE),
      maxRenderbufferSize: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
      maxColorAttachments: supportsWebGL2 ? gl.getParameter((gl as WebGL2RenderingContext).MAX_COLOR_ATTACHMENTS) : 0,
      isHighPerformance,
      isIntegrated,
      supportsWebGL2: !!supportsWebGL2,
      supportsOffscreenCanvas: typeof OffscreenCanvas !== 'undefined',
      supportsWebWorkers: typeof Worker !== 'undefined'
    }
  } catch (error) {
    console.warn('[PerformanceUtils] Failed to detect GPU:', error)
    return null
  }
}

/**
 * Detect platform information
 */
export function detectPlatform(): PlatformInfo {
  const userAgent = navigator.userAgent.toLowerCase()
  const platform = navigator.platform.toLowerCase()

  // Detect OS
  let os: PlatformInfo['os'] = 'unknown'
  if (platform.includes('win') || userAgent.includes('windows')) {
    os = 'windows'
  } else if (platform.includes('mac') || userAgent.includes('macintosh') || userAgent.includes('mac os')) {
    os = 'mac'
  } else if (platform.includes('linux') || userAgent.includes('linux')) {
    os = 'linux'
  } else if (userAgent.includes('iphone') || userAgent.includes('ipod')) {
    os = 'ios'
  } else if (userAgent.includes('android')) {
    os = 'android'
  }

  // Detect browser
  let browser: PlatformInfo['browser'] = 'unknown'
  if (userAgent.includes('chrome') && !userAgent.includes('edg')) {
    browser = 'chrome'
  } else if (userAgent.includes('firefox')) {
    browser = 'firefox'
  } else if (userAgent.includes('safari') && !userAgent.includes('chrome')) {
    browser = 'safari'
  } else if (userAgent.includes('edg')) {
    browser = 'edge'
  } else if (userAgent.includes('opera') || userAgent.includes('opr')) {
    browser = 'opera'
  }

  // Detect mobile/tablet
  const isMobile = /mobile|android|iphone|ipod|blackberry|iemobile|opera mini/i.test(userAgent)
  const isTablet = /ipad|android(?!.*mobile)|tablet/i.test(userAgent)

  // Get CPU cores
  const cpuCores = navigator.hardwareConcurrency || 4 // Default to 4 if not available

  // Try to get memory estimate (Chrome only)
  let memoryEstimate: number | null = null
  if ('memory' in performance) {
    const mem = (performance as any).memory
    if (mem && mem.jsHeapSizeLimit) {
      memoryEstimate = Math.round(mem.jsHeapSizeLimit / (1024 * 1024)) // Convert to MB
    }
  }

  return {
    os,
    browser,
    isMobile,
    isTablet,
    cpuCores,
    memoryEstimate
  }
}

/**
 * Get recommended performance settings based on GPU and platform
 */
export function getRecommendedSettings(gpuInfo: GPUInfo | null, platformInfo: PlatformInfo) {
  const recommendations = {
    useHighPerformanceGPU: false,
    preferCPU: false,
    maxPixelRatio: 1.5,
    useLogarithmicDepthBuffer: false,
    textureAnisotropy: 4,
    shadowMapSize: 2048,
    enablePostProcessing: true,
    enableSSS: false,
    enableSSR: false,
    enableAO: false
  }

  if (!gpuInfo) {
    // No GPU detected, use conservative settings
    recommendations.preferCPU = true
    recommendations.maxPixelRatio = 1.0
    recommendations.shadowMapSize = 1024
    recommendations.enablePostProcessing = false
    return recommendations
  }

  // High-performance GPU settings
  if (gpuInfo.isHighPerformance && !gpuInfo.isIntegrated) {
    recommendations.useHighPerformanceGPU = true
    recommendations.maxPixelRatio = 2.0
    recommendations.textureAnisotropy = 16
    recommendations.shadowMapSize = 4096
    recommendations.enableSSS = true
    recommendations.enableSSR = true
    recommendations.enableAO = true
  }
  // Integrated GPU settings
  else if (gpuInfo.isIntegrated) {
    recommendations.maxPixelRatio = 1.0
    recommendations.textureAnisotropy = 4
    recommendations.shadowMapSize = 2048
    recommendations.enableSSS = false
    recommendations.enableSSR = false
    recommendations.enableAO = false
  }
  // Unknown/mid-range GPU
  else {
    recommendations.maxPixelRatio = 1.5
    recommendations.textureAnisotropy = 8
    recommendations.shadowMapSize = 2048
    recommendations.enableSSS = false
    recommendations.enableSSR = false
    recommendations.enableAO = false
  }

  // Platform-specific adjustments
  if (platformInfo.os === 'mac') {
    // Mac-specific optimizations
    if (gpuInfo.renderer.toLowerCase().includes('apple')) {
      // Apple Silicon - can handle more
      recommendations.maxPixelRatio = 1.5
      recommendations.textureAnisotropy = 8
    }
  } else if (platformInfo.os === 'windows') {
    // Windows-specific optimizations
    if (gpuInfo.isHighPerformance) {
      recommendations.maxPixelRatio = 2.0
    }
  }

  // Mobile/tablet adjustments
  if (platformInfo.isMobile || platformInfo.isTablet) {
    recommendations.maxPixelRatio = 1.0
    recommendations.shadowMapSize = 1024
    recommendations.textureAnisotropy = 2
    recommendations.enablePostProcessing = false
    recommendations.enableSSS = false
    recommendations.enableSSR = false
    recommendations.enableAO = false
  }

  return recommendations
}

/**
 * Check if Web Workers are available and can be used
 */
export function canUseWebWorkers(): boolean {
  return typeof Worker !== 'undefined'
}

/**
 * Check if OffscreenCanvas is available (for Web Workers with canvas)
 */
export function canUseOffscreenCanvas(): boolean {
  return typeof OffscreenCanvas !== 'undefined'
}

/**
 * Get optimal worker count based on CPU cores
 */
export function getOptimalWorkerCount(): number {
  const cores = navigator.hardwareConcurrency || 4
  // Use 1 less than total cores to keep one for main thread
  // But at least 1, and max 4 workers
  return Math.max(1, Math.min(cores - 1, 4))
}

/**
 * Log performance information for debugging
 */
export function logPerformanceInfo() {
  const gpuInfo = detectGPU()
  const platformInfo = detectPlatform()
  const recommendations = getRecommendedSettings(gpuInfo, platformInfo)

  console.group('🚀 Performance Information')
  console.log('Platform:', platformInfo)
  if (gpuInfo) {
    console.log('GPU:', {
      vendor: gpuInfo.vendor,
      renderer: gpuInfo.renderer,
      version: gpuInfo.version,
      isHighPerformance: gpuInfo.isHighPerformance,
      isIntegrated: gpuInfo.isIntegrated,
      supportsWebGL2: gpuInfo.supportsWebGL2,
      maxTextureSize: gpuInfo.maxTextureSize,
      supportsOffscreenCanvas: gpuInfo.supportsOffscreenCanvas,
      supportsWebWorkers: gpuInfo.supportsWebWorkers
    })
  } else {
    console.warn('GPU detection failed')
  }
  console.log('Recommended Settings:', recommendations)
  console.log('Optimal Worker Count:', getOptimalWorkerCount())
  console.groupEnd()

  return { gpuInfo, platformInfo, recommendations }
}









































