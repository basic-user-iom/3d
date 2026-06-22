# Server Start Instructions

## Issue Detected

The dev server appears to be exiting immediately. Here's how to start it properly:

## ✅ Manual Start (Recommended)

### Step 1: Open Terminal

Open a new terminal window in your project directory.

### Step 2: Start Dev Server

```bash
cd d:\ai-cursor\3d-test-software
npm run dev
```

**Wait for output showing:**
```
  ➜  Local:   http://localhost:3000/
```

### Step 3: Open Browser

1. Navigate to: **http://localhost:3000**
2. **Open Developer Console** (Press F12)

### Step 4: Run Tests

**Option A: Auto-Run (Wait 2-5 seconds)**
- Tests will automatically execute
- Look for: `🚀 Auto-running post-processing tests...`

**Option B: Manual Run**
```javascript
window.postProcessingTests.runAllTests()
```

## 🔍 Troubleshooting

### Server won't start?

1. **Check for errors in terminal**
   - Look for any error messages
   - Check if port 3000 is already in use

2. **Check if port is in use:**
   ```bash
   netstat -ano | findstr :3000
   ```

3. **Kill existing process if needed:**
   ```bash
   taskkill /PID <process_id> /F
   ```

4. **Try alternative start:**
   ```bash
   npm run dev:skip-check
   ```

### Tests don't appear?

- Verify console shows: `✅ Post-processing test suite loaded`
- Check: `window.__viewer` or `window.sharedViewer` exists
- Run manually: `window.postProcessingTests.runAllTests()`

## 📊 Expected Test Results

Once tests run, you should see:

```
🧪 Running Post-Processing Test Suite...

=== Test 1: Shadow Map Preservation ===
Shadow maps enabled: true
Render target depth buffer: true

=== Test 2: Color Space and Tone Mapping ===
Output color space: srgb-linear
All passes exist: true
Pass order correct: true

[... more tests ...]

=== Test Results Summary ===
✅ Passed: X/7
```

---

**Status:** Server needs to be started manually. All test fixes are applied and ready!

























