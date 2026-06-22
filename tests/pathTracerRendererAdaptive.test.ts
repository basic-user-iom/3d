import { describe, expect, test, beforeEach, vi } from 'vitest'

type UseAppStoreType = typeof import('../src/store/useAppStore').useAppStore
type PathTracerRendererType = typeof import('../src/viewer/pathTracer/PathTracerModule').PathTracerRenderer
type PathTracerTelemetry = import('../src/viewer/pathTracer/PathTracerModule').PathTracerTelemetry

describe('PathTracerRenderer adaptive target evaluation', () => {
  let useAppStore: UseAppStoreType
  let PathTracerRenderer: PathTracerRendererType
  let evaluateAdaptiveTarget: (this: any, mode: 'gpu' | 'cpu', telemetry: PathTracerTelemetry) => void

  beforeEach(async () => {
    vi.resetModules()
    ;({ useAppStore } = await import('../src/store/useAppStore'))
    ;({ PathTracerRenderer } = await import('../src/viewer/pathTracer/PathTracerModule'))
    evaluateAdaptiveTarget = (PathTracerRenderer.prototype as any).evaluateAdaptiveTarget
  })

  test('increases GPU auto target when telemetry is fast', () => {
    const store = useAppStore.getState()
    store.setPathTracerAutoTarget('gpu', 64)

    const renderer: any = {
      previewMode: true,
      previewPausedForInteraction: false,
      config: { samples: 64 },
      gpuPathTracerReady: true,
      gpuPathTracer: { samples: 10 },
      pathTracer: null,
      lastAutoAdjustTime: { gpu: -5000, cpu: -5000 },
      applySampleTarget: vi.fn(function (this: any, _mode: 'gpu' | 'cpu', samples: number) {
        this.config.samples = samples
      }),
      getCurrentSampleCount: (PathTracerRenderer.prototype as any).getCurrentSampleCount
    }

    const telemetry: PathTracerTelemetry = {
      mode: 'gpu',
      avgSampleTimeMs: 0.2,
      maxSampleTimeMs: 0.4,
      samplesPerSecond: 120,
      samplesMeasured: 10,
      lastUpdated: performance.now()
    }

    evaluateAdaptiveTarget.call(renderer, 'gpu', telemetry)

    const updated = useAppStore.getState()
    expect(updated.pathTracerAutoTarget.gpu).toBeGreaterThan(64)
    expect(renderer.config.samples).toBe(updated.pathTracerAutoTarget.gpu)
    expect(renderer.applySampleTarget).toHaveBeenCalled()
    expect(renderer.lastAutoAdjustTime.gpu).toBeGreaterThan(0)
  })

  test('decreases CPU auto target when telemetry is slow', () => {
    const store = useAppStore.getState()
    store.setPathTracerMode('cpu')
    store.setPathTracerAutoTarget('cpu', 256)

    const renderer: any = {
      previewMode: true,
      previewPausedForInteraction: false,
      config: { samples: 256 },
      gpuPathTracerReady: false,
      gpuPathTracer: null,
      pathTracer: {
        getSampleCount: () => 220,
        updateConfig: vi.fn()
      },
      lastAutoAdjustTime: { gpu: -5000, cpu: -5000 },
      applySampleTarget: vi.fn(function (this: any, mode: 'gpu' | 'cpu', samples: number) {
        this.config.samples = samples
        if (mode === 'cpu' && this.pathTracer && typeof this.pathTracer.updateConfig === 'function') {
          this.pathTracer.updateConfig({ samples })
        }
      }),
      getCurrentSampleCount: (PathTracerRenderer.prototype as any).getCurrentSampleCount
    }

    const telemetry: PathTracerTelemetry = {
      mode: 'cpu',
      avgSampleTimeMs: 15,
      maxSampleTimeMs: 20,
      samplesPerSecond: 5,
      samplesMeasured: 20,
      lastUpdated: performance.now()
    }

    evaluateAdaptiveTarget.call(renderer, 'cpu', telemetry)

    const updated = useAppStore.getState()
    expect(updated.pathTracerAutoTarget.cpu).toBe(updated.pathTracerSampleTargets.cpu)
    expect(renderer.config.samples).toBe(updated.pathTracerSampleTargets.cpu)
    expect(renderer.applySampleTarget).toHaveBeenCalled()
    expect(renderer.pathTracer.updateConfig).toHaveBeenCalledWith({
      samples: updated.pathTracerSampleTargets.cpu
    })
    expect(renderer.lastAutoAdjustTime.cpu).toBeGreaterThan(0)
  })
})


