'use strict'

/**
 * Server/Electron-only Replicate API helper (SEC-4).
 *
 * Reads REPLICATE_API_TOKEN from the process environment (never VITE_*).
 * If a token was ever shipped as VITE_REPLICATE_API_TOKEN in a client build,
 * rotate it at https://replicate.com/account/api-tokens and use REPLICATE_API_TOKEN instead.
 */

const fs = require('fs')
const path = require('path')

const REPLICATE_API_BASE = 'https://api.replicate.com'
const MAX_BODY_BYTES = 12 * 1024 * 1024
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 20

const ALLOWED_METHODS = new Set(['GET', 'POST'])
const ALLOWED_PATH_PATTERNS = [
  /^\/v1\/models\/xinntao\/realesrgan\/versions\/?$/,
  /^\/v1\/predictions\/?$/,
  /^\/v1\/predictions\/[A-Za-z0-9._-]+\/?$/
]

let envFileLoaded = false
const rateLimitBuckets = new Map()

/**
 * Load KEY=VALUE pairs from a .env file into process.env when unset.
 * Does not override existing environment variables.
 * @param {string} rootDir
 */
function loadReplicateEnvFile(rootDir) {
  if (envFileLoaded || !rootDir) return
  envFileLoaded = true

  const envPath = path.join(rootDir, '.env')
  if (!fs.existsSync(envPath)) return

  let text
  try {
    text = fs.readFileSync(envPath, 'utf8')
  } catch {
    return
  }

  let sawLegacyViteToken = false
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (key === 'VITE_REPLICATE_API_TOKEN' && value) {
      sawLegacyViteToken = true
      continue
    }
    if (key !== 'REPLICATE_API_TOKEN') continue
    if (process.env.REPLICATE_API_TOKEN) continue
    process.env.REPLICATE_API_TOKEN = value
  }

  if (sawLegacyViteToken && !(process.env.REPLICATE_API_TOKEN || '').trim()) {
    console.warn(
      '[SEC-4] VITE_REPLICATE_API_TOKEN is ignored (unsafe in client bundles). ' +
        'Rename it to REPLICATE_API_TOKEN, rotate the token at Replicate, and restart.'
    )
  }
}

/**
 * @returns {string | null}
 */
function getReplicateApiToken() {
  const token = (process.env.REPLICATE_API_TOKEN || '').trim()
  return token || null
}

/**
 * @returns {boolean}
 */
function hasReplicateApiToken() {
  return !!getReplicateApiToken()
}

/**
 * @param {unknown} pathname
 * @returns {boolean}
 */
function isAllowedReplicatePath(pathname) {
  if (typeof pathname !== 'string' || !pathname.startsWith('/')) return false
  if (pathname.includes('..') || pathname.includes('\\') || pathname.includes('://')) {
    return false
  }
  return ALLOWED_PATH_PATTERNS.some((re) => re.test(pathname))
}

/**
 * @param {string} [bucketKey]
 * @returns {boolean}
 */
function checkRateLimit(bucketKey = 'default') {
  const now = Date.now()
  let bucket = rateLimitBuckets.get(bucketKey)
  if (!bucket) {
    bucket = []
    rateLimitBuckets.set(bucketKey, bucket)
  }
  const fresh = bucket.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS)
  if (fresh.length >= RATE_LIMIT_MAX) {
    rateLimitBuckets.set(bucketKey, fresh)
    return false
  }
  fresh.push(now)
  rateLimitBuckets.set(bucketKey, fresh)
  return true
}

/**
 * @param {{ method?: unknown, path?: unknown, body?: unknown }} request
 * @returns {{ ok: true, method: string, path: string, body: unknown } | { ok: false, status: number, error: string }}
 */
function validateReplicateRequest(request) {
  if (!request || typeof request !== 'object') {
    return { ok: false, status: 400, error: 'Invalid request payload' }
  }

  const method = typeof request.method === 'string' ? request.method.toUpperCase() : ''
  if (!ALLOWED_METHODS.has(method)) {
    return { ok: false, status: 405, error: 'Method not allowed' }
  }

  const pathname = typeof request.path === 'string' ? request.path.trim() : ''
  if (!isAllowedReplicatePath(pathname)) {
    return { ok: false, status: 403, error: 'Path not allowed' }
  }

  if (method === 'GET' && request.body != null) {
    return { ok: false, status: 400, error: 'GET requests must not include a body' }
  }

  if (method === 'POST') {
    if (request.body == null || typeof request.body !== 'object') {
      return { ok: false, status: 400, error: 'POST body must be a JSON object' }
    }
    let encoded
    try {
      encoded = JSON.stringify(request.body)
    } catch {
      return { ok: false, status: 400, error: 'POST body is not serializable' }
    }
    if (Buffer.byteLength(encoded, 'utf8') > MAX_BODY_BYTES) {
      return { ok: false, status: 413, error: 'Request body too large' }
    }
  }

  return {
    ok: true,
    method,
    path: pathname.replace(/\/+$/, '') || pathname,
    body: method === 'POST' ? request.body : undefined
  }
}

/**
 * Perform a narrow Replicate API call. Never returns the token.
 * @param {{ method?: unknown, path?: unknown, body?: unknown }} request
 * @param {{ rateLimitKey?: string }} [options]
 * @returns {Promise<{ ok: boolean, status: number, data?: unknown, error?: string }>}
 */
async function callReplicateApi(request, options = {}) {
  if (!checkRateLimit(options.rateLimitKey || 'default')) {
    return { ok: false, status: 429, error: 'Too many Replicate requests; try again shortly' }
  }

  const validated = validateReplicateRequest(request)
  if (!validated.ok) {
    return { ok: false, status: validated.status, error: validated.error }
  }

  const token = getReplicateApiToken()
  if (!token) {
    return {
      ok: false,
      status: 503,
      error: 'REPLICATE_API_TOKEN is not configured on the server/Electron main process'
    }
  }

  const url = `${REPLICATE_API_BASE}${validated.path}`
  /** @type {Record<string, string>} */
  const headers = {
    Authorization: `Token ${token}`,
    Accept: 'application/json'
  }

  /** @type {RequestInit} */
  const init = {
    method: validated.method,
    headers
  }

  if (validated.method === 'POST') {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(validated.body)
  }

  let response
  try {
    response = await fetch(url, init)
  } catch (error) {
    return {
      ok: false,
      status: 502,
      error: error instanceof Error ? error.message : 'Failed to reach Replicate API'
    }
  }

  const text = await response.text()
  let data
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { raw: text }
  }

  if (!response.ok) {
    const message =
      (data && typeof data === 'object' && (data.detail || data.error || data.title)) ||
      `Replicate API error (${response.status})`
    return {
      ok: false,
      status: response.status,
      error: typeof message === 'string' ? message : `Replicate API error (${response.status})`,
      data
    }
  }

  return { ok: true, status: response.status, data }
}

module.exports = {
  MAX_BODY_BYTES,
  loadReplicateEnvFile,
  getReplicateApiToken,
  hasReplicateApiToken,
  isAllowedReplicatePath,
  validateReplicateRequest,
  checkRateLimit,
  callReplicateApi
}
