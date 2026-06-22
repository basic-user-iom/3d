# 3D Viewer Optimization & Refactoring Plan

## Executive Summary
The ViewerCanvas component is 11,215 lines and needs to be refactored into smaller, maintainable modules. This document outlines the optimization plan based on code analysis and best practices.

## Current Issues

### 1. File Size & Structure
- **11,215 lines** in a single file
- All systems in one component
- Difficult to navigate and maintain
- High risk of merge conflicts

### 2. Performance Concerns
- 56 React hooks (useEffect, useRef, useState, etc.)
- Potential unnecessary re-renders
- Large component re-renders entire viewer
- No memoization of expensive operations

### 3. Resource Management
- 44 dispose calls (good coverage)
- But scattered throughout file
- Hard to verify complete cleanup
- Potential memory leaks in edge cases

### 4. Code Duplication
- Similar patterns repeated
- Utility functions could be extracted
- State management could be consolidated

## Refactoring Strategy

### Phase 1: Extract Core Systems (Priority: HIGH)

#### 1.1 Scene Initialization Hook
**File**: `src/viewer/hooks/useThreeScene.ts`
**Extract**: Lines ~290-500
- Scene creation
- Camera setup
- Renderer setup
- CSS3DRenderer setup

#### 1.2 Controls Hook
**File**: `src/viewer/hooks/useThreeControls.ts`
**Extract**: Lines ~430-500
- OrbitControls setup
- TransformControls setup
- Control event handlers

#### 1.3 Lighting Hook
**File**: `src/viewer/hooks/useThreeLighting.ts`
**Extract**: Lines ~1000-3000
- Ambient light
- Directional lights
- Light helpers
- Light gizmos

#### 1.4 Shadow Hook
**File**: `src/viewer/hooks/useThreeShadows.ts`
**Extract**: Lines ~3000-5000
- ShadowManager
- CSMShadowSystem
- ShadowSystemCoordinator
- Shadow updates

### Phase 2: Extract Effect Systems (Priority: MEDIUM)

#### 2.1 Effects Hook
**File**: `src/viewer/hooks/useThreeEffects.ts`
**Extract**: Lines ~5000-7000
- HDR system integration
- Post-processing integration
- Particle systems
- Water system

#### 2.2 Model Loading Hook
**File**: `src/viewer/hooks/useThreeModelLoader.ts`
**Extract**: Lines ~7000-9000
- Model loading logic
- Texture management
- Material updates

#### 2.3 Object Management Hook
**File**: `src/viewer/hooks/useThreeObjectManager.ts`
**Extract**: Lines ~9000-11000
- Object selection
- Transform controls
- Raycasting

### Phase 3: Animation & Rendering (Priority: HIGH)

#### 3.1 Animation Loop Hook
**File**: `src/viewer/hooks/useThreeAnimation.ts`
**Extract**: Animation loop logic (scattered)
- Render loop
- Update logic
- Frame limiting
- VSync handling

### Phase 4: Consolidation (Priority: MEDIUM)

#### 4.1 Resource Manager
**File**: `src/viewer/utils/ResourceManager.ts`
**Consolidate**: All resource tracking
- ResourceTracker (already exists)
- Enhanced cleanup
- Memory leak detection

#### 4.2 State Consolidation
**File**: `src/store/viewerStore.ts` (new)
**Consolidate**: Viewer-specific state
- Move from useAppStore
- Better organization
- Clearer dependencies

## Implementation Steps

### Step 1: Create Hook Structure
1. Create `src/viewer/hooks/` directory
2. Create base hook files
3. Define interfaces for each hook

### Step 2: Extract Scene Initialization
1. Extract scene/camera/renderer setup
2. Test that viewer still works
3. Verify cleanup works

### Step 3: Extract Controls
1. Extract OrbitControls setup
2. Extract TransformControls setup
3. Test controls still work

### Step 4: Extract Lighting
1. Extract lighting logic
2. Test lighting still works
3. Verify cleanup

### Step 5: Extract Shadows
1. Extract shadow systems
2. Test shadows still work
3. Verify cleanup

### Step 6: Extract Effects
1. Extract effect systems
2. Test effects still work
3. Verify cleanup

### Step 7: Extract Model Loading
1. Extract model loading
2. Test model loading still works
3. Verify cleanup

### Step 8: Extract Object Management
1. Extract object management
2. Test selection/transformation
3. Verify cleanup

### Step 9: Extract Animation Loop
1. Extract animation loop
2. Test rendering still works
3. Verify performance

### Step 10: Consolidate & Optimize
1. Consolidate duplicate code
2. Optimize performance
3. Add memoization
4. Improve error handling

## Performance Optimizations

### 1. Memoization
- Memoize expensive calculations
- Use useMemo for Three.js objects
- Use useCallback for event handlers

### 2. Render Optimization
- Reduce unnecessary re-renders
- Optimize render loop
- Better frame limiting

### 3. Resource Management
- Comprehensive cleanup
- Memory leak detection
- Resource pooling

### 4. State Management
- Reduce state fragmentation
- Better state organization
- Clearer dependencies

## Testing Strategy

### After Each Extraction
1. Test viewer initialization
2. Test all features still work
3. Test cleanup on unmount
4. Check for memory leaks
5. Verify performance

### Final Testing
1. Full feature test
2. Performance benchmark
3. Memory leak test
4. Error handling test
5. Browser compatibility

## Success Criteria

1. ✅ ViewerCanvas < 2000 lines
2. ✅ All systems extracted to hooks
3. ✅ No functionality lost
4. ✅ Performance maintained or improved
5. ✅ No memory leaks
6. ✅ Better code organization
7. ✅ Easier to maintain

## Timeline Estimate

- **Phase 1**: 2-3 days (Core systems)
- **Phase 2**: 2-3 days (Effect systems)
- **Phase 3**: 1-2 days (Animation)
- **Phase 4**: 1-2 days (Consolidation)
- **Total**: 6-10 days

## Risk Mitigation

1. **Test after each extraction** - Don't extract everything at once
2. **Keep original file** - Use git to revert if needed
3. **Incremental commits** - Commit after each successful extraction
4. **Feature flags** - Use flags to switch between old/new code
5. **Comprehensive testing** - Test all features after each change














