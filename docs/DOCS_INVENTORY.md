# Documentation Inventory

This file records where each large family of Markdown files lives. The goal is
to keep the repository root limited to actively maintained guides while older
logs and investigation notes move under `docs/archive/`.

## Status

- **All** legacy Markdown files have been migrated out of the repository root.
  Only `README.md` remains there.
- Each filename family now lives inside a dedicated subfolder of
  `docs/archive/` (see `docs/archive/README.md` for the alphabetical list).
- `npm run docs:check` verifies that no new `.md` files are added to the root
  without being allow-listed first. The allowlist currently contains only
  `README.md`.

## How to Add or Retire Docs

1. When you create a new long-form document, prefer authoring it under
   `docs/guides/` (living docs) or directly inside `docs/` if it is still
   current.
2. When a root-level doc becomes stale, move it into
   `docs/archive/<prefix>/`. If a matching folder does not exist yet, create
   one using the lowercase prefix before the first underscore in the filename.
3. After moving files, run:
   - `npm run docs:check` – ensures no stray Markdown files remain.
4. No manual updates to this file are required beyond these instructions—the
   archive directory list is the canonical inventory.



