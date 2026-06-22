# Quick Test Checklist - Streets GL Integration

## ⚡ Quick Verification (5 minutes)

### Step 1: Check Servers (30 seconds)
- [ ] Open `http://localhost:3000` in browser
- [ ] Open `http://localhost:8081` in browser (Streets GL)
- [ ] Both should load without errors

### Step 2: Enable Streets GL (30 seconds)
- [ ] In 3D Viewer, open "OSM GROUND ver2" panel
- [ ] Check "Show Streets GL 3D Buildings (iframe overlay)"
- [ ] Wait for Streets GL map to load
- [ ] Verify map appears in iframe

### Step 3: Create Object (1 minute)
- [ ] Open "Primitives" panel
- [ ] Click "Create Box"
- [ ] **Verify**: Box appears in Streets GL map
- [ ] Check browser console for sync logs

### Step 4: Test Real-Time Sync (2 minutes)
- [ ] Select the box
- [ ] Press **G** (translate mode) or click translate button
- [ ] Drag the box
- [ ] **Verify**: Box moves in Streets GL in real-time as you drag
- [ ] Press **R** (rotate mode)
- [ ] Rotate the box
- [ ] **Verify**: Box rotates in Streets GL in real-time
- [ ] Press **S** (scale mode)
- [ ] Scale the box
- [ ] **Verify**: Box scales in Streets GL in real-time

### Step 5: Test Controls (1 minute)
- [ ] Open "Lighting & Environment" panel
- [ ] Change "Streets GL Shadow Quality" dropdown
- [ ] **Verify**: Shadows change in Streets GL
- [ ] Adjust "Sun Intensity" slider
- [ ] **Verify**: Scene brightness changes
- [ ] Adjust "Sun Direction" (target X/Y/Z)
- [ ] **Verify**: Lighting direction changes

---

## ✅ Expected Results

### Console Logs (F12 → Console)
```
[StreetsGL Manager] Server will run on http://localhost:8081
[App] Streets GL bridge is ready
[StreetsGLBridge] Extracted geometry and material: {...}
[StreetsGLSync] ✅ Model successfully added to Streets GL scene
[ViewerCanvas] ✅ Transform synced to Streets GL (real-time)
[ExternalObjectBridge] Shadow quality set to: medium
[ExternalObjectBridge] Sun intensity set to: 1.5
```

### Visual Verification
- ✅ Streets GL map loads in iframe
- ✅ Objects appear in Streets GL map
- ✅ Objects move/rotate/scale in real-time
- ✅ Shadows change when quality changes
- ✅ Lighting changes when sun controls adjusted

---

## ❌ Troubleshooting

### Servers Not Running
```bash
# Start both servers
npm run dev
```

### Objects Not Syncing
- Check: Streets GL overlay is enabled
- Check: Console for errors
- Check: Bridge is ready (console logs)

### Real-Time Sync Not Working
- Check: Object has `streetsGLObjectId` in userData
- Check: Console for sync errors
- Check: Transform controls are attached

### Controls Not Working
- Check: Streets GL overlay is enabled
- Check: Bridge is ready
- Check: Console for control logs

---

## 📊 Test Results

**Date**: ___________

**Servers**: [ ] Running [ ] Not Running
**Bridge**: [ ] Ready [ ] Not Ready
**Object Sync**: [ ] Working [ ] Not Working
**Real-Time Sync**: [ ] Working [ ] Not Working
**Controls**: [ ] Working [ ] Not Working

**Issues Found**:
1. ___________
2. ___________

**Notes**:
___________

---

**Time to Complete**: ~5 minutes
**Status**: Ready for testing! 🧪


