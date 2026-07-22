import { describe, expect, it, vi } from 'vitest'
import {
  bindPathTracerControlsChange,
  disposePathTracerOwnedResources,
  safeDispose
} from '../src/viewer/pathTracer/pathTracerLifecycle'

function createControlsMock() {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>()
  return {
    listeners,
    addEventListener: vi.fn((type: string, listener: (...args: unknown[]) => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)!.add(listener)
    }),
    removeEventListener: vi.fn((type: string, listener: (...args: unknown[]) => void) => {
      listeners.get(type)?.delete(listener)
    }),
    dispatch(type: string) {
      for (const listener of listeners.get(type) ?? []) {
        listener()
      }
    },
    count(type: string) {
      return listeners.get(type)?.size ?? 0
    }
  }
}

describe('pathTracerLifecycle (LIFE-2)', () => {
  describe('bindPathTracerControlsChange', () => {
    it('returns null when controls are absent', () => {
      expect(bindPathTracerControlsChange(null, () => {})).toBeNull()
      expect(bindPathTracerControlsChange(undefined, () => {})).toBeNull()
    })

    it('removes the same named listener on unbind', () => {
      const controls = createControlsMock()
      const onChange = vi.fn()

      const unbind = bindPathTracerControlsChange(controls, onChange)
      expect(unbind).toBeTypeOf('function')
      expect(controls.count('change')).toBe(1)

      controls.dispatch('change')
      expect(onChange).toHaveBeenCalledTimes(1)

      unbind!()
      expect(controls.count('change')).toBe(0)

      controls.dispatch('change')
      expect(onChange).toHaveBeenCalledTimes(1)
    })

    it('does not accumulate listeners across bind/unbind cycles', () => {
      const controls = createControlsMock()
      const onChange = vi.fn()

      for (let i = 0; i < 5; i++) {
        const unbind = bindPathTracerControlsChange(controls, onChange)
        expect(controls.count('change')).toBe(1)
        unbind!()
        expect(controls.count('change')).toBe(0)
      }

      expect(onChange).not.toHaveBeenCalled()
    })

    it('only the current binding receives camera-change callbacks', () => {
      const controls = createControlsMock()
      const first = vi.fn()
      const second = vi.fn()

      const unbindFirst = bindPathTracerControlsChange(controls, first)
      unbindFirst!()
      const unbindSecond = bindPathTracerControlsChange(controls, second)

      controls.dispatch('change')
      expect(first).not.toHaveBeenCalled()
      expect(second).toHaveBeenCalledTimes(1)

      unbindSecond!()
      expect(controls.count('change')).toBe(0)
    })
  })

  describe('safeDispose / disposePathTracerOwnedResources', () => {
    it('calls dispose on path tracer, gradient, and auxiliary textures', () => {
      const pathTracer = { dispose: vi.fn() }
      const gradientMap = { dispose: vi.fn() }
      const maskedHDRTexture = { dispose: vi.fn() }
      const colorTexture = { dispose: vi.fn() }

      disposePathTracerOwnedResources({
        pathTracer,
        gradientMap,
        maskedHDRTexture,
        colorTexture
      })

      expect(pathTracer.dispose).toHaveBeenCalledTimes(1)
      expect(gradientMap.dispose).toHaveBeenCalledTimes(1)
      expect(maskedHDRTexture.dispose).toHaveBeenCalledTimes(1)
      expect(colorTexture.dispose).toHaveBeenCalledTimes(1)
    })

    it('skips managed masked HDR textures', () => {
      const maskedHDRTexture = { dispose: vi.fn() }
      const gradientMap = { dispose: vi.fn() }

      disposePathTracerOwnedResources({
        pathTracer: { dispose: vi.fn() },
        gradientMap,
        maskedHDRTexture,
        maskedHDRIsManaged: true
      })

      expect(maskedHDRTexture.dispose).not.toHaveBeenCalled()
      expect(gradientMap.dispose).toHaveBeenCalledTimes(1)
    })

    it('is idempotent for missing resources and dispose errors', () => {
      expect(() => disposePathTracerOwnedResources({})).not.toThrow()
      expect(safeDispose(null)).toBe(false)
      expect(safeDispose({})).toBe(false)

      const boom = {
        dispose: vi.fn(() => {
          throw new Error('already disposed')
        })
      }
      expect(safeDispose(boom)).toBe(false)
      expect(boom.dispose).toHaveBeenCalledTimes(1)

      // Second owned-resources pass with already-disposed mocks must not throw.
      expect(() =>
        disposePathTracerOwnedResources({
          pathTracer: boom,
          gradientMap: boom
        })
      ).not.toThrow()
    })
  })
})
