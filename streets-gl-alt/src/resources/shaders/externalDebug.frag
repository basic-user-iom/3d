#include <versionPrecision>
#include <gBufferOut>

in vec2 vUv;
in vec3 vNormal;
in vec3 vPosition;
in vec4 vClipPos;
in vec4 vClipPosPrev;

uniform MainBlock {
    mat4 projectionMatrix;
    mat4 modelMatrix;
    mat4 viewMatrix;
    mat4 modelViewMatrixPrev;
};

// Keep the same uniform block layout family as the generic instance material so
// the WebGL2Material UBO creation logic stays happy. `color` is the real
// per-object color fed from ExternalRenderableObject.color; `useBaseColorMap` toggles UV sampling.
uniform PerInstanceType {
    float textureId;
    vec3 color;
    float useBaseColorMap;
    int pickingId;
};

uniform sampler2DArray tMap;
uniform sampler2D tBaseColor;

#include <packNormal>
#include <getMotionVector>

void main() {
    vec3 baseColor = color;
    if (useBaseColorMap > 0.5) {
        baseColor *= texture(tBaseColor, vUv).rgb;
    }

    // Two-sided lighting: flip the interpolated view-space normal for back faces.
    vec3 normal = normalize(vNormal) * (float(gl_FrontFacing) * 2.0 - 1.0);

    outColor = vec4(baseColor, 1.0);
    outGlow = vec3(0.0);
    outNormal = packNormal(normal);
    // Mostly rough, non-metallic dielectric (matches generic instance defaults).
    outRoughnessMetalnessF0 = vec3(0.8, 0.0, 0.03);
    outMotion = getMotionVector(vClipPos, vClipPosPrev);
    // Write the per-object picking id (0 = empty/unpickable) to the G-buffer object-id target.
    outObjectId = uint(pickingId);
}
