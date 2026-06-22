# Shader Editor Guide

Use the shader editor panel to experiment with lightweight GLSL effects without
leaving the viewer. The panel renders a separate Three.js scene on a floating
canvas and exposes live parameters via sliders.

## Opening the Panel

- Click the Shader icon/panel toggle in the viewer sidebar (the same flag is
  stored in `useAppStore().showShaderEditorPanel`).
- The panel docks on the left side and stacks with other floating panels using
  `usePanelStacking`.

## How It Works

- `ShaderEditorPanel.tsx` creates its own `THREE.WebGLRenderer`, scene, camera,
  and plane mesh when the panel is shown.
- The plane uses `createCineShaderStage()` so the shader fills a screen-like
  geometry with a vignette.
- A custom shader is built via `createShaderMaterial()`, which includes:
  - `iResolution`, `iTime`, `iMouse` uniforms (Shadertoy style).
  - User-tunable uniforms (`uSpeed`, `uIntensity`, `uColor`, `uRotation`,
    `uGlow`, `uVignette`).
- `requestAnimationFrame` drives the loop and updates `iTime` plus any sliders
  you change. Mouse movement over the panel updates `iMouse`.

## Controls & Parameters

| Parameter | Description |
| --------- | ----------- |
| **Speed** | Multiplier applied to time (`iTime * uSpeed`). Higher = faster animation. |
| **Intensity** | Scales the radial glow contribution. |
| **Color R/G/B** | Base glow color (RGB sliders). |
| **Rotation** | Rotational speed for the shader pattern. |
| **Glow** | Boosts the glow contribution before vignette. |
| **Vignette** | Controls how aggressively the edges darken. |

Sliders call `trackSliderInteraction` for analytics and immediately update
shader uniforms (`uniformsNeedUpdate = true`).

## Tips

- The shader runs on a dedicated canvas so it does not impact the main viewer.
- Use the panel drag handle to reposition it if it overlaps other UI.
- Hovering the canvas and dragging the mouse writes to `iMouse`, which you can
  use for custom shader tweaks (currently used for future expansions).
- The panel cleans up its renderer/scene when hidden, so leaving it open only
  when you need it saves GPU time.

## Related Files

- `src/components/ShaderEditorPanel.tsx` – UI + rendering loop + slider logic.
- `src/viewer/effects/CineShaderStage.ts` – returns a reusable “screen” mesh.
- `src/utils/sliderTracker.ts` – helper for logging slider interactions.


