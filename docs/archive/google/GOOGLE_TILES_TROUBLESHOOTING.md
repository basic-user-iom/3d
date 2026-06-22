# Google Photorealistic 3D Tiles - Troubleshooting Guide

## Current Status
❌ **NOT WORKING** - All tile requests returning 403 errors

## Problem Summary
- Root tileset (`root.json`) loads successfully
- Individual tile requests (`.glb` files) fail with 403 errors
- Tile URLs contain `session=` parameter but missing `key=` parameter
- The `3d-tiles-renderer` library bypasses all our request interception attempts

## Approaches Tried

### 1. ✅ Global Fetch Patching
- Patched `window.fetch` to inject `X-Goog-Api-Key` header and `key=` URL parameter
- **Result**: Library doesn't use patched fetch

### 2. ✅ XMLHttpRequest Patching
- Patched `XMLHttpRequest.prototype.open` and `XMLHttpRequest.prototype.send`
- **Result**: Library doesn't use XHR for tile loading

### 3. ✅ LoadingManager.fetch Patching
- Patched `tilesRenderer.manager.fetch` to inject headers
- **Result**: Not being called for tile requests

### 4. ✅ FileLoader.load Patching
- Patched `THREE.FileLoader.prototype.load` to add `key=` to URLs
- **Result**: Not being used by the library

### 5. ✅ resolveUrl Override
- Overrode `tilesRenderer.resolveUrl` to append `key=` and `session=` parameters
- **Result**: Not being called for tile URLs

### 6. ✅ Root.json Interception in fetchOptions
- Modified `fetchOptions.fetch` to intercept and modify `root.json` responses
- **Result**: Intercepts root.json but library still requests tiles without key

### 7. ✅ Pre-fetch and Modify Root.json
- Pre-fetched `root.json`, modified all tile URLs, created blob URL
- **Result**: Library doesn't process modified JSON correctly

### 8. ❌ Service Worker
- Created service worker file (`public/sw.js`) to intercept all network requests
- **Result**: Service Worker not registering (may need HTTPS or different configuration)

## Root Cause Analysis

The `3d-tiles-renderer` library appears to use an internal loading mechanism that:
1. Bypasses all standard fetch/XMLHttpRequest patching
2. Doesn't use the `fetchOptions.fetch` we provide
3. Directly constructs tile URLs from the `root.json` without applying our modifications
4. May use Web Workers or other isolated contexts for loading

## Most Likely Solution: Google Cloud Console Configuration

The 403 errors strongly suggest an **API key configuration issue**, not a code problem.

### Required Steps:

1. **Enable Map Tiles API**
   - Go to: https://console.cloud.google.com/apis/library/tile.googleapis.com
   - Click "Enable"

2. **Check API Key Restrictions**
   - Go to: https://console.cloud.google.com/apis/credentials
   - Find your API key (or the Cesium Ion key: `AIzaSyAuJtuLbQ1mMTDg9aEAbYP0HQJLYTbjybg`)
   - Click on the key to edit

3. **HTTP Referrer Restrictions**
   - Under "Application restrictions", select "HTTP referrers (web sites)"
   - Add: `http://localhost:3000/*`
   - Or temporarily remove restrictions for testing

4. **API Restrictions**
   - Under "API restrictions", ensure "Map Tiles API" is enabled
   - Or select "Don't restrict key" for testing

5. **Verify Key Permissions**
   - The Cesium Ion API key may not have access to Photorealistic 3D Tiles
   - Consider using your own API key: `AIzaSyBc3NzjCoyxp5xGA2x3MBEirLiJlEHCxE8`
   - Ensure your key has:
     - Map Tiles API enabled
     - No HTTP referrer restrictions (or includes localhost)
     - Proper billing/quota enabled

## Alternative Solutions

### Option 1: Use Cesium.js Instead
Cesium.js has native support for Google Photorealistic 3D Tiles and handles authentication automatically.

### Option 2: Proxy Server
Create a backend proxy that:
- Intercepts tile requests
- Adds the API key to URLs
- Forwards requests to Google
- Returns responses to the client

### Option 3: Fork/Modify 3d-tiles-renderer
Modify the library source code to:
- Accept API key as a parameter
- Inject key into all tile URLs during construction
- This would require maintaining a custom fork

## Testing Checklist

- [ ] Map Tiles API is enabled in Google Cloud Console
- [ ] API key has no HTTP referrer restrictions (or includes localhost)
- [ ] API key has Map Tiles API enabled in restrictions
- [ ] Billing is enabled for the Google Cloud project
- [ ] API key has quota available
- [ ] Using a key that has access to Photorealistic 3D Tiles

## Files Modified

- `3dtiles-demo.html` - Main demo file with all patching attempts
- `public/sw.js` - Service Worker file (not currently working)
- `GOOGLE_TILES_TROUBLESHOOTING.md` - This file

## Next Steps

1. **Check Google Cloud Console** (5 minutes) - Most likely fix
2. **Try your own API key** instead of Cesium Ion's key
3. **Consider switching to Cesium.js** if console configuration doesn't work
4. **Implement proxy server** as a last resort

## References

- Google Maps Platform Documentation: https://developers.google.com/maps/documentation/tile
- Map Tiles API Policy: https://developers.google.com/maps/documentation/tile/policies
- 3D Tiles Renderer: https://github.com/NASA-AMMOS/3DTilesRendererJS













