# Lighting & HDR Helpers

This guide explains how to use the Lighting panel, multiple directional lights,
and the HDR system (including ground projection). It ties together the key UI
panels and the underlying helpers (`LightingPanel.tsx`, `HDRSystem.ts`, CSM
shadows) so you know what to tweak for photorealistic scenes.

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
- If you want HDR-only lighting, disable all directional lights but leave the
  ambient slider around 0.8–1.0 to keep interiors readable.

## Standalone Weather (offline sky + clouds)

Enable **Standalone Weather** in the Weather panel (`WeatherPanel.tsx`) when you
want CSM shadows, a dynamic sky dome, and volumetric clouds **without** the
Streets GL iframe overlay:

- **Sun** – rendered in the iq-style sky shader (Inigo Quilez XslGRr raymarch);
  there is no separate sun mesh (avoids dark-orb artifacts).
- **Clouds** – integrated into the same sky shader when **Cloud density** &gt; 0.
  Enabling standalone weather sets a modest default density (~0.45) if clouds
  were off; use weather presets (Clear / Overcast / Foggy / Stormy) to tune.
- **Streets GL mode** – keeps LUT atmosphere + Worley box clouds (`cloudRenderingMode: box`).
- **Conflicts** – disable HDR ground projection while standalone weather is on;
  the store auto-disables it. HDR background textures can still provide
  reflections if HDR is enabled.

The sky dome follows the camera and requires an extended camera far plane
(`dynamicSkyCamera.ts`); sphere radius is ~9k world units.

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


