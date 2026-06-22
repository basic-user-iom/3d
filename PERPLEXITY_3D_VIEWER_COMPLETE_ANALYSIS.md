# Complete 3D Viewer Code Analysis for Perplexity

## Overview
This is a comprehensive React + Three.js 3D viewer application with multiple simultaneous systems running. The user reports bugs likely caused by concurrent operations. This document contains the complete codebase for analysis.

## Architecture Summary

### Main Components
1. **ViewerCanvas.tsx** (10,239 lines) - Core 3D viewer component
2. **useViewer.ts** (2,091 lines) - Viewer hook for model loading and management
3. **App.tsx** (1,884 lines) - Main application component
4. **useAppStore.ts** (2,303 lines) - Zustand state management store

### Key Systems Running Simultaneously
- HDR System (environment maps, IBL lighting)
- Shadow System (CSM, standard shadows, shadow opacity)
- Post-Processing System (SSR, SSS, AO, tone mapping, color grading)
- Water System
- Particle System
- Dynamic Sky System
- Sun/Moon System
- Atmospheric Perspective
- Path Tracer
- Streets GL Integration (iframe overlay)
- Transform Controls
- Light Gizmos
- Material System
- Texture Management

## Known Issues & Concerns

### 1. Race Conditions
- Multiple systems updating materials simultaneously
- HDR system, shadow system, and material enhancement all modify materials
- Texture loading and material updates happening concurrently
- Model loading while systems are initializing

### 2. Memory Leaks
- Texture disposal issues
- Geometry not properly disposed
- Event listeners not cleaned up
- Animation loops not properly stopped

### 3. Performance Issues
- Large ViewerCanvas.tsx file (10K+ lines)
- Multiple animation loops running
- Excessive re-renders
- No proper batching of updates

### 4. State Synchronization
- Multiple state sources (Zustand store, refs, local state)
- Viewer instance shared across components
- Streets GL bridge synchronization

## Complete Code Files

### File 1: ViewerCanvas.tsx (Main Viewer Component)
**Location**: `src/viewer/ViewerCanvas.tsx`
**Size**: 10,239 lines
**Purpose**: Core 3D viewer with scene, camera, renderer, controls, and all effect systems

**Key Features**:
- Scene initialization
- Camera setup (PerspectiveCamera)
- WebGL renderer with quality settings
- OrbitControls (Twinmotion-style navigation)
- Transform controls for object manipulation
- Multiple effect systems initialization
- Animation loop
- Object selection (raycasting)
- Light management
- Shadow system integration
- Post-processing pipeline
- HDR system integration
- Material enhancement
- Model loading integration

**Critical Sections**:
- Lines 199-500: Initialization logic
- Lines 500-2000: Effect systems setup
- Lines 2000-5000: Animation loop and rendering
- Lines 5000-8000: Event handlers and interactions
- Lines 8000-10239: Cleanup and utilities

### File 2: useViewer.ts (Viewer Hook)
**Location**: `src/viewer/useViewer.ts`
**Size**: 2,091 lines
**Purpose**: Model loading, positioning, material enhancement, Streets GL sync

**Key Functions**:
- `loadFromFile()` - Load 3D models from files
- `loadFromUrl()` - Load 3D models from URLs
- `positionModelOnGround()` - Position models on ground plane
- `syncModelToStreetsGL()` - Sync models to Streets GL iframe
- `disposeTexturesFromMaterial()` - Texture cleanup
- `fixTextureFiltering()` - Texture quality fixes

**Critical Issues**:
- Lines 772-828: Viewer initialization wait loop (potential race condition)
- Lines 952-1346: Material enhancement (conflicts with other systems)
- Lines 1046-1127: Transparent material handling (complex logic)
- Lines 1412-1449: Model positioning with multiple setTimeout calls

### File 3: App.tsx (Main Application)
**Location**: `src/App.tsx`
**Size**: 1,884 lines
**Purpose**: Main app component, UI panels, keyboard shortcuts, Streets GL integration

**Key Features**:
- Viewer initialization callback
- Multiple UI panels (Material, Lighting, Transform, etc.)
- Keyboard shortcuts (WASD navigation, transform modes)
- Streets GL iframe overlay
- Smooth navigation loop
- Auto-load default model

**Critical Issues**:
- Lines 196-802: Viewer ready callback (complex initialization)
- Lines 820-1162: Keyboard event handlers (multiple listeners)
- Lines 1549-1622: Smooth navigation loop (always running)
- Lines 1656-1829: Streets GL iframe integration (complex state)

### File 4: useAppStore.ts (State Management)
**Location**: `src/store/useAppStore.ts`
**Size**: 2,303 lines
**Purpose**: Zustand store for global application state

**Key State**:
- Viewer settings (pixel ratio, shadows, HDR, etc.)
- UI panel visibility
- Selected objects
- Transform mode
- Lighting configuration
- Material settings
- Streets GL settings
- Undo/redo stack

## Code Structure Analysis

### ViewerCanvas.tsx Structure
```typescript
// 1. Imports (45+ imports)
// 2. Interfaces (ViewerInstance, ViewerCanvasProps)
// 3. Temporary vectors/matrices (reused for performance)
// 4. Component function
// 5. Refs (container, viewer, animation frame, etc.)
// 6. Store subscriptions
// 7. Main useEffect (initialization)
//    - Scene setup
//    - Camera setup
//    - Renderer setup
//    - Controls setup
//    - Effect systems initialization
//    - Animation loop setup
// 8. Multiple useEffects (updates, cleanup)
// 9. Event handlers
// 10. Utility functions
// 11. Cleanup
```

### Potential Bug Sources

#### 1. Concurrent Material Updates
**Location**: Multiple files
**Issue**: HDR system, shadow system, material enhancement, and post-processing all modify materials simultaneously

**Example Conflicts**:
- `useViewer.ts` lines 1183-1344: Material enhancement sets `envMap`, `envMapIntensity`, `depthWrite`
- `HDRSystem.ts`: Updates `envMap` and `envMapIntensity`
- `ShadowManager.ts`: Modifies shadow-related material properties
- `PostProcessingSystem.ts`: May modify materials for post-processing

**Solution Needed**: Material update queue or lock mechanism

#### 2. Animation Loop Conflicts
**Location**: `ViewerCanvas.tsx` and `App.tsx`
**Issue**: Multiple animation loops running simultaneously

**Loops**:
- ViewerCanvas main render loop
- App.tsx smooth navigation loop (lines 1549-1622)
- Keyboard navigation loop (lines 892-995 in App.tsx)
- Streets GL sync updates

**Solution Needed**: Single unified animation loop or proper coordination

#### 3. State Synchronization
**Location**: All files
**Issue**: State stored in multiple places (Zustand, refs, local state, shared singleton)

**State Sources**:
- `useAppStore` (Zustand)
- `viewerRef.current` (React ref)
- `sharedViewer` (module-level singleton in useViewer.ts)
- `window.sharedViewer` (global)
- Local component state

**Solution Needed**: Single source of truth or proper synchronization

#### 4. Memory Leaks
**Location**: Multiple files
**Issue**: Resources not properly disposed

**Leak Sources**:
- Textures not disposed when materials change
- Geometries not disposed when models removed
- Event listeners not removed
- Animation frames not cancelled
- Effect systems not cleaned up

**Solution Needed**: Comprehensive cleanup in useEffect return functions

#### 5. Race Conditions in Initialization
**Location**: `useViewer.ts` lines 772-828
**Issue**: Model loading waits for viewer, but viewer initialization is async

**Problem**:
```typescript
// useViewer.ts - loadFromFile
while (!currentViewer && attempts < maxAttempts) {
  await new Promise(resolve => setTimeout(resolve, 100))
  attempts++
  currentViewer = sharedViewer
}
```

**Solution Needed**: Proper promise-based initialization or event system

## Optimization Opportunities

### 1. Code Organization
- **Split ViewerCanvas.tsx**: Break into smaller components
  - SceneSetup.tsx
  - RendererSetup.tsx
  - ControlsSetup.tsx
  - EffectSystemsManager.tsx
  - AnimationLoop.tsx

### 2. Performance
- **Batch Updates**: Group material updates
- **Debounce/Throttle**: Reduce frequent updates
- **Lazy Loading**: Load effect systems on demand
- **Object Pooling**: Reuse temporary objects
- **Frustum Culling**: Only render visible objects

### 3. State Management
- **Single Source**: Consolidate state management
- **Selective Subscriptions**: Only subscribe to needed state
- **Memoization**: Memoize expensive calculations

### 4. Memory Management
- **Resource Tracking**: Track all resources for cleanup
- **Automatic Cleanup**: Dispose resources when not needed
- **Weak References**: Use WeakMap/WeakSet where appropriate

## Questions for Perplexity Analysis

1. **How to prevent race conditions** when multiple systems update materials simultaneously?

2. **What's the best pattern** for coordinating multiple animation loops?

3. **How to optimize** a 10,000+ line React component without breaking functionality?

4. **What's the best approach** for managing shared state across multiple systems?

5. **How to ensure proper cleanup** of Three.js resources (textures, geometries, materials)?

6. **What patterns** can reduce memory leaks in complex Three.js applications?

7. **How to batch updates** to improve performance?

8. **What's the best way** to handle async initialization of multiple systems?

9. **How to debug** issues when many systems are running simultaneously?

10. **What optimizations** can be applied to the rendering pipeline?

## Next Steps

1. Read the complete code files (provided below)
2. Analyze race conditions and concurrent operations
3. Identify memory leak sources
4. Suggest code organization improvements
5. Recommend performance optimizations
6. Provide patterns for better state management
7. Suggest debugging strategies
8. Recommend testing approaches

---

## Complete Code Files

The complete codebase is available in the repository. Key files to analyze:

1. **ViewerCanvas.tsx** (10,239 lines) - Main viewer component
2. **useViewer.ts** (2,091 lines) - Model loading and management
3. **App.tsx** (1,884 lines) - Main application component
4. **useAppStore.ts** (2,303 lines) - State management

## Critical Analysis Request

Please analyze this 3D viewer codebase for:

### 1. Race Conditions
- Multiple systems updating materials simultaneously (HDR, shadows, material enhancement)
- Animation loops running concurrently (ViewerCanvas, App.tsx navigation loop, keyboard loop)
- Async initialization conflicts (model loading while systems initialize)
- State synchronization issues (Zustand, refs, local state, shared singleton)

### 2. Memory Leaks
- Texture disposal when materials change
- Geometry disposal when models removed
- Event listeners not cleaned up
- Animation frames not cancelled
- Effect systems not properly disposed

### 3. Performance Issues
- Large component files (10K+ lines)
- Multiple animation loops
- Excessive re-renders
- No batching of updates
- Material updates happening every frame

### 4. Code Organization
- How to split 10,000+ line component
- Better separation of concerns
- Effect system coordination
- State management consolidation

### 5. Best Practices
- React + Three.js patterns
- Resource management
- Event handling
- Error boundaries
- TypeScript usage

### 6. Optimization Opportunities
- Batching material updates
- Debouncing/throttling frequent updates
- Lazy loading effect systems
- Object pooling
- Frustum culling
- LOD implementation

## Specific Questions

1. **How to prevent race conditions** when HDR system, shadow system, and material enhancement all modify materials simultaneously?

2. **What's the best pattern** for coordinating multiple animation loops (ViewerCanvas main loop, App.tsx navigation loop, keyboard loop)?

3. **How to optimize** a 10,000+ line React component without breaking functionality?

4. **What's the best approach** for managing shared state across multiple systems (Zustand, refs, local state, singleton)?

5. **How to ensure proper cleanup** of Three.js resources (textures, geometries, materials) in React components?

6. **What patterns** can reduce memory leaks in complex Three.js applications?

7. **How to batch updates** to improve performance (material updates, shadow updates, etc.)?

8. **What's the best way** to handle async initialization of multiple systems (HDR, shadows, post-processing, etc.)?

9. **How to debug** issues when many systems are running simultaneously?

10. **What optimizations** can be applied to the rendering pipeline?

## Expected Deliverables

1. **Comprehensive bug report** identifying all race conditions, memory leaks, and performance issues
2. **Code organization recommendations** with specific refactoring suggestions
3. **Optimization plan** with prioritized improvements
4. **Best practices guide** for React + Three.js applications
5. **Code examples** showing how to fix identified issues
6. **Architecture recommendations** for better scalability and maintainability

