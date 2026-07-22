'use strict'

/**
 * Decide whether a URL is safe to hand to the OS via shell.openExternal.
 * Only plain http(s) destinations without credentials are allowed.
 *
 * @param {unknown} rawUrl
 * @param {{ allowHttp?: boolean }} [options]
 * @returns {boolean}
 */
function isSafeExternalUrl(rawUrl, options = {}) {
  if (typeof rawUrl !== 'string' || rawUrl.trim() === '') {
    return false
  }

  let parsed
  try {
    parsed = new URL(rawUrl)
  } catch {
    return false
  }

  const protocol = parsed.protocol.toLowerCase()
  const allowHttp = options.allowHttp === true

  if (protocol === 'https:') {
    // continue
  } else if (protocol === 'http:' && allowHttp) {
    // continue
  } else {
    return false
  }

  // Reject embedded credentials (https://user:pass@host/...)
  if (parsed.username || parsed.password) {
    return false
  }

  // Reject empty / malformed hosts
  if (!parsed.hostname) {
    return false
  }

  return true
}

/**
 * @param {unknown} rawUrl
 * @param {{ allowHttp?: boolean }} [options]
 * @returns {string | null} Normalized href when safe, otherwise null
 */
function getSafeExternalUrl(rawUrl, options = {}) {
  if (!isSafeExternalUrl(rawUrl, options)) {
    return null
  }

  try {
    return new URL(String(rawUrl)).href
  } catch {
    return null
  }
}

module.exports = {
  isSafeExternalUrl,
  getSafeExternalUrl
}
