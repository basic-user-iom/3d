/**
 * Simple Express server for local helper APIs (bug write + Replicate proxy).
 * This runs alongside Vite when using `npm run server` / `dev:full`.
 *
 * SEC-4: Replicate auth uses REPLICATE_API_TOKEN only (never VITE_*).
 * If a token was previously shipped as VITE_REPLICATE_API_TOKEN, rotate it.
 */

import express from 'express'
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const require = createRequire(import.meta.url)
const {
  loadReplicateEnvFile,
  hasReplicateApiToken,
  callReplicateApi,
  MAX_BODY_BYTES: REPLICATE_MAX_BODY_BYTES
} = require('./electron/replicateApi.cjs')

loadReplicateEnvFile(__dirname)

const app = express()
const PORT = 3001

const ALLOWED_ORIGINS = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000'
])
const MAX_MARKDOWN_BYTES = 64 * 1024

app.use(express.json({ limit: REPLICATE_MAX_BODY_BYTES }))

// CORS middleware — local Vite origin only
app.use((req, res, next) => {
  const origin = req.headers.origin
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.header('Access-Control-Allow-Origin', origin)
    res.header('Vary', 'Origin')
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') {
    res.sendStatus(origin && ALLOWED_ORIGINS.has(origin) ? 200 : 403)
  } else {
    next()
  }
})

function rejectForeignOrigin(req, res) {
  const origin = req.headers.origin
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    res.status(403).json({ error: 'Origin not allowed' })
    return true
  }
  return false
}

// Write bug/fix to FIXES_APPLIED.md
app.post('/api/write-bug', (req, res) => {
  try {
    if (rejectForeignOrigin(req, res)) return

    const { markdown } = req.body
    if (typeof markdown !== 'string' || markdown.length === 0) {
      return res.status(400).json({ error: 'No markdown provided' })
    }
    if (Buffer.byteLength(markdown, 'utf8') > MAX_MARKDOWN_BYTES) {
      return res.status(413).json({ error: 'Markdown payload too large' })
    }

    const filePath = path.join(__dirname, 'FIXES_APPLIED.md')

    let existingContent = ''
    if (fs.existsSync(filePath)) {
      existingContent = fs.readFileSync(filePath, 'utf-8')
    } else {
      existingContent = '# Bug Fixes Applied\n\n'
    }

    const newContent = existingContent + markdown
    fs.writeFileSync(filePath, newContent, 'utf-8')

    console.log(`[BugFix Server] Written bug/fix to FIXES_APPLIED.md`)
    res.json({ success: true, message: 'Bug written to file' })
  } catch (error) {
    console.error('[BugFix Server] Error writing bug:', error)
    res.status(500).json({ error: error.message })
  }
})

// SEC-4: Replicate status (no secrets returned)
app.get('/api/replicate/status', (req, res) => {
  if (rejectForeignOrigin(req, res)) return
  res.json({ configured: hasReplicateApiToken() })
})

// SEC-4: Narrow Replicate proxy — token stays on this process
app.post('/api/replicate/request', async (req, res) => {
  try {
    if (rejectForeignOrigin(req, res)) return
    const result = await callReplicateApi(req.body || {}, { rateLimitKey: 'server' })
    res.status(result.ok ? 200 : result.status || 500).json(result)
  } catch (error) {
    console.error('[Replicate Proxy] Error:', error)
    res.status(500).json({
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : 'Replicate proxy error'
    })
  }
})

// Bind to loopback only — never expose helper APIs on the LAN.
app.listen(PORT, '127.0.0.1', () => {
  console.log(`[Local API Server] Running on http://127.0.0.1:${PORT}`)
  console.log(`[Local API Server] Replicate configured: ${hasReplicateApiToken() ? 'yes' : 'no'}`)
})
