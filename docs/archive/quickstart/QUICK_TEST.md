# Quick Test Guide

## 🚀 Immediate Checks

### 1. Browser Console (F12)
Look for these messages in order:

**Expected Console Output:**
```
[Renderer] WebGL2 support confirmed ✓
[GroundLayer] Tile grid: ...
[GroundLayer] Loaded 9 map tiles
[GroundLayer] Ground layer added to scene
[Buildings] Fetching building data from Overpass API...
[Buildings] Loaded X buildings from Overpass API
[Roads] Fetching road data from Overpass API...
[Roads] Loaded X road segments
[Camera] Position updated
```

### 2. Visual Checks

**What You Should See:**
- ✅ Map tiles on the ground (satellite/street map)
- ✅ 3D buildings (colored boxes with roofs)
- ✅ Roads (gray lines on the ground)
- ✅ Shadows (buildings cast shadows)
- ✅ Sky blue background

**What Might Be Missing:**
- ⚠️ Buildings: May take 5-10 seconds to load (API rate limiting)
- ⚠️ Roads: May take a few seconds after buildings
- ⚠️ Trees: May not be visible in all areas

### 3. Controls

**Mouse Controls:**
- **Left Click + Drag**: Rotate camera
- **Right Click + Drag**: Pan camera
- **Scroll Wheel**: Zoom in/out
- **Double Click**: Focus on location

### 4. URL Hash

The URL should show coordinates in the hash:
```
#32.90379,-97.03924,27.75,25.00,905.10
```

Format: `#lat,lon,zoom,heading,distance`

## 🔧 Troubleshooting

### If Nothing Appears:
1. **Check Console**: Look for red errors
2. **Check Network Tab**: See if tiles are loading
3. **Wait 10 seconds**: API calls may be slow
4. **Refresh**: Sometimes helps with API rate limits

### If Buildings Don't Show:
- Check console for "429" or "504" errors (rate limiting)
- Wait 30 seconds and refresh
- Try a different location

### If Map Tiles Don't Show:
- Check network tab for failed tile requests
- Verify internet connection
- Try different map style (if UI available)

## 📍 Test Locations

### Location 1: Default (Arlington, Texas)
```
#32.90379,-97.03924,27.75,25.00,905.10
```
Should show: Urban area with buildings

### Location 2: Closer View
```
#32.89579,-97.03913,45.00,0.00,320.00
```
Should show: Closer view with more detail

### Location 3: Different Area
```
#32.89683,-97.04039,45.00,0.00,776.45
```
Should show: Different part of same area

## ✅ Success Indicators

**Everything is working if:**
1. ✅ Map tiles visible on ground
2. ✅ Buildings appear (may take 5-10 seconds)
3. ✅ Roads visible
4. ✅ Shadows working
5. ✅ Camera controls responsive
6. ✅ No critical console errors

## 🎯 Performance

**Good Performance:**
- Smooth camera movement (60fps)
- No stuttering
- Buildings load within 10 seconds

**If Slow:**
- Reduce number of buildings (if option available)
- Check browser performance tab
- Try different browser (Chrome recommended)

## 📊 What to Compare

Compare with streets.gl demo:
- Building appearance
- Building heights
- Roof types (if visible)
- Colors and materials
- Shadow quality

**Note**: Our version uses solid colors (no textures), so it may look slightly different but should be visually similar.







