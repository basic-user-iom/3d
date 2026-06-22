# Streets GL Tile Loading Diagnosis

## Current Status
- ✅ URL hash format: **FIXED** - Now using correct format `lat,lon,pitch,yaw,distance`
- ✅ Streets GL UI: **WORKING** - Search bar, FPS counter, controls all visible
- ✅ Bridge communication: **WORKING** - Objects can be placed and synced
- ❌ Map tiles/buildings: **NOT LOADING** - Blue screen persists

## Root Cause Analysis

### Webpack Proxy Configuration
The webpack config (`streets-gl-alt/webpack.config.js`) has proxy setup:
- `/vector` → `https://tiles.streets.gl`
- `/vector.timestamp` → `https://tiles.streets.gl`

### Possible Issues

1. **Streets GL Server Not Running**
   - Check if `npm run dev` is running in `streets-gl-alt` folder
   - Server should be on `http://localhost:8081`

2. **Proxy Not Working**
   - Webpack proxy might need server restart
   - Check terminal for `[Webpack Proxy]` log messages
   - Verify `http-proxy-middleware` is installed

3. **Tile Server Issues**
   - `https://tiles.streets.gl` might be down or slow
   - Network/CORS issues blocking requests

4. **Camera Position**
   - Camera might be positioned where no tiles exist
   - Try different locations (NYC, London, etc.)

## Diagnostic Steps

### Step 1: Verify Streets GL Server is Running
```bash
cd streets-gl-alt
npm run dev
```
Look for:
- `[Webpack Proxy] Setting up proxy via setupMiddlewares...`
- `[Webpack Proxy] Proxy middleware setup complete!`
- Server running on `http://localhost:8081`

### Step 2: Test Proxy Directly
Open in browser: `http://localhost:8081/vector/13/2412/3079`
- Should return tile data (binary PBF)
- If 404/error, proxy is not working

### Step 3: Check Streets GL Console
1. Open `http://localhost:8081` directly (not in iframe)
2. Open browser DevTools → Console
3. Look for tile loading errors
4. Check Network tab for failed `/vector/` requests

### Step 4: Verify Tile Server
Try accessing: `https://tiles.streets.gl/vector/13/2412/3079`
- Should return tile data
- If fails, tile server might be down

## Solutions

### Solution 1: Restart Streets GL Server
```bash
cd streets-gl-alt
# Stop current server (Ctrl+C)
npm run dev
```

### Solution 2: Install Missing Dependencies
```bash
cd streets-gl-alt
npm install http-proxy-middleware
```

### Solution 3: Check Network Tab
1. Open browser DevTools → Network
2. Filter by `/vector`
3. Check if requests are being made
4. Check response status codes

### Solution 4: Test Different Location
Try navigating to a location with known buildings:
- New York: `40.7128,-73.9352,60.00,0.00,500.00`
- London: `51.5074,-0.1278,60.00,0.00,500.00`
- Tokyo: `35.6762,139.6503,60.00,0.00,500.00`

## Expected Behavior

When working correctly:
1. Streets GL loads and shows UI
2. Console shows: `[Webpack Proxy]` messages for tile requests
3. Network tab shows successful `/vector/{z}/{x}/{y}` requests (200 status)
4. Buildings and map features appear after a few seconds
5. Blue screen is replaced with 3D map

## Current Configuration

- **Iframe URL**: `http://localhost:8081/#40.7128,-73.9352,60.00,0.00,500.00`
- **Tile Endpoint**: `/vector/{z}/{x}/{y}` (proxied to `https://tiles.streets.gl`)
- **Proxy Target**: `https://tiles.streets.gl`




