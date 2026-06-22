# Perplexity Query: Shadow System Transition Issues - Need Guidance

## Problem Summary

We have a Three.js application with multiple shadow systems (Standard, HDR, CSM/Weather GL) that can be switched between. After implementing fixes and running comprehensive tests, we've identified several critical inconsistencies when switching between systems. We need architectural guidance and specific solutions.

## System Architecture

### Shadow Systems
1. **Standard Shadows** - Regular Three.js directional light shadows
2. **HDR System** - HDR environment with standard shadows
3. **Weather GL (CSM)** - Cascaded Shadow Maps system

### Components
- **ShadowManager**: Manages active shadow system
- **ShadowSystemCoordinator**: Coordinates state preservation during switches
- **ShadowMaterialStateManager**: Preserves material and shadow states
- **ShadowPlaneManager**: Manages shadow plane visibility and material

## Critical Issues Found

### Issue 1: Race Condition in Light Position Restoration
**Problem:**
Light positions are restored in two places:
1. Atomically in `ShadowSystemCoordinator.switchSystem()` (lines 110-119)
2. Again in `requestAnimationFrame` callback in `ViewerCanvas.tsx` (lines 10759-10866)

This causes potential conflicts where positions are restored twice, leading to incorrect final positions.

**Code Location:**
- `src/viewer/utils/ShadowSystemCoordinator.ts:110-119`
- `src/viewer/ViewerCanvas.tsx:10759-10866`

**Question:** What's the best pattern to ensure light positions are restored exactly once, atomically, without race conditions?

### Issue 2: Shadow Camera Bounds Timing After CSM Disable
**Problem:**
When disabling Weather GL (CSM), shadow camera bounds are updated:
1. In `requestAnimationFrame` callback (line 10827)
2. Again after 100ms delay (line 10858)

However, CSM lights may still be in the scene during the first update, causing incorrect bounding box calculation. Even though we destroy CSM before switching, there's a timing window where CSM lights might still affect the calculation.

**Code Location:**
- `src/viewer/ViewerCanvas.tsx:10740-10863`
- `src/viewer/utils/shadowManager.ts:27-41` (CSM lights excluded from bounds)

**Question:** How to ensure shadow camera bounds are calculated only after CSM lights are completely removed from the scene? Should we use a different synchronization mechanism?

### Issue 3: HDR Disable Doesn't Restore CSM Properly
**Problem:**
When HDR is disabled, the code checks for saved shadow system state:
- If CSM was active before HDR, it should restore CSM
- BUT: The restoration logic only logs a message, doesn't actually restore CSM
- CSM restoration relies on `enableStandaloneWeather` effect, which may not trigger

**Code Location:**
- `src/viewer/ViewerCanvas.tsx:7894-7957`
- `src/viewer/ViewerCanvas.tsx:7767-7783` (state saving)

**Code:**
```typescript
if (targetShadowSystem === 'csm') {
  // Only logs - doesn't restore CSM!
  console.log('[ViewerCanvas] ✅ CSM shadows active - CSM system will manage shadows')
} else {
  // Restores standard shadows
}
```

**Question:** What's the proper way to restore CSM system after HDR disable? Should we explicitly recreate CSM, or rely on the weather effect? How to ensure CSM is fully restored with correct configuration?

### Issue 4: Double CSM Destruction Risk
**Problem:**
CSM is destroyed in two places:
1. Manually in `ViewerCanvas.tsx` before system switch (line 10740-10744)
2. Automatically in `ShadowManager.disableCurrentSystem()` (line 448-452)

This could cause:
- Double destruction errors
- Timing issues where CSM is destroyed but still referenced
- Resource leaks if destruction fails

**Code Location:**
- `src/viewer/ViewerCanvas.tsx:10740-10744`
- `src/viewer/utils/shadowManager.ts:448-452`

**Question:** What's the best pattern for resource cleanup when switching systems? Should destruction be centralized in ShadowManager, or should we have a cleanup coordination pattern?

### Issue 5: Lights Not Found After Weather GL Exit
**Problem:**
After disabling Weather GL, lights may not be found:
- `directionalLights` Map may be empty
- Scene traversal fallback may miss lights if they're hidden or not properly marked
- Console shows: `⚠️ No directional lights found to register with ShadowManager`

**Code Location:**
- `src/viewer/ViewerCanvas.tsx:10830-10860`
- `src/viewer/ViewerCanvas.tsx:10764-10780` (light finding logic)

**Question:** How to ensure lights are always findable after system switches? Should we maintain a separate light registry? How to handle lights that are temporarily hidden during CSM?

## Test Results

### Test 1: Standard → Weather GL → Standard
- **Status:** ⚠️ PARTIAL PASS
- **Issues:** Light position restoration timing, CSM cleanup timing, shadow camera bounds

### Test 2: Standard → HDR → Standard
- **Status:** ⚠️ PARTIAL PASS
- **Issues:** State saving redundancy, restoration path inconsistency, multiple bounds updates

### Test 3: Weather GL → HDR → Weather GL
- **Status:** ❌ FAIL
- **Issues:** CSM not restored after HDR disable, state not preserved correctly

### Test 4: Rapid Switching
- **Status:** ❌ FAIL
- **Issues:** Race conditions, overlapping transitions, state corruption

## Specific Questions for Perplexity

1. **Architecture Pattern:** What's the best architectural pattern for managing multiple shadow systems in Three.js? Should we use:
   - State machine pattern?
   - Command pattern for transitions?
   - Observer pattern for state changes?
   - Transition queue to prevent overlapping switches?

2. **Resource Cleanup:** How to properly coordinate resource cleanup (CSM destruction, light state) when switching systems? Should cleanup be:
   - Synchronous before switch?
   - Asynchronous with proper waiting?
   - Coordinated through a cleanup manager?

3. **State Preservation:** What's the most reliable way to preserve and restore shadow system state? Should we:
   - Save complete state snapshot?
   - Use incremental state updates?
   - Maintain state machine with transitions?

4. **Timing/Synchronization:** How to handle async operations (CSM destruction, shadow map regeneration) during system switches? Should we:
   - Use promises/async-await?
   - Use event emitters?
   - Use requestAnimationFrame with proper sequencing?

5. **Light Management:** How to ensure lights are always accessible after system switches? Should we:
   - Maintain separate light registry?
   - Never hide lights, only disable shadows?
   - Use WeakMap for light tracking?

6. **Shadow Camera Bounds:** How to ensure shadow camera bounds are calculated correctly after CSM disable? Should we:
   - Wait for CSM destruction to complete?
   - Use a callback/promise from destroy?
   - Calculate bounds only after scene is stable?

## Code Context

### Key Files
- `src/viewer/ViewerCanvas.tsx` - Main viewer component, handles system switches
- `src/viewer/utils/ShadowSystemCoordinator.ts` - Coordinates system switches
- `src/viewer/utils/shadowManager.ts` - Manages shadow systems
- `src/viewer/utils/ShadowMaterialStateManager.ts` - Preserves material states

### Current Implementation
- Uses `ShadowSystemCoordinator` for state preservation
- Uses `requestAnimationFrame` for async operations
- Uses `setTimeout` for delayed updates
- Manual CSM destruction before system switch

## Request for Guidance

Please provide:
1. **Architectural recommendations** for managing multiple shadow systems
2. **Specific code patterns** to fix the identified issues
3. **Best practices** for Three.js shadow system transitions
4. **Synchronization strategies** for async operations
5. **Resource cleanup patterns** to prevent leaks and conflicts
6. **State management patterns** for reliable state preservation

We need concrete, actionable solutions that can be implemented in our existing codebase.





















