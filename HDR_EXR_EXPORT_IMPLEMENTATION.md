# HDR/EXR Export Implementation

## Summary
Implemented proper HDR (RGBE) and EXR export formats for environment maps, replacing the previous PNG export which was lossy and didn't preserve HDR data.

## Implementation Details

### Features
1. **HDR (RGBE) Format Export**
   - Proper RGBE encoding (4 bytes per pixel: R, G, B, E)
   - Shared exponent encoding for efficient HDR storage
   - Radiance RGBE file format header
   - Preserves full dynamic range of HDR data

2. **EXR Format Export**
   - Uses Three.js EXRExporter when available
   - Falls back to HDR format if EXRExporter not available
   - Preserves Float32 data for maximum precision

3. **Data Extraction**
   - **Primary method**: Extracts Float32Array directly from DataTexture if available
   - **Secondary method**: Renders texture to FloatType render target and reads pixels (preserves HDR values)
   - **Fallback method**: Canvas extraction (lossy, but better than nothing)

### Code Changes

**File:** `src/utils/webExport.ts`

**Function:** `exportHDR(scene, format, renderer)`

**Parameters:**
- `scene`: Three.js scene with environment map
- `format`: `'hdr'` (default) or `'exr'`
- `renderer`: Optional WebGL renderer for better quality extraction

**Key Implementation Points:**

1. **Float32Array Extraction**
   ```typescript
   // If texture is a DataTexture with Float32Array, use it directly
   if (envMap instanceof THREE.DataTexture && envMap.image?.data instanceof Float32Array) {
     floatData = envMap.image.data as Float32Array
   }
   ```

2. **Renderer-Based Extraction**
   ```typescript
   // Render texture to FloatType render target to preserve HDR values
   const renderTarget = new THREE.WebGLRenderTarget(width, height, {
     type: THREE.FloatType,
     format: THREE.RGBAFormat,
     colorSpace: THREE.LinearSRGBColorSpace
   })
   // Disable tone mapping to preserve HDR values
   renderer.toneMapping = THREE.NoToneMapping
   ```

3. **RGBE Encoding**
   ```typescript
   // Find maximum component and calculate shared exponent
   const max = Math.max(r, g, b, 1e-32)
   let exp = Math.floor(Math.log2(max)) + 128
   // Normalize and encode RGB with shared exponent
   ```

4. **HDR File Format**
   - Radiance RGBE format header
   - Proper file structure with dimensions
   - Binary RGBE data

### Usage

**Basic usage (HDR format):**
```typescript
const hdrBlob = await exportHDR(scene)
// Returns Blob with .hdr file
```

**With format selection:**
```typescript
const hdrBlob = await exportHDR(scene, 'hdr')  // HDR format
const exrBlob = await exportHDR(scene, 'exr')   // EXR format (if available)
```

**With renderer for better quality:**
```typescript
const hdrBlob = await exportHDR(scene, 'hdr', renderer)
```

### Integration

The function is automatically called in `exportForWeb()` when exporting HDR environment maps:
```typescript
// In exportForWeb()
if (!hdrBlob) {
  const viewerRenderer = (viewer as any)?.renderer as THREE.WebGLRenderer | undefined
  hdrBlob = await exportHDR(scene, 'hdr', viewerRenderer)
}
```

### Benefits

1. **Preserves HDR Data**: No longer loses dynamic range by converting to PNG
2. **Industry Standard Formats**: HDR (RGBE) and EXR are standard formats for HDR images
3. **Better Quality**: Float32Array extraction preserves full precision
4. **Compatibility**: HDR format is widely supported, EXR is supported by many tools

### Testing

**Test Cases:**
1. ✅ Export HDR from DataTexture with Float32Array
2. ✅ Export HDR using renderer extraction
3. ✅ Export HDR with canvas fallback
4. ✅ Export EXR format (if EXRExporter available)
5. ✅ Fallback to HDR if EXR not available

**To Test:**
1. Load an HDR environment map
2. Use web export feature
3. Check that exported file is .hdr format (not .png)
4. Verify file can be loaded in HDR viewers

### Future Improvements

1. **PMREM Export**: Export pre-filtered environment maps (PMREM) to HDR/EXR
2. **Cube Map Export**: Export cube map faces as separate HDR/EXR files
3. **Compression Options**: Add compression options for EXR format
4. **Progress Callbacks**: Add progress feedback for large exports

### References

- Radiance RGBE Format: https://en.wikipedia.org/wiki/RGBE_image_format
- Three.js EXRExporter: https://threejs.org/examples/?q=exr#misc_exporter_exr
- OpenEXR Format: https://www.openexr.com/














