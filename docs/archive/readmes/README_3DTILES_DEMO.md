# 3D Tiles Loader Demo

A standalone demo recreating the Three.js 3D Tiles loader example, using the `3d-tiles-renderer` library to load and render OGC 3D Tiles tilesets.

## 🚀 Quick Start

### Option 1: Run with Local Server

1. **Start a local server** (choose one):
   ```bash
   # Python
   python -m http.server 8080
   
   # Node.js
   npx http-server -p 8080
   
   # PHP  
   php -S localhost:8080
   ```

2. **Open in browser**:
   ```
   http://localhost:8080/3dtiles-demo.html
   ```

3. **Load a tileset**:
   - Enter a tileset URL in the input field (default example is pre-filled)
   - Click "Load Tileset" or press Enter
   - The tileset will load progressively based on camera position

### Option 2: Use with Vite Dev Server

If you're running the project's dev server (`npm run dev`), you can access the demo at:
```
http://localhost:3000/3dtiles-demo.html
```

## 📋 Features

- ✅ Load OGC 3D Tiles tilesets from any URL
- ✅ Progressive loading based on camera position
- ✅ DRACO compression support for geometry
- ✅ Real-time statistics (active tiles, visible tiles, downloaded tiles)
- ✅ Orbit controls for navigation
- ✅ Automatic camera framing when tileset loads
- ✅ Error handling and progress indicators

## 🎮 Controls

- **Mouse drag**: Orbit around the scene
- **Scroll wheel**: Zoom in/out
- **Right-click drag**: Pan (if enabled)

## 📦 Dependencies

The demo uses CDN imports, so no installation is required. It uses:
- Three.js 0.162.0
- 3D Tiles Renderer 0.3.24
- OrbitControls from Three.js examples

## 🔗 Sample Tilesets

Here are some publicly available 3D Tiles tilesets you can try:

1. **Cesium 3D Tiles Samples** (default):
   ```
   https://raw.githubusercontent.com/CesiumGS/3d-tiles-samples/main/1.1/TilesetWithRequestVolume/tileset.json
   ```

2. **More Cesium Samples**:
   - Browse: https://github.com/CesiumGS/3d-tiles-samples
   - Various examples in the `main/1.1/` directory

3. **Cesium Ion** (requires access token):
   - Sign up at https://cesium.com/ion/
   - Get your access token
   - Use Cesium Ion asset IDs

## 🛠️ How It Works

1. **TilesRenderer**: The core class from `3d-tiles-renderer` that handles:
   - Parsing tileset.json files
   - Managing tile hierarchy
   - Loading tiles based on camera frustum
   - Culling and LOD management

2. **Progressive Loading**: Tiles are loaded based on:
   - Distance from camera
   - Screen space error
   - Camera frustum visibility

3. **GLTF Loading**: Individual tiles (GLTF/GLB files) are loaded using Three.js GLTFLoader with DRACO support

## 📊 Statistics

The demo displays real-time statistics:
- **Active Tiles**: Currently loaded and visible tiles
- **Visible Tiles**: Tiles in the camera frustum
- **Downloaded Tiles**: Total tiles downloaded
- **Failed Tiles**: Tiles that failed to load

## 🔧 Customization

You can customize the demo by modifying `3dtiles-demo.html`:

### Change Default Tileset
Edit the `value` attribute of the `tilesUrl` input:
```html
<input type="text" id="tilesUrl" value="YOUR_TILESET_URL">
```

### Adjust Camera Settings
Modify camera initialization:
```javascript
camera.position.set(x, y, z);
controls.minDistance = 1;
controls.maxDistance = 10000;
```

### Add Custom Headers
For tilesets requiring authentication:
```javascript
tilesRenderer.fetchOptions = {
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN'
  }
};
```

## 🐛 Troubleshooting

**Tileset doesn't load?**
- Check browser console for CORS errors
- Verify the tileset URL is accessible
- Ensure the tileset.json file is valid

**CORS Errors?**
- Use a CORS proxy for development
- Host tilesets on a server with proper CORS headers
- Use Cesium Ion for hosted tilesets

**Performance Issues?**
- 3D Tiles are designed for large datasets
- Tiles load progressively - wait for initial load
- Check statistics to see loading progress

**Black Screen?**
- Verify WebGL support in your browser
- Check that tileset URL is correct
- Look for errors in browser console

## 📚 Resources

- [3D Tiles Specification](https://github.com/CesiumGS/3d-tiles)
- [3D Tiles Renderer JS](https://github.com/NASA-AMMOS/3DTilesRendererJS)
- [Three.js Examples](https://threejs.org/examples/#webgl_loader_3dtiles)
- [Cesium Ion](https://cesium.com/ion/)

## 💡 Integration with Main App

The project already has 3D Tiles support integrated via:
- `src/viewer/loaders/cesiumIonTilesLoader.ts` - Cesium Ion tileset loader
- Uses the same `3d-tiles-renderer` library

You can use the existing loader in your React components:
```typescript
import { loadCesiumIonTileset } from './viewer/loaders/cesiumIonTilesLoader'

const handle = loadCesiumIonTileset({
  viewer: viewerInstance,
  url: 'https://your-tileset-url/tileset.json',
  accessToken: 'your-token' // optional
})
```

## 📝 License

Same as the main project license.

## 🙏 Credits

- Based on [Three.js 3D Tiles Example](https://threejs.org/examples/#webgl_loader_3dtiles)
- Uses [3D Tiles Renderer JS](https://github.com/NASA-AMMOS/3DTilesRendererJS) by NASA-AMMOS
- Built with [Three.js](https://threejs.org/)













