# Standalone Weather System

This guide documents the **offline weather stack** used when **Standalone Weather** is enabled in the Weather panel. It covers architecture, day/night behavior, cloud presets, and how our iq-style sky compares to reference shaders.

## Architecture

When standalone weather is on (`enableStandaloneWeather` in `useAppStore`):

| Layer | Implementation | Notes |
| ----- | -------------- | ----- |
| Sky dome | `DynamicSky` + `IqCloudSkyShader.ts` | Camera-centered 9k sphere (`dynamicSkyCamera.ts`) |
| Clouds | iq XslGRr volumetric raymarch | Integrated in sky fragment shader (`cloudRenderingMode: 'iq'`) |
| Sun disk | Shader-only (no sun mesh) | Avoids dark-orb artifacts |
| Moon | `SunMoonSystem` mesh + shader moon glow | Visible 18:00–06:00 |
| Stars | Procedural in iq shader | Appear when sun below horizon |
| Shadows | `CSMShadowSystem` | 3 cascades, 2048² maps |
| Fog | `AtmosphericPerspective` | Owned by standalone branch when active |
| Lighting | Directional sun + ambient | Sun direction clamped above horizon for stable CSM |

Streets GL mode uses LUT atmosphere + Worley box clouds (`cloudRenderingMode: 'box'`) instead.

### Sun direction split

Two directions are used in standalone mode:

- **Sky sun** (`standaloneSkySunDirection`) — true elevation from the 24h solar arc, including below-horizon night. Drives sky gradient, clouds, moon, stars.
- **Light sun** (`standaloneLightSunDirection`) — clamped above the horizon (`STANDALONE_MIN_SUN_ELEVATION_Y`). Drives CSM, directional lights, and water reflections so shadows stay stable at night.

## Day / Night

Time of day is **0–24 hours** on the Weather panel slider.

| Hour | Sun elevation | Sky | Lighting |
| ---- | ------------- | --- | -------- |
| 6 | Sunrise (0) | Warm twilight gradient | Ramp-up |
| 12 | Zenith | Bright blue iq gradient | Full sun + ambient |
| 18 | Sunset (0) | Orange twilight | Ramp-down |
| 0 | Nadir (below horizon) | Dark blue + stars + moon | Low sun (0.1) + dim ambient (0.2) |

Solar path uses a continuous 24h sine arc (`timeOfDayToSkyAngles` in `lightUtils.ts`).

At night:

- Sky shader darkens via `iqSkyGradient` night mix and `dayFactor`
- Clouds stay visible but dimmer (`dayFactor` scales cloud lighting)
- Moon mesh shown opposite the sky sun direction
- Optional procedural stars when `sunElev < -0.04`
- Scene fog tint shifts to `#0a1020` when elevation &lt; 0

## Cloud Presets

Presets are defined in `weatherPresets.ts` and applied via the Weather panel:

| Preset | `cloudDensity` | Character |
| ------ | -------------- | --------- |
| Clear | 0 | No volumetric clouds |
| Overcast | 0.75 | Dense cover — primary test preset |
| Foggy | 0.35 | Light clouds + heavy fog |
| Stormy | 0.9 | Dark, windy, rainy |

Enabling standalone weather sets default `cloudDensity` to **0.45** if clouds were off.

### Cloud band

Clouds render in a **camera-relative Y slab** (`iqCloudBandY`):

- Base: `cameraY + 350` world units
- Top: base + 3800 units
- Horizontal noise uses **camera-relative XZ** so patterns stay stable as the dome follows the camera

Raymarch uses **Y-slab intersection only** (infinite XZ). A finite axis-aligned box breaks horizon rays (`tFar <= tNear`) and was the root cause of invisible clouds away from zenith.

## Reference Comparison

| Feature | iq XslGRr / docs | Our implementation | Gap (before fix) | Status |
| ------- | ---------------- | -------------------- | ---------------- | ------ |
| 3D value noise + fBm | 4 octaves, `d = 0.2 - p.y` | Same formula in `mapDensity` | — | Match |
| Coverage threshold | None (always cloudy) | `smoothstep` from UI `cloudDensity` | Intentional UI control | OK |
| Raymarch stepping | `max(0.1, 0.025*t)` | Layer-scaled steps through Y slab | Step sizing tuned for 9k dome | OK |
| Light scatter | Directional derivative | Same `dif` hack | — | Match |
| Sky gradient | Analytic blue + sun glare | `iqSkyGradient` + sun/moon disks | Night was clamped to day | Fixed |
| Cloud composite | `mix(sky, cloud, alpha)` | Same | Horizon AABB bug | Fixed |
| Sun below horizon | N/A (fixed sun) | Full 24h arc + night sky | Clamped to horizon | Fixed |
| Stars / moon | Other Shadertoys (e.g. stilltravelling) | Procedural stars + moon disk + mesh | Missing | Added |

References:

- [iq Clouds — Shadertoy XslGRr](https://www.shadertoy.com/view/XslGRr)
- [iq articles index](https://iquilezles.org/articles/)
- Local copy: `.XslGRr_clouds.txt` in repo root

## Troubleshooting

| Symptom | Check |
| ------- | ----- |
| No clouds except at zenith | Ensure Y-slab raymarch (not finite XZ box); verify `cloudDensity > 0` |
| Sky still bright at midnight | Sky must receive unclamped `skySunDir`; disable HDR background override |
| Moon missing | `timeOfDay` outside 6–18; `SunMoonSystem` re-adds mesh at night |
| Shadows wrong at night | Expected — light sun is clamped; CSM uses twilight-like direction |
| Dome clipped | Camera `far` must be ≥ 13500 (`activateDynamicSkyCamera`) |

## Related Files

- `src/viewer/effects/IqCloudSkyShader.ts` — iq sky + cloud fragment shader
- `src/viewer/effects/DynamicSky.ts` — dome mesh, uniforms, per-frame band update
- `src/viewer/ViewerCanvas.tsx` — standalone weather orchestration
- `src/viewer/utils/lightUtils.ts` — solar arc, sky vs light sun split
- `src/components/WeatherPanel.tsx` — UI controls and presets
- `docs/guides/lighting-hdr.md` — HDR conflicts and lighting panel overview
