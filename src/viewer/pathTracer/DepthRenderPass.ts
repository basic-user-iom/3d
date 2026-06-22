import * as THREE from 'three'

/**
 * Render pass for extracting depth from the scene
 * Used by path tracer for depth-based denoising
 * Writes depth values to the red channel of an RGBA texture
 */
export class DepthRenderPass {
  private depthMaterial: THREE.ShaderMaterial
  private originalMaterials: WeakMap<THREE.Mesh, THREE.Material | THREE.Material[]>
  private camera: THREE.Camera

  constructor(camera: THREE.Camera) {
    this.camera = camera
    // Get camera near/far for linear depth calculation
    let cameraNear = 0.1
    let cameraFar = 1000
    if (camera instanceof THREE.PerspectiveCamera || camera instanceof THREE.OrthographicCamera) {
      cameraNear = camera.near
      cameraFar = camera.far
    }
    
    // Create shader material for depth rendering
    this.depthMaterial = new THREE.ShaderMaterial({
      uniforms: {
        cameraNear: { value: cameraNear },
        cameraFar: { value: cameraFar }
      },
      vertexShader: `
        varying vec4 vViewPosition;
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vViewPosition = mvPosition;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec4 vViewPosition;
        uniform float cameraNear;
        uniform float cameraFar;
        void main() {
          // CRITICAL FIX: Calculate linear depth from view space position
          // gl_FragCoord.z is non-linear (perspective-corrected), we need linear depth
          // Linear depth = distance from camera in view space
          float linearDepth = -vViewPosition.z;
          // Normalize to 0-1 range (0 = near, 1 = far)
          float normalizedLinearDepth = (linearDepth - cameraNear) / (cameraFar - cameraNear);
          normalizedLinearDepth = clamp(normalizedLinearDepth, 0.0, 1.0);
          // Pack normalized linear depth into red channel
          gl_FragColor = vec4(normalizedLinearDepth, 0.0, 0.0, 1.0);
        }
      `
    })

    this.originalMaterials = new WeakMap()
  }

  /**
   * Replace materials in scene with depth material
   */
  private replaceMaterials(object: THREE.Object3D): void {
    if (object instanceof THREE.Mesh) {
      // Store original material
      if (object.material && !this.originalMaterials.has(object)) {
        this.originalMaterials.set(object, object.material)
      }

      // Replace with depth material
      object.material = this.depthMaterial
    }

    // Recursively process children
    for (const child of object.children) {
      this.replaceMaterials(child)
    }
  }

  /**
   * Restore original materials
   */
  private restoreMaterials(object: THREE.Object3D): void {
    if (object instanceof THREE.Mesh && this.originalMaterials.has(object)) {
      object.material = this.originalMaterials.get(object)!
    }

    // Recursively process children
    for (const child of object.children) {
      this.restoreMaterials(child)
    }
  }

  /**
   * Render depth to a render target
   */
  render(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    target: THREE.WebGLRenderTarget
  ): void {
    const oldRenderTarget = renderer.getRenderTarget()

    // Update camera near/far uniforms if camera changed
    if (camera instanceof THREE.PerspectiveCamera || camera instanceof THREE.OrthographicCamera) {
      const uniforms = this.depthMaterial.uniforms as any
      if (uniforms.cameraNear) uniforms.cameraNear.value = camera.near
      if (uniforms.cameraFar) uniforms.cameraFar.value = camera.far
    }

    // Replace materials with depth material
    this.replaceMaterials(scene)

    // Render to target
    renderer.setRenderTarget(target)
    renderer.render(scene, camera)

    // Restore original materials
    this.restoreMaterials(scene)

    // Restore render target
    renderer.setRenderTarget(oldRenderTarget)
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.depthMaterial.dispose()
  }
}

