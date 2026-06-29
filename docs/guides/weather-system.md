# Weather System GPU Cost Guide

This document summarizes the main GPU workloads in standalone weather mode and how quality presets affect them.

## Major GPU consumers

| System | Cost driver | Notes |
|--------|-------------|-------|
| **Dynamic Sky (iq mode)** | Fullscreen sky dome raymarch every frame | 32–96 steps/pixel depending on `weatherQuality`; adaptive reduction on Low/Medium |
| **CSM shadows** | Cascade count × shadow map resolution | Low: 1×512²; Medium: 2×1024²; High/Ultra: 3×2048² |
| **Post-processing** | Bloom, SSR, AO, tone mapping | Multiple fullscreen passes when enabled |
| **Particles (rain/snow)** | Point count × update frequency | Skipped entirely when intensity is 0; Low preset caps at 5k particles |
| **Path tracer** | Per-sample GPU path trace | Render loop stops when paused or max samples reached |
| **Streets GL iframe** | Separate WebGL context | Only runs in **City** or **Hybrid** render mode; paused when tab is hidden |

## Existing idle / visibility optimizations

- **Page Visibility**: render loop cancels when the tab is hidden; Streets GL iframe unloads (`about:blank`).
- **Idle pause**: when the camera is static, wind is off, and no rain/snow/particles animate, frames are not rendered until user input wakes the loop. CSM and static clouds do not force continuous redraw.
- **Path tracer**: viewer raster render is skipped while the path tracer owns the WebGL context.
- **Low weather + unlimited FPS**: automatically capped at 60 FPS when standalone weather is active.

## Quality preset (`weatherQuality`)

| Preset | iq raymarch steps | CSM cascades | CSM map size | Max pixel ratio | GPU preference |
|--------|-------------------|--------------|--------------|-----------------|--------------|
| Low | 32–48 (density-scaled) | 1 | 512 | 1.5 | `low-power` |
| Medium | 48–56 (density-scaled) | 2 | 1024 | 2.0 | default |
| High | 64–80 (fixed) | 3 | 2048 | store cap | default |
| Ultra | 64–96 (fixed) | 3 | 2048 | store cap | default |

**High** and **Ultra** keep full iq raymarch step counts regardless of cloud density to preserve visual quality.

### Estimated GPU savings (Low vs High, standalone weather)

| Optimization | Approx. savings |
|--------------|-----------------|
| Raymarch steps 32–48 vs 80 | ~40–60% sky shader cost |
| 1×512² CSM vs 3×2048² | ~94% shadow map memory & passes |
| Pixel ratio cap 1.5 vs 2+ | ~44% fill rate on retina |
| Idle pause (static camera) | ~100% when not interacting |
| Streets GL paused (Product mode) | Entire second WebGL context |

## Pixel ratio

Auto pixel ratio is capped by `maxPixelRatio` (default 2), further limited per weather tier (Low 1.5, Medium 2.0), and on very wide canvases so effective render width does not exceed ~3840 px (4K fill-rate protection).

## Cloud density slider (iq mode)

The **Cloud Density** slider (0–100%) and weather presets share one mapping via `iqCloudCoverage.ts`. The value is passed as the `coverage` uniform to the iq XslGRr sky shader.

| Slider | Preset reference | Visual intent | GPU behaviour |
|--------|------------------|---------------|---------------|
| **0%** | Clear | Blue sky, no volumetric clouds | Raymarch skipped (`coverage ≤ 0.004`) |
| **25%** | — | Light scattered clouds | High density cutoff (~0.62), narrow feather, reduced opacity scale |
| **75%** | Overcast | Grey overcast sky | Lower cutoff (~0.21), wider feather |
| **100%** | Stormy (0.9) | Dense storm ceiling | Cutoff → 0, max feather, boosted opacity scale |

### How coverage maps to density

Three separate controls work together (Horizon-style terminology):

1. **Coverage cutoff** — `smoothstep` threshold on the iq fBm field (`0.2 - p.y + 3×noise`). Lower cutoff = more sky area becomes cloud. Linear from 0.82 (clear) to 0.0 (storm).
2. **Feather width** — soft edge of each cloud puff. Grows from 0.07 at 25% to 0.16 at 100% so overcast reads solid, not billowy patches.
3. **Opacity scale** — extra raymarch alpha multiplier (`0.6 + 0.52 × coverage²`) so 100% feels like a storm ceiling, not just more puffs.

Density function shape follows iq Shadertoy XslGRr: four octaves of 3D value noise, height gradient on normalized cloud-band Y, world-space slab raymarch with path-length steps (full layer traversal even at horizon).

Presets use the same `cloudDensity` field: Clear 0, Foggy 0.35, Overcast 0.75, Stormy 0.9.

## Recommendations

1. Use **Low** weather quality on integrated GPUs or when the GPU runs hot.
2. Set **maxFPS** to 30–60 in Rendering settings for sustained sessions.
3. Disable SSR/AO/bloom in post-processing if GPU usage is still high.
4. Disable standalone weather when using Streets GL iframe overlay (two WebGL contexts when both are active in City/Hybrid mode).
5. Leave the camera idle after framing — the render loop pauses automatically when wind and effects are off.
6. Switch render mode to **Product** when Streets GL map is not needed — the iframe WebGL context stays unloaded.
