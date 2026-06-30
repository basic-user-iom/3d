# Lighting & HDR Helpers

This guide explains the unified lighting stack: sun/ambient lights, HDR/IBL, tone mapping,
weather presets, fog, and how they connect to CSM shadows. For shadow-specific tuning see
[`shadow-system.md`](shadow-system.md). For weather GPU tiers see
[`weather-system.md`](weather-system.md).

## Unified lighting architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Renderer (ViewerCanvas)                                        │
│  outputColorSpace: SRGBColorSpace                               │
│  toneMapping: ACESFilmicToneMapping                             │
│  toneMappingExposure: weather + HDR + golden-hour (lightUtils)  │
└─────────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌──────────────┐    ┌──────────────────┐    ┌─────────────────────┐
│ Sun light    │    │ AmbientLight     │    │ scene.environment   │
│ (isSun dir.) │    │ (fill, reduced   │    │ HDR equirect / PMREM│
│ + CSM shadow │    │  when HDR on)    │    │ (IBL reflections)   │
│   maps only  │    │                  │    │                     │
└──────────────┘    └──────────────────┘    └─────────────────────┘
         │                    │                    │
         │           ┌────────┴────────┐           │
         │           ▼                 │           │
         │    ┌──────────────┐         │           │
         │    │ LightProbe   │         │           │
         │    │ (HDR SH,     │         │           │
         │    │  replaces    │         │           │
         │    │  flat fill)  │         │           │
         │    └──────────────┘         │           │
         └────────────────────┴────────────────────┘
                              ▼
                    MeshStandardMaterial / Physical
                    + interior cavity dimming
                    + optional auto RectAreaLight fill
                    + optional SAO (cavityOcclusion)
```

### Branch modes

| Mode | Sun direct light | Shadows | Sky visual | Fog |
|------|------------------|---------|------------|-----|
| Standard (no weather) | `isSun` DirectionalLight | Per-light shadow maps | Optional HDR background | `sceneFog.ts` FogExp2 |
| Standalone weather | `isSun` light (illumination) | CSM cascade lights (intensity 0, shadow-only) | DynamicSky iq raymarch | AtmosphericPerspective |
| Streets GL overlay | Sun light hidden | Streets GL internal | DynamicSky box/LUT | Streets GL atmosphere |
| Path tracer | Baked from scene export | Path-traced | HDR / env | N/A (offline) |

Authoritative mode enum: `resolveLightingMode()` in `src/viewer/utils/lightingContext.ts`. See [`shadow-system.md`](shadow-system.md) for the full conflict matrix.

**Mutual exclusion (enforced in store):**

- `streetsGLIframeOverlay` + `enableStandaloneWeather` cannot both be true.
- `hdrGroundProjectionEnabled` + `enableStandaloneWeather` cannot both be true.

**Night split:** sky shader uses true below-horizon sun (`standaloneSkySunDirection`); scene
lights and CSM use clamped direction (`standaloneLightSunDirection`) so shadows stay stable.
See `lightUtils.ts`.

### Best-practice alignment

| Topic | Three.js guidance | Our implementation |
|-------|-------------------|-------------------|
| Key + fill | Directional sun + low Ambient/Hemisphere | Directional sun + AmbientLight; weather reduces ambient when HDR active |
| IBL | `scene.environment` + PMREM for roughness | Equirect HDR on `scene.environment` (webexport parity); PMREM stored for ground projection |
| Tone mapping | ACES + exposure for HDR→LDR | ACESFilmic; exposure from `computeSunLightingFromElevation` + weather + HDR boost |
| Color output | `renderer.outputColorSpace = SRGBColorSpace` | Set at viewer init |
| Fog + PBR | Match `scene.fog` color to horizon; enable `material.fog` | `sceneFog.ts`; sky meshes excluded via `userData` |
| CSM lights | Shadow casters should not duplicate direct light | **Fixed:** cascade lights at intensity 0; sun light provides illumination |

## Lighting Panel Overview

Open the **Lighting** panel from the toolbar to manage the built–in lighting
stack backed by `useAppStore` and `CSMShadowSystem`:

- **Directional Lights**: add/remove lights, toggle which one is marked as the
  “Sun”, adjust intensity/color, enable/disable shadows, and tune shadow map
  resolution per light.
- **Shadow Quality** presets map directly to the cascading shadow map helpers;
  the debug logs you see in tests (`[CSMShadowSystem] …`) are emitted from
  `src/viewer/effects/CSMShadowSystem.ts`.
- **Shadow Plane & Opacity**: enable the ground shadow matte, tint it, or make
  it semi-transparent.
- **Ambient Light** slider controls the global fill light (`ambientLight` stored
  in `ViewerCanvas`).

Tips:

1. Keep at least one directional light flagged as the Sun—the sun/moon and CSM
   helpers follow that flag.
2. Use the “Shadow Diagnostics” button (ViewerCanvas wiring) if shadows look
   wrong; it prints the same diagnostics as the vitest suite.

## HDR Workflow

The HDR panel lives on the right sidebar:

1. **Enable HDR** toggle – turns on `HDRSystem` and shows the current map.
2. **Load HDR** – paste a URL or upload an `.hdr/.exr` file. The original
   equirectangular texture is kept around so the path tracer can access it
   (see `PathTracerDemo.setupEnvironment()`).
3. **Intensity & Rotation** – adjust exposure plus azimuth/elevation to align
   reflections with the scene.
4. **Ground Projection** – creates the Grounded Skybox dome that receives real
   shadows. When enabled, the path tracer automatically converts the dome
   material to PBR so shadows show up in offline renders.
5. **Background Visibility** – toggle whether the HDR is visible in the viewer
   while still providing lighting/reflections.

### Matching HDR + Lights

- Set the HDR rotation so the sun in the environment matches the Sun
  directional light; otherwise shadows won’t line up.
- When HDR is enabled, ambient fill is automatically reduced (~35–65% of weather
  value) so IBL does not wash out shadows. Keep the ambient slider moderate.
- If you want HDR-only lighting, disable all directional lights but leave the
  ambient slider around 0.35–0.5 to keep interiors readable.

## Exterior vs interior (without engine rewrite)

| Technique | Status | Notes |
|-----------|--------|-------|
| HDR sun + reduced ambient | Implemented | Ambient ×0.15–0.65 when `scene.environment` set |
| HDR SH light probe (exterior) | **Implemented** | `IndirectLightingSystem` — `LightProbeGenerator.fromCubeRenderTarget` on HDR PMREM; further reduces flat ambient |
| Cavity material dimming | Implemented | `enhanceInternalShadows` — envMap ×0.12 on interior meshes |
| Auto interior RectAreaLight fill | **Implemented** | `interiorFillLight.ts` — soft fill when ≥2 interior-tagged meshes, no shadows |
| `userData.lightingZone` tags | Implemented | `'interior'` / `'exterior'` + render layers 0/1 |
| Per-zone LightProbeGrid (Sponza) | Future | Requires three.js `LightProbeGridWebGL` (dev branch); see below |
| Light portals | Path tracer only | Real-time portals need WebGPU or RT |
| RectAreaLight interiors (manual) | Partial | Supported in Lighting panel; no shadows |
| Selective sun via light layers | **Not in WebGL** | Use material dimming + CSM instead |

### Sponza light probe volume vs our stack

The official [webgl_lightprobes_sponza](https://threejs.org/examples/#webgl_lightprobes_sponza) example (three.js dev) differs from our viewer in several important ways:

| Aspect | Sponza example | Our viewer (v3.18) |
|--------|----------------|-------------------|
| Indirect GI | `LightProbeGridWebGL` — 3D grid (~10×7×7 probes), GPU bake with bounce passes | Single global `LightProbe` from HDR equirect (SH diffuse) |
| Zone blending | Trilinear interpolation between probes as camera moves | **Not available** in r181 — one scene probe only; interiors use cavity dimming + optional auto `RectAreaLight` |
| Direct sun | `DirectionalLight` intensity ~100, PCF shadows, separate from GI | `isSun` directional + CSM cascades (shadow-only lights at intensity 0) |
| Sky / env | `Sky` shader dome — no `scene.environment` IBL | HDR equirect on `scene.environment` for specular + split-sum diffuse |
| Embedded lights | Stripped from GLTF before bake | User lights + sun preserved |
| Interior darkness | Baked low irradiance in courtyard vs bright exterior probes | `enhanceInternalShadows` + `userData.lightingZone = 'interior'` |

**PMREM env vs light probe:** `scene.environment` (PMREM/equirect) drives **specular** reflections and split-sum **diffuse** on `MeshStandardMaterial`. A `LightProbe` stores **low-frequency diffuse irradiance** (L2 spherical harmonics). Using both is intentional here: the probe replaces flat `AmbientLight` fill with directionally varying diffuse; `scene.environment` keeps glossy reflections. Avoid raising ambient slider when HDR + probe are active.

**Physical lights reference:** Shadow defaults align with [webgl_lights_physical](https://threejs.org/examples/#webgl_lights_physical) via `physicalShadowSettings.ts` — map size 2048, bias −0.0001, normalBias 0.02, PCF radius 1 for legacy sun maps; CSM uses shader bias −0.0025 and radius 0 for crisp cascades. Use the Lighting panel **Physical lighting** preset to apply.

### Gap analysis (port feasibility)

| Technique | Sponza | Our impl | Can we port? |
|-----------|--------|----------|--------------|
| SH diffuse probes per room/zone | `LightProbeGrid` bake | Single HDR probe + interior dimming | **Partial** — full grid needs three.js dev / WebGPU bake |
| Probe blending at boundaries | Grid trilinear interpolation | None (global probe) | **No** on r181 without custom shaders |
| Direct sun + probe indirect | Yes — sun lights, grid provides GI | Yes — sun/CSM + HDR probe + cavity dim | **Yes** (current) |
| PMREM env vs light probe | Grid replaces env diffuse; separate sky | Env for specular; probe for ambient replacement | **Yes** with tuned ambient reduction |

### Future work: LightProbeGrid path

When upgrading to three.js with `LightProbeGridWebGL`:

1. After model load, compute model AABB and place a probe grid (similar to Sponza GUI defaults).
2. Bake with `grid.bake(renderer, scene, { cubemapSize: 32, bounces: 1 })`.
3. Remove or reduce `scene.environment` diffuse contribution to avoid double-counting.
4. Expose grid resolution in an advanced Lighting panel section.

Until then, tag interior meshes, enable **Darken interior cavities** (Weather panel), and rely on HDR probe + auto fill light.

**Too bright interior:** tag mesh `userData.lightingZone = 'interior'`, reload model or call `reapplyInteriorCavityEnhancements`, enable SAO (medium+ weather + post-processing).

**Double shadows:** check only one shadow authority is active (see conflict matrix in shadow-system guide); disable sun `castShadow` when CSM is on.

## Physical lights comparison (`webgl_lights_physical`)

Reference: [three.js webgl_lights_physical](https://threejs.org/examples/#webgl_lights_physical)

The official example demonstrates **physical light units** (point `power` in lumens, hemisphere irradiance in lux, `decay = 2`) with **Reinhard** tone mapping and exposure `pow(0.68, 5)`. It uses a **PointLight** shadow with Three.js default bias — not a directional sun. For outdoor sun contact shadows we align with the same principles plus directional shadow tutorials: tight orthographic frustum, `PCFSoftShadowMap`, small bias, moderate normal bias.

| Aspect | `webgl_lights_physical` | Our standalone weather | Gap (before → after) |
|--------|-------------------------|------------------------|----------------------|
| Light model | Physical units (lumens/lux), decay 2 | Elevation-based sun + ambient (`lightUtils.ts`); point/spot support `power`/`decay` | Unitless sun — intentional for art direction |
| Shadow technique | Single PointLight shadow map | CSM cascade lights (intensity 0) + custom shader | CSM needed for large scenes; sharper bias tuning added |
| Map resolution | Default (512) | Weather tier: 512–2048 (`weatherGpuUtils`) | Tier-capped for GPU thermal limits — unchanged |
| Bias / normalBias | Defaults (0) on point light | CSM shader + depth pass constants in `physicalShadowSettings.ts` | Was `-0.003` / `0.02` depth bias → **`-0.0025` / `0.005`** |
| Shadow camera frustum | Small indoor scene (~20 m) | Was loose multipliers → **`computeTightShadowFrustum`** at ≤30 m scale |
| Material roughness | 0.5–0.8 MeshStandard | GLTF import defaults + Material panel | Per-asset |
| Exposure / tone mapping | Reinhard, exposure ~0.15 | ACES Filmic + weather/HDR exposure | Different look — ACES kept for HDR pipeline |
| Shadow radius / softness | Implicit PCF | Was `radius=3` sun, CSM `radius=2` → **`radius=1` standard, `0` CSM** |

### When to use standard vs CSM shadows

| Mode | Use when | Shadow authority |
|------|----------|------------------|
| **Standard** (no standalone weather) | Single product shots, cars, interiors, Lighting panel shadow map slider | Sun `DirectionalLight.castShadow` + `updateShadowCameraBounds` |
| **CSM** (standalone weather on) | Large outdoor scenes, moving camera, sun low on horizon | `CSMShadowSystem` cascade lights; sun light illuminates only |
| **Streets GL overlay** | Full map atmosphere | Streets GL internal shadows; Three.js sun hidden |

GPU thermal tiers (`weatherQuality`: low/medium/high/ultra) still cap CSM resolution and pixel ratio — see [`weather-system.md`](weather-system.md).

### Physical lighting preset

In the **Lighting** panel → **Shadow Quality**, click **Apply Physical Lighting Preset** to set 2048 map size, adaptive bias, and sharp CSM radius. Implementation: `getPhysicalLightingPresetValues()` in `src/viewer/utils/physicalShadowSettings.ts`.

### Verify crisp contact shadows (car, low sun)

1. Load a car GLB; enable **Standalone Weather**.
2. Set time of day to ~7:00 or ~17:00 (low sun).
3. Orbit near wheels/body — contact shadow should hug geometry without a wide gap.
4. Compare with standard mode (weather off): shadows should be similarly crisp with tighter frustum.
5. Optional: open [webgl_lights_physical](https://threejs.org/examples/#webgl_lights_physical) side-by-side for indoor point-light reference.

## Standalone Weather (offline sky + clouds)

Enable **Standalone Weather** in the Weather panel (`WeatherPanel.tsx`) when you
want CSM shadows, a dynamic sky dome, and volumetric clouds **without** the
Streets GL iframe overlay. See [`docs/guides/weather-system.md`](weather-system.md)
for architecture, day/night behavior, presets, and reference comparison.

- **Sun** – rendered in the iq-style sky shader (Inigo Quilez XslGRr raymarch);
  there is no separate sun mesh (avoids dark-orb artifacts).
- **Clouds** – integrated into the same sky shader when **Cloud density** &gt; 0.
  Enabling standalone weather sets a modest default density (~0.45) if clouds
  were off; use weather presets (Clear / Overcast / Foggy / Stormy) to tune.
- **Night** – sky uses true below-horizon sun direction for dark sky, stars, and
  moon; scene lights use a clamped sun direction so CSM shadows stay stable.
- **Streets GL mode** – keeps LUT atmosphere + Worley box clouds (`cloudRenderingMode: box`).
- **Standalone mode** – iq direction-space raymarch on the sky dome (`cloudRenderingMode: iq`).
- **Conflicts** – disable HDR ground projection while standalone weather is on;
  the store auto-disables it. HDR background textures can still provide
  reflections if HDR is enabled.

The sky dome follows the camera and requires an extended camera far plane
(`dynamicSkyCamera.ts`); sphere radius is ~9k world units. Clouds use a
camera-relative direction-space raymarching (see weather-system guide).

## Path Tracer Considerations

- The new `PathTracerDemo` (see `docs/guides/path-tracer.md`) pulls the original
  HDR texture from `HDRSystem`. If you see `[PathTracerDemo] ⚠️ scene.background
  is null`, reload the HDR or disable/enable it once so the original texture is
  cached again.
- When Ground Projection is on, the path tracer converts the Grounded Skybox
  material to a semi-transparent PBR shader so it can both receive shadows and
  let environment light pass through. Exposure is automatically boosted (2.5+)
  to compensate for the extra geometry.
- Undoing lighting/HDR tweaks now triggers a scene revision, so the viewer and
  panels stay in sync.

## Troubleshooting Checklist

| Symptom | Fix |
| ------- | --- |
| Shadows missing after toggling panels | Reopen Lighting panel and reapply “Shadow Quality” or click “Run Diagnostics” to reinitialize CSM. |
| Double shadows on terrain | SSS + CSM — lower SSS intensity in Rendering panel | 
| Interior too bright with HDR on | Tag `userData.lightingZone = 'interior'`; enable standalone weather SAO |
| Shadow map size slider dead | Standalone weather on — use Weather quality preset |
| HDR looks washed out | Lower `hdrIntensity` or switch tone mapping to `ACES` with exposure ~1.0–1.2. |
| Ground projection too bright/dark | Adjust “Ground Projection Radius/Height” and the shadow plane opacity simultaneously. |
| Path tracer stuck white | Ensure HDR is enabled, `scene.background` isn’t null, and the path tracer panel actually shows “Running” (otherwise `renderFrame()` is never invoked). |

## Related Files

- `src/components/LightingPanel.tsx` – UI hooks for lights/shadows.
- `src/viewer/utils/lightingContext.ts` – mode enum, conflict detection, shadow guards.
- `src/viewer/utils/physicalShadowSettings.ts` – webgl_lights_physical shadow defaults.
- `src/viewer/effects/IndirectLightingSystem.ts` – HDR-derived `LightProbe` (SH diffuse).
- `src/utils/interiorFillLight.ts` – auto `RectAreaLight` for tagged interiors.
- `src/utils/lightProbeUtils.ts` – SH scaling and ambient reduction helpers.
- `src/viewer/effects/CSMShadowSystem.ts` – cascading shadow maps.
- `src/viewer/effects/HDRSystem.ts` – HDR loading, PMREM generation, ground projection dome.
- `src/components/PathTracerDemoPanel.tsx` & `src/viewer/pathTracer/PathTracerDemo.ts` – how HDR + lighting feed the progressive renderer.


