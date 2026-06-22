#!/usr/bin/env node

/**
 * Automated smoke tests via Playwright.
 * Builds the app first so preview matches CI/production assets.
 */

import { spawnSync } from 'node:child_process'
import process from 'node:process'

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

console.log('[smoke-tests] Building viewer for preview...')
run('npm', ['run', 'build'])

console.log('[smoke-tests] Running Playwright smoke suite...')
run('npx', ['playwright', 'test'])

console.log('[smoke-tests] All smoke checks passed.')
