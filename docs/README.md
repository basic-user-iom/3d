# Documentation Hub

This directory collects all project-facing documentation so we can keep the
root of the repository focused on source code. The structure is intentionally
simple:

- `guides/`: living reference docs that we expect contributors to keep up to
  date. Add new feature notes or how-tos here.
- `archive/`: historical notes that are still useful for context but no longer
  describe the current state of the app. Files keep their original names inside
  topical subfolders (for example `archive/streets-gl`, `archive/weather`,
  `archive/shadow`).
- Top-level Markdown files inside `docs/` are cross-cutting references that are
  still actively maintained (analysis docs, long-form design notes, etc.).

## Adding or Moving Docs

1. Prefer writing new content in `guides/` and link it from the feature README,
   the toolbar docs, or other relevant hubs.
2. When you retire a root-level Markdown file, move it into the appropriate
   `archive/<topic>` folder instead of deleting it. Update the inventory
   (`DOCS_INVENTORY.md`) so the next cleanup pass knows it has been handled.
3. If you truly need a Markdown file in the repository root, add its filename
   to `docs/root-md-allowlist.json` (once reintroduced) and explain the reason
   in the file header.

## Guides

- [`index.md`](index.md) – quick links to all living docs and archive folders.
- [`guides/viewer-basics.md`](guides/viewer-basics.md) – setup, usage, and
  troubleshooting tips for the viewer (migrated from the legacy README).
- [`guides/selection-and-gizmo.md`](guides/selection-and-gizmo.md) – advanced
  selection, marquee, and pivot behavior.
- [`guides/streets-gl-integration.md`](guides/streets-gl-integration.md) –
  dev-server flow and bridge tips for the Streets GL iframe.
- [`guides/path-tracer.md`](guides/path-tracer.md) – how to run the GPU path
  tracer demo and capture renders.
- [`guides/shader-editor.md`](guides/shader-editor.md) – GLSL demo panel usage
  and slider behavior.
- [`guides/lighting-hdr.md`](guides/lighting-hdr.md) – lighting panel, HDR, and
  ground projection best practices.
- [`guides/dev-workflow.md`](guides/dev-workflow.md) – run/lint/test checklist
  before shipping changes.
- [`guides/streets-gl-troubleshooting.md`](guides/streets-gl-troubleshooting.md)
  – overlay/bridge/server diagnostics.
- [`guides/testing-playbook.md`](guides/testing-playbook.md) – automated tests +
  manual smoke checks.

## Inventory & Linting

- `DOCS_INVENTORY.md` tracks which filename families have already been moved.
- Run `npm run docs:check` before committing to ensure no new Markdown files are
  left in the repository root. If you truly need to keep one there, add its
  filename to `docs/root-md-allowlist.json` and explain why in the file header.



