import * as THREE from 'three'
import type { ViewerInstance } from '../ViewerCanvas'
import { useAppStore } from '../../store/useAppStore'

export interface PathTracerTelemetry {
  mode: 'gpu' | 'cpu'
  avgSampleTimeMs: number
  maxSampleTimeMs: number
  samplesPerSecond: number
  samplesMeasured: number
  lastUpdated: number
}

export interface PathTracerRendererOptions {
  viewer?: ViewerInstance | null
  samples?: number
  bounces?: number
  width?: number
  height?: number
  denoiseEnabled?: boolean
  denoiseStrength?: number
}

export interface PathTracerStartOptions {
  onProgress?: (progress: number) => void
  onPreview?: (canvas: HTMLCanvasElement) => void
}

export interface PathTracerStartResult {
  canvas: HTMLCanvasElement | null
  sampleCount: number
}

/**
 * Lightweight compatibility wrapper that keeps legacy tooling (tests, PathTracerOnlyApp)
 * working while the real-time PathTracerDemo handles the in-viewer experience.
 */
export class PathTracerRenderer {
  viewer?: ViewerInstance | null
  config: {
    samples: number
    bounces: number
    width: number
    height: number
    denoiseEnabled: boolean
    denoiseStrength: number
  }
  previewMode = true
  previewPausedForInteraction = false
  gpuPathTracerReady = false
  gpuPathTracer: { samples: number } | null = null
  pathTracer: { getSampleCount?: () => number; updateConfig?: (config: { samples: number }) => void } | null = null
  lastAutoAdjustTime: Record<'gpu' | 'cpu', number> = { gpu: -Infinity, cpu: -Infinity }
  private managedObjects: THREE.Object3D[] = []

  constructor(options: PathTracerRendererOptions = {}) {
    this.viewer = options.viewer ?? null
    this.config = {
      samples: options.samples ?? 128,
      bounces: options.bounces ?? 3,
      width: options.width ?? 1024,
      height: options.height ?? 1024,
      denoiseEnabled: options.denoiseEnabled ?? true,
      denoiseStrength: options.denoiseStrength ?? 0.5
    }
  }

  addObject(object: THREE.Object3D): void {
    this.managedObjects.push(object)
  }

  dispose(): void {
    this.managedObjects.length = 0
    this.pathTracer = null
    this.gpuPathTracer = null
  }

  async start(options: PathTracerStartOptions = {}): Promise<PathTracerStartResult> {
    const canvas =
      (this.viewer?.renderer?.domElement as HTMLCanvasElement | undefined) ?? this.createFallbackCanvas()

    if (canvas) {
      options.onPreview?.(canvas)
    }

    // Simulate immediate completion – this wrapper is primarily for tooling/tests.
    options.onProgress?.(1)

    return {
      canvas,
      sampleCount: this.config.samples
    }
  }

  getCurrentSampleCount(mode: 'gpu' | 'cpu' = 'gpu'): number {
    if (mode === 'gpu') {
      return this.gpuPathTracer?.samples ?? 0
    }
    return this.pathTracer?.getSampleCount?.() ?? 0
  }

  applySampleTarget(mode: 'gpu' | 'cpu', samples: number): void {
    this.config.samples = samples
    if (mode === 'gpu') {
      if (this.gpuPathTracer) {
        this.gpuPathTracer.samples = samples
      }
    } else if (this.pathTracer && typeof this.pathTracer.updateConfig === 'function') {
      this.pathTracer.updateConfig({ samples })
    }
  }

  evaluateAdaptiveTarget(mode: 'gpu' | 'cpu', telemetry: PathTracerTelemetry): void {
    const store = useAppStore.getState()

    if (!store.pathTracerAutoEnabled[mode]) {
      return
    }

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    if (now - this.lastAutoAdjustTime[mode] < 1000) {
      return
    }

    const baseline = store.pathTracerSampleTargets[mode]
    const currentAuto = store.pathTracerAutoTarget[mode] ?? baseline

    let next = currentAuto
    if (mode === 'gpu') {
      const isFast = telemetry.samplesPerSecond > 60 && telemetry.avgSampleTimeMs < 1
      if (!isFast) {
        return
      }
      const maxTarget = Math.max(baseline * 4, baseline + 64)
      next = Math.min(Math.max(currentAuto * 1.5, currentAuto + 16), maxTarget)
    } else {
      const isSlow = telemetry.samplesPerSecond < 10 || telemetry.avgSampleTimeMs > 10
      if (!isSlow) {
        return
      }
      next = baseline
    }

    const clamped = Math.max(1, Math.round(next))
    store.setPathTracerAutoTarget(mode, clamped)
    this.applySampleTarget(mode, clamped)
    this.lastAutoAdjustTime[mode] = now
  }

  private createFallbackCanvas(): HTMLCanvasElement {
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      const canvas = document.createElement('canvas')
      canvas.width = this.config.width
      canvas.height = this.config.height
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.fillStyle = '#000'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }
      return canvas
    }

    // Node/test fallback
    const fallback = {
      width: this.config.width,
      height: this.config.height,
      getContext: () => null,
      toDataURL: () => '',
      toBlob: (_cb: BlobCallback) => {}
    } as unknown as HTMLCanvasElement
    return fallback
  }
}

