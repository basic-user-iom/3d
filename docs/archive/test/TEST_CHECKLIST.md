# Test Checklist - Object Placement on Map

## ✅ Implementation Complete

### Changes Made:
1. ✅ Canvas z-index set to 20 (above iframe)
2. ✅ Iframe z-index set to 5 (below canvas)
3. ✅ Transparent canvas background when iframe enabled
4. ✅ Scene background set to null when iframe enabled
5. ✅ Clear color set to transparent when iframe enabled

## 🧪 Testing Steps

### Step 1: Verify Setup
- [ ] Open browser console (F12)
- [ ] Navigate to http://localhost:3000
- [ ] Check for any errors

### Step 2: Enable Iframe Overlay
- [ ] Click "OSM GROUND ver2" button in toolbar
- [ ] Check "Show Streets GL 3D Buildings (iframe overlay)"
- [ ] Verify map appears
- [ ] Check console: Should see `[App] Streets GL iframe loaded successfully`

### Step 3: Load 3D Model
- [ ] Use "Open Files" or "Load URL" from toolbar
- [ ] Select a GLTF/GLB model (car or any 3D model)
- [ ] Wait for model to load

### Step 4: Verify Object Placement
- [ ] Check console for: `[ModelPosition] Using iframe overlay - positioned at origin`
- [ ] Verify position: `{ x: 0.000, y: 0.035, z: 0.000 }`
- [ ] Check console for: `[FrameObject] Framing object:`
- [ ] Model should be automatically framed

### Step 5: Verify Visibility
- [ ] **Model should be visible ON TOP of the map**
- [ ] **Map should be visible BEHIND the model**
- [ ] Model should appear to be "on" the map
- [ ] If model not visible, click "Fit" button (🎯 Fit)

### Step 6: Verify Z-Index Layering
- [ ] Open browser DevTools
- [ ] Inspect `#viewer-canvas` element
- [ ] Verify `z-index: 20` in computed styles
- [ ] Inspect iframe container
- [ ] Verify `z-index: 5` in computed styles

### Step 7: Verify Transparency
- [ ] Inspect canvas element in DevTools
- [ ] Check if background is transparent
- [ ] Map should show through canvas background
- [ ] Objects should render on top

## 📊 Expected Console Output

### When Iframe Loads:
```
[App] Streets GL iframe loaded successfully
```

### When Model Loads:
```
[ModelPosition] Starting positioning, model structure: {...}
[ModelPosition] Using iframe overlay - positioned at origin (map center): {
  lat: 32.89917,
  lon: -97.03813,
  worldPosition: { x: 0.000, y: 0.035, z: 0.000 },
  note: 'Iframe overlay: objects at origin match map center visually'
}
[ModelLoad] Framing model in viewport (from URL)
[FrameObject] Framing object: {
  center: { x: 0.00, y: 0.00, z: 0.00 },
  size: {...},
  maxDim: ...,
  distance: ...
}
[FrameObject] Camera positioned: {...}
```

## ✅ Success Criteria

- [ ] Map loads and displays correctly
- [ ] Model loads without errors
- [ ] Model is positioned at origin (0, 0.035, 0)
- [ ] Model is visible ON TOP of map
- [ ] Map is visible BEHIND model
- [ ] Canvas has transparent background
- [ ] Z-index layering is correct (canvas: 20, iframe: 5)
- [ ] No console errors

## 🔧 Troubleshooting

### Issue: Model not visible
**Solutions:**
1. Click "Fit" button (🎯 Fit) to frame the model
2. Check Objects Panel - verify model is in scene
3. Check console for positioning logs
4. Verify model position is (0, 0.035, 0)

### Issue: Map not visible
**Solutions:**
1. Verify Streets GL server is running (http://localhost:8081)
2. Check iframe loaded successfully in console
3. Verify iframe overlay is enabled
4. Check iframe z-index is 5

### Issue: Model behind map
**Solutions:**
1. Verify canvas z-index is 20 (inspect element)
2. Verify iframe z-index is 5 (inspect element)
3. Check canvas has transparent background
4. Refresh page and try again

### Issue: Canvas not transparent
**Solutions:**
1. Verify iframe overlay is enabled before loading model
2. Check renderer has `alpha: true` when overlay enabled
3. Check scene.background is `null` when overlay enabled
4. Check renderer clear color is transparent

## 📝 Notes

- **Z-Index Order**: Toolbar (1000) > Canvas (20) > Iframe (5)
- **Transparency**: Only active when iframe overlay is enabled
- **Performance**: Transparent background has minimal impact
- **Compatibility**: Works with all WebGL-capable browsers

## 🎯 Expected Visual Result

```
┌─────────────────────────────────┐
│  Toolbar (z-index: 1000)       │
├─────────────────────────────────┤
│  ┌───────────────────────────┐  │
│  │  Canvas (z-index: 20)     │  │ ← Your Car Model
│  │  [3D Objects Visible]     │  │   (transparent bg)
│  ├───────────────────────────┤  │
│  │  Iframe (z-index: 5)      │  │ ← Streets GL Map
│  │  [Map Visible Behind]     │  │   (shows through)
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

**Result**: Objects appear to be "on" the map! 🎉
