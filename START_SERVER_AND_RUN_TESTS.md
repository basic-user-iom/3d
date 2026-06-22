# Start Server and Run Tests - Complete Guide

## 🚀 Quick Start

### Step 1: Start Dev Server

**Open a new terminal/command prompt** and run:

```bash
cd d:\ai-cursor\3d-test-software
npm run dev
```

**What to expect:**
- The command will start multiple services (StreetsGL and Vite)
- Wait for output showing: `➜  Local:   http://localhost:3000/`
- The browser should automatically open (due to `--open` flag)
- If browser doesn't open automatically, navigate manually to `http://localhost:3000`

### Step 2: Open Browser Console

1. **If browser opened automatically:** Press **F12** to open Developer Tools
2. **If browser didn't open:** Navigate to `http://localhost:3000` and press **F12**
3. **Click on "Console" tab** in Developer Tools

### Step 3: Run Tests

**Option A: Auto-Run (Recommended)**
- Wait **2-5 seconds** after page loads
- Tests will automatically execute
- Look for: `🚀 Auto-running post-processing tests...` in console

**Option B: Manual Run**
- In the console, type:
```javascript
window.postProcessingTests.runAllTests()
```
- Press **Enter**

## 📊 Expected Console Output

You should see output like this:

```
✅ Post-processing test suite loaded. Run window.postProcessingTests.runAllTests() to test.
🚀 Auto-running post-processing tests...

🧪 Running Post-Processing Test Suite...

=== Test 1: Shadow Map Preservation ===
Shadow maps enabled: true
Render target depth buffer: true
✅ Visual check: Shadows should be visible in scene

=== Test 2: Color Space and Tone Mapping ===
Output color space: srgb-linear
Pass order: ["RenderPass", "ShaderPass", "OutputPass", ...]
Total passes: X
Pass indices: {render: 0, toneMapping: X, lut: -1, colorGrading: X, output: X}
Color space correct: true
All passes exist: true
Pass order correct: true
✅ Visual check: Colors should be vibrant, not washed out

=== Test 3: SSS Shadow Intensity ===
SSS intensity: 0.5
Expected: 0.5
⚠️ Check shader code: intensity should only be applied once
✅ Visual check: Shadows should not be too dark

=== Test 4: SSR Camera Matrices ===
Projection matrix updated: true
View matrix updated: true

[... Tests 5-7 ...]

=== Test Results Summary ===
┌─────────────┬───────┐
│ shadowMaps  │ true  │
│ colorSpace  │ true  │
│ sssIntensity│ true  │
│ ssrMatrices │ true  │
│ memoryLeaks │ true  │
│ textureUpdates│ true │
│ passOrder   │ true  │
└─────────────┴───────┘

✅ Passed: 7/7
```

## ✅ Test Results Expected

- **Test 1: Shadow Map Preservation** - Should PASS ✅
- **Test 2: Color Space and Tone Mapping** - Should PASS ✅ (fixed)
- **Test 3: SSS Shadow Intensity** - Should PASS ✅ (null checks added)
- **Test 4: SSR Camera Matrices** - Should PASS ✅
- **Test 5: Memory Leaks** - Should PASS ✅
- **Test 6: Texture Updates** - Should PASS ✅
- **Test 7: Pass Order Stability** - Should PASS ✅

## 🔍 Troubleshooting

### Server won't start?

1. **Check for errors in terminal**
   - Look for any red error messages
   - Check if dependencies are installed: `npm install`

2. **Check if port 3000 is in use:**
   ```bash
   netstat -ano | findstr :3000
   ```

3. **Kill existing process if needed:**
   ```bash
   taskkill /PID <process_id> /F
   ```

4. **Try alternative start command:**
   ```bash
   npm run dev:skip-check
   ```

### Tests don't auto-run?

1. **Check console for:**
   - `✅ Post-processing test suite loaded`
   - If missing, refresh the page

2. **Verify viewer exists:**
   ```javascript
   window.__viewer || window.sharedViewer
   ```

3. **Run manually:**
   ```javascript
   window.postProcessingTests.runAllTests()
   ```

### Tests show errors?

1. **Check specific error message** in console
2. **Verify post-processing system:**
   ```javascript
   window.__viewer?.postProcessingSystem
   ```
3. **Check if model is loaded** (some tests need a scene)

### Page won't load?

1. **Verify server is running:**
   - Terminal should show: `Local: http://localhost:3000`
   - Try refreshing the page
   - Check for error messages in terminal

## 📝 Notes

- **Auto-run:** Tests execute automatically 2-5 seconds after page load
- **Non-destructive:** Tests don't modify your scene permanently
- **All fixes applied:** Test suite has been improved with error handling
- **Model required:** Some tests may need a model to be loaded

## ✅ Status

**Test Suite:** ✅ Ready  
**Fixes Applied:** ✅ Complete  
**Auto-run:** ✅ Enabled  
**Server:** ⏳ Needs to be started manually  

---

**Next Step:** Start the dev server with `npm run dev` and open the browser to run the tests!

























