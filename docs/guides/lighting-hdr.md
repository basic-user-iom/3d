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
         └────────────────────┴────────────────────┘
                              ▼
                    MeshStandardMaterial / Physical
                    + interior cavity dimming
                    + optional SAO (cavityOcclusion)
```

### Branch modes

| Mode | Sun direct light | Shadows | Sky visual | Fog |
|------|------------------|---------|------------|-----|
| Standard (no weather) | `isSun` DirectionalLight | Per-light shadow maps | Optional HDR background | `sceneFog.ts` FogExp2 |
| Standalone weather | `isSun` light (illumination) | CSM cascade lights (intensity 0, shadow-only) | DynamicSky iq raymarch | AtmosphericPerspective |
| Streets GL overlay | Sun light hidden | Streets GL internal | DynamicSky box/LUT | Streets GL atmosphere |

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
| HDR looks washed out | Lower `hdrIntensity` or switch tone mapping to `ACES` with exposure ~1.0–1.2. |
| Ground projection too bright/dark | Adjust “Ground Projection Radius/Height” and the shadow plane opacity simultaneously. |
| Path tracer stuck white | Ensure HDR is enabled, `scene.background` isn’t null, and the path tracer panel actually shows “Running” (otherwise `renderFrame()` is never invoked). |

## Related Files

- `src/components/LightingPanel.tsx` – UI hooks for lights/shadows.
- `src/viewer/effects/CSMShadowSystem.ts` – cascading shadow maps.
- `src/viewer/effects/HDRSystem.ts` – HDR loading, PMREM generation, ground projection dome.
- `src/components/PathTracerDemoPanel.tsx` & `src/viewer/pathTracer/PathTracerDemo.ts` – how HDR + lighting feed the progressive renderer.


