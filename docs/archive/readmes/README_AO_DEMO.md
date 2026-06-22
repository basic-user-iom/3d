# Ambient Occlusion (AO) Demo

A standalone interactive demo showcasing Three.js Screen-Space Ambient Occlusion (SSAO) effects.

## 🚀 Quick Start

### Option 1: Using Vite Dev Server (Recommended)

1. Start the development server:
   ```bash
   npm run dev
   ```

2. Open in your browser:
   ```
   http://localhost:3000/ao-demo.html
   ```

### Option 2: Using a Simple HTTP Server

1. Start a local server (choose one):
   ```bash
   # Python 3
   python -m http.server 8080
   
   # Node.js
   npx http-server -p 8080
   
   # PHP
   php -S localhost:8080
   ```

2. Open in your browser:
   ```
   http://localhost:8080/ao-demo.html
   ```

## 🎮 Controls

### Mouse Controls
- **Left Click + Drag**: Rotate camera around the scene
- **Scroll Wheel**: Zoom in/out

### AO Parameters

#### Enable/Disable
- **Enable AO**: Toggle Ambient Occlusion on/off to see the difference

#### Output Mode
- **Beauty (Final Result)**: Normal rendering with AO applied (default)
- **Default**: Same as Beauty mode
- **SAO Only**: Shows only the AO map (useful for debugging)
- **Normal Map**: Visualizes the normal buffer used for AO calculation

#### Intensity (0-2)
Controls the strength of the occlusion effect. Higher values create darker shadows in occluded areas.

#### Bias (0-1)
Depth bias to prevent self-occlusion artifacts. Adjust if you see unwanted darkening on surfaces.

#### Scale (0.1-10)
Overall scale multiplier for the AO effect. Affects the size and intensity of occluded areas.

#### Kernel Radius (1-200)
Sampling radius in pixels. Larger values sample from a wider area, creating smoother but potentially less accurate AO.

#### Min Resolution (0-256)
Minimum resolution for the AO pass. Lower values (0 = full resolution) provide better quality but may impact performance.

#### Blur Settings
- **Enable Blur**: Smooths the AO result for a more natural appearance
- **Blur Radius (1-16)**: Size of the blur kernel
- **Blur Std Dev (0.1-10)**: Gaussian blur standard deviation

#### Reset Button
Resets all parameters to their default values.

## 🎨 Scene Description

The demo features a carefully designed scene to showcase AO effects:

1. **Stacked Boxes** (Center): Multiple boxes of different sizes create crevices and contact shadows
2. **Torus Knot** (Left): Complex geometry with many curves and self-occlusions
3. **Sphere on Cylinder** (Right): Demonstrates contact shadows between objects
4. **Multiple Overlapping Objects** (Back): Shows how AO affects object intersections
5. **Ground Plane**: Receives shadows and shows AO at object contact points

## 💡 Understanding Ambient Occlusion

Ambient Occlusion (AO) is a shading technique that simulates how exposed each point in a scene is to ambient lighting. It:

- **Darkens corners and crevices** where light has difficulty reaching
- **Adds depth and realism** to 3D scenes
- **Enhances contact shadows** where objects meet
- **Works in real-time** using screen-space techniques (SSAO)

### How It Works

1. **Depth Buffer**: Uses the scene's depth information
2. **Normal Buffer**: Uses surface normals to determine occlusion direction
3. **Sampling**: Samples nearby pixels to detect occlusions
4. **Blending**: Combines the AO map with the final rendered image

## 🔧 Technical Details

- **Three.js Version**: 0.162.0
- **AO Implementation**: SAOPass (Screen-Space Ambient Occlusion)
- **Post-Processing**: EffectComposer with RenderPass, SAOPass, and OutputPass
- **Performance**: Real-time, typically 60 FPS on modern hardware

## 📊 Performance Tips

- **Lower Kernel Radius**: Reduces sampling cost
- **Increase Min Resolution**: Reduces AO pass resolution for better performance
- **Disable Blur**: Removes blur pass overhead (may reduce quality)
- **Adjust Intensity**: Lower intensity values are computationally cheaper

## 🐛 Troubleshooting

### AO Not Visible
- Ensure "Enable AO" checkbox is checked
- Try increasing Intensity
- Check that Output Mode is set to "Beauty" or "Default"

### Performance Issues
- Reduce Kernel Radius
- Increase Min Resolution
- Disable Blur
- Lower the overall resolution

### Artifacts or Self-Occlusion
- Adjust Bias value (try values between 0.3-0.7)
- Reduce Intensity
- Adjust Scale parameter

## 📚 References

- [Three.js SAOPass Documentation](https://threejs.org/docs/#examples/en/postprocessing/SAOPass)
- [LearnOpenGL - SSAO Tutorial](https://learnopengl.com/Advanced-Lighting/SSAO)
- [Wikipedia - Ambient Occlusion](https://en.wikipedia.org/wiki/Ambient_occlusion)

## 🎯 Use Cases

AO is commonly used in:
- **Game Development**: Adding depth to game environments
- **Architectural Visualization**: Realistic lighting in building renders
- **Product Visualization**: Enhancing 3D product presentations
- **Animation**: Adding depth to animated scenes

## 📝 Notes

- The demo uses CDN-hosted Three.js, so an internet connection is required
- All objects cast and receive shadows for maximum visual impact
- The scene is optimized to clearly demonstrate AO effects
- Try different output modes to understand how AO is calculated

---

**Enjoy exploring Ambient Occlusion!** 🌑














