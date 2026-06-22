# Testing Playbook

Use this checklist before sending changes to review. It covers automated tests,
docs linting, and quick manual smoke checks.

## Automated Tests

```bash
npm run test          # vitest suites (store, path tracer, shadows)
npm run docs:check    # docs placement, enforced in CI
npm run lint:scripts  # placeholder (add ESLint/tsc once ready)
npm run test:smoke    # quick manual checklist helper
```

### Vitest suites

- `tests/useAppStore.test.ts` – sanity for the Zustand store (undo stack,
  lighting defaults, etc.).
- `tests/pathTracerRendererAdaptive.test.ts` – verifies the adaptive sample
  logic exposed via the compatibility `PathTracerRenderer`.
- `tests/shadowSystem.test.ts` + `tests/streets-gl-standalone.test.ts` – ensure
  cascading shadows and Streets GL helper utilities still initialize correctly.

> Note: legacy `render-graph/tests` suites in the vendored Streets GL copies are
> excluded (they refer to tilde aliases). If you need them, adjust
> `vitest.config.ts` and re-add the alias stubs.

## Docs Lint

- Blocks stray Markdown in the repo root (only `README.md` is allowed).
- If it fails, move the doc into `docs/` or add it to
  `docs/root-md-allowlist.json` (with a header explaining why it stays at root).

## Manual Smoke Test

1. **Load a model** (drag & drop GLB/FBX).  
2. **Selection & Undo**  
   - Select part of the model, move it, press `Ctrl+Z` – ensure gizmo and
     Objects panel update immediately.  
3. **Lighting/HDR**  
   - Open Lighting panel, toggle a directional light, re-run `shadow quality`.
   - Enable HDR, load a map (or toggle the default) and ensure the scene updates.  
4. **Path Tracer** (`npm run test:smoke` reminds about this step).  
   - Open the Path Tracer panel, click Start, confirm `[PathTracerDemo] Running`
     logs appear and the preview updates.  
5. **Streets GL overlay** (if applicable)  
   - Toggle overlay, verify the iframe loads and the bridge reaches “ready.”

## CI Expectations

`npm run docs:check` runs on every push/PR (`.github/workflows/docs.yml`). If
you add more scripts (lint/build), piggyback on that workflow so all PRs gate on
the same checks.

## Submitting PRs

Include:

- Summary of changes + rationale.
- `npm run test` output (or reason if skipped).  
- Confirmation that `npm run docs:check` passed if you touched docs.
- Any manual findings (screenshots/logs) for shader/lighting UI work.

