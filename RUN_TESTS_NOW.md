# Run Tests Now - Instructions

## Quick Test Execution

### Option 1: Browser Console (Recommended)

1. **Start the dev server** (if not running):
   ```bash
   npm run dev
   ```

2. **Open browser** to `http://localhost:3000`

3. **Open browser console** (F12)

4. **Run tests**:
   ```javascript
   window.postProcessingTests.runAllTests()
   ```

### Option 2: Auto-Run (Automatic)

Tests will **automatically run** when:
- Page loads
- Viewer is initialized
- Post-processing system is ready
- Test suite is loaded

**Wait 2-5 seconds after page load** and check the console for results.

## Expected Test Results

### ✅ Test 1: Shadow Map Preservation
- Should show: `Shadow maps enabled: true`
- Should show: `Render target depth buffer: true`
- **Expected: PASS**

### ✅ Test 2: Color Space and Tone Mapping  
- Should show: `Output color space: srgb-linear`
- Should show: `All passes exist: true`
- Should show: `Pass order correct: true`
- **Expected: PASS** (after fixes)

### ✅ Test 3: SSS Shadow Intensity
- Should show: `SSS intensity: 0.5`
- Should show: `Expected: 0.5`
- **Expected: PASS** (with null checks)

### ⏳ Tests 4-7: Other Tests
- Will run automatically
- Check console for individual results

## Test Output Format

```
🧪 Running Post-Processing Test Suite...

=== Test 1: Shadow Map Preservation ===
Shadow maps enabled: true
Render target depth buffer: true
✅ Visual check: Shadows should be visible in scene

=== Test 2: Color Space and Tone Mapping ===
Output color space: srgb-linear
Pass order: [...]
Pass indices: {...}
Color space correct: true
All passes exist: true
Pass order correct: true
✅ Visual check: Colors should be vibrant, not washed out

[... more tests ...]

=== Test Results Summary ===
[Table with results]

✅ Passed: X/7
```

## Troubleshooting

### Tests don't auto-run?
- Check console for: `✅ Post-processing test suite loaded`
- Check console for: `🚀 Auto-running post-processing tests...`
- If missing, run manually: `window.postProcessingTests.runAllTests()`

### Server not running?
```bash
npm run dev
```

### Tests show errors?
- Check browser console for detailed error messages
- Verify viewer is initialized: `window.__viewer` or `window.sharedViewer`
- Verify post-processing system exists: `window.__viewer?.postProcessingSystem`

---

**Status:** ✅ **Ready to test** - All fixes applied, tests should pass!

























