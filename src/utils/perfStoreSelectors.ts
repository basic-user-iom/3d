import type { AppState } from '../store/useAppStore'

/**
 * PERF-5: narrow Zustand slices for the root shell and viewer canvas.
 * Keep these pickers free of high-churn unrelated fields (todos, projectObjects, etc.).
 */

export function selectViewerCanvasStore(state: AppState) {
  return {
    transformMode: state.transformMode,
    selectedObject: state.selectedObject,
    setSelectedObject: state.setSelectedObject,
    setTransformMode: state.setTransformMode,
    showMaterialPanel: state.showMaterialPanel,
    showLightingPanel: state.showLightingPanel,
    pixelRatio: state.pixelRatio,
    maxPixelRatio: state.maxPixelRatio,
    streetsGLIframeOverlay: state.streetsGLIframeOverlay,
    renderMode: state.renderMode,
    streetsGLIframeInteractive: state.streetsGLIframeInteractive,
    pathTracerActive: state.pathTracerActive
  }
}

export function selectAppShellStore(state: AppState) {
  return {
    showGrid: state.showGrid,
    showAxes: state.showAxes,
    showLightHelpers: state.showLightHelpers,
    showBoundingBoxes: state.showBoundingBoxes,
    showShadowPlane: state.showShadowPlane,
    showMaterialPanel: state.showMaterialPanel,
    showTextureManagementPanel: state.showTextureManagementPanel,
    selectedObject: state.selectedObject,
    setSelectedObject: state.setSelectedObject,
    showLightingPanel: state.showLightingPanel,
    showOptimizationPanel: state.showOptimizationPanel,
    showObjectsPanel: state.showObjectsPanel,
    showRoomsPanel: state.showRoomsPanel,
    showRevitConnectionPanel: state.showRevitConnectionPanel,
    showRenderingQualityPanel: state.showRenderingQualityPanel,
    showCameraViewsPanel: state.showCameraViewsPanel,
    showWeatherPanel: state.showWeatherPanel,
    showWebExportPanel: state.showWebExportPanel,
    showPlacesPanel: state.showPlacesPanel,
    showTransformPanel: state.showTransformPanel,
    showPathTracerPreview: state.showPathTracerPreview,
    setPathTracerActive: state.setPathTracerActive,
    togglePathTracerPreview: state.togglePathTracerPreview,
    toggleCameraViewsPanel: state.toggleCameraViewsPanel,
    showPrimitivesPanel: state.showPrimitivesPanel,
    showRenderingEffectsPanel: state.showRenderingEffectsPanel,
    showEdgeEnhancementPanel: state.showEdgeEnhancementPanel,
    showSmoothingPanel: state.showSmoothingPanel,
    showPointCloudPanel: state.showPointCloudPanel,
    showOSMGroundV2Panel: state.showOSMGroundV2Panel,
    showPolygonDrawingPanel: state.showPolygonDrawingPanel,
    showShaderEditorPanel: state.showShaderEditorPanel,
    showCubesViewer: state.showCubesViewer,
    showStreetsGLDemo: state.showStreetsGLDemo,
    showAIEnhancementPanel: state.showAIEnhancementPanel,
    showShadowSystemTestPanel: state.showShadowSystemTestPanel,
    showHDRTestPanel: state.showHDRTestPanel,
    showHDRShadowDemoPanel: state.showHDRShadowDemoPanel,
    showTodoPanel: state.showTodoPanel,
    streetsGLIframeOverlay: state.streetsGLIframeOverlay,
    streetsGLIframeInteractive: state.streetsGLIframeInteractive,
    streetsGLShowUI: state.streetsGLShowUI,
    streetsGLGroundLat: state.streetsGLGroundLat,
    renderMode: state.renderMode,
    streetsGLGroundLon: state.streetsGLGroundLon,
    streetsGLGroundZoom: state.streetsGLGroundZoom,
    streetsGLIframeReloadKey: state.streetsGLIframeReloadKey,
    transformMode: state.transformMode,
    fogDensity: state.fogDensity,
    rainIntensity: state.rainIntensity,
    snowIntensity: state.snowIntensity,
    enableStandaloneWeather: state.enableStandaloneWeather,
    cloudDensity: state.cloudDensity,
    setTransformMode: state.setTransformMode,
    addToUndoStack: state.addToUndoStack,
    undo: state.undo,
    sceneRevision: state.sceneRevision,
    canUndo: state.canUndo,
    canRedo: state.canRedo,
    redo: state.redo
  }
}

/** High-churn keys that must not force ViewerCanvas shell re-renders. */
export const VIEWER_CANVAS_UNRELATED_STORE_KEYS = [
  'todoItems',
  'showTodoPanel',
  'projectObjects',
  'cameraViews',
  'fogDensity',
  'cloudDensity',
  'rainIntensity',
  'snowIntensity',
  'error',
  'loading',
  'progress',
  'loadingMessage'
] as const

/** High-churn keys that must not appear in the App shell selector. */
export const APP_SHELL_UNRELATED_STORE_KEYS = [
  'todoItems',
  'projectObjects',
  'cameraViews',
  'directionalLights',
  'error',
  'loading',
  'progress',
  'loadingMessage',
  'ambientIntensity',
  'hdrUrl',
  'bloomEnabled'
] as const
