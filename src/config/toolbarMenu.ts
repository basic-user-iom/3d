export type MenuSectionId = 'files' | 'modeling' | 'rendering' | 'presentation' | 'developing'

export type MenuLayout = Record<MenuSectionId, MenuActionId[]>
export type MenuRowBreaks = Record<MenuSectionId, MenuActionId[]>

export interface MenuSectionDefinition {
  id: MenuSectionId
  label: string
  description?: string
}

export const MENU_SECTIONS: MenuSectionDefinition[] = [
  { id: 'files', label: 'Files' },
  { id: 'modeling', label: 'Modeling' },
  { id: 'rendering', label: 'Rendering' },
  { id: 'presentation', label: 'Presentation' },
  { id: 'developing', label: 'Under consideration' }
]

export const createEmptyMenuRowBreaks = (): MenuRowBreaks =>
  MENU_SECTIONS.reduce((acc, section) => {
    acc[section.id] = []
    return acc
  }, {} as MenuRowBreaks)

export type MenuActionId =
  | 'openFiles'
  | 'openFolder'
  | 'loadUrl'
  | 'fitView'
  | 'resetScene'
  | 'screenshot'
  | 'exportPresentation'
  | 'toggleFullscreen'
  | 'toggleStats'
  | 'toggleTransformPanel'
  | 'toggleLightingPanel'
  | 'toggleObjectsPanel'
  | 'toggleCameraViewsPanel'
  | 'toggleRenderingQualityPanel'
  | 'toggleWeatherPanel'
  | 'togglePathTracer'
  | 'toggleMaterialPanel'
  | 'toggleTextureManagementPanel'
  | 'toggleOptimizationPanel'
  | 'toggleShadowPlane'
  | 'toggleShortcuts'
  | 'resetMenuLayout'
  | 'saveMenuLayout'
  | 'saveProject'
  | 'loadProject'
  | 'toggleTodoPanel'
  | 'togglePrimitivesPanel'
  | 'toggleRenderingEffectsPanel'
  | 'toggleEdgeEnhancementPanel'
  | 'toggleSmoothingPanel'
  | 'togglePointCloudPanel'
  | 'toggleOSMGroundV2Panel'
  | 'togglePolygonDrawingPanel'
  | 'toggleHotspotsPanel'
  | 'toggleCubesViewer'
  | 'toggleAIEnhancementPanel'
  | 'toggleShaderEditorPanel'
  | 'toggleShadowSystemTestPanel'
  | 'toggleHDRTestPanel'
  | 'toggleHDRShadowDemoPanel'
  | 'togglePlacesPanel'
  | 'toggleStreetsGLDemo'
  | 'toggleRoomsPanel'
  | 'toggleRevitConnectionPanel'

export const MENU_STORAGE_KEY = 'viewer.menuLayout'
export const MENU_LAYOUT_VERSION = 7 // Increment this to force reset to new default layout (v4: moved Plane and Shortcuts to toolbar header, v5: moved Transform to toolbar header, v6: moved Fit to toolbar header, v7: added Point Cloud panel)

export const DEFAULT_MENU_LAYOUT: MenuLayout = {
  files: [
    'openFiles',
    'openFolder',
    'saveProject',
    'loadProject',
    'loadUrl',
    'toggleRevitConnectionPanel'
  ],
  modeling: [
    'toggleObjectsPanel',
    'toggleRoomsPanel',
    'toggleMaterialPanel',
    'toggleTextureManagementPanel',
    // 'toggleTransformPanel' removed - now in toolbar header
    // 'toggleShadowPlane' removed - now in toolbar header
    'toggleOptimizationPanel', // Optimize
    'togglePrimitivesPanel', // Primitives
    'togglePolygonDrawingPanel', // Polygons
    'toggleCubesViewer', // Cubes
    'toggleOSMGroundV2Panel' // OSM 3D
  ],
  rendering: [
    'toggleLightingPanel', // Lighting
    'toggleWeatherPanel', // Weather
    'togglePathTracer', // Path Trace
    'toggleRenderingQualityPanel', // Quality
    'toggleRenderingEffectsPanel', // Effects
    'toggleEdgeEnhancementPanel', // Edge
    'toggleSmoothingPanel', // Smooth
    'togglePointCloudPanel' // Point Cloud
  ],
  presentation: [
    // 'fitView' removed - now in toolbar header
    'resetScene', // Reset
    'screenshot', // Screenshot
    'toggleCameraViewsPanel', // Camera
    // 'toggleShortcuts' removed - now in toolbar header
    'exportPresentation', // Export Web
    'toggleHotspotsPanel' // Hotspots
  ],
  developing: [
    'resetMenuLayout', // Reset Menu
    'saveMenuLayout', // Save Menu
    'toggleTodoPanel', // TODOS
    'toggleHDRShadowDemoPanel', // HDR Shadow Demo
    'togglePlacesPanel', // Places
    'toggleHDRTestPanel', // HDR Tests
    'toggleShaderEditorPanel', // Shader Demo
    'toggleShadowSystemTestPanel', // Shadow Tests
    'toggleAIEnhancementPanel' // AI Enhance
  ]
}

export const ALL_MENU_ACTIONS: MenuActionId[] = Array.from(
  new Set(
    Object.values(DEFAULT_MENU_LAYOUT).flatMap((actions) => actions)
  )
)

const ALL_MENU_ACTIONS_SET = new Set<MenuActionId>(ALL_MENU_ACTIONS)

export const createDefaultMenuLayout = (): MenuLayout =>
  (Object.keys(DEFAULT_MENU_LAYOUT) as MenuSectionId[]).reduce((acc, section) => {
    acc[section] = [...DEFAULT_MENU_LAYOUT[section]]
    return acc
  }, {} as MenuLayout)

export const normalizeMenuLayout = (
  layout: Partial<Record<MenuSectionId, MenuActionId[]>> | null | undefined
): MenuLayout => {
  const normalized = createDefaultMenuLayout()
  const seen = new Set<MenuActionId>()

  ;(Object.keys(DEFAULT_MENU_LAYOUT) as MenuSectionId[]).forEach((section) => {
    const incoming = layout?.[section] ?? []
    const filtered: MenuActionId[] = []

    incoming.forEach((action) => {
      if (ALL_MENU_ACTIONS_SET.has(action) && !seen.has(action)) {
        filtered.push(action)
        seen.add(action)
      }
    })

    const remainingDefaults = DEFAULT_MENU_LAYOUT[section].filter((action) => !seen.has(action))

    normalized[section] = [...filtered, ...remainingDefaults]
    normalized[section].forEach((action) => seen.add(action))
  })

  return normalized
}

export const cloneMenuLayout = (layout: MenuLayout): MenuLayout =>
  (Object.keys(layout) as MenuSectionId[]).reduce((acc, section) => {
    acc[section] = [...layout[section]]
    return acc
  }, {} as MenuLayout)

export const cloneMenuRowBreaks = (rowBreaks: MenuRowBreaks): MenuRowBreaks => {
  const clone = createEmptyMenuRowBreaks()
  ;(Object.keys(clone) as MenuSectionId[]).forEach((section) => {
    clone[section] = [...(rowBreaks[section] ?? [])]
  })
  return clone
}

export const normalizeMenuRowBreaks = (
  rowBreaks: Partial<Record<MenuSectionId, MenuActionId[]>> | null | undefined,
  layout: MenuLayout
): MenuRowBreaks => {
  const normalized = createEmptyMenuRowBreaks()

  ;(Object.keys(layout) as MenuSectionId[]).forEach((section) => {
    const layoutActions = new Set(layout[section])
    const incoming = rowBreaks?.[section] ?? []
    const seen = new Set<MenuActionId>()

    incoming.forEach((actionId) => {
      if (layoutActions.has(actionId) && !seen.has(actionId)) {
        normalized[section].push(actionId)
        seen.add(actionId)
      }
    })
  })

  return normalized
}


