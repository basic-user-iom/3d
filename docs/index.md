# Documentation Index

Use this page to jump to the most relevant documentation without digging through
folders. Living guides stay under `docs/guides/`, while historical content sits
inside `docs/archive/`.

## Quick Guides

- [`guides/viewer-basics.md`](guides/viewer-basics.md) – run the app locally,
  understand supported formats, and troubleshoot common issues.
- [`guides/selection-and-gizmo.md`](guides/selection-and-gizmo.md) – marquee
  selection, pivot modes, and transform gizmo behavior.
- [`guides/streets-gl-integration.md`](guides/streets-gl-integration.md) – dev
  scripts, bridge architecture, and debugging tips for the Streets GL iframe.
- [`guides/path-tracer.md`](guides/path-tracer.md) – start/stop the path tracer,
  tune settings, and record high-quality frames.
- [`guides/shader-editor.md`](guides/shader-editor.md) – tweak the GLSL demo
  shader and learn how the floating panel works.
- [`guides/lighting-hdr.md`](guides/lighting-hdr.md) – manage directional
  lights, CSM shadows, HDR/ground projection, and **standalone weather** (offline
  sky, iq-style clouds, sun disk).
- [`guides/weather-system.md`](guides/weather-system.md) – standalone weather
  architecture, day/night, cloud presets, and iq reference comparison.
- [`guides/dev-workflow.md`](guides/dev-workflow.md) – contributor checklist
  (docs, tests, manual sanity).
- [`guides/desktop-windows.md`](guides/desktop-windows.md) – Windows desktop
  build, code signing, installer upgrades, and auto-update.
- [`guides/streets-gl-troubleshooting.md`](guides/streets-gl-troubleshooting.md)
  – diagnose iframe/bridge/server issues quickly.
- [`guides/testing-playbook.md`](guides/testing-playbook.md) – scripts +
  manual smoke tests to run before PRs.
- _Coming soon_: add new guides here when you document other systems (Streets
  GL sync, path tracer, shader tooling, etc.).

## Reference

- [`README.md`](../README.md) – concise project overview and scripts.
- [`docs/README.md`](README.md) – how the docs folder is organized plus upkeep
  steps.
- [`docs/DOCS_INVENTORY.md`](DOCS_INVENTORY.md) – policy for moving/retiring
  docs and instructions for future cleanup passes.
- [`docs/root-md-allowlist.json`](root-md-allowlist.json) – guardrail that keeps
  Markdown out of the repo root (should only list `README.md`).

## Archive

- [`docs/archive/README.md`](archive/README.md) – alphabetical list of every
  legacy folder plus migration notes.
- Each folder mirrors the original filename prefix. For example,
  `docs/archive/shadow/SHADOW_COMPARISON_ANALYSIS.md` contains the old shadow
  investigations.

## Adding New Material

1. Place living docs in `docs/guides/` and link them under **Quick Guides**.
2. Move retired root docs into `docs/archive/<prefix>/` and mention the new
   folder in the archive README.
3. Run `npm run docs:check` before committing.

