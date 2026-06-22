/**
 * Normal prepass shader for extracting normals
 * Renders view-space normals to a texture for use by SSR
 */
export const NormalPassShader = {
  uniforms: {
    tDiffuse: { value: null }
  },

  vertexShader: `
    varying vec3 vNormal;
    varying vec3 vViewPos;
    void main() {
      // Transform normal to view space
      vNormal = normalize(normalMatrix * normal);
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      vViewPos = mvPosition.xyz;
      gl_Position = projectionMatrix * mvPosition;
    }
  `,

  fragmentShader: `
    precision highp float;
    uniform sampler2D tDiffuse;
    varying vec3 vNormal;
    varying vec3 vViewPos;

    void main() {
      // Encode view-space normal in RGB (0.5 + 0.5 * normal maps to 0-1)
      vec3 normal = normalize(vNormal);
      gl_FragColor = vec4(normal * 0.5 + 0.5, 1.0);
    }
  `
}




















































