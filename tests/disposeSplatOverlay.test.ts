import { describe, expect, test, vi } from 'vitest'

import { disposeSplatOverlay } from '../src/viewer/loaders/disposeSplatOverlay'

type FakeNode = {
  userData: Record<string, unknown>
  dispose?: () => void
  children: FakeNode[]
  traverse: (cb: (node: FakeNode) => void) => void
}

function makeNode(userData: Record<string, unknown> = {}, dispose?: () => void): FakeNode {
  const node: FakeNode = {
    userData,
    dispose,
    children: [],
    traverse(cb) {
      cb(node)
      node.children.forEach((child) => child.traverse(cb))
    }
  }
  return node
}

describe('disposeSplatOverlay', () => {
  test('calls dispose on a gaussian splat overlay root', () => {
    const dispose = vi.fn()
    const root = makeNode({ gaussianSplatOverlay: true, isGaussianSplatViewer: true }, dispose)

    const result = disposeSplatOverlay(root as any)

    expect(dispose).toHaveBeenCalledTimes(1)
    expect(result).toBe(true)
  })

  test('disposes a splat overlay nested inside the removed subtree', () => {
    const dispose = vi.fn()
    const parent = makeNode({ isModel: true })
    parent.children.push(makeNode({ gaussianSplatOverlay: true }, dispose))

    const result = disposeSplatOverlay(parent as any)

    expect(dispose).toHaveBeenCalledTimes(1)
    expect(result).toBe(true)
  })

  test('does not call dispose on ordinary objects', () => {
    const dispose = vi.fn()
    const root = makeNode({ isModel: true }, dispose)

    const result = disposeSplatOverlay(root as any)

    expect(dispose).not.toHaveBeenCalled()
    expect(result).toBe(false)
  })

  test('ignores a splat overlay flag with no dispose function', () => {
    const root = makeNode({ gaussianSplatOverlay: true })

    expect(() => disposeSplatOverlay(root as any)).not.toThrow()
    expect(disposeSplatOverlay(root as any)).toBe(false)
  })

  test('swallows errors thrown by dispose so removal is never blocked', () => {
    const dispose = vi.fn(() => {
      throw new Error('overlay teardown failed')
    })
    const root = makeNode({ gaussianSplatOverlay: true }, dispose)

    expect(() => disposeSplatOverlay(root as any)).not.toThrow()
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  test('handles null and malformed input safely', () => {
    expect(disposeSplatOverlay(null)).toBe(false)
    expect(disposeSplatOverlay(undefined)).toBe(false)
    expect(disposeSplatOverlay({} as any)).toBe(false)
  })
})
