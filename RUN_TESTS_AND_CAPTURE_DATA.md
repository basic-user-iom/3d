# Run Tests and Capture All Data

## Quick Start

The comprehensive test runner is now available! It will automatically capture all test data and download it as a JSON file.

### Run Tests in Browser Console

1. Open browser to `http://localhost:3000`
2. Wait for viewer to fully initialize
3. Open browser console (F12)
4. Run:

```javascript
window.shadowSystemTestRunner.runAll()
```

This will:
- ✅ Run all shadow system transition tests
- ✅ Capture complete state before/after each transition
- ✅ Verify light position restoration
- ✅ Verify shadow camera restoration
- ✅ Verify shadow plane restoration
- ✅ Generate comprehensive summary statistics
- ✅ **Automatically download results as JSON file**

### Available Commands

```javascript
// Run all tests and capture data (downloads JSON automatically)
window.shadowSystemTestRunner.runAll()

// Get last test results (returns object)
window.shadowSystemTestRunner.getResults()

// Manually export results as JSON (if already run)
window.shadowSystemTestRunner.exportResults()
```

## What Gets Captured

### Light State
- Position (x, y, z)
- Target position (x, y, z)
- Intensity
- Visibility
- castShadow flag
- Shadow camera bounds (left, right, top, bottom, near, far)
- Shadow camera position
- Shadow map size
- Shadow bias values
- **userData with saved positions**

### Shadow Plane State
- Visibility
- Position
- receiveShadow/castShadow flags
- Material properties (transparent, opacity, depthWrite)

### System State
- Current shadow system (standard/csm)
- CSM lights count
- Standard lights count
- CSM system exists
- Renderer shadow map enabled/type

### Test Results
- Before/after state for each transition
- Success/failure status
- Errors and warnings
- Position restoration verification
- Summary statistics

## Output Format

The test results are saved as JSON with this structure:

```json
{
  "timestamp": "2025-12-13T20:15:00.000Z",
  "totalTests": 4,
  "passedTests": 4,
  "failedTests": 0,
  "results": [
    {
      "timestamp": "...",
      "testName": "Standard to Weather GL",
      "fromSystem": "standard",
      "toSystem": "csm",
      "beforeState": {...},
      "afterState": {...},
      "lightStates": {
        "before": [...],
        "after": [...],
        "restored": [true, false, ...]
      },
      "shadowPlaneState": {...},
      "shadowCameraState": {...},
      "materialState": {...},
      "systemState": {...},
      "errors": [],
      "warnings": [],
      "success": true
    }
  ],
  "summary": {
    "lightPositionRestoration": { "success": 4, "failed": 0 },
    "shadowCameraRestoration": { "success": 4, "failed": 0 },
    "shadowPlaneRestoration": { "success": 4, "failed": 0 },
    "materialStatePreservation": { "success": 4, "failed": 0 },
    "systemStateConsistency": { "success": 4, "failed": 0 }
  }
}
```

## Test Scenarios

The test runner executes:

1. **Standard → Weather GL (CSM)**
   - Captures state before switch
   - Switches to CSM
   - Captures state after switch
   - Verifies restoration

2. **Weather GL → Standard**
   - Captures state before switch
   - Switches back to standard
   - Captures state after switch
   - Verifies light positions restored

3. **Standard → Weather GL (Round Trip)**
   - Tests multiple transitions
   - Verifies consistency

4. **Weather GL → Standard (Round Trip)**
   - Final round trip test
   - Verifies all state preserved

## Accessing Results

After running tests:

1. **Automatic Download**: Results are automatically downloaded as JSON file
2. **Window Object**: Results are also stored in `window.shadowSystemTestResults`
3. **Console Output**: Full results are logged to console

## Example Usage

```javascript
// Run tests
await window.shadowSystemTestRunner.runAll()

// Wait for completion, then access results
const results = window.shadowSystemTestRunner.getResults()
console.log('Test Summary:', results.summary)
console.log('All Results:', results.results)

// Or manually export
window.shadowSystemTestRunner.exportResults()
```

## Notes

- Tests run sequentially with 500ms delays between transitions
- Each test waits 200ms after switch for async operations
- All data is captured before and after each transition
- Results are automatically downloaded as JSON file
- File name includes timestamp: `shadow-system-test-results-2025-12-13T20-15-00-000Z.json`





















