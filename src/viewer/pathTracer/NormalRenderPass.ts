import * as THREE from 'three'

/**
 * Render pass for extracting normals from the scene
 * Used by path tracer for better denoising and lighting calculations
 */
export class NormalRenderPass {
  private normalMaterial: THREE.ShaderMaterial
  private originalMaterials: WeakMap<THREE.Mesh, THREE.Material | THREE.Material[]>

  constructor() {
    // Create shader material for normal rendering
    this.normalMaterial = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          // CRITICAL FIX: Output view space normals (not world space)
          // normalMatrix transforms normals to view space, which is what SSR needs
          // since SSR ray marching happens in view space
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec3 vNormal;
        void main() {
          // Encode view space normal in RGB (0.5 + 0.5 * normal maps to 0-1)
          // This is view space normal, which SSR shader expects
          vec3 normal = normalize(vNormal);
          gl_FragColor = vec4(normal * 0.5 + 0.5, 1.0);
        }
      `
    })

    this.originalMaterials = new WeakMap()
  }

  /**
   * Replace materials in scene with normal material
   */
  private replaceMaterials(object: THREE.Object3D): void {
    if (object instanceof THREE.Mesh) {
      // Store original material
      if (object.material && !this.originalMaterials.has(object)) {
        this.originalMaterials.set(object, object.material)
      }

      // Replace with normal material
      object.material = this.normalMaterial
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
   * Render normals to a render target
   */
  render(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    target: THREE.WebGLRenderTarget
  ): void {
    const oldRenderTarget = renderer.getRenderTarget()

    // Replace materials with normal material
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
    this.normalMaterial.dispose()
    // FIX: Clear WeakMap to help garbage collection
    // WeakMap should auto-clear, but explicitly clearing helps ensure cleanup
    this.originalMaterials = new WeakMap()
  }
}
