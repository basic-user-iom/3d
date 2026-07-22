import { describe, expect, it } from 'vitest'
import { shallow } from 'zustand/shallow'
import {
  APP_SHELL_UNRELATED_STORE_KEYS,
  VIEWER_CANVAS_UNRELATED_STORE_KEYS,
  selectAppShellStore,
  selectViewerCanvasStore
} from '../src/utils/perfStoreSelectors'
import { OPTIONAL_PANEL_IDS, OPTIONAL_PANEL_LOADERS } from '../src/utils/optionalPanels'
import type { AppState } from '../src/store/useAppStore'

const stableActions = {
  setSelectedObject: () => {},
  setTransformMode: () => {},
  setPathTracerActive: () => {},
  togglePathTracerPreview: () => {},
  toggleCameraViewsPanel: () => {},
  addToUndoStack: () => {},
  undo: () => {},
  redo: () => {}
}

function fakeState(overrides: Partial<AppState> = {}): AppState {
  return {
    transformMode: 'translate',
    selectedObject: null,
    showMaterialPanel: false,
    showLightingPanel: false,
    pixelRatio: -1,
    maxPixelRatio: 2,
    streetsGLIframeOverlay: false,
    renderMode: 'product',
    streetsGLIframeInteractive: false,
    pathTracerActive: false,
    showGrid: true,
    showAxes: true,
    showLightHelpers: false,
    showBoundingBoxes: false,
    showShadowPlane: false,
    showTextureManagementPanel: false,
    showOptimizationPanel: false,
    showObjectsPanel: false,
    showRoomsPanel: false,
    showRevitConnectionPanel: false,
    showRenderingQualityPanel: false,
    showCameraViewsPanel: false,
    showWeatherPanel: false,
    showWebExportPanel: false,
    showPlacesPanel: false,
    showTransformPanel: false,
    showPathTracerPreview: false,
    showPrimitivesPanel: false,
    showRenderingEffectsPanel: false,
    showEdgeEnhancementPanel: false,
    showSmoothingPanel: false,
    showPointCloudPanel: false,
    showOSMGroundV2Panel: false,
    showPolygonDrawingPanel: false,
    showHotspotsPanel: false,
    showShaderEditorPanel: false,
    showCubesViewer: false,
    showStreetsGLDemo: false,
    showAIEnhancementPanel: false,
    showShadowSystemTestPanel: false,
    showHDRTestPanel: false,
    showHDRShadowDemoPanel: false,
    showTodoPanel: false,
    streetsGLShowUI: false,
    streetsGLGroundLat: 0,
    streetsGLGroundLon: 0,
    streetsGLGroundZoom: 15,
    streetsGLIframeReloadKey: 0,
    fogDensity: 0,
    rainIntensity: 0,
    snowIntensity: 0,
    enableStandaloneWeather: false,
    cloudDensity: 0,
    sceneRevision: 0,
    canUndo: false,
    canRedo: false,
    todoItems: [],
    projectObjects: [],
    cameraViews: [],
    directionalLights: [],
    error: null,
    loading: false,
    progress: 0,
    loadingMessage: '',
    ambientIntensity: 1,
    hdrUrl: null,
    bloomEnabled: false,
    ...stableActions,
    ...overrides
  } as unknown as AppState
}

describe('PERF-5 store selectors', () => {
  it('viewer canvas selector ignores unrelated high-churn keys', () => {
    const base = fakeState()
    const a = selectViewerCanvasStore(base)
    const b = selectViewerCanvasStore(
      fakeState({
        todoItems: [{ id: '1', title: 'x', status: 'pending' }],
        showTodoPanel: true,
        projectObjects: [{ id: 'o1' } as any],
        cameraViews: [{ id: 'c1' } as any],
        fogDensity: 0.5,
        cloudDensity: 0.8,
        rainIntensity: 1,
        snowIntensity: 1,
        error: 'boom',
        loading: true,
        progress: 42,
        loadingMessage: 'loading…'
      })
    )

    for (const key of VIEWER_CANVAS_UNRELATED_STORE_KEYS) {
      expect(Object.prototype.hasOwnProperty.call(a, key)).toBe(false)
    }
    expect(shallow(a, b)).toBe(true)
  })

  it('viewer canvas selector reacts when subscribed fields change', () => {
    const a = selectViewerCanvasStore(fakeState({ pixelRatio: -1 }))
    const b = selectViewerCanvasStore(fakeState({ pixelRatio: 1.5 }))
    expect(shallow(a, b)).toBe(false)
    expect(b.pixelRatio).toBe(1.5)
  })

  it('app shell selector ignores unrelated high-churn keys', () => {
    const a = selectAppShellStore(fakeState())
    const b = selectAppShellStore(
      fakeState({
        todoItems: [{ id: '1', title: 'x', status: 'pending' }],
        projectObjects: [{ id: 'o1' } as any],
        cameraViews: [{ id: 'c1' } as any],
        directionalLights: [{ id: 'l1' } as any],
        error: 'boom',
        loading: true,
        progress: 10,
        loadingMessage: 'wait',
        ambientIntensity: 0.2,
        hdrUrl: 'hdr.hdr',
        bloomEnabled: true
      })
    )

    for (const key of APP_SHELL_UNRELATED_STORE_KEYS) {
      expect(Object.prototype.hasOwnProperty.call(a, key)).toBe(false)
    }
    expect(shallow(a, b)).toBe(true)
  })

  it('app shell selector reacts when panel visibility changes', () => {
    const a = selectAppShellStore(fakeState({ showPathTracerPreview: false }))
    const b = selectAppShellStore(fakeState({ showPathTracerPreview: true }))
    expect(shallow(a, b)).toBe(false)
    expect(b.showPathTracerPreview).toBe(true)
  })
})

describe('PERF-5 optional panel lazy loaders', () => {
  it('registers the high-impact optional panels from the plan', () => {
    expect(OPTIONAL_PANEL_IDS).toEqual(
      expect.arrayContaining([
        'pathTracer',
        'webExport',
        'textureManagement',
        'aiEnhancement',
        'pointCloud',
        'shaderEditor',
        'rooms'
      ])
    )
    expect(OPTIONAL_PANEL_IDS.length).toBeGreaterThanOrEqual(15)
  })

  it('each loader is a dynamic import factory (not invoked here)', () => {
    for (const id of OPTIONAL_PANEL_IDS) {
      expect(typeof OPTIONAL_PANEL_LOADERS[id]).toBe('function')
      // Vite rewrites import() in tests; assert the dynamic module path remains.
      expect(OPTIONAL_PANEL_LOADERS[id].toString()).toMatch(/components\/[A-Za-z0-9]+\.tsx/)
    }
  })
})
