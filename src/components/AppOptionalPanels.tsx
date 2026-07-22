import { lazy, memo, type ComponentType } from 'react'
import type * as THREE from 'three'
import { OptionalPanelBoundary } from './OptionalPanelBoundary'
import { OPTIONAL_PANEL_LOADERS } from '../utils/optionalPanels'

const PathTracerDemoPanel = lazy(OPTIONAL_PANEL_LOADERS.pathTracer)
const WebExportPanel = lazy(OPTIONAL_PANEL_LOADERS.webExport)
const TextureManagementPanel = lazy(OPTIONAL_PANEL_LOADERS.textureManagement)
const AIEnhancementPanel = lazy(OPTIONAL_PANEL_LOADERS.aiEnhancement)
const PointCloudPanel = lazy(OPTIONAL_PANEL_LOADERS.pointCloud)
const OSMGroundV2Panel = lazy(OPTIONAL_PANEL_LOADERS.osmGroundV2)
const CubesViewer = lazy(OPTIONAL_PANEL_LOADERS.cubesViewer)
const StreetsGLDemo = lazy(OPTIONAL_PANEL_LOADERS.streetsGLDemo)
const ShadowSystemTestPanel = lazy(OPTIONAL_PANEL_LOADERS.shadowSystemTest)
const HDRTestPanel = lazy(OPTIONAL_PANEL_LOADERS.hdrTest)
const HDRShadowDemoPanel = lazy(OPTIONAL_PANEL_LOADERS.hdrShadowDemo)
const RevitConnectionPanel = lazy(OPTIONAL_PANEL_LOADERS.revitConnection)
const PlacesPanel = lazy(OPTIONAL_PANEL_LOADERS.places)
const PrimitivesPanel = lazy(OPTIONAL_PANEL_LOADERS.primitives)
const RenderingEffectsPanel = lazy(OPTIONAL_PANEL_LOADERS.renderingEffects)
const EdgeEnhancementPanel = lazy(OPTIONAL_PANEL_LOADERS.edgeEnhancement)
const SmoothingPanel = lazy(OPTIONAL_PANEL_LOADERS.smoothing)
const PolygonDrawingPanel = lazy(OPTIONAL_PANEL_LOADERS.polygonDrawing)
const RoomsPanel = lazy(OPTIONAL_PANEL_LOADERS.rooms)
const ShaderEditorPanel = lazy(OPTIONAL_PANEL_LOADERS.shaderEditor)
const TodoPanel = lazy(OPTIONAL_PANEL_LOADERS.todo)

export interface AppOptionalPanelsProps {
  showTextureManagementPanel: boolean
  showRoomsPanel: boolean
  showRevitConnectionPanel: boolean
  showWebExportPanel: boolean
  showPlacesPanel: boolean
  showShadowSystemTestPanel: boolean
  showHDRTestPanel: boolean
  showHDRShadowDemoPanel: boolean
  showPathTracerPreview: boolean
  showPrimitivesPanel: boolean
  showRenderingEffectsPanel: boolean
  showEdgeEnhancementPanel: boolean
  showSmoothingPanel: boolean
  showPointCloudPanel: boolean
  showOSMGroundV2Panel: boolean
  showPolygonDrawingPanel: boolean
  showCubesViewer: boolean
  showStreetsGLDemo: boolean
  showAIEnhancementPanel: boolean
  showShaderEditorPanel: boolean
  showTodoPanel: boolean
  viewer: {
    renderer: THREE.WebGLRenderer
    camera: THREE.PerspectiveCamera
    scene: THREE.Scene
    controls?: unknown
  } | null
  onClosePathTracer: () => void
}

function AppOptionalPanelsComponent({
  showTextureManagementPanel,
  showRoomsPanel,
  showRevitConnectionPanel,
  showWebExportPanel,
  showPlacesPanel,
  showShadowSystemTestPanel,
  showHDRTestPanel,
  showHDRShadowDemoPanel,
  showPathTracerPreview,
  showPrimitivesPanel,
  showRenderingEffectsPanel,
  showEdgeEnhancementPanel,
  showSmoothingPanel,
  showPointCloudPanel,
  showOSMGroundV2Panel,
  showPolygonDrawingPanel,
  showCubesViewer,
  showStreetsGLDemo,
  showAIEnhancementPanel,
  showShaderEditorPanel,
  showTodoPanel,
  viewer,
  onClosePathTracer
}: AppOptionalPanelsProps) {
  const PathTracer = PathTracerDemoPanel as ComponentType<{
    viewer: AppOptionalPanelsProps['viewer']
    onClose: () => void
  }>

  return (
    <OptionalPanelBoundary>
      {showTextureManagementPanel && <TextureManagementPanel />}
      {showRoomsPanel && <RoomsPanel />}
      {showRevitConnectionPanel && <RevitConnectionPanel />}
      {showWebExportPanel && <WebExportPanel />}
      {showPlacesPanel && <PlacesPanel />}
      {showShadowSystemTestPanel && <ShadowSystemTestPanel />}
      {showHDRTestPanel && <HDRTestPanel />}
      {showHDRShadowDemoPanel && <HDRShadowDemoPanel />}
      {showPathTracerPreview && viewer && (
        <PathTracer viewer={viewer} onClose={onClosePathTracer} />
      )}
      {showPrimitivesPanel && <PrimitivesPanel />}
      {showRenderingEffectsPanel && <RenderingEffectsPanel />}
      {showEdgeEnhancementPanel && <EdgeEnhancementPanel />}
      {showSmoothingPanel && <SmoothingPanel />}
      {showPointCloudPanel && <PointCloudPanel />}
      {showOSMGroundV2Panel && <OSMGroundV2Panel />}
      {showPolygonDrawingPanel && <PolygonDrawingPanel />}
      {showCubesViewer && <CubesViewer />}
      {showStreetsGLDemo && <StreetsGLDemo />}
      {showAIEnhancementPanel && <AIEnhancementPanel />}
      {showShaderEditorPanel && <ShaderEditorPanel />}
      {showTodoPanel && <TodoPanel />}
    </OptionalPanelBoundary>
  )
}

export const AppOptionalPanels = memo(AppOptionalPanelsComponent)
