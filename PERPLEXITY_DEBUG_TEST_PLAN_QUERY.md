# Perplexity Query: Debug/Test Plan for Shadow System Inconsistencies

## Problem Statement

We have a Three.js application with multiple shadow systems that can be switched between:
1. **Standard Shadows** - Regular Three.js directional light shadows
2. **HDR System** - HDR environment with standard shadows
3. **Weather GL (CSM)** - Cascaded Shadow Maps system

When switching between these systems, we're experiencing inconsistencies with:
- **Shadows** - Not appearing correctly, appearing in wrong positions, or disappearing
- **Shadow Plane** - Visibility, position, material properties not preserved
- **Light Positions** - Lights not restoring to correct positions after system switches

## Current Architecture

### Shadow Management System
- **ShadowManager**: Manages active shadow system (standard, CSM, HDR)
- **ShadowSystemCoordinator**: Coordinates state preservation during switches
- **ShadowMaterialStateManager**: Preserves material and shadow states
- **ShadowPlaneManager**: Manages shadow plane visibility and material

### System Switch Flow
```typescript
// When switching systems:
shadowCoordinator.switchSystem(targetSystem, config, {
  preserveMaterials: true,
  preserveShadowPlane: true,
  preserveLightStates: true,
  restoreLightPositions: true
})
```

## Request for Guidance

We need a comprehensive **debugging and testing strategy** to identify all inconsistencies when switching between:
- Standard → HDR → Standard
- Standard → Weather GL (CSM) → Standard
- Weather GL (CSM) → HDR → Weather GL (CSM)
- HDR → Weather GL (CSM) → HDR
- Quick rapid switching between all three systems

## Specific Areas to Test

### 1. Shadow State Verification
- Are shadows enabled/disabled correctly?
- Are shadow maps regenerated?
- Are shadow camera bounds updated correctly?
- Are shadow camera positions correct?
- Are shadow camera near/far planes correct?

### 2. Shadow Plane State Verification
- Is shadow plane visible after switch?
- Is shadow plane position correct (y = -0.001)?
- Are shadow plane material properties preserved (transparent, opacity, color)?
- Can shadow plane receive shadows?
- Is shadow plane excluded from HDR material updates?

### 3. Light Position Verification
- Are light positions restored correctly?
- Are light target positions restored correctly?
- Are light intensities restored correctly?
- Are lights visible after switch?
- Are lights registered with ShadowManager?
- Are light shadow properties correct (castShadow, shadow.enabled)?

### 4. Material State Verification
- Are material shadow properties preserved (castShadow, receiveShadow)?
- Are material depth properties preserved (depthWrite, depthTest)?
- Are CSM shader patches removed when switching away from CSM?
- Are materials updated correctly for the new shadow system?

### 5. System State Verification
- Is the correct shadow system active?
- Are previous system resources cleaned up?
- Are there any leftover CSM lights in the scene?
- Are there any race conditions with async operations?

## Questions for Perplexity

1. **What is the best approach to create a comprehensive test suite** for shadow system transitions in Three.js?
   - Should we use unit tests, integration tests, or visual regression tests?
   - What testing frameworks work best for Three.js applications?

2. **What debugging tools and techniques** are most effective for identifying shadow system inconsistencies?
   - How to log shadow camera state?
   - How to visualize shadow camera frustums?
   - How to track light positions over time?
   - How to verify shadow map state?

3. **What are common pitfalls** when switching between different shadow systems in Three.js?
   - Timing issues with async operations?
   - State not being preserved correctly?
   - Resources not being cleaned up?
   - Shadow camera bounds calculation errors?

4. **What verification checks should be performed** after each system switch?
   - Shadow camera bounds vs scene bounds?
   - Light positions vs saved positions?
   - Shadow plane state vs expected state?
   - Material properties vs saved state?

5. **How to create a debug visualization** to help identify issues?
   - Shadow camera frustum visualization?
   - Light position markers?
   - Shadow plane bounds visualization?
   - System state indicators?

6. **What automated testing approach** would catch these inconsistencies?
   - Snapshot testing for shadow states?
   - Property comparison tests?
   - Visual regression testing?
   - State machine testing?

## Desired Output

We need:
1. A comprehensive test plan/checklist for all transition scenarios
2. Debug logging strategy to capture all relevant state
3. Visualization tools/techniques to identify issues visually
4. Automated test structure to catch regressions
5. Best practices for debugging Three.js shadow systems

## Technical Context

- **Three.js version**: 0.162+
- **React** for UI
- **TypeScript** for type safety
- **Zustand** for state management
- Multiple shadow systems that need to coexist

Please provide guidance on creating a comprehensive debugging and testing strategy for identifying all inconsistencies in shadow system transitions.





















