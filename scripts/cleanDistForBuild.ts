/**
 * BUILD-4: Clear stale Vite outputs under dist/ while preserving
 * directories that must survive across web builds (desktop installer output
 * and local upload content that packaging already excludes).
 */
import fs from 'node:fs'
import path from 'node:path'

/** Directories under dist/ that must not be removed by a Vite web build. */
export const DIST_PRESERVE_NAMES = Object.freeze(['desktop-build', 'files-upload'] as const)

/**
 * Electron-builder include patterns for the web build output.
 * Explicit allowlist so stale/demo/local content under dist/ is not packaged.
 */
export const ELECTRON_DIST_FILE_GLOBS = Object.freeze([
  'dist/index.html',
  'dist/assets/**/*',
  '!dist/assets/**/*.map',
  'dist/web-ifc/**/*',
  'dist/basis/**/*',
  'dist/draco/**/*',
  'dist/env/**/*',
  'dist/panoramas/**/*',
  'dist/panorama-effects/**/*',
  'dist/projects/**/*',
  'dist/vite.svg',
  'dist/sw.js'
] as const)

/**
 * Remove everything under `distDir` except entries listed in `preserveNames`.
 * Returns the names that were removed (best-effort; missing dist is a no-op).
 */
export function cleanDistForBuild(
  distDir: string,
  preserveNames: readonly string[] = DIST_PRESERVE_NAMES
): string[] {
  const preserve = new Set(preserveNames)
  if (!fs.existsSync(distDir)) {
    return []
  }

  const removed: string[] = []
  for (const entry of fs.readdirSync(distDir)) {
    if (preserve.has(entry)) {
      continue
    }
    fs.rmSync(path.join(distDir, entry), { recursive: true, force: true })
    removed.push(entry)
  }
  return removed
}

/**
 * True when a packaging file glob list ships hashed assets but never source maps,
 * and never uses a broad dist recursive include that would reintroduce stale content.
 */
export function packagingExcludesSourceMapsAndBroadDist(files: readonly string[]): boolean {
  const list = [...files]
  const hasAssets = list.some((p) => p === 'dist/assets/**/*' || p.startsWith('dist/assets/'))
  const excludesMaps = list.some(
    (p) => p === '!dist/assets/**/*.map' || p === '!**/*.map' || p === '!dist/**/*.map'
  )
  const hasBroadDist = list.some((p) => p === 'dist/**/*' || p === 'dist/**')
  return hasAssets && excludesMaps && !hasBroadDist
}
