# HDR Implementation Conflicts Analysis

## Overview
This document identifies all potential conflicts in the HDR implementation where `scene.background` or `scene.environment` are modified.

## Critical Conflicts Found

### 1. **Multiple Effects Modifying scene.background**
**Location**: Multiple `useEffect` hooks
**Issue**: At least 10 different places set `scene.background`, causing race conditions

**Conflicting Effects:**
- **HDR Effect** (line ~2095): Sets `scene.background = originalHdrTexture` when HDR is loaded
- **DynamicSky Effect** (line ~3198): Sets `scene.background = null` when DynamicSky enabled
- **Weather Effect** (line ~3286): Tries to enforce HDR background but runs after DynamicSky
- **Particle Effect** (line ~4017): Final check for HDR background
- **Cleanup Code** (line ~2641): Clears background on HDR disable
- **Initial Setup** (line ~248): Sets default color background
- **Model Loading Cleanup** (line ~2664): Resets to default color

**Priority**: 🔴 CRITICAL - This is the main cause of HDR background not showing

### 2. **Multiple Effects Modifying scene.environment**
**Location**: Multiple `useEffect` hooks
**Issue**: At least 8 different places set `scene.environment`

**Conflicting Effects:**
- **HDR Effect** (line ~2426): Sets `scene.environment = envMap` (PMREM)
- **DynamicSky Effect** (line ~3245): Sets fallback `RoomEnvironment` when HDR disabled
- **Weather Effect** (line ~3499): Sets fallback `RoomEnvironment` when HDR disabled
- **Cleanup Code** (line ~2660): Clears environment on HDR disable
- **Blob URL Handler** (line ~2245): Clears environment when blob URL detected

**Priority**: 🟡 HIGH - Can cause environment map to be cleared unexpectedly

### 3. **Effect Execution Order Issues**
**Problem**: React effects run in dependency order, but HDR and DynamicSky effects can run simultaneously

**Dependencies:**
- HDR Effect: `[hdrEnabled, hdrUrl, hdrIntensity, dynamicSkyEnabled]`
- DynamicSky Effect: `[dynamicSkyEnabled, timeOfDay, cloudDensity, ...hdrEnabled]`
- Weather Effect: `[weatherPreset, dynamicSkyEnabled, hdrEnabled, ...]`

**Issue**: When both HDR and DynamicSky are enabled:
1. DynamicSky effect runs and sets `scene.background = null`
2. HDR effect runs and tries to set `scene.background = hdrTexture`
3. Weather effect runs and tries to enforce HDR background
4. But DynamicSky might run again and override

**Priority**: 🔴 CRITICAL

### 4. **Timing/Race Conditions**
**Problem**: Multiple `setTimeout` calls trying to enforce HDR background

**Locations:**
- Line ~2410: 100ms delay to re-enforce HDR background
- Line ~4017: Final check in particle effect
- Line ~4311: Final check in weather effect cleanup

**Issue**: These timeouts can conflict with each other and with effect runs

**Priority**: 🟡 MEDIUM

### 5. **DynamicSky Mesh Visibility**
**Problem**: DynamicSky mesh can cover HDR background even when HDR is enabled

**Locations:**
- Line ~3260: Hides mesh when HDR enabled
- Line ~4019: Hides mesh in particle effect
- Line ~4313: Hides mesh in weather cleanup

**Issue**: Multiple places trying to hide/show the mesh, possible race conditions

**Priority**: 🟡 MEDIUM

### 6. **Material envMap Updates**
**Problem**: Multiple effects traverse scene and update materials, causing conflicts

**Locations:**
- HDR Effect: Applies envMap when HDR loaded
- DynamicSky Effect: Applies fallback envMap when HDR disabled
- Weather Effect: Applies envMap with intensity boosts
- Blob URL Handler: Applies fallback envMap

**Issue**: Materials can be updated multiple times per frame, causing performance issues

**Priority**: 🟡 MEDIUM

## Recommended Solution

### Priority 1: Consolidate Background Management
- Create a single `useEffect` that manages `scene.background` based on priority:
  - Priority 1: HDR (if enabled and loaded)
  - Priority 2: DynamicSky (if enabled and HDR not enabled)
  - Priority 3: Solid color (fallback)

### Priority 2: Consolidate Environment Management
- Create a single `useEffect` that manages `scene.environment`:
  - HDR PMREM (if HDR enabled and loaded)
  - Fallback RoomEnvironment (if HDR disabled)
  - null (if both disabled)

### Priority 3: Remove Redundant Checks
- Remove all `setTimeout` enforcement checks
- Remove duplicate final checks in multiple effects
- Keep only one final enforcement point

### Priority 4: Batch Material Updates
- Only update materials once per effect cycle
- Cache material state to avoid redundant updates





