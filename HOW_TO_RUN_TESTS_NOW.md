# How to Run Tests and Capture All Data - RIGHT NOW

## Method 1: Browser Console (Easiest)

1. **Open your browser** to `http://localhost:3000`
2. **Wait** for the viewer to fully initialize (you'll see "✅ Shadow System Test Runner initialized!" in console)
3. **Open browser console** (Press F12, then click "Console" tab)
4. **Run this command**:

```javascript
window.shadowSystemTestRunner.runAll()
```

That's it! The tests will run automatically and:
- ✅ Capture all data before/after each transition
- ✅ Verify light position restoration
- ✅ Generate comprehensive summary
- ✅ **Automatically download results as JSON file**

## Method 2: Copy-Paste Script

1. Open browser console (F12)
2. Copy the entire contents of `run-tests-script.js`
3. Paste into console and press Enter

## Method 3: One-Line Command

Just paste this into console:

```javascript
await window.shadowSystemTestRunner.runAll()
```

## What Happens

1. **Test 1**: Standard → Weather GL (CSM)
   - Captures state before
   - Switches to CSM
   - Captures state after
   - Verifies restoration

2. **Test 2**: Weather GL → Standard
   - Captures state before
   - Switches back to standard
   - Captures state after
   - Verifies light positions restored

3. **Test 3**: Standard → Weather GL (Round Trip)
   - Tests multiple transitions

4. **Test 4**: Weather GL → Standard (Round Trip)
   - Final verification

## Output

After completion, you'll get:

1. **Console Output**: Full detailed results logged to console
2. **JSON File Download**: Automatically downloads `shadow-system-test-results-[timestamp].json`
3. **Window Object**: Results stored in `window.shadowSystemTestResults`

## Access Results Later

```javascript
// Get results
const results = window.shadowSystemTestRunner.getResults()

// Or access directly
const results = window.shadowSystemTestResults

// Export again
window.shadowSystemTestRunner.exportResults()
```

## Expected Duration

Tests take approximately **3-5 seconds** to complete (includes delays for async operations).

## Troubleshooting

**"Test Runner not initialized"**
- Wait a few seconds for viewer to fully load
- Check console for "✅ Shadow System Test Runner initialized!"

**"No viewer reference"**
- Make sure you're on the main viewer page
- Refresh the page and wait for initialization

**Tests fail**
- Check console for detailed error messages
- Results will still be captured and downloaded





















