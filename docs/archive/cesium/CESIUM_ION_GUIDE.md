# Cesium Ion Tilesets - Complete Guide

## What You Need

To load Cesium Ion tilesets, you need:

### 1. **Cesium Ion Access Token** (Required)

A Cesium Ion access token is required to authenticate with Cesium's API and access tilesets.

#### How to Get a Cesium Ion Access Token:

1. **Sign up for Cesium Ion** (Free tier available):
   - Go to https://cesium.com/ion/
   - Click "Sign Up" or "Get Started"
   - Create a free account

2. **Get Your Access Token**:
   - After signing up, go to your account dashboard
   - Navigate to "Access Tokens" section
   - Click "Create Token" or copy your default token
   - The token looks like: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

3. **Token Types**:
   - **Default Token**: Works for most public assets
   - **Custom Token**: Can be scoped to specific assets/permissions

### 2. **Asset ID or URL** (Required)

You need either:
- **Cesium Ion Asset ID**: A numeric ID (e.g., `2275207` for OSM Buildings)
- **Direct Tileset URL**: A full URL to a tileset.json file

#### Finding Asset IDs:

1. **Browse Cesium Ion Assets**:
   - Go to https://cesium.com/ion/assetdepot
   - Browse available 3D Tiles assets
   - Click on an asset to see its ID in the URL or asset details

2. **Popular Asset IDs**:
   - **OSM Buildings**: `2275207`
   - **Cesium World Terrain**: `1`
   - **Cesium OSM Buildings**: `96188`
   - **Google Photorealistic 3D Tiles**: Requires special setup (see below)

### 3. **Google API Key** (Optional - Only for Google Photorealistic 3D Tiles)

If you want to load Google Photorealistic 3D Tiles, you also need:

1. **Google Cloud API Key**:
   - Go to https://console.cloud.google.com/
   - Create a project or select existing one
   - Enable "Photorealistic 3D Tiles API"
   - Create an API key
   - Restrict the key to "Photorealistic 3D Tiles API" for security

## How to Use in the Demo

### Option 1: Using the Standalone Demo (`3dtiles-demo.html`)

The standalone demo currently doesn't have built-in Cesium Ion support. You can:

1. **Get the tileset URL manually**:
   - Use the Cesium Ion API to resolve the asset:
     ```
     https://api.cesium.com/v1/assets/{ASSET_ID}/endpoint?access_token={YOUR_TOKEN}
     ```
   - Copy the `url` from the response
   - Paste it into the demo's URL input field

2. **Or modify the demo** to add Cesium Ion support (see integration section below)

### Option 2: Using the Main Application

The main application already has full Cesium Ion support:

1. **Open the Maps Panel**:
   - Click the "🗺️ Maps" button in the toolbar
   - Or use the sidebar to open Maps Panel

2. **Enter Your Cesium Ion Token**:
   - In the Maps Panel, find the "Cesium Ion Access Token" field
   - Paste your access token

3. **Load a Cesium Ion Asset**:
   - Enter the Asset ID (e.g., `2275207` for OSM Buildings)
   - Click "Load Cesium Ion Asset"
   - The tileset will load and the camera will automatically frame it

4. **Load Google Photorealistic 3D Tiles**:
   - Enter your Cesium Ion token
   - Enter your Google API key
   - Click "Load Google Photorealistic 3D Tiles"

## Code Integration

### Using the Existing Loader

The project already has a Cesium Ion loader at `src/viewer/loaders/cesiumIonTilesLoader.ts`:

```typescript
import { loadCesiumIonTileset } from './viewer/loaders/cesiumIonTilesLoader'
import { resolveCesiumIonAsset } from './utils/cesiumIon'

// Resolve asset ID to URL
const resolved = await resolveCesiumIonAsset(assetId, accessToken)

// Load the tileset
const handle = loadCesiumIonTileset({
  viewer: viewerInstance,
  url: resolved.url,
  accessToken: accessToken,
  name: 'My Tileset',
  googleApiKey: googleApiKey // optional
})

// Frame the camera
handle.focusCamera()
```

### Adding Cesium Ion Support to the Standalone Demo

To add Cesium Ion support to `3dtiles-demo.html`, you would need to:

1. Add an input field for the access token
2. Add an input field for the asset ID
3. Use the Cesium Ion API to resolve the asset:
   ```javascript
   const endpointUrl = `https://api.cesium.com/v1/assets/${assetId}/endpoint?access_token=${token}`
   const response = await fetch(endpointUrl)
   const data = await response.json()
   const tilesetUrl = data.url || data.options?.url
   ```
4. Load the tileset using the resolved URL

## Example: Loading OSM Buildings

Here's a complete example for loading OSM Buildings:

```javascript
// 1. Get your Cesium Ion token from https://cesium.com/ion/
const accessToken = 'YOUR_ACCESS_TOKEN_HERE'

// 2. OSM Buildings asset ID
const assetId = '2275207'

// 3. Resolve the asset
const endpointUrl = `https://api.cesium.com/v1/assets/${assetId}/endpoint?access_token=${accessToken}`
const response = await fetch(endpointUrl)
const data = await response.json()
const tilesetUrl = data.url

// 4. Load in the demo
// Paste tilesetUrl into the demo's URL input field and click "Load Tileset"
```

## Free vs Paid Tiers

### Free Tier:
- ✅ Access to many public assets (OSM Buildings, World Terrain, etc.)
- ✅ Limited quota (usually sufficient for development/testing)
- ✅ Personal use

### Paid Tiers:
- ✅ Higher quotas
- ✅ Commercial use
- ✅ Priority support
- ✅ Custom asset hosting

## Troubleshooting

### "Access token is required" error:
- Make sure you've entered your Cesium Ion access token
- Verify the token is valid at https://cesium.com/ion/

### "Failed to load tileset" error:
- Check that the asset ID is correct
- Verify your token has access to that asset
- Check browser console for detailed error messages

### CORS errors:
- Cesium Ion tilesets should work without CORS issues
- If you see CORS errors, check that you're using the correct URL format

### Asset not found (404):
- Verify the asset ID exists
- Check that your token has permission to access the asset
- Some assets may require a paid subscription

## Security Best Practices

1. **Never commit tokens to version control**
   - Use environment variables
   - Store tokens in localStorage (as the app does)
   - Use token restrictions when possible

2. **Restrict API keys**:
   - For Google API keys, restrict to specific APIs
   - Use IP restrictions if possible
   - Rotate keys regularly

3. **Token scope**:
   - Use the minimum permissions needed
   - Create separate tokens for different purposes

## Resources

- **Cesium Ion**: https://cesium.com/ion/
- **Asset Depot**: https://cesium.com/ion/assetdepot
- **Documentation**: https://cesium.com/docs/
- **API Reference**: https://cesium.com/docs/rest-api/
- **Google 3D Tiles**: https://developers.google.com/maps/documentation/tile/3d-tiles

## Quick Start Checklist

- [ ] Sign up for Cesium Ion account
- [ ] Get your access token
- [ ] (Optional) Get Google API key for Photorealistic tiles
- [ ] Open Maps Panel in the main app
- [ ] Enter your Cesium Ion token
- [ ] Enter an asset ID (e.g., `2275207`)
- [ ] Click "Load Cesium Ion Asset"
- [ ] Enjoy your 3D Tiles!













