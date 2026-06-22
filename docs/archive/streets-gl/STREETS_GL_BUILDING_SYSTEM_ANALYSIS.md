# Streets GL Building System Analysis

## Key Findings

### 1. Tile Positioning System

**Coordinate System**: Web Mercator (EPSG:3857)
- Tiles use `MathUtils.tile2meters(x, y + 1)` to convert tile coordinates to meters
- Tile position: `(positionInMeters.x, 0, positionInMeters.y)` - **Note: Y and Z are swapped!**
- Tile size: `Config.TileSize = 611.4962158203125` meters (at zoom 16)

**From Tile.ts**:
```typescript
private updatePosition(): void {
  const positionInMeters = MathUtils.tile2meters(this.x, this.y + 1);
  this.position.set(positionInMeters.x, 0, positionInMeters.y); // Y and Z swapped!
  this.updateMatrix();
}
```

**Coordinate Conversion**:
```typescript
// MathUtils.tile2meters(x, y, zoom = 16)
// Returns Vec2 with x (meters) and y (meters)
// Streets GL uses: position.x = meters.x, position.z = meters.y, position.y = height
```

---

### 2. Building Structure

**Buildings are children of Tiles**:
- Buildings are `TileExtrudedMesh` objects
- Buildings are added to tiles: `tile.add(this.extrudedMesh)`
- Buildings are in **local tile space** (relative to tile position)
- Buildings are transformed to world space via `tile.matrixWorld`

**Building Geometry Format**:
- `positionBuffer`: Float32Array [x, y, z, x, y, z, ...] - **in local tile space**
- `normalBuffer`: Float32Array [nx, ny, nz, ...]
- `colorBuffer`: Uint8Array [r, g, b, ...]
- `uvBuffer`: Float32Array [u, v, u, v, ...]
- `textureIdBuffer`: Uint8Array [textureId, ...]
- `localIdBuffer`: Uint32Array [localId, ...]
- `displayBuffer`: Uint8Array [display, ...]

**Key Point**: Building positions are in **local tile space**, not world space!

---

### 3. Building Materials

**ExtrudedMeshMaterialContainer**:
- Uses `Shaders.extruded.vertex` and `Shaders.extruded.fragment`
- Uniforms:
  - `modelViewMatrix` (PerMesh) - from `tile.matrixWorld`
  - `modelViewMatrixPrev` (PerMesh)
  - `tileId` (PerMesh) - `tile.localId`
  - `projectionMatrix` (PerMaterial)
  - `windowLightThreshold` (PerMaterial)
  - `tMap` (Texture2DArray) - building textures
  - `tNoise` (Texture2D) - noise texture

**Rendering**:
```typescript
const mvMatrix = Mat4.multiply(camera.matrixWorldInverse, tile.matrixWorld);
this.extrudedMeshMaterial.getUniform('modelViewMatrix', 'PerMesh').value = new Float32Array(mvMatrix.values);
tile.extrudedMesh.draw(); // Buildings drawn as children of tiles
```

---

### 4. The Problem

**External objects are positioned incorrectly**:
- External objects are positioned in **world space** directly
- Buildings are positioned in **local tile space** and transformed by `tile.matrixWorld`
- External objects need to be positioned in the same coordinate system as buildings

**Solution**: 
1. Convert lat/lon to Web Mercator meters (like tiles do)
2. Position objects in world space using Web Mercator coordinates
3. OR: Position objects relative to nearest tile (like buildings)

---

## Coordinate System Details

### Web Mercator to Meters
- X (meters) = `(2 * 20037508.34 * x) / (1 << zoom) - 20037508.34`
- Z (meters) = `20037508.34 - (2 * 20037508.34 * y) / (1 << zoom)`
- At zoom 16: Tile size = 611.4962158203125 meters

### Lat/Lon to Web Mercator
- X = lon * 20037508.34 / 180
- Y = ln(tan((90 + lat) * π / 360)) / (π / 180) * 20037508.34 / 180

---

## Next Steps

1. Create function to convert lat/lon to Web Mercator meters
2. Position external objects using Web Mercator coordinates
3. Ensure objects use same coordinate system as tiles/buildings


