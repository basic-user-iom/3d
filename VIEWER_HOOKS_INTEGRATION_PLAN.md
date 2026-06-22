# ViewerCanvas Hooks Integration Plan

## Overview
This document outlines the plan for integrating all 8 custom hooks into ViewerCanvas.tsx to reduce its size from 11,215 lines to < 2000 lines.

## Completed Hooks (8/8) ✅

1. **useThreeScene.ts** - Scene, camera, renderer initialization
2. **useThreeControls.ts** - OrbitControls and TransformControls
3. **useThreeLighting.ts** - Ambient and directional lights
4. **useThreeShadows.ts** - ShadowManager and ShadowSystemCoordinator
5. **useThreeEffects.ts** - HDR, post-processing, particles, water
6. **useThreeModelLoader.ts** - Model loading and texture management
7. **useThreeObjectManager.ts** - Object selection and raycasting
8. **useThreeAnimation.ts** - Animation loop with UnifiedAnimationLoop

## Integration Strategy

### Phase 1: Hook Integration (Current)
1. Import all hooks at the top of ViewerCanvas
2. Replace initialization code with hook calls
3. Maintain backward compatibility with ViewerInstance interface
4. Test each hook integration incrementally

### Phase 2: Code Removal
1. Remove duplicate initialization code
2. Remove code now handled by hooks
3. Keep only orchestration logic in ViewerCanvas

### Phase 3: Testing
1. Test all viewer functionality
2. Verify no regressions
3. Check memory leaks
4. Performance testing

### Phase 4: Optimization
1. Add memoization where needed
2. Optimize render loop
3. Consolidate duplicate systems

## Integration Steps

### Step 1: Import Hooks
```typescript
import { useThreeScene } from './hooks/useThreeScene'
import { useThreeControls } from './hooks/useThreeControls'
import { useThreeLighting } from './hooks/useThreeLighting'
import { useThreeShadows } from './hooks/useThreeShadows'
import { useThreeEffects } from './hooks/useThreeEffects'
import { useThreeModelLoader } from './hooks/useThreeModelLoader'
import { useThreeObjectManager } from './hooks/useThreeObjectManager'
import { useThreeAnimation } from './hooks/useThreeAnimation'
```

### Step 2: Initialize Hooks in Order
1. useThreeScene - Creates scene, camera, renderer
2. useThreeControls - Creates controls (depends on scene)
3. useThreeLighting - Creates lights (depends on scene)
4. useThreeShadows - Creates shadow systems (depends on scene, lights)
5. useThreeEffects - Creates effects (depends on scene, renderer)
6. useThreeModelLoader - Model loading (depends on scene)
7. useThreeObjectManager - Object selection (depends on scene, controls)
8. useThreeAnimation - Animation loop (depends on all)

### Step 3: Build ViewerInstance
Combine results from all hooks into ViewerInstance interface

### Step 4: Remove Old Code
Remove initialization code that's now handled by hooks

## Backward Compatibility

### ViewerInstance Interface
- Must maintain exact same interface
- All existing properties must be accessible
- Methods must work the same way

### onViewerReady Callback
- Must be called at the same point in initialization
- Must receive complete ViewerInstance

### Store Integration
- All hooks use useAppStore for state
- No breaking changes to store structure

## Testing Checklist

- [ ] Scene initialization
- [ ] Camera controls
- [ ] Lighting system
- [ ] Shadow systems
- [ ] Post-processing
- [ ] Model loading
- [ ] Object selection
- [ ] Animation loop
- [ ] Memory leaks
- [ ] Performance

## Expected Results

- ViewerCanvas.tsx: ~11,215 lines → < 2,000 lines
- Better code organization
- Easier maintenance
- Better testability
- Reduced memory leaks
- Improved performance

## Risks and Mitigation

### Risk: Breaking Changes
- **Mitigation**: Maintain exact ViewerInstance interface
- **Mitigation**: Test incrementally

### Risk: Performance Regression
- **Mitigation**: Profile before and after
- **Mitigation**: Use React.memo where needed

### Risk: Memory Leaks
- **Mitigation**: All hooks have proper cleanup
- **Mitigation**: Test with memory profiler

## Timeline

1. **Integration**: 1-2 hours
2. **Testing**: 1 hour
3. **Optimization**: 1 hour
4. **Total**: 3-4 hours














