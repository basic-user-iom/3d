/**
 * PERF-5: lazy-load factories for optional / heavy panels.
 * Keep these out of the initial App module graph until the panel is opened.
 */
export const OPTIONAL_PANEL_LOADERS = {
  pathTracer: () => import('../components/PathTracerDemoPanel'),
  webExport: () => import('../components/WebExportPanel'),
  textureManagement: () => import('../components/TextureManagementPanel'),
  aiEnhancement: () => import('../components/AIEnhancementPanel'),
  pointCloud: () => import('../components/PointCloudPanel'),
  osmGroundV2: () => import('../components/OSMGroundV2Panel'),
  cubesViewer: () => import('../components/CubesViewer'),
  streetsGLDemo: () => import('../components/StreetsGLDemo'),
  shadowSystemTest: () => import('../components/ShadowSystemTestPanel'),
  hdrTest: () => import('../components/HDRTestPanel'),
  hdrShadowDemo: () => import('../components/HDRShadowDemoPanel'),
  revitConnection: () => import('../components/RevitConnectionPanel'),
  places: () => import('../components/PlacesPanel'),
  primitives: () => import('../components/PrimitivesPanel'),
  renderingEffects: () => import('../components/RenderingEffectsPanel'),
  edgeEnhancement: () => import('../components/EdgeEnhancementPanel'),
  smoothing: () => import('../components/SmoothingPanel'),
  polygonDrawing: () => import('../components/PolygonDrawingPanel'),
  rooms: () => import('../components/RoomsPanel'),
  shaderEditor: () => import('../components/ShaderEditorPanel'),
  todo: () => import('../components/TodoPanel')
} as const

export type OptionalPanelId = keyof typeof OPTIONAL_PANEL_LOADERS

export const OPTIONAL_PANEL_IDS = Object.keys(OPTIONAL_PANEL_LOADERS) as OptionalPanelId[]
