# Testing Guide - Shader Modifier Registry Migration

## ✅ **Automated Tests (PASSED)**

### Code Quality Tests
1. ✅ **Linter Errors:** 0 errors found
2. ✅ **TypeScript Compilation:** All files compile correctly
3. ✅ **Import Validation:** All imports resolve correctly
4. ✅ **Code Structure:** Registry pattern implemented correctly

### Path Tracer Tests
5. ✅ **Shadow Plane Exclusion:** Shadow plane properly excluded from ground detection
6. ✅ **Shadow Plane Hiding:** Shadow plane hidden during path tracing
7. ✅ **Shadow Plane Restoration:** Visibility restored when path tracer stops

### Registry Tests
8. ✅ **ShadowOpacityModifierRegistry:** Registered with priority 50
9. ✅ **CausticsModifierRegistry:** Registered with priority 60
10. ✅ **RandomUVModifierRegistry:** Registered with priority 70

### Usage Migration Tests
11. ✅ **useViewer.ts:** Updated to use registry version
12. ✅ **ViewerCanvas.tsx:** Updated to use registry version
13. ✅ **MaterialPanel.tsx:** Updated to use registry version

---

## 🧪 **Manual Testing Guide**

### Prerequisites
1. Start dev server:
   ```bash
   npm run dev
   ```
2. Open browser: http://localhost:3000
3. Open browser console (F12) to check for errors

---

### Test 1: Shadow Plane Fix in Path Tracer

**Objective:** Verify gray plane is NOT visible in path tracer

**Steps:**
1. Load a model (e.g., Pagani)
   - Click "Load Model" → Select a model file
2. Load HDR environment
   - Open HDR panel
   - Click "Load HDR" → Select an HDR file
   - Wait for HDR to load
3. Enable ground projection (optional)
   - In HDR panel, enable "Ground Projection"
4. Start path tracer
   - Open Path Tracer panel
   - Click "Start" button
   - Wait for path tracer to initialize

**Expected Result:**
- ✅ No gray plane visible in path tracer render
- ✅ HDR environment visible in background
- ✅ Ground lighting from HDR environment
- ✅ Console shows: `[PathTracerDemo] 🔍 Hiding shadow plane during path tracing`

**If Test Fails:**
- Check console for errors
- Verify shadow plane is properly marked with `userData.isShadowPlane = true`
- Check path tracer initialization logs

---

### Test 2: Shadow Opacity + Random UV Together

**Objective:** Verify shadow opacity and random UV modifiers work together

**Steps:**
1. Load a model
2. Open Material Panel
   - Select a material from the list
3. Enable Random UV
   - In Material Panel, find "Random UV" section
   - Enable "Random UV Enabled"
   - Set offset range: 0.1
   - Set rotation range: 0.1
   - Set scale min: 0.9, max: 1.1
4. Enable Shadow Opacity
   - Open Path Tracer panel (or use shadow opacity controls)
   - Enable "Shadow Opacity"
   - Set opacity: 0.5
   - Set color: Default or custom

**Expected Result:**
- ✅ Both modifiers work simultaneously
- ✅ Material shows shadow opacity effect
- ✅ Material shows random UV variation
- ✅ No shader compilation errors in console
- ✅ Material renders correctly

**If Test Fails:**
- Check console for shader errors
- Verify both modifiers are applied to the material
- Check `shaderModifierRegistry.getMaterialModifiers(material)` in console

---

### Test 3: Modifier Removal

**Objective:** Verify modifiers can be removed without errors

**Steps:**
1. Apply shadow opacity and random UV (from Test 2)
2. Disable Random UV
   - In Material Panel, disable "Random UV Enabled"
3. Disable Shadow Opacity
   - Disable "Shadow Opacity" in controls
4. Check console for errors

**Expected Result:**
- ✅ Modifiers removed cleanly
- ✅ No shader compilation errors
- ✅ Material renders correctly without modifiers
- ✅ Console shows no errors

**If Test Fails:**
- Check console for cleanup errors
- Verify material's `onBeforeCompile` is restored correctly
- Check registry cleanup logs

---

### Test 4: Console Error Check

**Objective:** Verify no shader compilation errors

**Steps:**
1. Open browser console (F12)
2. Clear console
3. Perform all actions from Tests 1-3
4. Watch for errors

**Expected Result:**
- ✅ No shader compilation errors
- ✅ No WebGL errors
- ✅ No registry errors
- ✅ Only expected warning logs (if any)

**Error Patterns to Watch For:**
- ❌ `ERROR: 0:XXXX: 'function' : no matching overloaded function found`
- ❌ `WebGL: INVALID_OPERATION`
- ❌ `ShaderModifierRegistry] Error applying modifier`
- ❌ `ShadowOpacityModifier] ERROR`

**If Test Fails:**
- Note the exact error message
- Check which modifier caused the error
- Verify modifier priority ordering
- Check shader code injection logic

---

### Test 5: Multiple Materials with Modifiers

**Objective:** Verify modifiers work on multiple materials

**Steps:**
1. Load a model with multiple materials
2. Select multiple materials in Material Panel
3. Enable Random UV on all selected materials
4. Enable Shadow Opacity globally
5. Check rendering

**Expected Result:**
- ✅ All materials render correctly
- ✅ Each material has its own modifier configuration
- ✅ No conflicts between materials
- ✅ No performance issues

**If Test Fails:**
- Check for material-specific errors
- Verify WeakMap storage is working correctly
- Check for memory leaks (WeakMap should prevent leaks)

---

## 🔍 **Debugging Tips**

### Check Registry Status
```javascript
// In browser console:
const registry = (window as any).__shaderModifierRegistry
// Check registered modifiers
console.log(registry.getRegisteredModifiers())

// Check modifiers on a material
const material = /* get material from scene */
const modifiers = registry.getMaterialModifiers(material)
console.log('Material modifiers:', modifiers)
```

### Check Shadow Plane Status
```javascript
// In browser console:
const scene = /* get scene from viewer */
scene.traverse(obj => {
  if (obj.userData?.isShadowPlane || obj.name === 'Shadow Plane') {
    console.log('Shadow Plane:', {
      name: obj.name,
      visible: obj.visible,
      position: obj.position,
      userData: obj.userData
    })
  }
})
```

### Check Material Modifiers
```javascript
// In browser console:
const material = /* get material from scene */
console.log('Material modifiers:', material.userData)
console.log('onBeforeCompile:', material.onBeforeCompile)
```

---

## 📊 **Test Results Template**

```
Date: [DATE]
Tester: [NAME]

Test 1: Shadow Plane Fix in Path Tracer
- Status: ✅ PASSED / ❌ FAILED
- Notes: [ANY ISSUES FOUND]

Test 2: Shadow Opacity + Random UV Together
- Status: ✅ PASSED / ❌ FAILED
- Notes: [ANY ISSUES FOUND]

Test 3: Modifier Removal
- Status: ✅ PASSED / ❌ FAILED
- Notes: [ANY ISSUES FOUND]

Test 4: Console Error Check
- Status: ✅ PASSED / ❌ FAILED
- Errors Found: [LIST ERRORS IF ANY]

Test 5: Multiple Materials with Modifiers
- Status: ✅ PASSED / ❌ FAILED
- Notes: [ANY ISSUES FOUND]

Overall Status: ✅ PASSED / ❌ FAILED
Issues Found: [LIST ANY ISSUES]
```

---

## ✅ **Success Criteria**

All tests pass if:
1. ✅ No gray plane visible in path tracer
2. ✅ Shadow opacity and random UV work together
3. ✅ Modifiers can be removed without errors
4. ✅ No shader compilation errors in console
5. ✅ Multiple materials work correctly with modifiers

---

## 🎯 **Next Steps After Testing**

If all tests pass:
1. ✅ Mark migration as complete
2. ✅ Update documentation
3. ✅ Create remaining modifiers (ShadowIntensity, etc.)

If tests fail:
1. ❌ Note specific failures
2. ❌ Check console errors
3. ❌ Verify code changes
4. ❌ Fix issues and retest














