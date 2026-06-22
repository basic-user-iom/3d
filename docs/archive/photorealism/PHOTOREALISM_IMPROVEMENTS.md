# Photorealism Improvements Based on Verge3D Demo

## Reference
- **Demo**: https://cdn.soft8soft.com/demo/blender/scooter/index.html
- **Framework**: Verge3D (WebGL-based)
- **Key Techniques**: KTX2 textures, HDR lighting, PBR materials, baked AO

## Recommended Improvements

### 1. KTX2/Basis Universal Texture Support ✅ HIGH PRIORITY
**Current State**: Using standard JPG/PNG textures
**Improvement**: Add support for KTX2/Basis Universal compressed textures

**Benefits**:
- 10-20x smaller file sizes
- Better quality at same file size
- GPU-optimized format
- Faster loading times

**Implementation**:
```typescript
// Add KTX2 loader
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import { BasisManager } from 'three/examples/jsm/utils/BasisManager.js'

// Initialize Basis transcoder
const basisManager = new BasisManager()
const ktx2Loader = new KTX2Loader(basisManager)
ktx2Loader.setTranscoderPath('/path/to/basis/')
```

**Files to Modify**:
- `src/viewer/useViewer.ts` - Add KTX2 loader support
- `src/components/MaterialPanel.tsx` - Support KTX2 texture uploads

### 2. Combined Texture Maps (Packed Textures) ✅ MEDIUM PRIORITY
**Current State**: Separate textures for each map type
**Improvement**: Support combined texture maps (BaseRoughMetallic, OcclusionRoughnessMetallic)

**Benefits**:
- Fewer texture lookups (better performance)
- Smaller total file size
- Industry standard for PBR workflows

**Implementation**:
```typescript
// Support combined texture maps
interface CombinedTextureMap {
  baseColor?: THREE.Texture
  roughness?: THREE.Texture
  metallic?: THREE.Texture
  occlusion?: THREE.Texture
  // OR combined:
  baseRoughMetallic?: THREE.Texture // RGB = Base, Roughness, Metallic
  occlusionRoughnessMetallic?: THREE.Texture // RGB = Occlusion, Roughness, Metallic
}
```

**Files to Modify**:
- `src/components/MaterialPanel.tsx` - Add combined texture map support
- `src/viewer/useViewer.ts` - Parse combined textures when loading models

### 3. Scene-Level Baked Ambient Occlusion ✅ LOW PRIORITY
**Current State**: Real-time SAO (Screen Space Ambient Occlusion)
**Improvement**: Support baked AO textures as an option

**Benefits**:
- Higher quality AO (no artifacts)
- Better performance (no real-time computation)
- Can be combined with real-time AO for best results

**Implementation**:
```typescript
// Add baked AO option
interface AOSettings {
  useBakedAO: boolean
  bakedAOTexture?: THREE.Texture
  realTimeAO: boolean // Can use both
  blendFactor: number // 0-1, how much baked vs real-time
}
```

**Files to Modify**:
- `src/viewer/postprocessing/PostProcessingSystem.ts` - Add baked AO support
- `src/components/RenderingQualityPanel.tsx` - Add baked AO controls

### 4. Enhanced Material Quality Settings ✅ MEDIUM PRIORITY
**Current State**: Basic PBR material support
**Improvement**: Add quality presets and advanced material options

**Benefits**:
- Better control over material appearance
- Presets for different use cases (photorealistic, stylized, etc.)

**Implementation**:
```typescript
interface MaterialQualityPreset {
  name: string
  anisotropy: number
  minFilter: THREE.TextureFilter
  magFilter: THREE.TextureFilter
  mipmaps: boolean
  encoding: THREE.TextureEncoding
  colorSpace: THREE.ColorSpace
}

const PRESETS: MaterialQualityPreset[] = [
  {
    name: 'Photorealistic',
    anisotropy: 16,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    mipmaps: true,
    encoding: THREE.sRGBEncoding,
    colorSpace: THREE.SRGBColorSpace
  },
  // ... more presets
]
```

**Files to Modify**:
- `src/viewer/useViewer.ts` - Add quality presets
- `src/components/MaterialPanel.tsx` - Add preset selector

### 5. Improved Tone Mapping ✅ HIGH PRIORITY
**Current State**: Basic tone mapping in OutputPass
**Improvement**: Add multiple tone mapping operators (ACES, Reinhard, Uncharted2, etc.)

**Benefits**:
- More photorealistic color grading
- Better HDR handling
- Industry-standard look

**Implementation**:
```typescript
// Add tone mapping options
import { ToneMappingShader } from './ToneMappingShader'

enum ToneMappingType {
  LINEAR = 'linear',
  REINHARD = 'reinhard',
  CINEON = 'cineon',
  ACES_FILMIC = 'aces-filmic',
  UNCHARTED2 = 'uncharted2'
}
```

**Files to Modify**:
- `src/viewer/postprocessing/PostProcessingSystem.ts` - Add tone mapping options
- `src/components/RenderingQualityPanel.tsx` - Add tone mapping controls

### 6. Enhanced Bloom Settings ✅ MEDIUM PRIORITY
**Current State**: Basic bloom with strength/radius/threshold
**Improvement**: Add advanced bloom controls (luminance threshold, kernel size, etc.)

**Benefits**:
- More control over bloom appearance
- Better HDR bloom effects
- Photorealistic glow

**Files to Modify**:
- `src/viewer/postprocessing/PostProcessingSystem.ts` - Enhance bloom parameters
- `src/components/RenderingQualityPanel.tsx` - Add advanced bloom controls

### 7. Texture Streaming/LOD System ✅ LOW PRIORITY
**Current State**: Load all textures at once
**Improvement**: Implement texture LOD system for large scenes

**Benefits**:
- Faster initial load
- Better performance for large scenes
- Progressive quality improvement

## Implementation Priority

1. **KTX2 Support** - High impact, medium effort
2. **Tone Mapping Options** - High impact, low effort
3. **Combined Texture Maps** - Medium impact, medium effort
4. **Enhanced Bloom** - Medium impact, low effort
5. **Material Quality Presets** - Medium impact, low effort
6. **Baked AO** - Low impact, high effort
7. **Texture Streaming** - Low impact, high effort

## Notes

- The Verge3D demo uses compressed HDR files (`.hdr.xz`) - we already support HDR but could add compression
- All textures are KTX2 format for optimal performance
- Scene uses baked lighting combined with real-time lighting
- Materials use industry-standard PBR workflow with combined texture maps













