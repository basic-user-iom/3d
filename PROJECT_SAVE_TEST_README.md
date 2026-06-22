# Project Save/Load Testing Guide

## Overview

This guide explains how to test and debug the project save/load functionality in the 3D viewer application.

## Quick Test

### Option 1: Run Complete Test Suite (Recommended)

1. Open the application in your browser
2. Wait for the scene to load
3. Open the browser console (F12)
4. Copy and paste the entire contents of `test-project-save-complete.js` into the console
5. Press Enter to run the test

The test will:
- ✅ Check viewer state
- ✅ Analyze scene objects
- ✅ Check file registry
- ✅ Create a project snapshot
- ✅ Validate model files and base64 encoding
- ✅ Test JSON serialization
- ✅ Provide detailed diagnostics

### Option 2: Use Debug Functions

The following functions are available in the browser console:

#### `window.debugProjectState()`
Get detailed information about the current project state:
```javascript
const state = window.debugProjectState()
console.log(state)
```

Returns:
- `viewer`: Viewer state information
- `sceneObjects`: Array of all models in the scene with their transformations
- `registeredFiles`: Array of files registered in the file registry
- `snapshotInfo`: Estimated snapshot size and creation capability

#### `window.validateProjectSnapshot(snapshot)`
Validate a saved project snapshot:
```javascript
const snapshot = await window.createProjectSnapshot()
const validation = window.validateProjectSnapshot(snapshot)
console.log(validation)
```

Returns:
- `valid`: Boolean indicating if snapshot is valid
- `errors`: Array of error messages
- `warnings`: Array of warning messages
- `info`: Summary information about the snapshot

#### `window.createProjectSnapshot()`
Create a project snapshot for testing:
```javascript
const snapshot = await window.createProjectSnapshot()
console.log(snapshot)
```

## Common Issues and Solutions

### Issue 1: Models Not Saving

**Symptoms:**
- Models exist in scene but don't appear in saved snapshot
- `sceneObjects` array is empty in snapshot

**Diagnosis:**
```javascript
const state = window.debugProjectState()
console.log('Scene objects:', state.sceneObjects)
```

**Solution:**
- Ensure models have `userData.isModel` or `userData.isImportedModel` set to `true`
- Check that models have `userData.fileName` set

### Issue 2: Files Not Embedded

**Symptoms:**
- Model files in snapshot have `fileUrl` but no `fileData`
- Models don't restore when loading project

**Diagnosis:**
```javascript
const snapshot = await window.createProjectSnapshot()
const validation = window.validateProjectSnapshot(snapshot)
console.log('Embedded files:', validation.info.embeddedFiles)
console.log('Warnings:', validation.warnings)
```

**Solution:**
- Check if files are registered in file registry
- Files larger than 50MB are not embedded (by design)
- Blob URLs cannot be embedded (they're session-specific)

### Issue 3: Base64 Encoding Errors

**Symptoms:**
- Error: "Invalid typed array length"
- Error: "Invalid base64 string format"
- Models fail to load from embedded data

**Diagnosis:**
```javascript
const snapshot = await window.createProjectSnapshot()
const fileWithData = snapshot.store.modelFiles.find(f => f.fileData)
if (fileWithData) {
  const cleanBase64 = fileWithData.fileData.trim().replace(/\s/g, '')
  const isValid = /^[A-Za-z0-9+/]*={0,2}$/.test(cleanBase64)
  console.log('Base64 valid:', isValid)
}
```

**Solution:**
- Base64 strings should only contain A-Z, a-z, 0-9, +, /, and =
- Check for whitespace or special characters
- Verify JSON serialization/deserialization doesn't corrupt the data

### Issue 4: Models Not Restoring

**Symptoms:**
- Project loads but models don't appear
- Console shows "Model file not found" warnings

**Diagnosis:**
```javascript
// Check what's in the snapshot
const snapshot = await window.createProjectSnapshot()
console.log('Model files:', snapshot.store.modelFiles)
console.log('Scene objects:', snapshot.sceneObjects)

// Check file registry
const state = window.debugProjectState()
console.log('Registered files:', state.registeredFiles)
```

**Solution:**
- Ensure model files are embedded in snapshot (check `fileData` property)
- If using URLs, ensure they're still accessible
- Check that `restoreSceneObject` is finding files in registry

### Issue 5: Transformations Not Restored

**Symptoms:**
- Models load but are in wrong position/rotation/scale

**Diagnosis:**
```javascript
// Before saving
const before = window.debugProjectState()
console.log('Before save:', before.sceneObjects)

// After loading (check in console)
// Models should have same position/rotation/scale
```

**Solution:**
- Verify `serializeSceneObject` is saving position, rotation, scale
- Check that `restoreSceneObject` is applying transformations
- Ensure transformations are applied after model is loaded

## Test Checklist

When testing project save/load, verify:

- [ ] Models are saved with correct transformations
- [ ] Model files are embedded (or have valid URLs)
- [ ] Base64 encoding is valid
- [ ] JSON serialization works correctly
- [ ] Models restore correctly when loading
- [ ] Transformations are restored correctly
- [ ] Materials and textures are restored
- [ ] HDR environment is restored
- [ ] Camera position is restored

## Manual Testing Steps

1. **Prepare Scene:**
   - Load one or more GLB/GLTF models
   - Transform models (move, rotate, scale)
   - Apply materials/textures if needed
   - Set HDR environment
   - Adjust camera position

2. **Save Project:**
   - Click "Save Project" in toolbar
   - Choose save location
   - Wait for save to complete

3. **Verify Snapshot:**
   ```javascript
   const snapshot = await window.createProjectSnapshot()
   const validation = window.validateProjectSnapshot(snapshot)
   console.log(validation)
   ```
   - Check for errors
   - Verify all models are in snapshot
   - Verify files are embedded

4. **Load Project:**
   - Clear scene or reload page
   - Click "Load Project" in toolbar
   - Select saved project file
   - Wait for load to complete

5. **Verify Restoration:**
   - Check that all models appear
   - Verify transformations match original
   - Check materials/textures
   - Verify HDR environment
   - Check camera position

## Debugging Tips

1. **Use Console Logging:**
   - All save/load operations log to console with `[ProjectPersistence]` prefix
   - Watch for warnings and errors

2. **Inspect Snapshot:**
   ```javascript
   const snapshot = await window.createProjectSnapshot()
   // Save to file for inspection
   const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' })
   const url = URL.createObjectURL(blob)
   const a = document.createElement('a')
   a.href = url
   a.download = 'snapshot-debug.json'
   a.click()
   ```

3. **Check File Registry:**
   ```javascript
   const state = window.debugProjectState()
   console.log('Registered files:', state.registeredFiles)
   ```

4. **Monitor Network:**
   - Open Network tab in DevTools
   - Watch for failed file loads
   - Check CORS errors for external URLs

## Performance Considerations

- **Large Files:** Files > 50MB are not embedded (stored as URL references)
- **JSON Size:** Large projects may create very large JSON files
- **Base64 Overhead:** Base64 encoding adds ~33% size overhead
- **Recommendation:** Use packaged project (ZIP) for large projects

## Best Practices

1. **Always Embed Files:** When possible, embed model files in snapshot
2. **Use Valid URLs:** If using URLs, ensure they're permanent and accessible
3. **Test Restore:** Always test loading after saving
4. **Validate Snapshots:** Use `validateProjectSnapshot` before distributing
5. **Monitor Size:** Keep project files under 50MB for best performance

## Getting Help

If tests fail or you encounter issues:

1. Run the complete test suite and review all output
2. Check console for errors and warnings
3. Use `window.debugProjectState()` to inspect current state
4. Validate snapshot with `window.validateProjectSnapshot()`
5. Check the test results stored in `window.projectSaveTestResults`
