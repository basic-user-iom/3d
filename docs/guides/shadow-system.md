# Shadow System Guide

Standalone weather uses a **Streets GL–style Cascaded Shadow Map (CSM)** port (`StreetsGLCSM` + `CSMShadowSystem`), not the Three.js addon `CSM.js`. The renderer still uses `PCFSoftShadowMap` for the depth pass; materials sample cascades via injected GLSL.

## Architecture

| Layer | File | Role |
|-------|------|------|
| Coordinator | `CSMShadowSystem.ts` | Init, quality tiers, material setup, sun sync |
| CSM core | `StreetsGLCSM.ts` | Practical splits (λ=0.5), cascade cameras, shader uniforms |
| Viewer | `ViewerCanvas.tsx` | `renderer.shadowMap`, per-frame `update()`, weather branch |
| Interior | `enhanceInternalShadows.ts` | Cavity dimming, double-sided interiors, cast/receive flags |
| Cavity AO | `cavityOcclusion.ts` | Auto SAO on medium+ weather when post-processing is on |
| GPU tiers | `weatherGpuUtils.ts` | Cascade count, map size, max far per `weatherQuality` |
| Sun | `lightUtils.ts` | Sun travel direction, horizon clamp, low-sun PBR colors |

## How CSM works

1. **Splits** — Practical split scheme (GPU Gems 3 Ch. 10): blend of logarithmic + uniform with λ=0.5.
2. **Cascade cameras** — Orthographic frustum per slice; texel snapping on a shared grid to reduce seams.
3. **Shadow pass** — One `DirectionalLight` per cascade; Three.js renders depth maps (`PCFSoftShadowMap`).
4. **Sampling** — `onBeforeCompile` injects `getCSMShadow()` into standard materials; selects cascade by view depth, PCF optional via `CSMShadowRadius`.
5. **Per frame** — `csmShadowSystem.update()` recalculates cascade matrices **and** refreshes mutable uniform buffers (matrices, splits, bias).

## Quality tiers (`weatherQuality`)

Aligned with [weather-system.md](./weather-system.md):

| Preset | Cascades | Map size | Max far | Approx. GPU vs High |
|--------|----------|----------|---------|---------------------|
| Low | 1 | 512² | 3000 m | ~3% |
| Medium | 2 | 1024² | 4000 m | ~11% |
| High | 3 | 2048² | 5000 m | 100% |
| Ultra | 3 | 2048² | 5000 m | 100% |

`LightingPanel` shadow quality selectors use the same tiers (not legacy 4096 px presets).

## Bias model (Two.js vs Streets GL)

| Parameter | Three.js docs / best practice | Our value | Where |
|-----------|------------------------------|-----------|-------|
| `renderer.shadowMap.type` | `PCFSoftShadowMap` | `PCFSoftShadowMap` | `ViewerCanvas` |
| Light `shadow.bias` | ≈ −0.0001 … −0.001 | −0.0002 | CSM depth pass (`CSM_LIGHT_SHADOW_BIAS`) |
| Light `shadow.normalBias` | 0.01–0.05 (higher at low sun) | 0.02 | CSM depth pass |
| CSM shader `CSMBias` | Streets GL: small base × cascade size | −0.003 / 0.002 × top | Fragment sampling |
| `shadow.radius` | 1–3 for soft PCF | User `csmShadowRadius` (default 2) | CSM + renderer |

**Important:** Interior enhancement (`enhanceInternalShadows`) skips lights tagged `userData.isCSMLight` so it does not override CSM bias.

## Interior / cavity handling

- **Shadow flags** — Imported meshes get `castShadow` / `receiveShadow`; interior candidates are double-sided.
- **Cavity dimming** — Reduces `envMapIntensity`, albedo, emissive on named/spatial interior meshes (engine bay, exhaust, etc.).
- **SAO** — Auto-enabled on medium+ standalone weather when post-processing is on (`cavityOcclusion.ts`).
- **Hide pass** — Only explicit interior structural names; aborted if >30% of meshes would hide.

Low sun **color** (metallic PBR not crushed to black) is handled in `computeSunLightingFromElevation()` (`lightUtils.ts`), not the shadow map.

## Standalone weather interaction

- CSM is created when `enableStandaloneWeather` is true and Streets GL iframe overlay is off.
- **Illumination vs shadows:** the user `isSun` DirectionalLight provides direct lighting;
  CSM cascade DirectionalLights use `intensity = 0` and only render shadow depth maps
  (prevents N× sun overexposure). Logical sun intensity is stored in CSM shader uniforms.
- Sun direction: `sunSkyDirectionToLightTravelDirection(standaloneLightSunDirection(...))` each lighting tick.
- `applyWeatherQuality()` runs when `weatherQuality` changes; preserves sun direction/intensity/color across reinit.
- Render loop calls `csmShadowSystem.update()` before `renderer.render()` (also on idle wake when camera moves).

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| No shadows | `castShadow`/`receiveShadow` false, or CSM not init | Enable shadows; toggle standalone weather; check console for CSM init |
| Shadow acne (stripes) | Low `normalBias` at grazing sun | Raise weather quality; tune CSM shader normal bias in Lighting panel |
| Peter-panning (floating shadow) | `normalBias` too high | Lower shader normal bias; do not apply interior bias overrides to CSM lights |
| Cascade seams | Texel misalignment | Should be handled by shared-grid snap; report if visible |
| Shadows stale when moving | Uniforms not updating | Fixed: mutable buffers refreshed in `update()` |
| GPU hot | 3×2048² maps + iq sky | Use **Low** weather quality; cap FPS |
| Interior too bright | HDR fill in cavities | Interior dimming + SAO; tag meshes `userData.interior` |
| Streets GL + weather conflict | Two sun systems | Overlay auto-disables standalone weather |

## Path tracer

Path tracer uses separate `ShadowCatcherMaterial` — not CSM. CSM is raster/standalone-weather only.

## References

- [Lighting & HDR architecture](./lighting-hdr.md) — sun, ambient, HDR, tone mapping, weather
- [Weather GPU tiers](./weather-system.md) — quality presets aligned with CSM
- [Three.js LightShadow](https://threejs.org/docs/pages/LightShadow.html) — bias, normalBias, mapSize
- [Three.js CSM addon](https://threejs.org/docs/pages/CSM.html) — practical splits, `update()` / `updateFrustums()`
- [GPU Gems 3 Ch. 10](https://developer.nvidia.com/gpugems/GPUGems3/gpugems3_ch10.html) — cascade split schemes
- Streets GL reference: `streets-gl-alt/src/app/render/CSM.ts`
