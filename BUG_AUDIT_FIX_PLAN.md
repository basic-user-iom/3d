# v3.18 Bug Audit Remediation Plan

Target repository: `F:\3d-viever-backup\v3.18`

Audit type: read-only static review plus safe automated checks

Purpose: this document is the implementation specification for fixing the verified defects found during the audit. Verify each finding against the current code before changing it, then work through the phases in order.

## Instructions for the fixing agent

1. Read this complete document before editing.
2. Inspect any repository-level `AGENTS.md`, `README`, deployment, and contribution instructions before running commands.
3. Preserve all pre-existing work. Do not reset, stash, delete, overwrite, or reformat unrelated files.
4. The baseline branch was `master...origin/master [ahead 1]` with the untracked items listed below. Treat them as user-owned.
5. Verify every defect before implementing its fix. If a finding is no longer reproducible, document the evidence and do not make a speculative change.
6. Work one phase at a time. Keep security, persistence, lifecycle, performance, and dependency changes in separate commits.
7. Add regression tests with each fix. Do not merely suppress TypeScript, lint, runtime, or audit failures.
8. Do not deploy or publish unless the user separately requests it.
9. Avoid broad rewrites. Preserve externally visible project-file compatibility unless a versioned migration is supplied.
10. After every phase, report files changed, tests run, results, remaining risks, and any behavior that requires manual verification.

### Pre-existing untracked files/directories

Do not modify or remove these unless the user explicitly asks:

- `.XslGRr_clouds.txt`
- `.cdlyWr-thumb.jpg`
- `.curl-3dbviewer.html`
- `.curl-cdlyWr.json`
- `.curl-site-bundle.js`
- `.cursor/`
- `.gh-auth-login-out.txt`
- `.mensab.html`
- `.shadertoy-archive.html`
- `.shadertoy-archive2.html`
- `.shadertoy-cdlyWr.html`
- `.shadertoy-cdlyWr.json`
- `.shadertoy-cxly.html`
- `.shadertoy-stilltravelling.html`
- `main.cjs`

## Baseline checks

The read-only audit produced these results:

- Unit tests: 62 files and 453 tests passed.
- Application typecheck: failed with 8 errors.
- Full TypeScript check: failed with 42 errors.
- ESLint: 0 errors and 490 warnings in 133 files.
- Production dependency audit: 4 vulnerabilities — 1 critical, 1 high, and 2 moderate.
- `npm ls three --all --depth=4`: reported an invalid `web-ifc-three` peer dependency.
- Browser E2E, build, packaging, and deployment were not run during the read-only audit because they can write output/state.

Recommended validation commands, chosen as appropriate for each phase:

```powershell
npm run typecheck
npm run typecheck:full
npm run lint
npm test -- --run --no-cache --configLoader=runner
npm run test:e2e
npm run build
npm audit --omit=dev
npm ls three --all --depth=4
```

Do not treat the existing lint/type errors as permission to introduce new ones. Record before/after counts where a phase cannot reasonably clear all historical debt.

---

## Phase 1 — Security boundaries

Complete this phase before project-persistence or performance refactors.

### SEC-1 — High: stored XSS through imported hotspot HTML

Evidence:

- `src/components/HotspotPopup.tsx:150-167` renders an unsandboxed interactive iframe and passes hotspot HTML to `dangerouslySetInnerHTML`.
- `src/utils/projectPersistence.ts:4365-4399` parses and applies imported project JSON without schema validation.
- Persisted/imported hotspots can reach the popup rendering path.

Required change:

- Prefer removing arbitrary active HTML. If HTML remains a supported feature, sanitize it using a current maintained sanitizer with a strict allowlist.
- Reject scripts, event-handler attributes, `javascript:` URLs, active SVG, unsafe CSS, and active embeds.
- Sandbox interactive iframes with only the minimum required permissions; validate allowed URL protocols.
- Validate the full project schema before mutating application state.
- Add a restrictive Content Security Policy as defense in depth for browser and Electron builds.

Acceptance criteria:

- Imported hotspot payloads using `onerror`, `onclick`, script-closing strings, `javascript:` links, or active SVG do not execute.
- Normal supported hotspot formatting continues to render.
- Tests cover direct creation, project import, save/reload, and Electron rendering behavior.

### SEC-2 — High: persistent injection in standalone web exports

Evidence:

- `src/utils/webExport.ts:1238-1247` inserts camera-view identifiers/names into generated HTML without context-correct escaping.
- `src/utils/webExport.ts:463-475` serializes configuration with `JSON.stringify`.
- `src/utils/webExport.ts:1539-1540` inserts that JSON directly into an executable script element.

Required change:

- Construct dynamic UI using DOM APIs and `textContent`, or apply correct HTML text/attribute escaping for every interpolation.
- Store configuration in a non-executable JSON block or separate file.
- When embedding JSON in HTML, encode at least `<`, `>`, `&`, U+2028, and U+2029 so `</script>` cannot terminate the container.
- Add a restrictive CSP to generated exports.

Acceptance criteria:

- Camera names and configuration values containing quotes, angle brackets, `</script>`, event handlers, Unicode line separators, and ampersands remain inert text/data.
- Export round-trip tests load these values without syntax errors or code execution.

### SEC-3 — High: Electron forwards untrusted URLs to the OS shell

Evidence:

- `electron/main.cjs:349-351` passes every `window.open` URL to `shell.openExternal` without validating protocol or host.
- There is no comprehensive top-level/frame navigation deny policy around `electron/main.cjs:331-359`.

Required change:

- Parse URLs using `new URL()` and allow only explicitly required protocols, normally `https:` and possibly narrowly justified `http:` development destinations.
- Reject `file:`, executable/custom protocols, credentials, malformed input, and non-allowlisted hosts where practical.
- Deny unexpected `will-navigate` and `will-frame-navigate` events.
- Install a default-deny permission request handler.

Acceptance criteria:

- Tests prove blocked schemes never reach `shell.openExternal`.
- Allowed HTTPS destinations still work.
- Renderer or iframe input cannot navigate the main window.

### SEC-4 — High, conditional: Replicate bearer token is compiled into clients

Evidence:

- `.env.example:8-10` recommends `VITE_REPLICATE_API_TOKEN`.
- `src/store/useAppStore.ts:1090` reads that variable in renderer code.
- `src/utils/aiEnhancement.ts:63-66`, `106-122`, and `144-147` sends it as a bearer credential.

Required change:

- Remove the Vite-exposed secret.
- For web deployments, proxy Replicate through an authenticated backend with authorization, quotas, and rate limiting.
- For desktop-only operation, keep secrets in the main process or OS credential storage and expose a narrow validated IPC operation without returning the secret.
- Rotate any token that has ever been included in a distributed build.

Acceptance criteria:

- A production renderer bundle contains no Replicate token.
- Renderer code cannot read the stored credential.
- Requests still work through the controlled boundary and reject unauthorized/oversized use.

### SEC-5 — Medium-high: unauthenticated Streets GL service and `postMessage` bridge

Evidence:

- `electron/main.cjs:113-125` and `270-275` accept an arbitrary existing responder on port 8081.
- `src/utils/streetsGLBridge.ts:175-225` accepts messages without exact origin/source validation.
- `src/utils/streetsGLBridge.ts:316-325` posts using `'*'`.
- `streets-gl-alt/src/app/ExternalObjectBridge.ts:102-205` has the reciprocal broad bridge and exposes scene mutations.

Required change:

- Use a per-launch random capability and preferably an ephemeral port or application protocol.
- Verify both `event.source` and exact `event.origin`.
- Use an exact `targetOrigin`.
- Validate message schemas and impose geometry, count, and byte-size limits.
- Do not adopt an arbitrary process already listening on the expected port in packaged mode.

Acceptance criteria:

- A fake service on port 8081 cannot receive registry/model data or become the application bridge.
- Messages from an unexpected frame/origin are ignored.
- Oversized and malformed geometry messages are rejected before allocation.

### SEC-6 — Medium: development write server is network-accessible

Evidence:

- `server.js:17-29` enables wildcard CORS.
- `server.js:31-60` exposes an unauthenticated write endpoint.
- `server.js:64-67` omits the listen host and therefore binds beyond loopback on typical Node configurations.

Required change:

- Bind explicitly to `127.0.0.1`.
- Remove wildcard CORS and validate the exact development origin.
- Require a random per-run token, cap request size, validate input, rate-limit requests, and use safe append semantics.
- Prefer removing this server if it is no longer necessary.

Acceptance criteria:

- The endpoint is unreachable from another LAN host.
- Cross-origin unauthenticated requests fail.
- Large/repeated requests cannot consume unbounded disk or memory.

---

## Phase 2 — Project persistence and data integrity

This phase has the highest correctness priority. Add fixture-based save/load round-trip tests before changing the format.

### DATA-1 — Critical: model instances, hierarchies, and material edits are corrupted on round-trip

Evidence:

- `src/utils/projectPersistence.ts:895-977` recursively serializes an imported root and its descendants.
- `src/utils/projectPersistence.ts:2675-2710` deduplicates loaded imports using `fileName`.
- `src/utils/projectPersistence.ts:3383-3398` recreates saved non-imported descendant nodes as `THREE.Group` placeholders.
- `src/utils/projectPersistence.ts:3415-3445` restores materials only when the recreated object is a `THREE.Mesh`.
- `src/utils/projectPersistence.ts:3448-3455` appends the placeholder descendants even though the loaded asset already contains its original hierarchy.

Impact:

- Two instances of the same asset collapse into one object and later transforms overwrite earlier ones.
- Descendant material/transform edits are lost or applied to empty placeholder nodes.
- Saved and restored hierarchies diverge.

Required change:

- Give each asset a stable asset ID/hash and every scene occurrence a separate instance ID.
- Restore one root per saved instance rather than deduplicating by filename.
- Identify descendant nodes using stable node IDs or deterministic hierarchy paths.
- Load the original hierarchy once per instance and apply saved node state in place; do not recreate loaded descendants as placeholder groups.
- Version the project schema and provide migration for existing files.

Acceptance criteria:

- Round-trip tests cover two instances of the same file, different files sharing the same basename, nested transforms, visibility, renamed nodes, and per-child material changes.
- Save→load→save produces equivalent semantic state.
- Older supported project versions migrate without silent loss.

### DATA-2 — High: project loading destroys current state before success and leaks old resources

Evidence:

- `src/utils/projectPersistence.ts:3474-3508` removes current models before restoration succeeds and does not dispose their geometry/materials/textures.
- `src/utils/projectPersistence.ts:3518-3578` catches per-object failures and continues without rollback.
- `src/utils/projectPersistence.ts:4278-4363` defines a validator, but `loadProjectFromFile` at `4365-4399` parses and applies directly.
- Module-global file/model registries retain old objects and `File` blobs across project loads.

Required change:

- Enforce schema validation, size limits, and reference consistency before mutation.
- Restore into temporary scene/store/registry state.
- Verify required resources and object counts, then atomically swap.
- Preserve the current project on any failure.
- Dispose project-owned Three.js/GPU resources and reconcile or clear registries after a successful swap.

Acceptance criteria:

- Corrupt, incomplete, unsupported, and missing-asset projects leave the current scene unchanged.
- Repeatedly switching large projects does not show monotonic heap/GPU growth.
- Errors identify failed resources without leaving a half-restored project.

### DATA-3 — High: global loading-manager contamination and concurrent-load races

Evidence:

- `src/utils/projectPersistence.ts:2862-2898` creates dependency Blob URLs.
- `src/utils/projectPersistence.ts:2900-2967` installs broad filename/suffix matching on `THREE.DefaultLoadingManager`.
- `src/utils/projectPersistence.ts:2978-2982` deliberately leaves the modifier installed and does not revoke URLs.
- `src/viewer/loaders/gltfLoader.ts:599-607`, `789-796`, and `833-876` mutates the same global manager and has incomplete cleanup paths.

Required change:

- Create a dedicated `THREE.LoadingManager` for each load and pass it to the loader.
- Keep URL maps scoped to one asset/load.
- Perform restoration and Blob URL revocation in a single `finally` path.
- Make overlapping loads independent.

Acceptance criteria:

- Concurrent GLTF loads with identically named textures receive their own resources.
- A failed/cancelled load leaves no global callbacks/modifiers or unreleased Blob URLs.

### DATA-4 — High: Delete→Undo cannot restore destroyed backing state

Evidence:

- `src/components/ObjectsPanel.tsx:1039-1085` records only object/parent but disposes splat overlays, revokes URLs, and unregisters files/cache/bridge state.
- `src/store/useAppStore.ts:1755-1759` undo merely calls `parent.add(object)`.
- `src/viewer/loaders/splatLoader.ts:101-108` performs irreversible splat cleanup.

Required change:

- Make the undo command own all restoration metadata: source file, registry/cache descriptors, bridge/city state, URLs, and resource ownership.
- Defer irreversible disposal until an undo entry expires, or recreate the resource during undo.

Acceptance criteria:

- Delete→Undo restores ordinary models and splats visually and functionally.
- Restored objects survive save/reload and mode switches.
- Repeated delete/undo does not leak resources.

### DATA-5 — Medium: unbounded ZIP and project parsing can freeze or exhaust memory

Evidence:

- `src/viewer/loaders/zipLoader.ts:30-56` expands all entries concurrently without entry-count or expanded-byte limits.
- `src/utils/projectPersistence.ts:4365-4372` only warns for large JSON.
- `src/utils/projectPersistence.ts:4375-4386` wraps synchronous `JSON.parse` in `Promise.race`; the timeout cannot interrupt parsing.

Required change:

- Enforce compressed size, entry count, per-entry size, total expanded size, nesting/array counts, and embedded-base64 limits.
- Extract only referenced archive entries with bounded concurrency.
- Parse large JSON in a Worker or use a bounded streaming parser.

Acceptance criteria:

- Oversized and high-expansion-ratio fixtures fail early with a useful error.
- Rejected inputs do not allocate their full expanded contents or block the UI thread for an extended period.

---

## Phase 3 — Async and resource lifecycle correctness

### LIFE-1 — High: async loads mutate a stale/disposed viewer

Evidence:

- `src/viewer/useViewer.ts:2099-2148` captures a viewer before awaiting model loading.
- `src/viewer/useViewer.ts:2174-2180` and `2311-2318` mutate/add to that captured viewer without revalidation.
- URL loading repeats the pattern around `3021-3258`.
- Viewer teardown clears shared state at `src/viewer/useViewer.ts:1073-1090`.
- `src/App.tsx:360-394` starts a default Pagani load after only a pre-load project-state check; the URL loader can later replace restored models.

Required change:

- Introduce a viewer/session generation token and `AbortSignal` for each load.
- After every await, verify that the target viewer/session is still current.
- Dispose late results rather than attaching them to an obsolete scene.
- Cancel or re-check the optional default load before it mutates the scene; do not let it replace project models.

Acceptance criteria:

- Switching render mode, opening a project, or unmounting during a delayed import never changes an obsolete/current scene unexpectedly.
- Late assets are disposed and do not remain in caches.

### LIFE-2 — High: path-tracer resources and controls listener leak

Evidence:

- `src/viewer/pathTracer/PathTracerDemo.ts:1144-1152` installs an anonymous controls listener.
- `dispose()` at `5552-5655` never removes it and incorrectly states `WebGLPathTracer` has no dispose method.
- The installed `three-gpu-pathtracer` API exposes `dispose()`.

Required change:

- Store and remove a named listener.
- Call `this.pathTracer.dispose()`.
- Dispose owned gradient/auxiliary textures and make teardown idempotent.

Acceptance criteria:

- Repeated preview/export/open/close cycles do not increase registered controls callbacks or retained WebGL resources.
- Camera changes call only the current tracer.

### LIFE-3 — High: panorama RAF survives unmount

Evidence:

- `src/components/Panorama360Viewer.tsx:1001-1055` recursively schedules RAF without retaining its ID or checking a disposed flag.
- Cleanup at `1075-1103` disposes rendering resources but never cancels the loop.

Required change:

- Store the RAF ID, set an inactive/disposed guard before cleanup, cancel the pending frame, and reschedule only while active.

Acceptance criteria:

- After unmount there are no additional renders or state updates from the old viewer.
- Repeated panorama mounts create exactly one active loop.

### LIFE-4 — High: removed animated models remain retained and updated

Evidence:

- `src/viewer/utils/modelAnimations.ts:15-27` registers mixers.
- Its cleanup helper at `37-47` has no call sites.
- `src/viewer/ViewerCanvas.tsx:4687` updates all retained mixers every frame.
- `src/viewer/useViewer.ts:1148-1203` removes/replaces model roots without detaching mixers.

Required change:

- Centralize model resource ownership and invoke mixer cleanup, including `uncacheRoot`, before every subtree removal and viewer/project teardown.

Acceptance criteria:

- Removed animated roots are not retained or updated.
- Repeated model replacement keeps mixer count bounded.

### LIFE-5 — Medium: fetch timeout and retry cleanup are broken

Evidence:

- `src/utils/networkUtils.ts:78-100` aborts a different controller when the caller supplies a signal.
- Abort listeners are added on every retry and are not removed.
- Failed attempts do not consistently clear their timers.

Required change:

- Compose caller cancellation and timeout using `AbortSignal.any`, `AbortSignal.timeout`, or one carefully managed controller.
- Handle already-aborted caller signals.
- Remove listeners and clear timers in `finally` for every attempt.

Acceptance criteria:

- A hanging mocked fetch rejects at the configured timeout with and without a caller signal.
- Caller abort stops the active attempt immediately.
- Retry tests show no remaining timers/listeners.

### LIFE-6 — Medium: HDR cancellation leaks stale textures and PMREM targets

Evidence:

- `src/viewer/effects/HDRSystem.ts:787-794` cancellation only advances a generation.
- Stale paths after loading/generation return without disposing newly owned resources around `879-1008`.

Required change:

- Track ownership of source textures/render targets and dispose on every stale/error exit.
- Prefer abortable fetch/decode where supported.

Acceptance criteria:

- Rapid HDR changes and unmount-during-load leave only the final active resources.

---

## Phase 4 — Rendering and UI performance

### PERF-1 — High: disabled weather/water keeps full rendering alive forever

Evidence:

- `src/viewer/utils/renderLoopIdle.ts:111-126` treats any retained particle/water system as continuously active.
- `src/viewer/ViewerCanvas.tsx:8981-8984`, `9023-9025`, and `9079-9081` only mark rain, snow, and water disabled; the objects remain registered.
- `src/viewer/ViewerCanvas.tsx:5019-5025` therefore continues scheduling frames.

Required change:

- Make the idle predicate inspect actual enabled/intensity/activity state, or remove/destroy inactive systems.

Acceptance criteria:

- Enable→disable for each effect returns a static scene to idle.
- Tests instrument RAF/render counts and cover combinations of effects.

### PERF-2 — High: shadow bounds perform repeated nested scene traversals

Evidence:

- `src/viewer/ViewerCanvas.tsx:5774-5786` runs an unconditional 250 ms timer; another periodic path runs during animation around `4704-4710`.
- `src/viewer/utils/shadowManager.ts:275-341` traverses the scene and recursively retraverses descendant trees with per-node allocations.
- `src/viewer/utils/shadowManager.ts:447-448` forces shadow redraws.
- `src/viewer/utils/shadowManager.ts:494-513` repeats bounds work per light.

Required change:

- Recompute one aggregate bounds result only on relevant scene/transform/light changes.
- Reuse scratch objects and apply bounds to all lights.
- Set `shadow.needsUpdate` only when bounds or shadow configuration changed.

Acceptance criteria:

- Static scenes perform no periodic bounds traversal or forced shadow redraw.
- Benchmarks cover deep hierarchies and multiple lights.

### PERF-3 — High: Objects Panel rebuilds a superlinear tree several times per second

Evidence:

- `src/components/ObjectsPanel.tsx:115-179` recursively aggregates subtree statistics.
- `src/components/ObjectsPanel.tsx:425-450` invokes aggregation for every node while recursively walking the same tree.
- Timers at `497-500` and `508-564` repeatedly rebuild/traverse even without meaningful changes.

Required change:

- Refresh from explicit scene revisions/model events instead of polling.
- Aggregate once bottom-up, cache immutable geometry/texture sizes, and virtualize large trees.

Acceptance criteria:

- An unchanged open Objects Panel performs no repeated full-tree work.
- Large-scene interaction remains responsive and rebuild count follows actual mutations.

### PERF-4 — Medium: hotspot connectors maintain a permanent O(H²) RAF loop

Evidence:

- `src/components/HotspotsPanel.tsx:2852-2890` loops every frame, performs `hotspots.find` for every line, allocates vectors, and marks buffers dirty even when unchanged.

Required change:

- Index hotspots by ID, reuse scratch objects, and update only when a relevant transform changes.

Acceptance criteria:

- Static hotspot lines produce no frame-by-frame buffer uploads.
- Scaling is linear in changed connectors, not total hotspots squared.

### PERF-5 — Medium: broad store subscriptions and eager feature imports

Evidence:

- `src/App.tsx:177-231` and `src/viewer/ViewerCanvas.tsx:447-465` subscribe broadly to the Zustand store.
- The audit found 46 `useAppStore()` calls without selectors.
- `src/App.tsx:12-38` and `77-93` statically import many large optional panels/features.

Required change:

- Use narrow stable selectors and `useShallow` where multiple fields are required.
- Add memoized feature boundaries.
- Lazy-load path tracing, IFC, exporters, diagnostics, texture tools, and other optional panels.

Acceptance criteria:

- Unrelated store changes do not rerender the root viewer/panels.
- Initial bundle and preload size are recorded before/after and materially reduced.

---

## Phase 5 — Release gates, dependencies, and maintainability

### BUILD-1 — High: CI typecheck currently fails

Evidence:

- `.github/workflows/beta-validate.yml:27` runs `npm run typecheck`.
- Current application typecheck reports 8 errors, including `src/components/Panorama360ParticlesOverlay.tsx:221` and `src/components/Panorama360SpoutOverlay.tsx:171,360`.
- Full TypeScript checking reports 42 errors.

Required change:

- Fix root causes rather than adding `any`, `@ts-ignore`, or new `@ts-nocheck` directives.
- Keep the CI typecheck green and progressively bring the full configuration into CI.

Acceptance criteria:

- `npm run typecheck` exits zero locally and in CI.
- Full-check failures have either been fixed or recorded in a separately approved, time-bounded migration plan.

### BUILD-2 — High: known vulnerable and unsupported dependencies

Evidence:

- `npm audit --omit=dev` reported 4 production vulnerabilities involving `protobufjs`, `@protobufjs/utf8`, `dompurify`, and `js-yaml`.
- `gltf-pipeline` appears to be a direct production dependency but no source import was found; it pulls several vulnerable packages through Cesium.
- Electron is locked to 31.7.7, an end-of-support line.

Required change:

- Confirm whether `gltf-pipeline` is reachable; remove it if unused or upgrade the dependency chain.
- Upgrade DOMPurify before relying on it for SEC-1.
- Upgrade Electron incrementally to a currently supported line, testing packaging/updater behavior at each step.
- Resolve remaining production audit findings without forced breaking upgrades that bypass validation.

Acceptance criteria:

- `npm audit --omit=dev` has no unaccepted high/critical findings.
- Any accepted residual advisory has documented reachability and mitigation.
- Desktop smoke and packaging tests pass on the supported Electron version.

### BUILD-3 — High compatibility risk: IFC adapter expects an incompatible Three.js version

Evidence:

- `package.json` uses Three `^0.181.1` and `web-ifc-three ^0.0.126`.
- The locked adapter declares peer support for Three `^0.149.0`.
- `npm ls three --all --depth=4` reports `ELSPROBLEMS`.
- The adapter is actively imported by `src/viewer/loaders/ifcLoader.ts:14-15`.

Required change:

- Replace the abandoned/incompatible adapter with a maintained integration, or deliberately align versions behind an isolated tested adapter.

Acceptance criteria:

- Dependency validation exits cleanly.
- Representative IFC fixtures load, render, select, unload, and reload without warnings or leaked resources.

### BUILD-4 — Medium: stale build assets and source maps accumulate in packaged output

Evidence:

- `vite.config.ts:120-129` sets `emptyOutDir: false` and enables source maps.
- Electron packaging includes broad `dist/**/*` content.
- Read-only inventory found 151 `dist/assets` files totaling about 157.86 MiB, including 71 maps totaling about 120.22 MiB and multiple generations of hashed chunks.

Required change:

- Clean generated web assets safely while preserving only explicitly required desktop-build content.
- Keep production source maps outside packaged output or disable them where appropriate.
- Package using an explicit allowlist.

Acceptance criteria:

- Two consecutive clean builds contain no stale hashed generations.
- Package contents and size are deterministic and source maps follow the chosen release policy.

### BUILD-5 — Medium: maintainability safeguards are too weak

Evidence:

- ESLint reports 490 warnings, including 14 hook-rule and 42 exhaustive-dependency warnings.
- `tsconfig.json` disables strict mode.
- Core files are extremely large: `ViewerCanvas.tsx` about 9,726 lines, `webExport.ts` about 8,996, `PathTracerDemo.ts` about 5,824, `HotspotsPanel.tsx` about 4,958, and `projectPersistence.ts` about 4,409.
- Lifecycle/rendering behavior has little browser-level automated coverage.

Required change:

- Fix hook correctness warnings first and make them CI errors.
- Enable TypeScript strictness incrementally by subsystem.
- Extract resource ownership, loading sessions, project migration, render scheduling, and export encoding into smaller testable modules.
- Add browser lifecycle tests with fake RAF/listener accounting and resource-disposal assertions.

Acceptance criteria:

- No hook-order violations remain.
- Warning counts do not regress and have a documented reduction target.
- Critical persistence/security/lifecycle modules have focused automated tests.

---

## Completion definition

The remediation is complete only when:

1. Every finding above is fixed, explicitly disproved with evidence, or separately accepted by the user with documented risk.
2. Security payload regression tests remain inert in browser and Electron contexts.
3. Project round-trip and failure-rollback tests pass for representative assets and legacy project files.
4. RAF, listener, Blob URL, mixer, heap, and GPU-resource lifecycle tests show bounded behavior across repeated open/close/load/unload cycles.
5. Application typecheck and relevant unit/E2E tests pass.
6. No unrelated or pre-existing user files were altered.
7. Each phase has a concise implementation report and a separate reviewable commit.

## Suggested execution order

1. SEC-1 through SEC-4.
2. DATA-1 and DATA-2.
3. DATA-3 through DATA-5.
4. LIFE-1 through LIFE-6.
5. PERF-1 through PERF-5.
6. BUILD-1 through BUILD-5.

Pause for review after each numbered group. Do not deploy as part of this plan.
