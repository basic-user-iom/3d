import * as THREE from 'three'

export interface ShadowCatcherUniforms {
  hdrTexture: THREE.Texture | null
  hdrTransform: THREE.Matrix4
  shadowStrength: number
}

export interface ShadowCatcherMaterialConfig {
  hdrTexture: THREE.Texture | null
  hdrIntensity: number
  shadowDarkness: number
  worldToGround: THREE.Matrix4
}

export function createShadowCatcherMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      hdrTexture: { value: null },
      hdrIntensity: { value: 1 },
      shadowDarkness: { value: 1 },
      worldToGround: { value: new THREE.Matrix4() },
      textureSize: { value: new THREE.Vector2(1, 1) }
    },
    vertexShader: `
      varying vec3 vWorldPosition;

      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      #include <common>
      #include <packing>
      #include <lights_fragment_begin>

      uniform sampler2D hdrTexture;
      uniform float hdrIntensity;
      uniform float shadowDarkness;
      uniform mat4 worldToGround;
      uniform vec2 textureSize;

      varying vec3 vWorldPosition;

      float getShadowAmount() {
        float shadow = 0.0;
        #if defined( NUM_DIR_LIGHTS ) && NUM_DIR_LIGHTS > 0
          for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
            shadow += directionalShadow( directionalShadowMap[ i ], directionalLightShadow[ i ], directionalLight[ i ].shadow, directionalLight[ i ].direction, vWorldPosition );
          }
          shadow /= float(NUM_DIR_LIGHTS);
        #endif
        return shadow;
      }

      vec2 projectWorldPosition() {
        vec4 groundSpace = worldToGround * vec4( vWorldPosition, 1.0 );
        // Ground plane is XZ, map to UV
        vec2 uv = groundSpace.xz;
        uv = uv * 0.5 + 0.5;
        return uv;
      }

      void main() {
        vec2 uv = projectWorldPosition();
        vec3 base = texture2D( hdrTexture, uv ).rgb * hdrIntensity;
        float shadow = pow( getShadowAmount(), shadowDarkness );
        vec3 color = mix( base, vec3( 0.0 ), shadow );
        gl_FragColor = vec4( color, 1.0 );
      }
    `,
    lights: true,
    transparent: false,
    depthWrite: true,
    depthTest: true,
    toneMapped: true
  })
}


