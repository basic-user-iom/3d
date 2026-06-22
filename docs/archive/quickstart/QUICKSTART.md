# Ground Projection - Quick Start Guide

## 📦 What You Get

This package provides everything you need to add ground-projected HDR environments to your Three.js projects:

1. **ground-projection-setup.js** - Reusable module for your projects
2. **standalone-example.html** - Working demo (no dependencies needed)
3. **example-usage.html** - Integration example for existing Three.js projects  
4. **README-GROUND-PROJECTION.md** - Complete documentation
5. **Setup scripts** - Easy installation (PowerShell & Bash)

## 🚀 Quick Test (30 seconds)

### Option 1: Run the Standalone Demo

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
   http://localhost:8080/standalone-example.html
   ```

3. **Play with the demo**:
   - Drag to rotate
   - Scroll to zoom
   - Toggle ground projection on/off
   - Adjust height and radius sliders

### Option 2: Use the Setup Script

**Windows (PowerShell)**:
```powershell
.\setup-ground-projection.ps1 my-project
```

**Linux/Mac**:
```bash
chmod +x setup-ground-projection.sh
./setup-ground-projection.sh my-project
```

## 💻 Add to Your Project (3 steps)

### Step 1: Copy the module

Copy `ground-projection-setup.js` to your project folder.

### Step 2: Import and use

```javascript
import { setupGroundProjectedEnv } from './ground-projection-setup.js';

// After creating your scene:
const groundEnv = await setupGroundProjectedEnv(scene, {
    hdrPath: 'path/to/environment.hdr',
    height: 15,
    radius: 100
});

// Toggle on/off
groundEnv.toggle(true);  // enable
groundEnv.toggle(false); // disable

// Update parameters
groundEnv.update(newHeight, newRadius);
```

### Step 3: Add HDR environment

Download free HDR maps from:
- [Poly Haven](https://polyhaven.com/hdris) (recommended)
- [HDRI Haven](https://hdrihaven.com/)

## 📖 Full Examples

### Minimal Example (Copy & Paste)

```html
<!DOCTYPE html>
<html>
<head>
    <title>Ground Projection Demo</title>
    <style>
        body { margin: 0; }
        canvas { display: block; }
    </style>
</head>
<body>
    <script type="importmap">
        {
            "imports": {
                "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
                "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
            }
        }
    </script>
    
    <script type="module">
        import * as THREE from 'three';
        import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
        import { setupGroundProjectedEnv } from './ground-projection-setup.js';

        // Basic scene setup
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight);
        camera.position.set(0, 5, 10);

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        document.body.appendChild(renderer.domElement);

        const controls = new OrbitControls(camera, renderer.domElement);

        // Setup ground-projected environment
        const env = await setupGroundProjectedEnv(scene, {
            hdrPath: 'your-environment.hdr',
            height: 15,
            radius: 100
        });

        // Add a test object
        const geometry = new THREE.SphereGeometry(1);
        const material = new THREE.MeshStandardMaterial({
            metalness: 1.0,
            roughness: 0.2
        });
        const sphere = new THREE.Mesh(geometry, material);
        scene.add(sphere);

        // Render loop
        function animate() {
            requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        }
        animate();
    </script>
</body>
</html>
```

## 🎯 What It Does

**Ground Projected Environment Mapping** makes HDR environments look more realistic by:

1. **Projects the environment** onto a virtual ground plane
2. **Eliminates the "floating" feeling** of standard skyboxes
3. **Maintains proper reflections** on objects
4. **Adjustable parameters** for different scenarios

### Visual Difference

**Without Ground Projection** (standard):
- Sky appears as a sphere around everything
- Objects look like they're floating in space
- No proper ground plane integration

**With Ground Projection**:
- Sky meets a realistic ground plane
- Objects appear grounded in the environment
- Smooth transition from ground to horizon

## ⚙️ Parameters Explained

### Height
- **What**: Distance from camera to ground plane
- **Range**: Typically 5-30
- **Effect**: Higher = ground appears farther below
- **Use**: Match your scene's scale

### Radius
- **What**: Size of the projection sphere
- **Range**: Typically 50-200
- **Effect**: Larger = more environment visible
- **Use**: Must encompass entire scene

### Enabled
- **What**: Toggle ground projection on/off
- **Effect**: Switch between grounded and standard skybox
- **Use**: Compare the difference interactively

## 🎨 Material Tips

For best results with ground-projected environments:

```javascript
// Highly reflective (chrome, glass)
const material = new THREE.MeshPhysicalMaterial({
    metalness: 1.0,
    roughness: 0.1,
    clearcoat: 1.0
});

// Matte finish
const material = new THREE.MeshStandardMaterial({
    metalness: 0.0,
    roughness: 0.8
});

// Glass
const material = new THREE.MeshPhysicalMaterial({
    metalness: 0.0,
    roughness: 0.0,
    transmission: 1.0
});
```

## 🔧 Troubleshooting

### No reflections visible
✅ Use `MeshStandardMaterial` or `MeshPhysicalMaterial`
✅ Set `metalness > 0` for reflective materials
✅ Ensure `scene.environment` is set

### Black screen
✅ Check HDR file path is correct
✅ Wait for HDR to load (use `await`)
✅ Check browser console for errors

### Ground looks weird
✅ Adjust `height` parameter to match scene scale
✅ Increase `radius` if objects are outside projection
✅ Try different HDR environments

### Performance issues
✅ Use 1K or 2K HDR files (not 4K+)
✅ Reduce `resolution` parameter (default: 128)
✅ Limit number of reflective objects

## 📚 Learn More

- **Full Documentation**: See `README-GROUND-PROJECTION.md`
- **Three.js Docs**: [threejs.org/docs](https://threejs.org/docs)
- **Free HDRs**: [polyhaven.com](https://polyhaven.com/hdris)

## 🤝 Support

This implementation is based on Three.js's `GroundedSkybox` example.

Original example: `webgl_materials_envmaps_groundprojected.html`

## ✨ That's It!

You now have everything you need to add stunning ground-projected environments to your Three.js projects.

**Quick test**: Run `standalone-example.html` → See it work in 30 seconds!

**Add to project**: Copy `ground-projection-setup.js` → Import → Done!

Enjoy creating beautiful 3D environments! 🎉

