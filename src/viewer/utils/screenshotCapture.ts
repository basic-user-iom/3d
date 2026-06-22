import * as THREE from 'three'

function readRendererPixelsToDataUrl(renderer: THREE.WebGLRenderer, width: number, height: number): string {
  const pixels = new Uint8Array(width * height * 4)
  const gl = renderer.getContext() as WebGLRenderingContext | WebGL2RenderingContext
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Failed to create 2D context for screenshot capture')
  }

  const imageData = ctx.createImageData(width, height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcIdx = ((height - 1 - y) * width + x) * 4
      const dstIdx = (y * width + x) * 4
      imageData.data[dstIdx] = pixels[srcIdx]
      imageData.data[dstIdx + 1] = pixels[srcIdx + 1]
      imageData.data[dstIdx + 2] = pixels[srcIdx + 2]
      imageData.data[dstIdx + 3] = pixels[srcIdx + 3]
    }
  }
  ctx.putImageData(imageData, 0, 0)
  return canvas.toDataURL('image/png')
}

function flipPixelRowsToImageData(
  pixels: Uint8Array,
  width: number,
  height: number
): ImageData {
  const imageData = new ImageData(width, height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcIdx = ((height - 1 - y) * width + x) * 4
      const dstIdx = (y * width + x) * 4
      imageData.data[dstIdx] = pixels[srcIdx]
      imageData.data[dstIdx + 1] = pixels[srcIdx + 1]
      imageData.data[dstIdx + 2] = pixels[srcIdx + 2]
      imageData.data[dstIdx + 3] = pixels[srcIdx + 3]
    }
  }
  return imageData
}

/**
 * Read pixels from a WebGL render target into a PNG data URL.
 */
export function readRenderTargetToDataUrl(
  renderer: THREE.WebGLRenderer,
  renderTarget: THREE.WebGLRenderTarget,
  width: number,
  height: number
): string {
  const pixels = new Uint8Array(width * height * 4)
  renderer.readRenderTargetPixels(renderTarget, 0, 0, width, height, pixels)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Failed to create 2D context for render target capture')
  }

  ctx.putImageData(flipPixelRowsToImageData(pixels, width, height), 0, 0)
  return canvas.toDataURL('image/png')
}

/**
 * Read the current renderer framebuffer into a PNG data URL.
 */
export function readRendererFrameToDataUrl(
  renderer: THREE.WebGLRenderer,
  width: number = renderer.domElement.width,
  height: number = renderer.domElement.height
): string {
  return readRendererPixelsToDataUrl(renderer, width, height)
}

export function downloadDataUrl(filename: string, dataUrl: string): void {
  const link = document.createElement('a')
  link.download = filename
  link.href = dataUrl
  link.click()
}

export interface ScreenshotCaptureSource {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.Camera
  postProcessingSystem?: { render: () => void }
}

/**
 * Capture the current viewer frame without requiring preserveDrawingBuffer.
 */
export function captureViewerScreenshot(source: ScreenshotCaptureSource): string {
  const { renderer, scene, camera, postProcessingSystem } = source
  const width = renderer.domElement.width
  const height = renderer.domElement.height

  if (postProcessingSystem) {
    postProcessingSystem.render()
  } else {
    renderer.render(scene, camera)
  }

  return readRendererPixelsToDataUrl(renderer, width, height)
}
