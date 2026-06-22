# Shadow System Comparison: Test Demo vs Main Application

## Key Differences Found

### Test Demo (`test-shadow-system.html`)
- **Shadow Map Size**: 2048px
- **Shadow Camera Bounds**: Fixed, tight (-10 to 10 = 20 units)
- **Shadow Camera Near**: 0.1
- **Shadow Camera Far**: 50
- **Shadow Radius**: Not set (defaults to 0 or 1)
- **Shadow Bias**: Not set (defaults to 0)
- **Shadow Normal Bias**: Not set (defaults to 0)
- **Effective Resolution**: 2048px / 20 units = **102.4 pixels per unit** ✅

### Main Application (`ViewerCanvas.tsx`)
- **Shadow Map Size**: 8192px (from store)
- **Shadow Camera Bounds**: Dynamic, can be large (-2000 to 2000 = 4000 units initial)
- **Shadow Camera Near**: 0.01 (then 0.001 after update)
- **Shadow Camera Far**: 5000 (then dynamic)
- **Shadow Radius**: 2 (just updated)
- **Shadow Bias**: -0.0002 (initial), then adaptive
- **Shadow Normal Bias**: 0.01 (initial), then adaptive
- **Effective Resolution**: 8192px / 4000 units = **2.05 pixels per unit** ❌ (if using initial bounds)

## Problem Identified

The main application's **initial shadow camera bounds are too large** (-2000 to 2000), which causes:
- Low effective resolution (2.05 pixels per unit)
- Blocky shadows until dynamic bounds are calculated
- Inconsistent behavior compared to test demo

## Solution

Make the main application use **tighter initial shadow camera bounds** similar to the test demo, while keeping the dynamic bounds calculation for larger scenes.





