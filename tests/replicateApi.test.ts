import { createRequire } from 'node:module'
import { afterEach, describe, expect, test, vi } from 'vitest'

const require = createRequire(import.meta.url)
const replicateApi = require('../electron/replicateApi.cjs') as {
  isAllowedReplicatePath: (pathname: unknown) => boolean
  validateReplicateRequest: (request: {
    method?: unknown
    path?: unknown
    body?: unknown
  }) =>
    | { ok: true; method: string; path: string; body: unknown }
    | { ok: false; status: number; error: string }
  callReplicateApi: (
    request: { method?: unknown; path?: unknown; body?: unknown },
    options?: { rateLimitKey?: string }
  ) => Promise<{ ok: boolean; status: number; data?: unknown; error?: string }>
  hasReplicateApiToken: () => boolean
}

describe('replicateApi path allowlist (SEC-4)', () => {
  test('allows only Real-ESRGAN version lookup and prediction routes', () => {
    expect(replicateApi.isAllowedReplicatePath('/v1/models/xinntao/realesrgan/versions')).toBe(true)
    expect(replicateApi.isAllowedReplicatePath('/v1/predictions')).toBe(true)
    expect(replicateApi.isAllowedReplicatePath('/v1/predictions/abc123')).toBe(true)
  })

  test('rejects unrelated or unsafe paths', () => {
    expect(replicateApi.isAllowedReplicatePath('/v1/account')).toBe(false)
    expect(replicateApi.isAllowedReplicatePath('/v1/models/other/model/versions')).toBe(false)
    expect(replicateApi.isAllowedReplicatePath('https://evil.example/')).toBe(false)
    expect(replicateApi.isAllowedReplicatePath('/v1/predictions/../account')).toBe(false)
    expect(replicateApi.isAllowedReplicatePath('')).toBe(false)
  })
})

describe('replicateApi request validation', () => {
  test('accepts a valid POST prediction create payload', () => {
    const result = replicateApi.validateReplicateRequest({
      method: 'POST',
      path: '/v1/predictions',
      body: { version: 'abc', input: { image: 'data:image/png;base64,xx', scale: 4 } }
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.method).toBe('POST')
      expect(result.path).toBe('/v1/predictions')
    }
  })

  test('rejects disallowed methods and oversized bodies', () => {
    expect(
      replicateApi.validateReplicateRequest({
        method: 'DELETE',
        path: '/v1/predictions/abc'
      }).ok
    ).toBe(false)

    const huge = 'x'.repeat(13 * 1024 * 1024)
    const oversized = replicateApi.validateReplicateRequest({
      method: 'POST',
      path: '/v1/predictions',
      body: { version: 'v', input: { image: huge } }
    })
    expect(oversized.ok).toBe(false)
    if (oversized.ok === false) {
      expect(oversized.status).toBe(413)
    }
  })
})

describe('replicateApi callReplicateApi', () => {
  const originalToken = process.env.REPLICATE_API_TOKEN
  const originalFetch = globalThis.fetch

  afterEach(() => {
    if (originalToken === undefined) {
      delete process.env.REPLICATE_API_TOKEN
    } else {
      process.env.REPLICATE_API_TOKEN = originalToken
    }
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  test('fails closed when token is missing and never calls fetch', async () => {
    delete process.env.REPLICATE_API_TOKEN
    const fetchSpy = vi.fn()
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const result = await replicateApi.callReplicateApi(
      {
        method: 'GET',
        path: '/v1/models/xinntao/realesrgan/versions'
      },
      { rateLimitKey: `missing-token-${Date.now()}` }
    )

    expect(result.ok).toBe(false)
    expect(result.status).toBe(503)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(replicateApi.hasReplicateApiToken()).toBe(false)
  })

  test('forwards Authorization from REPLICATE_API_TOKEN only', async () => {
    process.env.REPLICATE_API_TOKEN = 'r8_test_secret_token'
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ results: [{ id: 'ver1' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    ) as unknown as typeof fetch

    const result = await replicateApi.callReplicateApi(
      {
        method: 'GET',
        path: '/v1/models/xinntao/realesrgan/versions'
      },
      { rateLimitKey: `with-token-${Date.now()}` }
    )

    expect(result.ok).toBe(true)
    expect(result.data).toEqual({ results: [{ id: 'ver1' }] })
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit
    ]
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Token r8_test_secret_token')
    expect(JSON.stringify(result)).not.toContain('r8_test_secret_token')
  })
})
