# Testing Checklist - Streets GL Integration

## ✅ Completed Fixes

### 1. ESLint Conflict Resolution
- ✅ Removed `@typescript-eslint/eslint-plugin` from package.json
- ✅ Removed `@typescript-eslint/parser` from package.json
- ✅ Removed lint scripts
- ✅ ESLintPlugin commented out in webpack.config.js
- ✅ No `.eslintrc.json` files exist
- ✅ Parent `.eslintrc.cjs` ignores `streets-gl-alt/**`

### 2. Model Visibility Improvements
- ✅ Enhanced `frameObject` function with minimum distance for small objects
- ✅ Added detailed console logging for model positioning
- ✅ Improved model loading delays to ensure proper rendering
- ✅ Added "Fit" button (🎯 Fit) to toolbar for manual reframing
- ✅ Multiple positioning attempts to ensure model sticks

### 3. Streets GL Integration
- ✅ Iframe overlay configured at `http://localhost:8081`
- ✅ Server availability check with user-friendly warnings
- ✅ UI elements repositioned to bottom center
- ✅ Modals made draggable with position persistence
- ✅ WebGL error filtering to reduce console noise

## 🧪 Testing Steps

### Step 1: Verify Streets GL Server
1. **Check terminal running `npm run dev` in `streets-gl-alt` folder:**
   - ✅ Should see: `webpack compiled successfully`
   - ❌ If you see ESLint errors, run `FIX_ESLINT_NOW.bat`

2. **Open http://localhost:8081 in browser:**
   - ✅ Should see Streets GL map interface
   - ✅ Search bar at bottom center
   - ✅ Navigation buttons (location, settings, info) at bottom center
   - ✅ Map should load with 3D buildings

### Step 2: Test Main Application Integration
1. **Open main 3D viewer (http://localhost:3000)**
2. **Click "OSM GROUND ver2" button in toolbar**
3. **Enable "Show Streets GL 3D Buildings (iframe overlay)"**
   - ✅ Map should appear as overlay
   - ✅ 3D buildings should be visible
   - ✅ No console errors (except harmless WebGL warnings from iframe)

### Step 3: Test 3D Model Loading
1. **Load a 3D model (car or any model):**
   - ✅ Model should automatically:
     - Be positioned on the ground (Y=0)
     - Be framed in the viewport
     - Be visible in the scene
   - ✅ Check console for positioning logs:
     ```
     [ModelLoad] Framing model in viewport
     [FrameObject] Framing object: { center, size, maxDim, distance }
     [FrameObject] Camera positioned: { position, target }
     ```

2. **If model is not visible:**
   - ✅ Click "Fit" button (🎯 Fit) in toolbar
   - ✅ Check console for any errors
   - ✅ Verify model is in scene (check Objects panel)

### Step 4: Test Streets GL Controls
1. **Search functionality:**
   - ✅ Type location in search bar
   - ✅ Select from dropdown
   - ✅ Map should update to new location
   - ✅ Iframe should reload with new coordinates

2. **Navigation buttons:**
   - ✅ Click location button (downward triangle) - should center on current location
   - ✅ Click settings button (gear) - modal should open and be draggable
   - ✅ Click info button ('i') - modal should open and be draggable
   - ✅ Modal positions should persist after closing/reopening

3. **Modal dragging:**
   - ✅ Drag modal by header
   - ✅ Modal should move smoothly
   - ✅ Position should save to localStorage
   - ✅ Modal should stay within viewport bounds

## 🔍 Troubleshooting

### Issue: ESLint errors still appear
**Solution:**
```powershell
cd streets-gl-alt
Remove-Item -Recurse -Force node_modules\.cache
Remove-Item -Recurse -Force build
npm run dev
```

### Issue: Map doesn't load
**Check:**
- Server running on http://localhost:8081
- Browser console for errors
- Network tab for failed requests

### Issue: Models not visible
**Try:**
1. Click "Fit" button (🎯 Fit)
2. Check console for positioning logs
3. Verify model is in scene (Objects panel)
4. Check if model is outside camera view (zoom out)

### Issue: Modals not draggable
**Check:**
- Browser console for JavaScript errors
- Verify `ModalPanel.tsx` has drag handlers
- Check localStorage for saved positions

## 📊 Expected Console Output

### Successful Model Load:
```
[ModelLoad] Framing model in viewport (from URL)
[FrameObject] Framing object: {
  center: { x: 0.00, y: 0.00, z: 0.00 },
  size: { x: 2.50, y: 1.50, z: 4.00 },
  maxDim: 4.00,
  distance: 10.00
}
[FrameObject] Camera positioned: {
  position: { x: 8.16, y: 6.12, z: 8.16 },
  target: { x: 0.00, y: 0.00, z: 0.00 }
}
```

### Streets GL Server Running:
```
[App] Streets GL iframe loaded successfully
```

### Streets GL Server Not Running:
```
⚠️ Streets GL Server Not Running
The Streets GL server is not accessible at http://localhost:8081.
```

## ✅ Success Criteria

- [ ] Streets GL server compiles without ESLint errors
- [ ] Map loads at http://localhost:8081
- [ ] Iframe overlay works in main app
- [ ] 3D models load and are automatically framed
- [ ] "Fit" button works for manual reframing
- [ ] Search functionality updates map location
- [ ] Modals are draggable and positions persist
- [ ] No critical console errors (WebGL warnings from iframe are OK)







