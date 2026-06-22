# Complete Analysis: Ground Projection & 360 HDR Shadow Issues

## Overview
This document provides a comprehensive analysis of all code that affects ground projection and 360 HDR with shadows not showing in the web export preview.

---

## 1. GROUND PROJECTION SETUP (`src/viewer/effects/ground-projection-setup.ts`)

### Key Issues Identified:

#### 1.1 Material Configuration (Lines 407-428)
- **Problem**: `GroundedSkybox` uses `MeshBasicMaterial` by default, which **does NOT support shadows**
- **Current Fix**: `applyShadowSupportToMaterial()` is called to inject shadow support
- **Issue**: This shader injection may not work reliably in all cases
- **Web Export**: Material is converted to `MeshStandardMaterial` (lines 2157-2174 in `webExport.ts`)

#### 1.2 Texture Configuration (Lines 57-76)
- **CRITICAL**: GroundedSkybox expects:
  - `envMap.rotation = 0` (GroundedSkybox handles its own unwrapping)
  - `envMap.flipY = false` (standard orientation)
  - `envMap.center.set(0.5, 0.5)`
- **Conflict**: In `HDRSystem.ts` (line 502), `flipY = false` is set correctly
- **Conflict**: In `webExport.ts` (line 2147), `flipY = true` is set (WRONG!)

#### 1.3 Shadow Receiving (Lines 403-416)
- `receiveShadow = true` is set correctly
- `castShadow = false` is set correctly
- Material shadow support is injected via `applyShadowSupportToMaterial()`

#### 1.4 Render Order (Line 398)
- `renderOrder = -1000` ensures GroundedSkybox renders first
- This is correct for background rendering

---

## 2. HDR SYSTEM (`src/viewer/effects/HDRSystem.ts`)

### Key Issues Identified:

#### 2.1 Texture State for Ground Projection (Lines 495-503)
```typescript
hdrTexture.mapping = THREE.EquirectangularReflectionMapping
hdrTexture.rotation = 0
hdrTexture.center.set(0.5, 0.5)
hdrTexture.flipY = false // GroundedSkybox expects standard orientation
```
- **CORRECT**: This matches what `ground-projection-setup.ts` expects

#### 2.2 Background Setting (Line 515)
- `scene.background = null` is set when ground projection is enabled
- **CORRECT**: GroundedSkybox replaces the background entirely

#### 2.3 Shadow Plane Visibility (Line 484)
- `updateShadowPlaneVisibilityForGroundProjection(true)` is called
- This should hide the shadow plane when ground projection is enabled

---

## 3. WEB EXPORT (`src/utils/webExport.ts`)

### CRITICAL ISSUES FOUND:

#### 3.1 HDR Texture Configuration - GROUND PROJECTION (Lines 2141-2147)
```typescript
const skyboxTexture = hdrTexture; // Use same texture
skyboxTexture.mapping = THREE.EquirectangularReflectionMapping;
skyboxTexture.rotation = 0; // GroundedSkybox handles its own unwrapping
skyboxTexture.center.set(0.5, 0.5);
skyboxTexture.flipY = true; // ❌ WRONG! Should be false
```
- **PROBLEM**: `flipY = true` is set, but `ground-projection-setup.ts` expects `flipY = false`
- **IMPACT**: This causes the HDR texture to be inverted, resulting in white screen

#### 3.2 Material Conversion (Lines 2157-2174)
```typescript
if (originalMaterial instanceof THREE.MeshBasicMaterial) {
  const textureMap = originalMaterial.map || null;
  const newMaterial = new THREE.MeshStandardMaterial({
    map: textureMap,
    roughness: 1.0,
    metalness: 0.0,
    side: THREE.DoubleSide,
    transparent: false,
    opacity: 1.0,
    depthWrite: true,
    color: textureMap ? 0xffffff : 0x888888
  });
  groundProjectionSkybox.material = newMaterial;
}
```
- **CORRECT**: This converts `MeshBasicMaterial` to `MeshStandardMaterial` for shadow support
- **ISSUE**: The texture map extraction (`originalMaterial.map`) may not work if GroundedSkybox uses a different property

#### 3.3 Shadow Plane Positioning (Lines 1739-1744)
```typescript
if (hdrConfig.groundProjectionEnabled === true) {
  const groundHeight = hdrConfig.groundProjectionHeight || 15;
  shadowPlane.position.y = groundHeight + 0.1; // Slightly above ground projection
}
```
- **CORRECT**: Shadow plane is positioned at ground projection height
- **POTENTIAL ISSUE**: Shadow plane may be created AFTER GroundedSkybox, causing z-fighting

#### 3.4 Shadow Plane Creation (Lines 1633-1687)
- Shadow plane is searched for in the loaded GLB
- If not found, it should be created, but **NO CREATION CODE EXISTS**
- **PROBLEM**: If shadow plane doesn't exist in GLB, it won't be created
- **IMPACT**: No shadow plane = no shadows visible

#### 3.5 Shadow Map Configuration (Lines 2311-2321)
```typescript
renderer.shadowMap.autoUpdate = true;
// ... update shadows ...
renderer.shadowMap.autoUpdate = false;
```
- **CORRECT**: Shadow maps are updated initially, then frozen
- **POTENTIAL ISSUE**: If GroundedSkybox is added after this, shadows may not update

#### 3.6 HDR Texture for Standard 360 HDR (Lines 2121-2127)
```typescript
hdrTexture.center.set(0.5, 0.5);
hdrTexture.flipY = true; // Fix vertical orientation
hdrTexture.needsUpdate = true;
```
- **CORRECT**: For standard HDR (non-ground-projection), `flipY = true` is correct

---

## 4. SHADOW PLANE CREATION IN WEB EXPORT

### Missing Code:
The web export does NOT create a shadow plane if it doesn't exist in the GLB. This is a **CRITICAL MISSING FEATURE**.

**Expected Code (should be added after line 1687):**
```typescript
// Create shadow plane if it doesn't exist
if (!shadowPlane) {
  console.log('[WebExport] Shadow plane not found in GLB, creating a new one.');
  const shadowPlaneGeometry = new THREE.PlaneGeometry(10000, 10000);
  const shadowMaterial = new THREE.ShadowMaterial({ opacity: 0.5 });
  shadowMaterial.depthWrite = true;
  shadowPlane = new THREE.Mesh(shadowPlaneGeometry, shadowMaterial);
  shadowPlane.name = 'Shadow Plane (Generated)';
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.receiveShadow = true;
  shadowPlane.castShadow = false;
  shadowPlane.userData.isShadowPlane = true;
  scene.add(shadowPlane);
}
```

---

## 5. RENDER ORDER & VISIBILITY

### Issues:

#### 5.1 GroundedSkybox Visibility
- `groundProjectionSkybox.visible = true` is set (line 2151)
- `groundProjectionSkybox.frustumCulled = false` is set (line 2153)
- **CORRECT**: These ensure GroundedSkybox is always visible

#### 5.2 Shadow Plane Visibility
- Shadow plane visibility is set to `true` (line 1637)
- **POTENTIAL ISSUE**: If shadow plane is created after GroundedSkybox, it may be occluded

#### 5.3 Render Order
- GroundedSkybox: `renderOrder = -1000` (renders first)
- Shadow Plane: No explicit renderOrder set (defaults to 0)
- **POTENTIAL ISSUE**: Shadow plane may render before GroundedSkybox, causing shadows to appear above the ground

---

## 6. SHADOW MAP UPDATES

### Issues:

#### 6.1 Initial Shadow Map Update
- Shadow maps are updated once after scene loads (lines 2311-2321)
- **POTENTIAL ISSUE**: If GroundedSkybox is added after this update, its shadows won't be in the shadow map

#### 6.2 Shadow Map Auto-Update
- `autoUpdate = false` after initial render (line 2320)
- **POTENTIAL ISSUE**: If GroundedSkybox material is changed, shadows won't update

---

## 7. MATERIAL TEXTURE EXTRACTION

### Issue in Web Export (Lines 2161, 2226):
```typescript
const textureMap = originalMaterial.map || null;
```
- **PROBLEM**: GroundedSkybox's `MeshBasicMaterial` may not have a `.map` property
- **SOLUTION**: Should check for `material.envMap` or access the texture from GroundedSkybox's internal structure

---

## SUMMARY OF CRITICAL ISSUES

### 1. **HDR Texture flipY Mismatch** (HIGH PRIORITY)
- **Location**: `webExport.ts` line 2147
- **Issue**: `flipY = true` for GroundedSkybox, but should be `false`
- **Impact**: Causes white HDR screen in ground projection

### 2. **Missing Shadow Plane Creation** (HIGH PRIORITY)
- **Location**: `webExport.ts` after line 1687
- **Issue**: Shadow plane is not created if missing from GLB
- **Impact**: No shadows visible if shadow plane doesn't exist

### 3. **Material Texture Extraction** (MEDIUM PRIORITY)
- **Location**: `webExport.ts` lines 2161, 2226
- **Issue**: `originalMaterial.map` may not exist for GroundedSkybox
- **Impact**: GroundedSkybox may not have texture after material conversion

### 4. **Render Order** (MEDIUM PRIORITY)
- **Location**: `webExport.ts` shadow plane configuration
- **Issue**: Shadow plane renderOrder not explicitly set
- **Impact**: Shadows may appear above ground projection

### 5. **Shadow Map Update Timing** (LOW PRIORITY)
- **Location**: `webExport.ts` lines 2311-2321
- **Issue**: Shadow maps updated before GroundedSkybox is fully configured
- **Impact**: Shadows may not appear until next render

---

## RECOMMENDED FIXES

### Fix 1: Correct HDR Texture flipY
```typescript
// Line 2147 in webExport.ts
skyboxTexture.flipY = false; // Change from true to false
```

### Fix 2: Create Shadow Plane if Missing
```typescript
// After line 1687 in webExport.ts
if (!shadowPlane) {
  // Create shadow plane code (see section 4)
}
```

### Fix 3: Improve Material Texture Extraction
```typescript
// Lines 2161, 2226 in webExport.ts
const textureMap = originalMaterial.map || 
                   (originalMaterial as any).envMap || 
                   (groundProjectionSkybox as any).material?.map || 
                   null;
```

### Fix 4: Set Shadow Plane Render Order
```typescript
// After shadow plane creation/configuration
shadowPlane.renderOrder = 1; // Render after GroundedSkybox (renderOrder -1000)
```

### Fix 5: Force Shadow Map Update After GroundedSkybox
```typescript
// After GroundedSkybox is added and configured
renderer.shadowMap.needsUpdate = true;
renderer.shadowMap.autoUpdate = true;
renderer.render(scene, camera);
renderer.shadowMap.autoUpdate = false;
```

---

## TESTING CHECKLIST

- [ ] Ground projection shows HDR correctly (not white)
- [ ] Shadows appear on ground projection
- [ ] Shadow plane is created if missing from GLB
- [ ] Standard 360 HDR shows shadows
- [ ] Shadow plane is positioned correctly for ground projection
- [ ] Shadow plane is positioned correctly for standard HDR
- [ ] GroundedSkybox material conversion preserves texture
- [ ] Render order is correct (GroundedSkybox behind, shadow plane on top)
- [ ] Shadow maps update correctly after GroundedSkybox is added


















































