import { describe, expect, it } from 'vitest'

const {
  shouldAdoptExistingStreetsGLServer,
  createStreetsGLInstanceToken,
  tryHandleStreetsGLIdentity,
  STREETS_GL_IDENTITY_PATH
} = require('../electron/streetsGLServerSafety.cjs') as {
  shouldAdoptExistingStreetsGLServer: (state: {
    isPackaged: boolean
    ownsServer: boolean
    portReachable: boolean
  }) => { adopt: boolean; reason: string }
  createStreetsGLInstanceToken: () => string
  tryHandleStreetsGLIdentity: (
    request: { url?: string },
    response: {
      writeHead: (code: number, headers: Record<string, string>) => void
      end: (body: string) => void
    },
    instanceToken: string
  ) => boolean
  STREETS_GL_IDENTITY_PATH: string
}

describe('streetsGLServerSafety (SEC-5)', () => {
  it('never adopts a foreign listener in packaged mode', () => {
    expect(
      shouldAdoptExistingStreetsGLServer({
        isPackaged: true,
        ownsServer: false,
        portReachable: true
      })
    ).toEqual({ adopt: false, reason: 'packaged-no-foreign-adopt' })
  })

  it('may reuse a healthy server in development', () => {
    expect(
      shouldAdoptExistingStreetsGLServer({
        isPackaged: false,
        ownsServer: false,
        portReachable: true
      })
    ).toEqual({ adopt: true, reason: 'dev-reuse-healthy' })
  })

  it('treats an owned server as adoptable', () => {
    expect(
      shouldAdoptExistingStreetsGLServer({
        isPackaged: true,
        ownsServer: true,
        portReachable: true
      })
    ).toEqual({ adopt: true, reason: 'owned-server' })
  })

  it('serves the identity endpoint with the instance token', () => {
    const token = createStreetsGLInstanceToken()
    expect(token.length).toBeGreaterThanOrEqual(32)

    let status = 0
    let body = ''
    const handled = tryHandleStreetsGLIdentity(
      { url: STREETS_GL_IDENTITY_PATH },
      {
        writeHead: (code) => {
          status = code
        },
        end: (payload) => {
          body = payload
        }
      },
      token
    )

    expect(handled).toBe(true)
    expect(status).toBe(200)
    expect(JSON.parse(body)).toEqual({ ok: true, token })
    expect(tryHandleStreetsGLIdentity({ url: '/' }, { writeHead() {}, end() {} }, token)).toBe(
      false
    )
  })
})
