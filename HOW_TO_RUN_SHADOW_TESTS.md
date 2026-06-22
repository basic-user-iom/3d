# How to Run Shadow System Tests

## Quick Start

The shadow system tests are automatically initialized when the viewer loads. You can run them in two ways:

### Method 1: Browser Console (Recommended)

1. Open your browser's developer console (F12)
2. Wait for the viewer to fully initialize
3. Run the comprehensive test suite:

```javascript
window.shadowSystemTests.runAll()
```

This will run all transition tests and log detailed results to the console.

### Method 2: UI Panel

1. Open the "Shadow System Tests" panel from the toolbar
2. Click "Run Comprehensive Tests" button
3. Check the console for detailed results

## Available Test Functions

### Run All Tests
```javascript
window.shadowSystemTests.runAll()
```
Runs all transition scenarios:
- Standard → Weather GL → Standard
- Weather GL → Standard → Weather GL (round trip)
- Multiple transitions to catch inconsistencies

### Test Specific Transition
```javascript
window.shadowSystemTests.testSwitch('standard', 'csm', 'Test Name')
```
Tests a specific system switch with detailed logging.

### Debug Current State
```javascript
// Debug system state
window.shadowSystemTests.debugSystem('Current State')

// Debug a specific light
const viewer = window.__viewer || window.sharedViewer
const lights = Array.from(viewer.directionalLights.values())
window.shadowSystemTests.debugLight(lights[0], 'Light 1')

// Debug shadow plane
window.shadowSystemTests.debugPlane(viewer.shadowPlane, 'Shadow Plane')

// Debug shadow camera
window.shadowSystemTests.debugShadow(lights[0], 'Shadow Camera')
```

### Visualize Shadow Camera
```javascript
const viewer = window.__viewer || window.sharedViewer
const lights = Array.from(viewer.directionalLights.values())
window.shadowSystemTests.visualizeCamera(lights[0])
```
Shows shadow camera frustum for 10 seconds.

### Visualize Light Position
```javascript
const viewer = window.__viewer || window.sharedViewer
const lights = Array.from(viewer.directionalLights.values())
window.shadowSystemTests.visualizeLight(lights[0])
```
Shows light position and target line.

## What the Tests Check

### 1. Shadow State
- Shadow camera bounds (left, right, top, bottom)
- Shadow camera position and target
- Shadow camera near/far planes
- Shadow map size and state
- Renderer shadow map enabled state

### 2. Shadow Plane State
- Visibility
- Position (should be y = -0.001)
- Material properties (transparent, opacity, color)
- receiveShadow/castShadow flags
- Material depthWrite

### 3. Light State
- Position (matches saved position)
- Target position (matches saved position)
- Intensity (matches saved intensity)
- Visibility
- castShadow flag
- Registration with ShadowManager

### 4. Material State
- Shadow properties (castShadow, receiveShadow)
- Depth properties (depthWrite, depthTest)
- CSM shader patches (removed when switching away from CSM)

### 5. System State
- Active shadow system type
- CSM lights count in scene (should be 0 when CSM disabled)
- Standard lights count
- CSM system existence
- Shadow plane existence

## Interpreting Results

### ✅ PASS
All state matches expected values. No inconsistencies detected.

### ❌ FAIL
State doesn't match expected values. Check the console logs for:
- What property failed
- Expected vs actual values
- Which transition caused the failure

### Common Issues to Look For

1. **Light positions not restored**
   - Check `[LightVerify]` logs
   - Look for position/target mismatches

2. **Shadow camera bounds incorrect**
   - Check `[ShadowDebug]` logs
   - Verify camera bounds cover the scene

3. **Shadow plane not visible**
   - Check `[ShadowPlaneDebug]` logs
   - Verify visibility and position

4. **CSM lights still in scene**
   - Check `[SystemDebug]` logs
   - csmLightsInScene should be 0 when CSM disabled

5. **Materials not updated**
   - Check CSM material count
   - Should be 0 when CSM disabled

## Example Test Output

```
🧪 TEST: Standard to Weather GL
Switching from standard to csm

[SystemDebug] BEFORE SWITCH: { currentSystem: 'standard', ... }
[LightDebug] BEFORE: { position: { x: 0, y: 10, z: 0 }, ... }
[ShadowPlaneDebug] BEFORE: { visible: true, position: { y: -0.001 }, ... }

[SystemDebug] AFTER SWITCH: { currentSystem: 'csm', ... }
[LightDebug] AFTER: { position: { x: 0, y: 10, z: 0 }, ... }
[LightVerify] Sun Light: { position: true, target: true, ... status: '✅ PASS' }

✅ TEST COMPLETE: Standard to Weather GL
```

## Troubleshooting

### Tests not available
If `window.shadowSystemTests` is undefined:
1. Wait for viewer to fully initialize
2. Check console for initialization message
3. Refresh the page

### Tests fail immediately
- Check that viewer is fully loaded
- Verify shadow systems are properly initialized
- Check console for errors

### Inconsistent results
- Run tests multiple times to catch race conditions
- Check timing issues with async operations
- Verify no other code is modifying shadow state during tests





















