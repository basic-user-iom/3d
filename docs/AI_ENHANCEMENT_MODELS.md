# AI Image Enhancement Models for Architectural Visualization

This document outlines the best AI models and approaches for image enhancement in architectural visualization, similar to Twinmotion's AI Enhancement feature.

## Recommended Models

### 1. **Real-ESRGAN** (Primary Recommendation)
- **Best for**: Image upscaling, detail refinement, texture enhancement
- **Architecture**: Generative Adversarial Network (GAN)
- **Strengths**:
  - Excellent for upscaling (2x, 4x) with minimal artifacts
  - Preserves architectural details and edges
  - Works well with low-resolution renders
  - Open-source and well-documented
- **Implementation Options**:
  - **TensorFlow.js**: Convert model to run in browser (best for client-side processing)
  - **WebAssembly**: For better performance (requires model conversion)
  - **API Service**: Use hosted Real-ESRGAN API (simpler but requires internet)
  - **Node.js Backend**: Server-side processing (best quality, but requires backend)

### 2. **ESRGAN** (Alternative)
- **Best for**: General purpose image super-resolution
- **Similar to Real-ESRGAN** but slightly older
- Good fallback option

### 3. **SRCNN (Super-Resolution CNN)**
- **Best for**: Fast upscaling with minimal computational requirements
- **Good for**: Browser-based real-time enhancement
- **Trade-off**: Lower quality than Real-ESRGAN but faster

### 4. **RIFE (Real-Time Intermediate Flow Estimation)**
- **Best for**: Video frame interpolation (if adding video enhancement later)
- Not directly relevant for single-image enhancement but useful for animations

## Browser-Based Implementation Options

### Option 1: TensorFlow.js (Recommended for Browser)
```javascript
// Load Real-ESRGAN model converted to TensorFlow.js format
import * as tf from '@tensorflow/tfjs'

async function enhanceWithRealESRGAN(imageDataUrl: string) {
  const model = await tf.loadLayersModel('/models/real-esrgan/model.json')
  // Preprocess image
  const tensor = tf.browser.fromPixels(imageElement)
  // Run inference
  const enhanced = model.predict(tensor)
  // Convert back to image
  return tf.browser.toPixels(enhanced)
}
```

**Pros**:
- Runs entirely in browser (no server needed)
- No API costs
- Privacy-friendly (images don't leave client)
- Offline capability

**Cons**:
- Large model file size (~50-200MB)
- Slower than GPU-accelerated backend
- Requires model conversion to TensorFlow.js format

### Option 2: WebAssembly (Best Performance)
- Convert Real-ESRGAN to WebAssembly using ONNX Runtime Web
- Faster than TensorFlow.js
- Still runs in browser
- Requires more setup

### Option 3: API-Based (Simplest Integration)
- Use Real-ESRGAN API service (e.g., Replicate, Hugging Face Spaces)
- Simple HTTP requests
- No model file downloads
- Requires internet connection
- May have usage costs
- Privacy concerns (images sent to server)

**Example API Integration**:
```javascript
async function enhanceViaAPI(imageDataUrl: string) {
  const response = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      version: 'real-esrgan-model-id',
      input: { image: imageDataUrl }
    })
  })
  return response.json()
}
```

## Enhancement Modes Implementation

### 1. **AI Upscale** (2x, 4x)
- Use Real-ESRGAN with 2x or 4x upscaling
- Best for low-resolution renders
- Preserves architectural details

### 2. **Detail Refinement**
- Use Real-ESRGAN with detail enhancement settings
- Applies sharpening and detail restoration
- Enhances fine textures and materials

### 3. **Texture Enhancement**
- Post-process with texture sharpening filters
- Combined with Real-ESRGAN upscaling
- Improves material clarity

### 4. **Edge Sharpening**
- Use edge-aware sharpening algorithms
- Combined with Real-ESRGAN output
- Ensures clean architectural lines

### 5. **Full Enhancement** (All Combined)
- Multi-stage processing:
  1. Real-ESRGAN upscale (2x)
  2. Detail refinement pass
  3. Texture enhancement
  4. Edge sharpening
- Best quality but slower

## Model Conversion & Setup

### Converting Real-ESRGAN to TensorFlow.js

1. **Convert PyTorch to ONNX**:
```bash
# Using Real-ESRGAN repository
python scripts/export_onnx.py --model_path checkpoints/RealESRGAN_x4plus.pth
```

2. **Convert ONNX to TensorFlow.js**:
```bash
# Using tfjs-converter
tensorflowjs_converter --input_format=onnx model.onnx model_tfjs
```

3. **Optimize for Browser**:
- Quantize model (reduce precision for smaller file size)
- Use weight sharing
- Split into smaller chunks for progressive loading

### Performance Optimization

1. **Progressive Loading**: Load model in background, show placeholder
2. **Web Worker**: Run inference in separate thread to avoid blocking UI
3. **Image Tiling**: Process large images in tiles to avoid memory issues
4. **Caching**: Cache enhanced images to avoid re-processing

## Recommended Implementation Path

### Phase 1: API-Based (Quick Start)
- Integrate with Replicate/Hugging Face Real-ESRGAN API
- Get working prototype quickly
- Test user experience

### Phase 2: Browser-Based (Production)
- Convert Real-ESRGAN to TensorFlow.js
- Implement progressive loading
- Add Web Worker support
- Optimize for performance

### Phase 3: Advanced Features
- Add multiple enhancement modes
- Implement before/after comparison
- Add batch processing
- Support video enhancement

## Resources

- **Real-ESRGAN GitHub**: https://github.com/xinntao/Real-ESRGAN
- **TensorFlow.js**: https://www.tensorflow.org/js
- **ONNX Runtime Web**: https://onnxruntime.ai/docs/tutorials/web/
- **Replicate API**: https://replicate.com/xinntao/realesrgan
- **Hugging Face Spaces**: https://huggingface.co/spaces

## Architectural-Specific Considerations

1. **Edge Preservation**: Architectural images need sharp edges - ensure model preserves line sharpness
2. **Material Detail**: Texture enhancement crucial for materials (wood, stone, concrete)
3. **Window Reflection**: Preserve reflections in glass without artifacts
4. **Shadow Detail**: Maintain shadow boundaries without bleeding
5. **Scale Sensitivity**: Different enhancement levels for different render resolutions

## Current Implementation Status

✅ **UI Panel**: Complete with enhancement mode selection
✅ **Image Capture**: Captures current view from renderer
✅ **Before/After Comparison**: Side-by-side view implemented
✅ **Download Functionality**: Both original and enhanced images

⏳ **AI Processing**: Placeholder implementation (needs Real-ESRGAN integration)
⏳ **Model Loading**: To be implemented
⏳ **Web Worker**: To be added for non-blocking processing
⏳ **Progress Feedback**: Basic progress bar (needs real progress from model)

## Next Steps

1. Choose implementation approach (API vs Browser-based)
2. Integrate Real-ESRGAN model
3. Add Web Worker for background processing
4. Implement actual enhancement modes
5. Add error handling and retry logic
6. Optimize performance for large images
7. Add batch processing capability












