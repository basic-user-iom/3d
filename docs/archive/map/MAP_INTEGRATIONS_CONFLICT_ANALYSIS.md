# Map Integrations Conflict Analysis

## Summary

Found **multiple OSM integrations** that can run simultaneously, and potential conflicts between the Maps button and OSM integrations.

## Current Map Integrations

### 1. **Maps Panel** (`🗺️ Maps` button)
- **Location**: `src/components/MapsPanel.tsx`
- **Features**:
  - Cesium Ion tilesets
  - Google 3D Tiles
  - OpenStreetMap tab (currently shows "Coming Soon" - not implemented)
  - Location search
- **State**: `showMapsPanel: true` (enabled by default)
- **Status**: ✅ Active, but OSM tab is placeholder only

### 2. **OSM Ground V2 Panel** (`🗺️ OSM 3D` button)
- **Location**: `src/components/OSMGroundV2Panel.tsx`
- **Features**:
  - **Option A**: Ground Layer (Direct Integration) - `streetsGLGroundEnabled`
    - Creates ground plane directly in Three.js scene
    - Uses OSM tiles to create texture
  - **Option B**: Streets GL 3D Buildings (iframe overlay) - `streetsGLIframeOverlay`
    - Full Streets GL renderer in iframe
    - 3D buildings overlay
- **State**: `showOSMGroundV2Panel: false` (disabled by default)
- **Status**: ✅ Active, but panel is hidden by default

### 3. **OSM Buildings** (Legacy)
- **Location**: `src/viewer/effects/osmBuildings.ts`
- **State**: `osmBuildingsEnabled: false` (disabled by default)
- **Status**: ⚠️ Exists but not actively used

## Conflicts Identified

### ❌ Conflict 1: Both Ground Layer AND Iframe Overlay Can Be Enabled Simultaneously

**Problem**: 
- `streetsGLGroundEnabled` and `streetsGLIframeOverlay` can both be `true` at the same time
- This creates **two different OSM integrations running simultaneously**:
  1. Ground layer plane in Three.js scene
  2. Full Streets GL iframe overlay

**Current Behavior**:
- Both checkboxes are independent in `OSMGroundV2Panel.tsx`
- No mutual exclusion logic
- Can cause visual conflicts (two maps rendering)

**Impact**: 
- Performance issues (rendering two map systems)
- Visual confusion (overlapping maps)
- Coordinate system conflicts

### ❌ Conflict 2: Maps Panel OSM Tab vs OSM Ground V2 Panel

**Problem**:
- Maps Panel has an "OpenStreetMap" tab (line 242-256 in `MapsPanel.tsx`)
- OSM Ground V2 Panel also provides OSM integration
- Both can be open simultaneously
- Maps Panel OSM tab is just a placeholder ("Coming Soon")

**Current Behavior**:
- Maps Panel OSM tab: Shows "Coming Soon" message, no actual functionality
- OSM Ground V2 Panel: Full OSM integration with two modes
- Both panels can be open at the same time

**Impact**:
- User confusion (two places for OSM)
- Redundant UI
- Maps Panel OSM tab is misleading (suggests functionality that doesn't exist)

### ⚠️ Conflict 3: Cesium Ion / Google Tiles vs Streets GL Iframe

**Problem**:
- Maps Panel can load Cesium Ion tilesets or Google 3D Tiles
- OSM Ground V2 Panel can enable Streets GL iframe overlay
- Both can be active simultaneously
- Different coordinate systems and rendering approaches

**Current Behavior**:
- No mutual exclusion
- Can cause rendering conflicts
- Coordinate system mismatches

**Impact**:
- Visual conflicts (multiple map systems)
- Performance degradation
- Coordinate system confusion

## Current State Analysis

### Default States:
```typescript
showMapsPanel: true                    // ✅ Enabled by default
showOSMGroundV2Panel: false           // ❌ Disabled by default
streetsGLGroundEnabled: false         // ❌ Disabled by default
streetsGLIframeOverlay: true          // ✅ Enabled by default
osmBuildingsEnabled: false            // ❌ Disabled by default
```

### Active Integrations (by default):
1. ✅ **Maps Panel** - Open (but OSM tab is placeholder)
2. ✅ **Streets GL Iframe Overlay** - Enabled (shows full Streets GL in iframe)

## Recommendations

### 1. Add Mutual Exclusion for Ground Layer and Iframe Overlay

**Fix**: When one is enabled, automatically disable the other:

```typescript
// In OSMGroundV2Panel.tsx
onChange={(e) => {
  if (e.target.checked) {
    // If enabling ground layer, disable iframe overlay
    setStreetsGLGroundEnabled(true)
    setStreetsGLIframeOverlay(false)
  } else {
    setStreetsGLGroundEnabled(false)
  }
}}
```

### 2. Remove or Implement Maps Panel OSM Tab

**Option A**: Remove the OSM tab from Maps Panel (since OSM Ground V2 Panel handles it)
**Option B**: Implement the OSM tab to use the same ground layer system

### 3. Add Conflict Detection and Warnings

**Fix**: Add warnings when multiple map systems are active:
- Warn if Cesium Ion + Streets GL both active
- Warn if Ground Layer + Iframe Overlay both active
- Warn if Maps Panel OSM tab is used (since it's not implemented)

### 4. Consolidate OSM Integration Points

**Fix**: 
- Use OSM Ground V2 Panel as the **primary** OSM integration
- Remove or redirect Maps Panel OSM tab to OSM Ground V2 Panel
- Add clear documentation about which panel to use for what

## Code Locations

### Files to Modify:
1. `src/components/OSMGroundV2Panel.tsx` - Add mutual exclusion logic
2. `src/components/MapsPanel.tsx` - Remove or implement OSM tab
3. `src/App.tsx` - Add conflict detection warnings
4. `src/store/useAppStore.ts` - Consider adding conflict state

## Testing Checklist

- [ ] Test: Enable ground layer, then enable iframe overlay - should disable ground layer
- [ ] Test: Enable iframe overlay, then enable ground layer - should disable iframe overlay
- [ ] Test: Open Maps Panel and OSM Ground V2 Panel simultaneously - check for conflicts
- [ ] Test: Load Cesium Ion tileset + enable Streets GL iframe - check for conflicts
- [ ] Test: Verify only one OSM integration is active at a time

## Next Steps

1. **Immediate**: Add mutual exclusion for `streetsGLGroundEnabled` and `streetsGLIframeOverlay`
2. **Short-term**: Remove or implement Maps Panel OSM tab
3. **Long-term**: Add conflict detection system for all map integrations


