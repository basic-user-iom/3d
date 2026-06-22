# Dev Workflow Checklist

This is the day-to-day checklist for contributing to the viewer. It captures the
commands and sanity checks we expect before opening a PR.

## 1. Environment Setup

```bash
npm install
```

Optional but useful:

- `npm run dev` – starts the viewer plus the managed Streets GL iframe.
- `npm run dev:full` – also boots the bug server (port 3001) if you’re working
  on proxy/streets integration.

## 2. While Developing

- **Docs stay in `docs/`** – write new guides under `docs/guides/` and run
  `npm run docs:check` if you touch Markdown. The allowlist only permits
  `README.md` in the repo root, while CI enforces that new root Markdown files
  are explicitly allow-listed.
- **Undo/pivot changes** – the undo stack now bumps a `sceneRevision`, so as
  long as you call `addToUndoStack` the panels will refresh automatically.
- **Path tracer work** – use `docs/guides/path-tracer.md` for the in-viewer demo
  or `PathTracerOnlyApp` if you need the legacy renderer API.
- **Lighting/HDR tweaks** – cross-reference `docs/guides/lighting-hdr.md` so you
  know how ground projection and CSM interact.

## 3. Before Committing

1. **Docs lint**  
   ```bash
   npm run docs:check
   ```
   Ensures no stray Markdown files are left in the repo root.

2. **Typecheck + tests**  
   ```bash
   npm run typecheck
   npm run test -- --run
   ```
   `typecheck` validates the shipped app entry graph, while Vitest covers the
   viewer store tests, adaptive path tracer checks, and the standalone Streets
   GL shadow diagnostics. The legacy render-graph suites are excluded.

3. **Builds**  
   ```bash
   npm run build
   npm run desktop:dist
   ```
   Run the desktop packaging step when you need to validate the Windows beta
   artifact or the bundled Streets GL desktop path.

4. **Manual sanity** (fast spot-check):
   - Load a model via drag & drop.
   - Verify Undo (Ctrl+Z) visually updates Helpers/Objects panel.
   - Toggle Lighting and HDR panels to ensure nothing errors in the console.
   - If you touched the path tracer, open the panel, click Start, and ensure the
     preview shows up (look for `[PathTracerDemo] Running` logs).

## 4. Pull Request Template

- Summary (what changed + why).
- Tests (include `npm run test` output or mention if something is intentionally
  skipped).
- Docs (link to any new/updated guides).

## 5. CI Expectations

GitHub Actions now runs:

- `docs.yml` for documentation placement on every push/PR.
- `beta-validate.yml` for typecheck, tests, viewer build, and Windows desktop
  packaging.

## Quick Commands Recap

| Command | When to run |
| ------- | ----------- |
| `npm run dev` | Start viewer + managed Streets GL |
| `npm run dev:full` | Start viewer + bug server + Streets GL |
| `npm run typecheck` | Before PR / CI parity |
| `npm run build` | Before beta drops |
| `npm run desktop:dist` | Before Windows beta packaging |
| `npm run docs:check` | Before every commit touching docs |
| `npm run test -- --run` | Before PR / CI parity |


