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

## Recommendations

1. Use **Low** weather quality on integrated GPUs or when Streets GL + weather run together.
2. Disable SSR/AO/bloom in post-processing if GPU usage is still high.
3. Set **maxFPS** to 30–60 in settings to cap frame rate when full quality is not needed.
4. Disable standalone weather when using Streets GL iframe overlay (two WebGL contexts).
