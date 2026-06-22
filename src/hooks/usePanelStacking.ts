import { useMemo } from 'react'
import { useAppStore } from '../store/useAppStore'

/**
 * Panel width configurations
 */
const PANEL_WIDTHS: Record<string, number> = {
  // Left-side panels
  material: 380,
  primitives: 360,
  polygonDrawing: 400,
  cubesViewer: 360,
  shaderEditor: 400,
  objects: 420,
  
  // Right-side panels
  transform: 340,
  lighting: 340,
  renderingQuality: 360,
  optimization: 400,
  cameraViews: 400,
  weather: 360,
  hotspots: 380,
  renderingEffects: 360,
  edgeEnhancement: 360,
  aiEnhancement: 420,
  smoothing: 360,
  webExport: 400,
  textureManagement: 380,
  places: 360,
  todo: 360,
  hdrTest: 360,
  hdrShadowDemo: 360,
  shadowTest: 360,
  pathTracerDemo: 400,
  osmGroundV2: 400,
}

/**
 * Panel stacking priority (lower number = stacks closer to edge)
 */
const PANEL_PRIORITY: Record<string, number> = {
  // Left-side panels - Material panel stacks closest to left edge
  material: 1,
  primitives: 2,
  polygonDrawing: 3,
  cubesViewer: 4,
  shaderEditor: 5,
  objects: 6,
  
  // Right-side panels - Transform panel stacks closest to right edge
  transform: 1,
  lighting: 2,
  renderingQuality: 4,
  optimization: 5,
  cameraViews: 6,
  weather: 7,
  hotspots: 8,
  renderingEffects: 9,
  edgeEnhancement: 10,
  aiEnhancement: 11,
  smoothing: 12,
  webExport: 13,
  textureManagement: 14,
  places: 15,
  todo: 16,
  hdrTest: 17,
  hdrShadowDemo: 18,
  shadowTest: 19,
  pathTracerDemo: 20,
  osmGroundV2: 21,
}

interface PanelStackingOptions {
  panelId: string
  anchor: 'left' | 'right'
}

/**
 * Hook to calculate stacking offset for panels to prevent overlaps
 */
/** True when TransformPanel is actually mounted (matches App.tsx render guard). */
export function isTransformPanelVisible(
  showTransformPanel: boolean,
  selectedObject: unknown
): boolean {
  return showTransformPanel && selectedObject != null
}

export function usePanelStacking({ panelId, anchor }: PanelStackingOptions) {
  const {
    showMaterialPanel,
    showPrimitivesPanel,
    showPolygonDrawingPanel,
    showCubesViewer,
    showTransformPanel,
    selectedObject,
    showLightingPanel,
    showObjectsPanel,
    showRenderingQualityPanel,
    showOptimizationPanel,
    showCameraViewsPanel,
    showWeatherPanel,
    showHotspotsPanel,
    showRenderingEffectsPanel,
    showEdgeEnhancementPanel,
    showOSMGroundV2Panel,
    showAIEnhancementPanel,
    showSmoothingPanel,
    showWebExportPanel,
    showTextureManagementPanel,
    showPlacesPanel,
    showTodoPanel,
    showHDRTestPanel,
    showHDRShadowDemoPanel,
    showShadowSystemTestPanel,
    showPathTracerPreview,
    showShaderEditorPanel,
  } = useAppStore()

  const panelStates = useMemo(() => ({
    material: showMaterialPanel && anchor === 'left',
    primitives: showPrimitivesPanel && anchor === 'left',
    polygonDrawing: showPolygonDrawingPanel && anchor === 'left',
    cubesViewer: showCubesViewer && anchor === 'left',
    shaderEditor: showShaderEditorPanel && anchor === 'left',
    objects: showObjectsPanel && anchor === 'left',
    transform: isTransformPanelVisible(showTransformPanel, selectedObject) && anchor === 'right',
    lighting: showLightingPanel && anchor === 'right',
    renderingQuality: showRenderingQualityPanel && anchor === 'right',
    optimization: showOptimizationPanel && anchor === 'right',
    cameraViews: showCameraViewsPanel && anchor === 'right',
    weather: showWeatherPanel && anchor === 'right',
    hotspots: showHotspotsPanel && anchor === 'right',
    renderingEffects: showRenderingEffectsPanel && anchor === 'right',
    edgeEnhancement: showEdgeEnhancementPanel && anchor === 'right',
    aiEnhancement: showAIEnhancementPanel && anchor === 'right',
    smoothing: showSmoothingPanel && anchor === 'right',
    webExport: showWebExportPanel && anchor === 'right',
    textureManagement: showTextureManagementPanel && anchor === 'right',
    places: showPlacesPanel && anchor === 'right',
    todo: showTodoPanel && anchor === 'right',
    hdrTest: showHDRTestPanel && anchor === 'right',
    hdrShadowDemo: showHDRShadowDemoPanel && anchor === 'right',
    shadowTest: showShadowSystemTestPanel && anchor === 'right',
    pathTracerDemo: showPathTracerPreview && anchor === 'right',
    osmGroundV2: showOSMGroundV2Panel && anchor === 'right',
  }), [
    showMaterialPanel,
    showPrimitivesPanel,
    showPolygonDrawingPanel,
    showCubesViewer,
    showTransformPanel,
    selectedObject,
    showLightingPanel,
    showObjectsPanel,
    showRenderingQualityPanel,
    showOptimizationPanel,
    showCameraViewsPanel,
    showWeatherPanel,
    showHotspotsPanel,
    showRenderingEffectsPanel,
    showEdgeEnhancementPanel,
    showOSMGroundV2Panel,
    showAIEnhancementPanel,
    showSmoothingPanel,
    showWebExportPanel,
    showTextureManagementPanel,
    showPlacesPanel,
    showTodoPanel,
    showHDRTestPanel,
    showHDRShadowDemoPanel,
    showShadowSystemTestPanel,
    showPathTracerPreview,
    showOSMGroundV2Panel,
    showShaderEditorPanel,
    anchor,
  ])

  const offset = useMemo(() => {
    const currentPriority = PANEL_PRIORITY[panelId] ?? 999
    
    // Define which panels are on which side
    const leftSidePanels = ['material', 'primitives', 'polygonDrawing', 'cubesViewer', 'shaderEditor', 'objects']
    const rightSidePanels = ['transform', 'lighting', 'renderingQuality', 'optimization', 'cameraViews', 'weather', 'hotspots', 'renderingEffects', 'edgeEnhancement', 'aiEnhancement', 'smoothing', 'webExport', 'textureManagement', 'places', 'todo', 'hdrTest', 'hdrShadowDemo', 'shadowTest', 'pathTracerDemo', 'osmGroundV2']
    
    const isLeftSide = leftSidePanels.includes(panelId)
    const isRightSide = rightSidePanels.includes(panelId)
    
    // Get all panels on the same side that are open and have higher priority (closer to edge)
    const panelsBefore = Object.entries(panelStates)
      .filter(([id, isOpen]) => {
        if (!isOpen || id === panelId) return false
        
        const otherPriority = PANEL_PRIORITY[id] ?? 999
        if (otherPriority >= currentPriority) return false
        
        // Check if panel is on the same side
        if (anchor === 'left' && !leftSidePanels.includes(id)) return false
        if (anchor === 'right' && !rightSidePanels.includes(id)) return false
        
        return true
      })
      .sort(([a], [b]) => PANEL_PRIORITY[a] - PANEL_PRIORITY[b])
    
    // Calculate total width of panels before this one
    const totalWidth = panelsBefore.reduce((sum, [id]) => {
      const width = PANEL_WIDTHS[id] ?? 320
      return sum + width + 16 // Add gap between panels
    }, 0)
    
    return totalWidth
  }, [panelId, anchor, panelStates])

  return offset
}

