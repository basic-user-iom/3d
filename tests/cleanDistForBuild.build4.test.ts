import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  cleanDistForBuild,
  DIST_PRESERVE_NAMES,
  ELECTRON_DIST_FILE_GLOBS,
  packagingExcludesSourceMapsAndBroadDist
} from '../scripts/cleanDistForBuild'

describe('cleanDistForBuild (BUILD-4)', () => {
  const tempRoots: string[] = []

  afterEach(() => {
    for (const root of tempRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('removes stale hashed assets and maps but preserves desktop-build and files-upload', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'build4-clean-'))
    tempRoots.push(root)
    const dist = path.join(root, 'dist')
    fs.mkdirSync(path.join(dist, 'assets'), { recursive: true })
    fs.mkdirSync(path.join(dist, 'desktop-build', 'win-unpacked'), { recursive: true })
    fs.mkdirSync(path.join(dist, 'files-upload', 'models'), { recursive: true })
    fs.writeFileSync(path.join(dist, 'assets', 'index-OLDHASH.js'), 'stale')
    fs.writeFileSync(path.join(dist, 'assets', 'index-OLDHASH.js.map'), 'stale-map')
    fs.writeFileSync(path.join(dist, 'index.html'), '<html>old</html>')
    fs.writeFileSync(path.join(dist, 'desktop-build', 'installer.exe'), 'keep')
    fs.writeFileSync(path.join(dist, 'files-upload', 'models', 'car.glb'), 'keep')

    const removed = cleanDistForBuild(dist)

    expect(removed.sort()).toEqual(['assets', 'index.html'])
    expect(fs.existsSync(path.join(dist, 'desktop-build', 'installer.exe'))).toBe(true)
    expect(fs.existsSync(path.join(dist, 'files-upload', 'models', 'car.glb'))).toBe(true)
    expect(fs.existsSync(path.join(dist, 'assets'))).toBe(false)
    expect(fs.existsSync(path.join(dist, 'index.html'))).toBe(false)
    expect([...DIST_PRESERVE_NAMES].sort()).toEqual(['desktop-build', 'files-upload'])
  })

  it('is a no-op when dist does not exist', () => {
    const missing = path.join(os.tmpdir(), `build4-missing-${Date.now()}`)
    expect(cleanDistForBuild(missing)).toEqual([])
  })
})

describe('electron packaging allowlist (BUILD-4)', () => {
  it('package.json uses an explicit dist allowlist that excludes source maps', () => {
    const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      build?: { files?: string[] }
    }
    const files = pkg.build?.files ?? []

    expect(packagingExcludesSourceMapsAndBroadDist(files)).toBe(true)
    for (const glob of ELECTRON_DIST_FILE_GLOBS) {
      expect(files).toContain(glob)
    }
    expect(files).toContain('electron/main.cjs')
    expect(files).toContain('streets-gl-alt/build/**/*')
  })

  it('shared ELECTRON_DIST_FILE_GLOBS itself excludes maps and broad dist/**', () => {
    expect(packagingExcludesSourceMapsAndBroadDist(ELECTRON_DIST_FILE_GLOBS)).toBe(true)
  })
})

describe('vite BUILD-4 config', () => {
  it('disables production source maps in vite.config.ts', () => {
    // Avoid executing the full Vite config (side-effectful plugins); assert the source policy.
    const viteConfigSource = fs.readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8')
    expect(viteConfigSource).toMatch(/sourcemap:\s*false/)
    expect(viteConfigSource).toContain('cleanDistForBuild')
    expect(viteConfigSource).toContain('clean-dist-preserve')
  })
})
