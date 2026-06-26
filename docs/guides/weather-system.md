# Weather System GPU Cost Guide

This document summarizes the main GPU workloads in standalone weather mode and how quality presets affect them.

## Major GPU consumers

| System | Cost driver | Notes |
|--------|-------------|-------|
| **Dynamic Sky (iq mode)** | Fullscreen sky dome raymarch every frame | 48–88 steps/pixel depending on `weatherQuality`; adaptive reduction on Low/Medium when cloud coverage is sparse |
| **CSM shadows** | 3 cascades × shadow map resolution | 1024² per cascade on **Low**, 2048² on Medium/High/Ultra (~12 MB vs ~48 MB GPU) |
| **Post-processing** | Bloom, SSR, AO, tone mapping | Multiple fullscreen passes when enabled |
| **Particles (rain/snow)** | Point count × update frequency | Skipped entirely when intensity is 0; Low preset caps at 5k particles |
| **Path tracer** | Per-sample GPU path trace | Render loop stops when paused or max samples reached |
| **Streets GL iframe** | Separate WebGL context | Runs its own render loop when overlay is active |

## Existing idle / visibility optimizations

- **Page Visibility**: render loop cancels when the tab is hidden.
- **Idle pause**: when the camera is static and nothing is animating, frames are not rendered until user input or scene change wakes the loop.
- **Path tracer**: viewer raster render is skipped while the path tracer owns the WebGL context.

## Quality preset (`weatherQuality`)

| Preset | iq raymarch steps | CSM map size | Particle cap |
|--------|-------------------|--------------|--------------|
| Low | 48 (density-scaled) | 1024 | 5,000 |
| Medium | 56 (density-scaled) | 2048 | 10,000 |
| High | 72 (fixed) | 2048 | 15,000 |
| Ultra | 88 (fixed) | 2048 | 20,000 |

**High** and **Ultra** keep full iq raymarch step counts regardless of cloud density to preserve visual quality.

## Pixel ratio

Auto pixel ratio is capped by `maxPixelRatio` (default 2) and further limited on very wide canvases so effective render width does not exceed ~3840 px (4K fill-rate protection).

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

1. Use **Low** weather quality on integrated GPUs or when Streets GL + weather run together.
2. Disable SSR/AO/bloom in post-processing if GPU usage is still high.
3. Set **maxFPS** to 30–60 in settings to cap frame rate when full quality is not needed.
4. Disable standalone weather when using Streets GL iframe overlay (two WebGL contexts).
