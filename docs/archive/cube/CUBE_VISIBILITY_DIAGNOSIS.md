# Cube Visibility Diagnosis Report

## Problem
Red 200x200 meter cubes are being placed in Streets GL but are not visible in the browser.

## Investigation Results

### 1. Material and Shader Analysis

**Building Rendering:**
- Buildings use `genericInstanceMaterial` or `advancedInstanceMaterial`
- These materials use the `instanceGeneric` shader
- Buildings have valid textures in the instance texture array at specific textureId values

**External Object Rendering:**
- External objects use `externalObjectMaterial`
- Also uses the `instanceGeneric` shader
- Texture array is set to the 'instance' texture pool
- Default textureId is 0 (adColumn texture)

### 2. Critical Issue Found: Shader Discard Logic

**Location:** `streets-gl-alt/src/resources/shaders/instanceGeneric.frag`

**Problem:**
```glsl
void main() {
    vec4 color = readDiffuse(vUv);

    if (color.a < 0.5) {
        discard;  // ❌ This discards fragments when texture is transparent/missing!
    }

    outColor = vec4(color.rgb * objectColor, 1);
}
```

**Root Cause:**
- The shader reads from texture array using `textureId * 2`
- If the texture at that index is transparent (alpha < 0.5) or missing, ALL fragments are discarded
- This means the entire cube becomes invisible even though it's being drawn

### 3. Fix Applied

**Modified Shader:** `streets-gl-alt/src/resources/shaders/instanceGeneric.frag`

**Change:**
```glsl
void main() {
    vec4 color = readDiffuse(vUv);

    // ✅ FIXED: If texture is transparent or missing, use solid object color instead
    if (color.a < 0.5) {
        // Use solid object color when texture is transparent/missing
        outColor = vec4(objectColor, 1.0);
    } else {
        // Multiply texture color by object color (allows solid colors when texture is white, or tinting)
        outColor = vec4(color.rgb * objectColor, 1);
    }
    
    outGlow = vec3(0);
    outNormal = packNormal(getNormal());
    outRoughnessMetalnessF0 = vec3(0.8, 0, 0.03);
    outMotion = getMotionVector(vClipPos, vClipPosPrev);
    outObjectId = 0u;
}
```

**Result:**
- When texture is transparent/missing, the shader now uses the solid `objectColor` (red for our cubes)
- This allows rendering solid colored objects without requiring a valid texture

### 4. Additional Findings

**Object Placement:**
- Objects are being placed correctly at coordinates
- Objects are being sent to Streets GL successfully
- Objects are being drawn (console logs confirm "Successfully drew object")
- Color is being set correctly (red: r=1.0, g=0.0, b=0.0)

**Camera Position:**
- Initial camera was too close (50m distance) for 200m cubes
- Fixed zoom function to use 800m distance and 60° pitch

**Height Calculation:**
- Objects are placed at 150m center height (bottom at 50m, top at 250m)
- This is above the 4-level parking garage (~15m tall)

## Summary

The cubes were invisible because:
1. **Shader was discarding fragments** when texture alpha < 0.5
2. The texture at `textureId * 2` (textureId = 0) might be transparent or not fully opaque
3. Even though objects were being drawn, all fragments were being discarded

**Solution:**
- Modified shader to use solid `objectColor` when texture is transparent/missing
- This allows rendering solid colored objects (like our red cubes) without requiring textures

## Next Steps

1. Wait for Streets GL webpack server to rebuild with the shader changes
2. Test if cubes are now visible
3. If still not visible, check:
   - If shader is being recompiled correctly
   - If texture array is properly initialized
   - If there are any other rendering issues

## Files Modified

1. `streets-gl-alt/src/resources/shaders/instanceGeneric.frag` - Fixed discard logic
2. `src/components/StreetsGLDemo.tsx` - Fixed camera zoom distance
3. `streets-gl-alt/src/app/render/passes/GBufferPass.ts` - Added comment about textureId






