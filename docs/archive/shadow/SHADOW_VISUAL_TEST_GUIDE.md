# Shadow System Visual Test Guide

## Running Visual Tests

### Option 1: Standalone Test Page
1. Open `test-shadow-system.html` in your browser
2. Click "Load Test Scene" to create test objects
3. Use the controls to test different shadow configurations

### Option 2: In Development Server
1. Start the dev server: `npm run dev`
2. Navigate to: `http://localhost:3000/test-shadow-system.html`

## Test Checklist

### ✅ Basic Shadow Tests
- [ ] **Test Scene Loads**: Click "Load Test Scene" - should see 3 colored objects (red box, green sphere, blue cylinder) on a gray ground plane
- [ ] **Shadows Visible**: Objects should cast shadows on the ground plane
- [ ] **Shadow Plane Toggle**: Enable/disable shadow plane checkbox - shadows should appear/disappear
- [ ] **Transparent Shadow Plane**: Toggle transparent mode - shadow plane should change appearance

### ✅ Shadow Configuration Tests
- [ ] **Shadows Enabled**: Toggle "Shadows Enabled" - shadows should appear/disappear
- [ ] **Shadow Intensity**: Adjust slider - shadow darkness should change
- [ ] **Shadow Map Size**: Adjust slider - shadow quality should change (may need to reload scene)

### ✅ CSM Shadow Tests
- [ ] **CSM Toggle**: Enable "Enable CSM" - CSM system should activate (if implemented)
- [ ] **CSM Shadows**: Shadows should work with CSM enabled
- [ ] **CSM Quality**: Shadow quality should be high with CSM

### ✅ Visual Verification
- [ ] **Shadow Direction**: Shadows should point away from light source
- [ ] **Shadow Sharpness**: Shadows should be reasonably sharp (not too blurry)
- [ ] **Shadow Coverage**: Shadows should cover appropriate area
- [ ] **Multiple Objects**: All objects should cast shadows
- [ ] **Ground Shadows**: Shadows should appear on ground plane

## Expected Results

### When Shadows Work Correctly:
- ✅ Objects cast visible shadows on the ground
- ✅ Shadow direction matches light direction
- ✅ Shadows are reasonably sharp
- ✅ Shadow plane shows shadows when enabled
- ✅ Shadow intensity affects shadow darkness
- ✅ All test objects cast shadows

### Common Issues:

1. **No Shadows Visible**
   - Check "Shadows Enabled" is checked
   - Check "Show Shadow Plane" is checked
   - Verify renderer.shadowMap.enabled = true
   - Check light.castShadow = true
   - Check objects have castShadow = true

2. **Shadows Too Blurry**
   - Increase shadow map size (2048, 4096, or 8192)
   - Check shadow camera bounds are appropriate
   - Reduce shadow radius if using PCF

3. **Shadows Not Appearing on Plane**
   - Verify shadow plane receiveShadow = true
   - Check shadow plane material is correct
   - Ensure shadow plane is visible
   - Check shadow camera covers shadow plane

4. **CSM Shadows Not Working**
   - Verify CSM system is initialized
   - Check CSM lights are in scene
   - Verify materials are set up for CSM
   - Check console for CSM errors

## Browser Console Commands

Open browser console (F12) and run:

```javascript
// Check shadow configuration
console.log('Shadows enabled:', window.renderer?.shadowMap?.enabled)
console.log('Light casts shadow:', window.directionalLight?.castShadow)

// Check objects
window.testObjects.forEach((obj, i) => {
    console.log(`Object ${i}:`, {
        castShadow: obj.castShadow,
        receiveShadow: obj.receiveShadow,
        visible: obj.visible
    })
})

// Run all tests
window.runAllTests()
```

## Integration with Main App

To test in the main application:

1. Start dev server: `npm run dev`
2. Load a 3D model
3. Enable shadow plane in Lighting panel
4. Verify shadows appear on shadow plane
5. Test CSM shadows by enabling Dynamic Sky
6. Test shadow intensity and quality settings

## Notes

- The standalone test page uses a simplified Three.js setup
- For full CSM testing, use the main application with Dynamic Sky enabled
- Shadow quality may vary based on GPU capabilities
- Large shadow map sizes (8192px) may cause performance issues on some GPUs





