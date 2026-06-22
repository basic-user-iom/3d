# 3D Viewer Code Structure Analysis

## File Statistics
- **Main File**: `src/viewer/ViewerCanvas.tsx`
- **Lines**: 11,215 lines
- **React Hooks**: 56 useEffect/useRef/useState/useMemo/useCallback
- **Dispose Calls**: 44 cleanup operations

## Current Structure

### Main Component: ViewerCanvas
- Single massive component with all logic
- All systems initialized in one useEffect
- All state management in one component
- All event handlers in one component

### Systems Integrated (in one file)
1. Scene/Camera/Renderer setup
2. Controls (OrbitControls, TransformControls)
3. Lighting (Ambient, Directional, Helpers, Gizmos)
4. Shadows (ShadowManager, CSM, ShadowSystemCoordinator)
5. HDR System
6. Post-Processing
7. Particle Systems
8. Water System
9. Weather Systems
10. Path Tracer
11. Model Loading
12. Object Selection
13. Material Management
14. Texture Management
15. Resource Tracking
16. Animation Loop
17. Event Handlers
18. Debug Tools

## Issues Identified

### 1. File Size
- 11,215 lines in one file
- Difficult to navigate
- Hard to maintain
- Merge conflicts likely
- Slow IDE performance

### 2. Component Structure
- Single massive component
- All logic in one place
- Difficult to test individual systems
- Hard to reuse code

### 3. State Management
- Mixed Zustand store and local state
- Many useEffect hooks (56)
- Potential for dependency issues
- Difficult to track state flow

### 4. Resource Management
- 44 dispose calls (good!)
- But scattered throughout file
- Hard to verify all resources are cleaned up
- Potential memory leaks

### 5. Performance
- Large component re-renders
- Many useEffect dependencies
- Potential unnecessary re-renders
- No memoization of expensive operations

## Recommended Refactoring

### Phase 1: Extract Systems to Separate Files
1. **SceneSetup.ts** - Scene, camera, renderer initialization
2. **ControlsSetup.ts** - OrbitControls, TransformControls
3. **LightingSystem.ts** - All lighting logic
4. **ShadowSystem.ts** - All shadow logic
5. **HDRSystem.ts** - Already separate, but check integration
6. **PostProcessingSystem.ts** - Already separate, but check integration
7. **ParticleSystem.ts** - Already separate, but check integration
8. **WaterSystem.ts** - Already separate, but check integration
9. **ModelLoader.ts** - Model loading logic
10. **ObjectManager.ts** - Object selection, transformation
11. **MaterialManager.ts** - Material management
12. **ResourceManager.ts** - Resource tracking and cleanup

### Phase 2: Create Custom Hooks
1. **useThreeScene.ts** - Scene setup and management
2. **useThreeCamera.ts** - Camera setup and controls
3. **useThreeRenderer.ts** - Renderer setup
4. **useThreeControls.ts** - Controls setup
5. **useThreeLighting.ts** - Lighting management
6. **useThreeShadows.ts** - Shadow management
7. **useThreeResources.ts** - Resource tracking
8. **useThreeAnimation.ts** - Animation loop

### Phase 3: Consolidate State
1. Move more state to Zustand store
2. Reduce local useState calls
3. Better state organization
4. Clearer state dependencies

### Phase 4: Optimize Performance
1. Memoize expensive calculations
2. Reduce unnecessary re-renders
3. Optimize render loop
4. Better resource disposal

## Specific Code Sections to Extract

### Section 1: Initialization (Lines ~210-1000)
- Scene setup
- Camera setup
- Renderer setup
- Controls setup
- **Extract to**: `hooks/useThreeInitialization.ts`

### Section 2: Lighting (Lines ~1000-3000)
- Ambient light
- Directional lights
- Light helpers
- Light gizmos
- **Extract to**: `hooks/useThreeLighting.ts` or `systems/LightingSystem.ts`

### Section 3: Shadows (Lines ~3000-5000)
- ShadowManager
- CSMShadowSystem
- ShadowSystemCoordinator
- Shadow updates
- **Extract to**: `hooks/useThreeShadows.ts` or `systems/ShadowSystem.ts`

### Section 4: Effects (Lines ~5000-7000)
- HDR system integration
- Post-processing integration
- Particle systems
- Water system
- **Extract to**: `hooks/useThreeEffects.ts`

### Section 5: Model Loading (Lines ~7000-9000)
- Model loading logic
- Texture management
- Material updates
- **Extract to**: `hooks/useThreeModelLoader.ts`

### Section 6: Object Management (Lines ~9000-11000)
- Object selection
- Transform controls
- Raycasting
- **Extract to**: `hooks/useThreeObjectManager.ts`

### Section 7: Animation Loop (Scattered)
- Render loop
- Update logic
- **Extract to**: `hooks/useThreeAnimation.ts`

## Consolidation Opportunities

### 1. Duplicate Code
- Check for repeated patterns
- Extract to utility functions
- Create shared hooks

### 2. Similar Systems
- Multiple shadow systems (consolidate?)
- Multiple water systems (consolidate?)
- Multiple lighting systems (consolidate?)

### 3. State Management
- Consolidate related state
- Reduce state fragmentation
- Better state organization

## Next Steps

1. **Analysis**: Use Perplexity to analyze each section
2. **Refactoring Plan**: Create detailed refactoring plan
3. **Implementation**: Start with Phase 1 (extract systems)
4. **Testing**: Test after each extraction
5. **Optimization**: Apply performance optimizations














