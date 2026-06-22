# Hook Initialization Timing Issue

## Problem Identified

From browser console logs:
1. ✅ Container ref becomes available: `[ViewerCanvas] ✅ Container ref available, hooks can initialize`
2. ❌ Hooks not ready: `[ViewerCanvas] Using existing initialization (hooks not ready: scene, controls, lighting, shadows, effects, modelLoader, objectManager, animation)`
3. ✅ Later hooks initialize: `[useThreeScene] Scene initialized: [object Object]`

## Root Cause

Hooks use `useEffect` internally, which means:
- They return `null` on first render
- They initialize asynchronously after render
- The main `useEffect` in ViewerCanvas runs before hooks are ready
- Falls back to existing initialization

## Current Flow

1. Component renders
2. Hooks called (return `null`)
3. `hookBasedViewer` useMemo returns `null` (all hooks null)
4. Main `useEffect` runs, sees `hookBasedViewer` is `null`
5. Falls back to existing initialization
6. Next render cycle: hooks initialize via `useEffect`
7. `hookBasedViewer` useMemo recalculates (but too late - old init already ran)

## Solution

The `useEffect` dependency array should include all hook results so it re-runs when hooks become ready. Let me check the current dependency array.














