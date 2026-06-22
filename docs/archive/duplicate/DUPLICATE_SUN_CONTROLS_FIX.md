# Duplicate Sun Controls Fix

## Problem
There were **two sun control sections** visible when Streets GL overlay is active:
1. **WeatherPanel**: "☀️ Sun Controls" - Three.js sun light controls
2. **LightingPanel**: "☀️ Streets GL Sun" - Streets GL sun controls

This was confusing because:
- Both control the same underlying sun light object
- WeatherPanel controls don't sync to Streets GL
- LightingPanel controls DO sync to Streets GL
- User doesn't know which one to use

## Solution
**Disabled WeatherPanel sun controls when Streets GL is active**, similar to other weather controls:

### Changes Made
1. **Added notice** at top of WeatherPanel "Sun Controls" section:
   - Shows when Streets GL overlay is active
   - Explains that Streets GL sun controls are in Lighting panel
   - Notes that WeatherPanel controls affect Three.js scene only

2. **Disabled all controls** in WeatherPanel "Sun Controls" section:
   - Name input
   - Enabled checkbox
   - Intensity slider
   - Color picker
   - Cast Shadows checkbox
   - Position inputs (X, Y, Z)

### Result
- ✅ **When Streets GL is active**: WeatherPanel sun controls are disabled with clear notice
- ✅ **When Streets GL is inactive**: WeatherPanel sun controls work normally for Three.js scene
- ✅ **LightingPanel**: Always shows Streets GL sun controls when Streets GL overlay is active
- ✅ **No confusion**: User knows to use Lighting panel for Streets GL sun controls

## File Changed
- `src/components/WeatherPanel.tsx` (lines 587-695)


