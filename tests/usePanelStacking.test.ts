import { describe, expect, test } from 'vitest'
import { isTransformPanelVisible } from '../src/hooks/usePanelStacking'

describe('isTransformPanelVisible', () => {
  test('requires both showTransformPanel and a selected object', () => {
    expect(isTransformPanelVisible(false, null)).toBe(false)
    expect(isTransformPanelVisible(true, null)).toBe(false)
    expect(isTransformPanelVisible(false, {})).toBe(false)
    expect(isTransformPanelVisible(true, {})).toBe(true)
  })
})

describe('openTransformPanelForSelection', () => {
  test('opens transform panel and sets translate mode in city workflows', async () => {
    const { useAppStore } = await import('../src/store/useAppStore')
    const { openTransformPanelForSelection } = useAppStore.getState()

    openTransformPanelForSelection('translate')

    const state = useAppStore.getState()
    expect(state.showTransformPanel).toBe(true)
    expect(state.transformMode).toBe('translate')
  })
})
