# FastHDR Implementation Status

## Current Implementation Overview

### ✅ What's Working

1. **FastHDR Loading & Display** (`src/viewer/effects/HDRSystem.ts`)
   - ✅ KTX2Loader integration for FastHDR files
   - ✅ Detection of PMREM vs equirectangular KTX2 files
   - ✅ Proper mapping setup (`CubeUVReflectionMapping` for PMREM)
   - ✅ Support for both environment maps and backgrounds
   - ✅ Format validation (UASTC, ETC1S support; Zstandard rejection)
   - ✅ Color space handling (LinearSRGBColorSpace for HDR)

2. **HDR to KTX2 Converter** (`src/utils/hdrToFastHDR.ts`)
   - ✅ Converts HDR/EXR to KTX2 format
   - ✅ UASTC compression support
   - ✅ Quality and compression level controls
   - ✅ Progress callbacks
   - ✅ File size optimization

3. **UI Integration**
   - ✅ FastHDRConverter component (`src/components/FastHDRConverter.tsx`)
   - ✅ Integration in LightingPanel
   - ✅ Panorama360App conversion support

### ⚠️ What's Missing / Incomplete

1. **PMREM Generation in Converter** (`src/utils/hdrToFastHDR.ts`)
   - ❌ **CRITICAL**: PMREM generation not implemented (marked as TODO)
   - Current converter creates equirectangular KTX2, not true FastHDR
   - According to Needle's documentation, FastHDR should be pre-computed PMREM in CubeUV format
   - Missing workflow:
     ```
     1. Load HDR/EXR equirectangular file ✅
     2. Generate PMREM using PMREMGenerator ⚠️ (available but not used in converter)
     3. Export PMREM to EXR using EXRExporter ❌ (not implemented)
     4. Convert EXR to KTX2 using Basis Universal ❌ (not implemented)
     ```

2. **EXR Exporter**
   - ❌ No EXRExporter implementation found
   - Referenced in TODOs but not implemented
   - Three.js examples have EXRExporter: https://threejs.org/examples/?q=exr%20exporter#misc_exporter_exr

## Resources Analysis

### StackBlitz Example: https://stackblitz.com/edit/needle-fast-hdri-r3f

**What it demonstrates:**
- How to load FastHDR files in React Three Fiber
- Proper usage of KTX2Loader with FastHDR
- Setting correct texture mapping (`CubeUVReflectionMapping`)
- Background blurriness for FastHDR backgrounds

**Key insights from Needle's approach:**
```javascript
// From Needle's FastHDR example:
texture.mapping = THREE.CubeUVReflectionMapping  // CRITICAL for FastHDR
scene.environment = texture  // Use PMREM directly
scene.background = texture   // Can also use for background
scene.backgroundBlurriness = 0.5  // Optional blur
```

**How it helps:**
- ✅ Confirms our loading approach is correct
- ✅ Validates our mapping setup
- ⚠️ Doesn't show how to CREATE FastHDR files (only how to use them)

### TacentView: https://github.com/bluescan/tacentview

**What it is:**
- Image/texture viewer supporting HDR, EXR, KTX, KTX2 formats
- Useful for viewing and validating HDR files
- Command-line tools for batch processing

**How it helps:**
- ✅ Can view HDR/EXR files before conversion
- ✅ Can inspect KTX2 files after conversion
- ✅ Useful for debugging format issues
- ❌ Doesn't help with PMREM generation or FastHDR creation

## Implementation Gaps

### Gap 1: PMREM to EXR Export

**Current state:**
- PMREMGenerator is available and used in `HDRSystem.ts`
- But converter doesn't use it to create FastHDR files

**What's needed:**
```typescript
// In hdrToFastHDR.ts, when generatePMREM is true:
1. Use PMREMGenerator.fromEquirectangular() to create PMREM texture
2. Export PMREM texture to EXR format
3. Convert EXR to KTX2 with UASTC compression
```

**Missing piece:**
- EXRExporter from three-stdlib or three/examples/jsm/exporters/EXRExporter

### Gap 2: PMREM Texture Export

**Current state:**
- We can generate PMREM for runtime use
- But can't export it to file format

**What's needed:**
- Extract PMREM cube map data
- Convert to EXR format
- Then encode to KTX2

## Recommendations

### Short-term (Use Existing Tools)

1. **For creating FastHDR files:**
   - Use external tools like `toktx` (from Khronos Group)
   - Command: `toktx --uastc --uastc_rdo_q 0.5 output.ktx2 input.hdr`
   - Or use Needle Cloud's FastHDR files directly

2. **For viewing/validating:**
   - Use TacentView to inspect HDR/EXR/KTX2 files
   - Verify format compatibility before loading

### Long-term (Complete Implementation)

1. **Add EXRExporter support:**
   ```typescript
   import { EXRExporter } from 'three/examples/jsm/exporters/EXRExporter'
   ```

2. **Complete PMREM workflow in converter:**
   ```typescript
   if (shouldGeneratePMREM && renderer) {
     // 1. Generate PMREM
     const pmremGenerator = new THREE.PMREMGenerator(renderer)
     const pmremTexture = pmremGenerator.fromEquirectangular(hdrTexture).texture
     
     // 2. Export PMREM to EXR
     const exrExporter = new EXRExporter()
     const exrBlob = exrExporter.parse(pmremTexture)
     
     // 3. Convert EXR to KTX2
     // (This part might need custom implementation or use toktx via WASM)
   }
   ```

3. **Alternative: Direct PMREM to KTX2**
   - Extract PMREM cube map faces
   - Convert each face to KTX2
   - Or use a different approach to encode PMREM directly

## Current Workflow

### What Works Now:
1. ✅ Load FastHDR files (from Needle Cloud or external tools)
2. ✅ Display FastHDR as environment map
3. ✅ Use FastHDR as background
4. ✅ Convert HDR/EXR to equirectangular KTX2 (not true FastHDR)

### What Doesn't Work:
1. ❌ Create true FastHDR files (PMREM KTX2) from HDR/EXR
2. ❌ Export PMREM textures to file format

## Next Steps

1. **Research EXRExporter availability:**
   - Check if three-stdlib includes it
   - Or import from three/examples/jsm/exporters/EXRExporter

2. **Implement PMREM export:**
   - Add PMREM generation to converter
   - Add EXR export capability
   - Complete KTX2 encoding pipeline

3. **Test with real FastHDR files:**
   - Download samples from Needle Cloud
   - Verify our loader works correctly
   - Compare with StackBlitz example

## Files to Review

- `src/viewer/effects/HDRSystem.ts` - FastHDR loading (✅ working)
- `src/utils/hdrToFastHDR.ts` - Converter (⚠️ incomplete PMREM support)
- `src/components/FastHDRConverter.tsx` - UI component
- `src/viewer/effects/EnvironmentManager.ts` - PMREMGenerator management

## References

- Needle FastHDR docs: https://cloud.needle.tools/articles/fasthdr-environment-maps
- StackBlitz example: https://stackblitz.com/edit/needle-fast-hdri-r3f
- Three.js EXR exporter: https://threejs.org/examples/?q=exr%20exporter#misc_exporter_exr
- TacentView: https://github.com/bluescan/tacentview








































