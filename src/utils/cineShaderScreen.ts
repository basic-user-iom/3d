/**
 * CineShader Demo Screen Utility
 * 
 * Creates a CineShader demo screen with turbulence noise shader.
 * Extracted from App.tsx to improve code organization.
 */

import * as THREE from 'three'

/**
 * Creates a CineShader demo screen in the scene
 * 
 * @param scene The Three.js scene to add the screen to
 * @returns The created screen group, or null if creation failed
 */
export function createCineShaderScreen(scene: THREE.Scene): THREE.Group | null {
  // Find native objects group
  let nativeObjectsGroup: THREE.Group | undefined = undefined
  scene.traverse((obj) => {
    if (obj.userData.isNativeObjectsGroup) {
      nativeObjectsGroup = obj as THREE.Group
    }
  })

  if (nativeObjectsGroup === undefined) {
    console.warn('[CineShaderScreen] Native objects group not found, cannot create CineShader demo screen')
    return null
  }
  
  // TypeScript needs this assertion after the undefined check
  const nativeGroup = nativeObjectsGroup as THREE.Group

  // Create CineShader demo screen
  try {
    const screenWidth = 3
    const screenHeight = 1.8

    // Initialize with high pixel resolution (Shadertoy expects pixel coordinates)
    const aspectRatio = screenWidth / screenHeight
    const pixelResolution = 1920.0
    const shaderScreenUniforms = {
      iTime: { value: 0 },
      iResolution: { value: new THREE.Vector2(pixelResolution, pixelResolution / aspectRatio) },
      iMouse: { value: new THREE.Vector4(0, 0, 0, 0) } // x, y, click state
    }

    // Noise functions (shared between vertex and fragment shaders)
    const noiseFunctions = `
      vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
      vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
      
      float snoise(vec3 v){ 
          const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
          const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
          
          // First corner
          vec3 i  = floor(v + dot(v, C.yyy) );
          vec3 x0 =   v - i + dot(i, C.xxx) ;
          
          // Other corners
          vec3 g = step(x0.yzx, x0.xyz);
          vec3 l = 1.0 - g;
          vec3 i1 = min( g.xyz, l.zxy );
          vec3 i2 = max( g.xyz, l.zxy );
          
          vec3 x1 = x0 - i1 + 1.0 * C.xxx;
          vec3 x2 = x0 - i2 + 2.0 * C.xxx;
          vec3 x3 = x0 - 1. + 3.0 * C.xxx;
          
          // Permutations
          i = mod(i, 289.0 ); 
          vec4 p = permute( permute( permute( 
                               i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
                           + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
                           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
          
          // Gradients
          float n_ = 1.0/7.0; // N=7
          vec3  ns = n_ * D.wyz - D.xzx;
          vec4 j = p - 49.0 * floor(p * ns.z *ns.z);
          vec4 x_ = floor(j * ns.z);
          vec4 y_ = floor(j - 7.0 * x_ );
          vec4 x = x_ *ns.x + ns.yyyy;
          vec4 y = y_ *ns.x + ns.yyyy;
          vec4 h = 1.0 - abs(x) - abs(y);
          vec4 b0 = vec4( x.xy, y.xy );
          vec4 b1 = vec4( x.zw, y.zw );
          vec4 s0 = floor(b0)*2.0 + 1.0;
          vec4 s1 = floor(b1)*2.0 + 1.0;
          vec4 sh = -step(h, vec4(0.0));
          vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
          vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
          vec3 p0 = vec3(a0.xy,h.x);
          vec3 p1 = vec3(a0.zw,h.y);
          vec3 p2 = vec3(a1.xy,h.z);
          vec3 p3 = vec3(a1.zw,h.w);
          
          //Normalise gradients
          vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
          p0 *= norm.x;
          p1 *= norm.y;
          p2 *= norm.z;
          p3 *= norm.w;
          
          // Mix final noise value
          vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
          m = m * m;
          return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), 
                                                            dot(p2,x2), dot(p3,x3) ) );
      }
      
      float fbm( vec3 p ) {
          float f = 0.0;
          f += 0.5000*snoise( p ); p = p*2.02;
          f += 0.2500*snoise( p ); p = p*2.03;
          f += 0.1250*snoise( p ); p = p*2.01;
          f += 0.0625*snoise( p );
          return f/0.9375;
      }
    `

    // Vertex shader with displacement for true 3D surface
    const vertexShader = `
      uniform vec2 iResolution;
      uniform float iTime;
      uniform vec4 iMouse;
      varying vec2 vUv;
      varying float vDisplacement;
      
      ${noiseFunctions}
      
      void main() {
        // Flip UV to fix inversion (vUv.y = 1.0 - uv.y)
        vUv = vec2(uv.x, 1.0 - uv.y);
        
        // Calculate displacement using the same noise function as fragment shader
        vec2 fragCoord = vUv * iResolution;
        vec2 uv_coord = fragCoord / iResolution.xy;
        float mouseRatio = smoothstep(100.0, 0.0, length(iMouse.xy - fragCoord.xy));
        float noise = 0.25 + fbm(vec3(uv_coord * 12.0 + (iMouse.xy - fragCoord.xy) * mouseRatio * 0.05, iTime * 0.18 + 0.5 * mouseRatio));
        noise *= 0.25 + snoise(vec3(uv_coord * 4.0 + 1.5, iTime * 0.15));
        
        vDisplacement = noise;
        
        // Displace vertex along normal vector (proper 3D displacement)
        vec3 newPosition = position;
        float displacementAmount = noise * 0.4; // Scale displacement for visible 3D effect
        // Displace along the normal vector to create proper 3D surface deformation
        newPosition += normal * displacementAmount;
        
        gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
      }
    `

    // CineShader turbulence noise shader with improved brightness and opacity
    const shaderScreenMaterial = new THREE.ShaderMaterial({
      uniforms: shaderScreenUniforms,
      vertexShader: vertexShader,
      fragmentShader: `
        precision highp float;
        
        uniform vec2 iResolution;
        uniform float iTime;
        uniform vec4 iMouse;
        varying vec2 vUv;
        varying float vDisplacement;
        
        ${noiseFunctions}
        
        void mainImage( out vec4 fragColor, in vec2 fragCoord ) {
          // Original CineShader demo code with brightness and opacity adjustments
          vec2 uv = fragCoord / iResolution.xy;
          float mouseRatio = smoothstep(100.0, 0.0, length(iMouse.xy - fragCoord.xy));
          float noise = 0.25 + fbm(vec3(uv * 12.0 + (iMouse.xy - fragCoord.xy) * mouseRatio * 0.05, iTime * 0.18 + 0.5 * mouseRatio));
          noise *= 0.25 + snoise(vec3(uv * 4.0 + 1.5, iTime * 0.15));
          
          // Increase brightness and opacity - remap noise to higher range for more solid appearance
          float alpha = noise;
          alpha = smoothstep(0.0, 0.8, alpha); // Remap to increase overall brightness
          alpha = mix(0.6, 1.0, alpha); // Ensure minimum opacity of 0.6, max of 1.0
          
          fragColor = vec4(1.0, 1.0, 1.0, alpha);
        }
        
        void main() {
          vec2 fragCoord = vUv * iResolution;
          vec4 fragColor;
          mainImage(fragColor, fragCoord);
          gl_FragColor = fragColor;
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: true,
      depthTest: true,
      blending: THREE.NormalBlending
    })

    // Create subdivided plane for vertex displacement (more vertices = smoother 3D surface)
    const segments = 128 // High resolution for smooth displacement
    const shaderScreenGeometry = new THREE.PlaneGeometry(screenWidth, screenHeight, segments, segments)

    // Simple physical frame around the screen
    const frameThickness = 0.12
    const frameDepth = 0.15
    
    const shaderScreen = new THREE.Mesh(shaderScreenGeometry, shaderScreenMaterial)
    shaderScreen.name = 'CineShaderDemoScreen'
    // Position screen in front of the frame (frame depth is 0.15, so position at frameDepth/2 + small offset)
    shaderScreen.position.set(0, 0, frameDepth / 2 + 0.02) // In front of frame
    // Rotate screen to face camera - PlaneGeometry faces +Z by default, camera is at +Z looking towards origin
    // So we need to rotate 180 degrees to face -Z (towards camera)
    shaderScreen.rotation.y = Math.PI // Face camera (rotate to face -Z)
    shaderScreen.castShadow = false
    shaderScreen.receiveShadow = false
    shaderScreen.renderOrder = 1000 // Render on top of frame
    shaderScreen.userData.isDemoShaderScreen = true
    const outerW = screenWidth + frameThickness * 2.0
    const outerH = screenHeight + frameThickness * 2.0

    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x111319,
      metalness: 0.65,
      roughness: 0.35
    })
    
    // Create frame as a border only (4 sides) instead of a box with inner cutout
    // This prevents the innerMesh from creating a black box that covers the screen
    const frameGroup = new THREE.Group()
    frameGroup.name = 'CineShaderDemoFrame'
    frameGroup.position.set(0, 0, 0) // Relative to parent group
    frameGroup.rotation.set(0, 0, 0)

    // Create frame border pieces (top, bottom, left, right)
    const borderThickness = frameThickness
    const borderDepth = frameDepth
    
    // Top border
    const topBorder = new THREE.Mesh(
      new THREE.BoxGeometry(outerW, borderThickness, borderDepth),
      frameMat
    )
    topBorder.position.set(0, screenHeight / 2 + borderThickness / 2, 0)
    
    // Bottom border
    const bottomBorder = new THREE.Mesh(
      new THREE.BoxGeometry(outerW, borderThickness, borderDepth),
      frameMat
    )
    bottomBorder.position.set(0, -screenHeight / 2 - borderThickness / 2, 0)
    
    // Left border
    const leftBorder = new THREE.Mesh(
      new THREE.BoxGeometry(borderThickness, screenHeight, borderDepth),
      frameMat
    )
    leftBorder.position.set(-screenWidth / 2 - borderThickness / 2, 0, 0)
    
    // Right border
    const rightBorder = new THREE.Mesh(
      new THREE.BoxGeometry(borderThickness, screenHeight, borderDepth),
      frameMat
    )
    rightBorder.position.set(screenWidth / 2 + borderThickness / 2, 0, 0)

    topBorder.castShadow = false
    topBorder.receiveShadow = true
    topBorder.renderOrder = 0
    bottomBorder.castShadow = false
    bottomBorder.receiveShadow = true
    bottomBorder.renderOrder = 0
    leftBorder.castShadow = false
    leftBorder.receiveShadow = true
    leftBorder.renderOrder = 0
    rightBorder.castShadow = false
    rightBorder.receiveShadow = true
    rightBorder.renderOrder = 0

    frameGroup.add(topBorder)
    frameGroup.add(bottomBorder)
    frameGroup.add(leftBorder)
    frameGroup.add(rightBorder)
    frameGroup.renderOrder = 0 // Frame renders first

    // Create a parent group to hold both screen and frame together
    const screenAndFrameGroup = new THREE.Group()
    screenAndFrameGroup.name = 'CineShaderDemoScreenGroup'
    screenAndFrameGroup.position.set(0, 1.4, -4)
    screenAndFrameGroup.rotation.y = THREE.MathUtils.degToRad(0)
    
    // Mark as CineShader demo screen (NOT a model - it's a helper/demo object)
    screenAndFrameGroup.userData.isDemoShaderScreen = true
    screenAndFrameGroup.userData.isCineShaderDemoScreenGroup = true
    screenAndFrameGroup.castShadow = false
    screenAndFrameGroup.receiveShadow = false

    // Add screen and frame to the parent group
    screenAndFrameGroup.add(shaderScreen)
    screenAndFrameGroup.add(frameGroup)

    const startTime = performance.now()
    shaderScreen.onBeforeRender = (renderer) => {
      const now = performance.now()
      shaderScreenUniforms.iTime.value = (now - startTime) / 1000.0
      const rendererSize = new THREE.Vector2()
      renderer.getSize(rendererSize)
      // Use pixel resolution (not world-space) - this is critical for proper noise detail
      shaderScreenUniforms.iResolution.value.set(pixelResolution, pixelResolution / aspectRatio)
      // iMouse can be updated from mouse position if needed
    }

    // Make visible when created
    screenAndFrameGroup.visible = true
    
    // Add the parent group to the native objects group
    nativeGroup.add(screenAndFrameGroup)
    console.log('[CineShaderScreen] CineShader demo screen created on demand:', {
      position: screenAndFrameGroup.position.clone(),
      rotation: screenAndFrameGroup.rotation.clone(),
      visible: screenAndFrameGroup.visible
    })

    return screenAndFrameGroup
  } catch (error) {
    console.warn('[CineShaderScreen] Failed to create CineShader demo screen:', error)
    return null
  }
}

