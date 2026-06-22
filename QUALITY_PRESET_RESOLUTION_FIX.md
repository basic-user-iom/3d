# Quality Preset Resolution Button State Fix

## Problem

When clicking a quality preset (Fast/Balanced/High/Ultra), it was setting `resolutionPreset` to `'custom'`, which deselected the resolution preset buttons (1080p, 2k, 4k, 8k) even if the quality preset's resolution scale matched a resolution preset.

## Root Cause

In `applyQualityPreset()`, the code always called `setResolutionPreset('custom')` regardless of whether the quality preset's `resolutionScale` matched one of the resolution presets.

## Solution

Modified `applyQualityPreset()` to:
1. Check if the quality preset's `resolutionScale` matches a resolution preset value
2. If it matches, set `resolutionPreset` to that matching preset instead of `'custom'`
3. This allows both quality and resolution preset buttons to be highlighted simultaneously when they match

## Implementation

```typescript
// Resolution preset scale mapping
const resolutionPresetMap: Record<string, number> = {
  '1080p': 1,
  '2k': 1.33,
  '4k': 2,
  '8k': 3
}

// Find matching resolution preset
const matchingResolutionPreset = Object.entries(resolutionPresetMap).find(
  ([_, scale]) => Math.abs(scale - preset.resolutionScale) < 0.01
)?.[0] as '1080p' | '2k' | '4k' | '8k' | undefined

// Set resolution preset to matching value, or 'custom' if no match
if (matchingResolutionPreset) {
  setResolutionPreset(matchingResolutionPreset)
} else {
  setResolutionPreset('custom')
}
```

## Quality Preset Resolution Scales

- **Fast**: resolutionScale = 1 → matches **1080p**
- **Balanced**: resolutionScale = 1.33 → matches **2k**
- **High**: resolutionScale = 1.5 → **custom** (no match)
- **Ultra**: resolutionScale = 2 → matches **4k**

## Result

- When clicking **Fast**: Both "Fast" and "1080p" buttons are highlighted
- When clicking **Balanced**: Both "Balanced" and "2k" buttons are highlighted
- When clicking **High**: Only "High" is highlighted (resolution preset set to "custom")
- When clicking **Ultra**: Both "Ultra" and "4k" buttons are highlighted

## Files Modified

- `src/components/PathTracerDemoPanel.tsx` (line ~895): Modified `applyQualityPreset()` to preserve resolution preset selection when it matches


























