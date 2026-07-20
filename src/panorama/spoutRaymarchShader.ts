/**
 * WebGL2 GLSL3 wrappers around P_Malin's Shadertoy Spout (lsXGzH), adapted for a
 * transparent panorama overlay: camera from uniforms, optional floor, SDF shape uniforms.
 */
import spoutBody from './spoutShaderSource.glsl?raw'

const VERT = /* glsl */ `
in vec3 position;
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const FRAG_HEADER = /* glsl */ `
precision highp float;
precision highp int;

uniform vec3 iResolution;
uniform float iTime;
uniform float iTimeDelta;
uniform float iFrame;
uniform vec4 iMouse;
uniform sampler2D iChannel0;

uniform vec3 uCameraPos;
uniform vec3 uCameraForward;
uniform vec3 uCameraUp;
uniform float uFovY;
uniform mat4 uInvSpoutWorld;
uniform float uPipeRadius;
uniform float uPipeThickness;
uniform float uPipeHeight;
uniform float uPipeLength;
uniform float uWaterSpeed;
uniform float uShowFloor;
uniform float uShowPipe;
uniform float uExposure;
uniform vec3 uPipeColor;
uniform float uPipeRoughness;
uniform vec3 uWaterColor;
uniform float uWaterOpacity;
uniform float uWaterRoughness;
uniform float uWaterIor;
uniform float uWaterTint;

out vec4 outColor;

#define kPipeRadius uPipeRadius
#define kPipeThickness uPipeThickness
#define kPipeHeight uPipeHeight
#define kPipeLength uPipeLength
`

/** Overlay camera + transparency entry (replaces Shadertoy mainImage / mainVR). */
const FRAG_MAIN = /* glsl */ `
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  C_Ray ray;

  vec2 vUV = fragCoord.xy / iResolution.xy;
  vec2 vViewCoord = vUV * 2.0 - 1.0;
  float fRatio = iResolution.x / max(iResolution.y, 1.0);
  vViewCoord.x *= fRatio;

  float tanHalf = tan(radians(uFovY) * 0.5);
  vec3 vForward = normalize(uCameraForward);
  vec3 vRight = normalize(cross(vForward, normalize(uCameraUp)));
  vec3 vUp = cross(vRight, vForward);

  vec3 worldOrigin = uCameraPos;
  vec3 worldDir = normalize(vRight * vViewCoord.x * tanHalf + vUp * vViewCoord.y * tanHalf + vForward);

  // Transform camera ray into spout local space (position / rotation / scale).
  vec4 oLocal = uInvSpoutWorld * vec4(worldOrigin, 1.0);
  vec4 dLocal = uInvSpoutWorld * vec4(worldDir, 0.0);
  ray.vOrigin = oLocal.xyz;
  ray.vDir = normalize(dLocal.xyz);
  ray.fStartDistance = 0.0;
  ray.fLength = kFarClip;

  C_HitInfo intersection;
  Raymarch(ray, intersection, 256, kTransparency);

  if (intersection.vObjectId.x < 0.5) {
    fragColor = vec4(0.0);
    return;
  }

  C_Surface surface;
  surface.vNormal = GetSceneNormal(intersection.vPos, kTransparency);

  C_Material material = GetObjectMaterial(intersection);
  surface.cReflection = GetReflection(ray, intersection, surface);

  if (material.fTransparency > 0.0) {
    surface.cTransmission = GetTransmission(ray, intersection, surface, material);
  }

  vec3 cScene = ShadeSurface(ray, intersection, surface, material);
  fragColor = vec4(Tonemap(cScene * uExposure), 1.0);
}

void main() {
  vec4 color = vec4(0.0);
  mainImage(color, gl_FragCoord.xy);
  outColor = color;
}
`

/**
 * Strip original mainImage/mainVR and rewrite GetDistanceScene to honour uShowFloor + uWaterSpeed.
 * Constants kPipe* are provided via #define → uniforms in the header.
 */
function adaptSpoutBody(src: string): string {
  let body = src

  // Drop Shadertoy entry points — we inject our own.
  const mainIdx = body.indexOf('void mainImage')
  if (mainIdx >= 0) body = body.slice(0, mainIdx)

  // Replace hardcoded pipe constants — #defines from header map names → uniforms.
  body = body.replace(/const float kPipeRadius = [\d.]+;/, '// kPipeRadius → uniform')
  body = body.replace(/const float kPipeThickness = [\d.]+;/, '// kPipeThickness → uniform')
  body = body.replace(/const float kPipeHeight = [\d.]+;/, '// kPipeHeight → uniform')
  body = body.replace(/const float kPipeLength = [\d.]+;/, '// kPipeLength → uniform')

  // Global initializer cannot reference uniforms — compute at use sites.
  body = body.replace(
    /float kRipplePos = sqrt\(abs\(2\.0 \* kPipeHeight \/ kWaterAccel\)\) \* kWaterVelocity;/,
    '// kRipplePos computed inline (uniform-safe)'
  )
  body = body.replace(
    /vec2 vRippleCentre1 = vPos\.xz - vec2\(kRipplePos, 0\.0\);/,
    `float kRipplePos = sqrt(abs(2.0 * kPipeHeight / kWaterAccel)) * kWaterVelocity;
	vec2 vRippleCentre1 = vPos.xz - vec2(kRipplePos, 0.0);`
  )

  // Gate floor / wall / trench behind uShowFloor.
  body = body.replace(
    /float fDistFloor = vPos\.y;[\s\S]*?vResult = DistCombineUnion\(vResult, vDistFloor\);/,
    `if (uShowFloor > 0.5) {
	float fDistFloor = vPos.y;
	float fDistBrick = fDistFloor;
	
	float fDistTrench = length(vPos.yz + vec2(-0.4, 0.0)) - 1.0;
	fDistBrick = max(fDistBrick, -(fDistTrench));
	
	float fDistWall = vPos.x + 1.0;
	fDistBrick = min(fDistBrick, fDistWall);
	
    vec4 vDistFloor = vec4(fDistBrick, kMaterialIdWall, vPos.xz + vec2(vPos.y, 0.0));
    vResult = DistCombineUnion(vResult, vDistFloor);
	}`
  )

  // Gate metal pipe behind uShowPipe (water stream always remains).
  body = body.replace(
    /float fDistPipe = max\(fDistWater - kPipeThickness, vWaterDomain\.x\);[\s\S]*?vResult = DistCombineUnion\(vResult, vDistPipe\);/,
    `if (uShowPipe > 0.5) {
    float fDistPipe = max(fDistWater - kPipeThickness, vWaterDomain.x);
    fDistPipe = max(fDistPipe, -vWaterDomain.x - kPipeLength);
    fDistPipe = max(fDistPipe, -fDistWater); // subtract the water from the pipe to make the hole
    vec4 vDistPipe = vec4(fDistPipe, kMaterialIdPipe, vPos.xy);
    vResult = DistCombineUnion(vResult, vDistPipe);
	}`
  )

  // Clip in-pipe water (x < 0) to pipeLength so the horizontal stream matches the metal pipe.
  // Free-fall spout for x >= 0 is unaffected (clip term is negative there).
  body = body.replace(
    /float fDistWater = \(length\(vWaterDomain\.yz\) - kPipeRadius\);/,
    `float fDistWater = (length(vWaterDomain.yz) - kPipeRadius);
    fDistWater = max(fDistWater, -vWaterDomain.x - kPipeLength);`
  )

  // Pipe material from color / roughness uniforms.
  body = body.replace(
    /\/\/ pipe\s*mat\.fR0 = 0\.8;\s*mat\.fSmoothness = 1\.0;\s*mat\.cAlbedo = vec3\(0\.5\);\s*mat\.fTransparency = 0\.0;/,
    `// pipe
        mat.fR0 = mix(0.04, 0.8, 1.0 - uPipeRoughness);
        mat.fSmoothness = clamp(1.0 - uPipeRoughness, 0.0, 1.0);
        mat.cAlbedo = uPipeColor;
        mat.fTransparency = 0.0;`
  )

  // Water material from color / opacity / roughness / IOR / tint uniforms.
  body = body.replace(
    /\/\/ water\s*mat\.fR0 = 0\.01;\s*mat\.fSmoothness = 1\.0;\s*mat\.fTransparency = 1\.0;\s*mat\.fRefractiveIndex = 1\.0 \/ 1\.3330;\s*const float fExtinctionScale = 2\.0;\s*const vec3 vExtinction = vec3\(0\.3, 0\.7, 0\.9\);\s*mat\.cAlbedo = \(vec3\(1\.0\) - vExtinction\) \* fExtinctionScale; \/\/ becomes extinction for transparency/,
    `// water
        mat.fR0 = 0.01;
        mat.fSmoothness = clamp(1.0 - uWaterRoughness, 0.0, 1.0);
        mat.fTransparency = clamp(uWaterOpacity, 0.0, 1.0);
        mat.fRefractiveIndex = 1.0 / max(uWaterIor, 1.001);
        // Desired tint stays; complementary channels absorb → blue/cyan look by default.
        mat.cAlbedo = (vec3(1.0) - uWaterColor) * uWaterTint; // extinction for transmission`
  )

  // Without the room floor, skip the infinite trench water plane.
  body = body.replace(
    /float fInTrench = step\(vPos\.y, \(-0\.1 \+ 0\.05\)\);/,
    'float fInTrench = uShowFloor > 0.5 ? step(vPos.y, (-0.1 + 0.05)) : 0.0;'
  )
  body = body.replace(
    /float fTrenchWaterDist = vPos\.y \+ 0\.1;\s*fDistWater = min\(fDistWater, fTrenchWaterDist\);/,
    `if (uShowFloor > 0.5) {
	float fTrenchWaterDist = vPos.y + 0.1;
	fDistWater = min(fDistWater, fTrenchWaterDist);
	}`
  )

  // Water animation speed.
  body = body.replace(
    /vNoiseDomain\.x \+= -iTime \* fWaterSpeed;/,
    'vNoiseDomain.x += -iTime * fWaterSpeed * uWaterSpeed;'
  )

  // Soften fog so misses stay transparent (primary path returns alpha 0 before fog).
  body = body.replace(/#define kFogDensity 0\.05/, '#define kFogDensity 0.0')

  return body
}

export function buildSpoutVertexShader(): string {
  return VERT
}

export function buildSpoutFragmentShader(): string {
  return FRAG_HEADER + adaptSpoutBody(spoutBody) + FRAG_MAIN
}
