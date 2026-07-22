'use strict'

const http = require('http')
const crypto = require('crypto')

const STREETS_GL_IDENTITY_PATH = '/__streets_gl_ok'
const DEFAULT_STREETS_GL_PORT = 8081

/**
 * @returns {string}
 */
function createStreetsGLInstanceToken() {
  return crypto.randomBytes(24).toString('hex')
}

/**
 * Packaged Electron must never adopt an arbitrary process already listening on 8081.
 * Dev mode may reuse a healthy local Streets GL webpack server for DX.
 *
 * @param {{ isPackaged: boolean, ownsServer: boolean, portReachable: boolean }} state
 * @returns {{ adopt: boolean, reason: string }}
 */
function shouldAdoptExistingStreetsGLServer(state) {
  if (state.ownsServer) {
    return { adopt: true, reason: 'owned-server' }
  }
  if (state.isPackaged) {
    return { adopt: false, reason: 'packaged-no-foreign-adopt' }
  }
  if (state.portReachable) {
    return { adopt: true, reason: 'dev-reuse-healthy' }
  }
  return { adopt: false, reason: 'not-reachable' }
}

/**
 * @param {number} port
 * @param {string} expectedToken
 * @param {number} [timeoutMs]
 * @returns {Promise<boolean>}
 */
function verifyStreetsGLInstanceToken(port, expectedToken, timeoutMs = 1500) {
  if (!expectedToken || typeof expectedToken !== 'string') {
    return Promise.resolve(false)
  }

  return new Promise((resolve) => {
    const request = http.get(
      {
        host: '127.0.0.1',
        port,
        path: STREETS_GL_IDENTITY_PATH,
        timeout: timeoutMs,
        headers: { Accept: 'application/json' }
      },
      (response) => {
        let body = ''
        response.setEncoding('utf8')
        response.on('data', (chunk) => {
          body += chunk
          if (body.length > 4096) {
            response.destroy()
            resolve(false)
          }
        })
        response.on('end', () => {
          if (response.statusCode !== 200) {
            resolve(false)
            return
          }
          try {
            const parsed = JSON.parse(body)
            resolve(parsed && parsed.ok === true && parsed.token === expectedToken)
          } catch {
            resolve(false)
          }
        })
      }
    )

    request.on('error', () => resolve(false))
    request.on('timeout', () => {
      request.destroy()
      resolve(false)
    })
  })
}

/**
 * @param {import('http').IncomingMessage} request
 * @param {import('http').ServerResponse} response
 * @param {string} instanceToken
 * @returns {boolean} true when the identity route was handled
 */
function tryHandleStreetsGLIdentity(request, response, instanceToken) {
  const requestUrl = request.url || '/'
  const pathname = decodeURIComponent(requestUrl.split('?')[0] || '/')
  if (pathname !== STREETS_GL_IDENTITY_PATH) {
    return false
  }

  response.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  })
  response.end(JSON.stringify({ ok: true, token: instanceToken }))
  return true
}

module.exports = {
  STREETS_GL_IDENTITY_PATH,
  DEFAULT_STREETS_GL_PORT,
  createStreetsGLInstanceToken,
  shouldAdoptExistingStreetsGLServer,
  verifyStreetsGLInstanceToken,
  tryHandleStreetsGLIdentity
}
