# Weather GL and HDR Conflict Analysis

## Problem: Cannot Enable HDR After Weather GL Exit

**User Report**: After enabling Weather GL and then exiting it, HDR cannot be turned on afterwards.

---

## Root Cause Analysis

### Issue 1: HDR Effect Doesn't Re-Run After Weather GL Exit ⚠️

**Location**: `ViewerCanvas.tsx:7907-8217`

**Problem**: 
- HDR effect only runs when `hdrEnabled`, `hdrUrl`, or `hdrFile` changes
- When Weather GL exits, it restores HDR background visibility (line 11221)
- BUT the HDR effect doesn't re-run because dependencies haven't changed
- Result: `scene.background` may still be `null` from Weather GL, and HDR isn't re-applied

**HDR Effect Dependencies**:
```typescript
}, [
  hdrEnabled,
  hdrUrl,
  hdrFile
  // NOTE: enableStandaloneWeather is NOT in dependencies!
])
```

**When Weather GL Exits**:
- `enableStandaloneWeather` changes from `true` to `false`
- HDR effect doesn't re-run (not in dependencies)
- `scene.background` may still be `null`
- HDR background visibility is restored, but background isn't set

---

### Issue 2: scene.background Set to null by Weather GL ⚠️

**Location**: `ViewerCanvas.tsx:8817` and `10915`

**Problem**:
- When Weather GL is enabled, `scene.background = null` is set (line 8817, 10915)
- This is correct for DynamicSky to render
- BUT when Weather GL exits, `scene.background` is not explicitly restored
- Only HDR background visibility is restored, not the actual background texture

**Code Flow**:
```typescript
// Weather GL Enable (line 8817)
scene.background = null  // ✅ Correct for DynamicSky

// Weather GL Exit (line 11214-11237)
if (viewerRef.current.hdrSystem) {
  if (hdrEnabled) {
    viewerRef.current.hdrSystem.updateBackgroundVisibility(hdrBackgroundVisible)
    // ❌ But scene.background is NOT set here!
  } else {
    scene.background = new THREE.Color(0x87ceeb) // Only if HDR not enabled
  }
}
```

**Result**: If HDR is enabled but effect doesn't re-run, `scene.background` stays `null`.

---

### Issue 3: HDR Effect Early Return ⚠️

**Location**: `ViewerCanvas.tsx:7908`

**Problem**:
- HDR effect has early return: `if (!viewerRef.current?.hdrSystem) return`
- If HDR system doesn't exist, effect doesn't run
- But HDR system should always exist after initialization

**Code**:
```typescript
useEffect(() => {
  if (!viewerRef.current?.hdrSystem) return  // ❌ Early return if system doesn't exist
  
  const hdrSystem = viewerRef.current.hdrSystem
  // ...
}, [hdrEnabled, hdrUrl, hdrFile])
```

**Potential Issue**: If HDR system is somehow disposed or undefined, effect won't run.

---

### Issue 4: HDR Source Check ⚠️

**Location**: `ViewerCanvas.tsx:7915`

**Problem**:
- HDR effect checks: `if (hdrEnabled && hdrSource)`
- If `hdrSource` is null/undefined, HDR won't be applied
- After Weather GL exit, if `hdrUrl` or `hdrFile` is cleared, HDR can't be enabled

**Code**:
```typescript
const hdrSource = hdrFile ?? hdrUrl
if (hdrEnabled && hdrSource) {
  // Apply HDR
} else {
  // Disable HDR
  hdrSystem.disableHDR()  // ❌ This clears HDR textures!
}
```

**Result**: If `hdrSource` is null when effect runs, HDR is disabled and textures are cleared.

---

## Complete Flow Analysis

### Scenario: Enable Weather GL → Exit → Enable HDR

**Step 1: Weather GL Enabled**
- `enableStandaloneWeather = true`
- `scene.background = null` (line 8817)
- `hdrSystem.updateBackgroundVisibility(false)` (line 8819)
- HDR effect doesn't run (not in dependencies)

**Step 2: Weather GL Exited**
- `enableStandaloneWeather = false`
- `hdrSystem.updateBackgroundVisibility(hdrBackgroundVisible)` (line 11221)
- `scene.background` is NOT restored (still `null`)
- HDR effect doesn't re-run (not in dependencies)

**Step 3: User Tries to Enable HDR**
- `hdrEnabled = true`
- HDR effect runs
- Checks: `if (hdrEnabled && hdrSource)`
- If `hdrSource` exists: HDR is applied ✅
- BUT `scene.background` might still be `null` from Weather GL
- Weather effect (line 9920-9955) tries to set background, but runs AFTER HDR effect

**Potential Race Condition**:
- HDR effect sets `scene.background = originalHdrTexture`
- Weather effect (line 9924) also sets `scene.background = originalHdrTexture`
- But if HDR effect runs first and `hdrSource` is null, HDR is disabled
- Then weather effect can't set background because HDR is disabled

---

## Conflicts Identified

### Conflict 1: scene.background Not Restored After Weather GL Exit

**Location**: `ViewerCanvas.tsx:11214-11237`

**Problem**: Only HDR background visibility is restored, not `scene.background` itself.

**Fix Needed**: Explicitly restore `scene.background` when HDR is enabled.

---

### Conflict 2: HDR Effect Doesn't Re-Run After Weather GL Exit

**Location**: `ViewerCanvas.tsx:7907-8217`

**Problem**: `enableStandaloneWeather` is not in HDR effect dependencies.

**Fix Needed**: Either add to dependencies OR explicitly trigger HDR re-apply after Weather GL exit.

---

### Conflict 3: Weather Effect May Override HDR Background

**Location**: `ViewerCanvas.tsx:9920-9955`

**Problem**: Weather effect runs after HDR effect and may override background.

**Fix Needed**: Ensure HDR background takes priority, or run HDR effect after weather effect.

---

## Recommended Fixes

### Fix 1: Restore scene.background After Weather GL Exit

```typescript
// After Weather GL exit (line 11214)
if (viewerRef.current.hdrSystem) {
  const store = useAppStore.getState()
  const hdrEnabled = store.hdrEnabled
  const hdrBackgroundVisible = store.hdrBackgroundVisible
  
  if (hdrEnabled) {
    // Restore HDR background visibility
    viewerRef.current.hdrSystem.updateBackgroundVisibility(hdrBackgroundVisible)
    
    // FIX: Explicitly restore scene.background if HDR is enabled
    const originalHdrTexture = viewerRef.current.environmentMap as THREE.DataTexture | null
    if (originalHdrTexture && originalHdrTexture instanceof THREE.DataTexture && 
        scene.environment && hdrBackgroundVisible && !hdrGroundProjectionEnabled) {
      originalHdrTexture.mapping = THREE.EquirectangularReflectionMapping
      originalHdrTexture.needsUpdate = true
      scene.background = originalHdrTexture
      console.log('[ViewerCanvas] ✅ HDR background restored after Weather GL exit')
    }
  }
}
```

### Fix 2: Force HDR Re-Apply After Weather GL Exit

```typescript
// After Weather GL exit (line 11214)
if (viewerRef.current.hdrSystem && hdrEnabled) {
  // Force HDR to re-apply by triggering effect
  // OR manually re-apply HDR
  const hdrSource = hdrFile ?? hdrUrl
  if (hdrSource) {
    viewerRef.current.hdrSystem.applyHDR(hdrSource, hdrIntensity)
  }
}
```

### Fix 3: Add enableStandaloneWeather to HDR Effect Dependencies

```typescript
}, [
  hdrEnabled,
  hdrUrl,
  hdrFile,
  enableStandaloneWeather  // FIX: Re-run when Weather GL changes
])
```

---

## Priority

**High Priority**:
- Fix 1: Restore `scene.background` after Weather GL exit
- Fix 2: Force HDR re-apply after Weather GL exit

**Medium Priority**:
- Fix 3: Add `enableStandaloneWeather` to dependencies (may cause unnecessary re-runs)

---

**Status**: Analysis complete - 3 conflicts identified





















