# 3D Model Viewer

Modern, client-side 3D model viewer built with React, Vite, and Three.js. Load
GLTF/GLB/FBX/OBJ/etc., inspect them with orbit controls, and toggle rendering
helpers—all in the browser.

## Quick Start

```bash
npm install
# Optional: copy .env.example to .env and add API tokens
npm run dev
# http://localhost:3000
```

Need the full setup guide (formats, decoders, troubleshooting)? See
[`docs/guides/viewer-basics.md`](docs/guides/viewer-basics.md).

## Preview

![Viewer marquee selection preview](edgesplit-demo-screenshot-1.png)

## Key Scripts

| Script | Purpose |
| ------ | ------- |
| `npm run dev` | Starts the viewer (Vite) plus the managed Streets GL server |
| `npm run dev:full` | Starts bug server + Streets GL + viewer |
| `npm run desktop:dev` | Opens the Electron shell against the local Vite app |
| `npm run build` | Production build into `dist/` |
| `npm run typecheck` | App-focused TypeScript validation for the shipped viewer |
| `npm run desktop:dist` | Builds the viewer, bundled Streets GL assets, and Windows desktop artifacts |
| `npm run desktop:dist:publish` | Same as above, then publishes to GitHub Releases (needs `GH_TOKEN`) |
| `npm run preview` | Serve the compiled build locally |
| `npm run docs:check` | Ensures no stray Markdown files live in the repo root |

## Documentation

- [`docs/index.md`](docs/index.md) – one-stop index of guides + archives
- [`docs/README.md`](docs/README.md) – documentation hub and folder structure
- Guides:
  - [`docs/guides/viewer-basics.md`](docs/guides/viewer-basics.md) – full setup & usage
  - [`docs/guides/selection-and-gizmo.md`](docs/guides/selection-and-gizmo.md) – marquee, pivot, gizmo
  - [`docs/guides/streets-gl-integration.md`](docs/guides/streets-gl-integration.md) – dev-server workflow
  - [`docs/guides/path-tracer.md`](docs/guides/path-tracer.md) – GPU path tracer controls
  - [`docs/guides/lighting-hdr.md`](docs/guides/lighting-hdr.md) – lighting panel + HDR helpers + standalone weather
  - [`docs/guides/weather-system.md`](docs/guides/weather-system.md) – standalone weather, clouds, day/night
  - [`docs/guides/shader-editor.md`](docs/guides/shader-editor.md) – GLSL demo panel
  - [`docs/guides/dev-workflow.md`](docs/guides/dev-workflow.md) – lint/test/docs checklist
  - [`docs/guides/desktop-windows.md`](docs/guides/desktop-windows.md) – Windows installer, signing, and updates
- `docs/archive/*` – historical investigations, now grouped by filename prefix

## Tech Stack

- React 19 + Vite 7 for the UI and dev tooling
- Three.js 0.181 for rendering, plus custom pivot/selection/gizmo utilities
- Zustand for app state

## Contributing

1. Fork or clone the repo
2. `npm install`
3. Make changes + run `npm run typecheck`, `npm run test -- --run`, and `npm run docs:check` as applicable
4. Use `npm run desktop:dist` when you need a Windows beta package
5. Open a pull request

## License

MIT — see [LICENSE](LICENSE).

