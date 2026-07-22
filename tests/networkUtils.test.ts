import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchWithRetry } from '../src/utils/networkUtils'

function hangingFetch() {
  return vi.fn((_url: string, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal
      if (!signal) return
      if (signal.aborted) {
        const err = new Error('Aborted')
        err.name = 'AbortError'
        reject(err)
        return
      }
      signal.addEventListener(
        'abort',
        () => {
          const err = new Error('Aborted')
          err.name = 'AbortError'
          reject(err)
        },
        { once: true }
      )
    })
  })
}

describe('fetchWithRetry (LIFE-5)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('rejects a hanging fetch at the configured timeout without a caller signal', async () => {
    vi.stubGlobal('fetch', hangingFetch())

    const promise = fetchWithRetry(
      'https://example.com/hang',
      {},
      { timeout: 1000, maxRetries: 0, retryDelay: 0 }
    )
    const expectation = expect(promise).rejects.toMatchObject({
      message: expect.stringMatching(/timeout/i),
    })

    await vi.advanceTimersByTimeAsync(1000)
    await expectation
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects a hanging fetch at the configured timeout with a caller signal', async () => {
    vi.stubGlobal('fetch', hangingFetch())
    const caller = new AbortController()

    const promise = fetchWithRetry(
      'https://example.com/hang',
      { signal: caller.signal },
      { timeout: 500, maxRetries: 0, retryDelay: 0 }
    )
    const expectation = expect(promise).rejects.toMatchObject({
      message: expect.stringMatching(/timeout/i),
    })

    await vi.advanceTimersByTimeAsync(500)
    await expectation
    expect(caller.signal.aborted).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('stops the active attempt immediately when the caller aborts', async () => {
    const fetchMock = hangingFetch()
    vi.stubGlobal('fetch', fetchMock)
    const caller = new AbortController()

    const promise = fetchWithRetry(
      'https://example.com/hang',
      { signal: caller.signal },
      { timeout: 30_000, maxRetries: 3, retryDelay: 1000 }
    )
    const expectation = expect(promise).rejects.toMatchObject({
      name: 'AbortError',
      message: expect.stringMatching(/aborted/i),
    })

    await Promise.resolve()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    caller.abort()
    await expectation
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects immediately when the caller signal is already aborted', async () => {
    const fetchMock = hangingFetch()
    vi.stubGlobal('fetch', fetchMock)
    const caller = new AbortController()
    caller.abort()

    await expect(
      fetchWithRetry(
        'https://example.com/hang',
        { signal: caller.signal },
        { timeout: 1000, maxRetries: 2, retryDelay: 100 }
      )
    ).rejects.toMatchObject({
      name: 'AbortError',
      message: expect.stringMatching(/aborted/i),
    })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('removes caller abort listeners after success and after timeout failure', async () => {
    const caller = new AbortController()
    const addSpy = vi.spyOn(caller.signal, 'addEventListener')
    const removeSpy = vi.spyOn(caller.signal, 'removeEventListener')

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('ok', { status: 200 }))
    )

    await fetchWithRetry(
      'https://example.com/ok',
      { signal: caller.signal },
      { timeout: 1000, maxRetries: 0 }
    )

    expect(addSpy.mock.calls.length).toBeGreaterThan(0)
    expect(removeSpy.mock.calls.length).toBeGreaterThan(0)
    expect(vi.getTimerCount()).toBe(0)

    addSpy.mockClear()
    removeSpy.mockClear()
    vi.stubGlobal('fetch', hangingFetch())

    const promise = fetchWithRetry(
      'https://example.com/hang',
      { signal: caller.signal },
      { timeout: 200, maxRetries: 0, retryDelay: 0 }
    )
    const expectation = expect(promise).rejects.toThrow(/timeout/i)
    await vi.advanceTimersByTimeAsync(200)
    await expectation

    expect(addSpy.mock.calls.length).toBeGreaterThan(0)
    expect(removeSpy.mock.calls.length).toBeGreaterThan(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('retries timeouts then leaves no timers or caller listeners', async () => {
    const caller = new AbortController()
    const removeSpy = vi.spyOn(caller.signal, 'removeEventListener')
    vi.stubGlobal('fetch', hangingFetch())

    const promise = fetchWithRetry(
      'https://example.com/hang',
      { signal: caller.signal },
      { timeout: 100, maxRetries: 2, retryDelay: 50 }
    )
    const expectation = expect(promise).rejects.toMatchObject({
      message: expect.stringMatching(/timeout/i),
    })

    // attempt 0 timeout
    await vi.advanceTimersByTimeAsync(100)
    // retry delay 50
    await vi.advanceTimersByTimeAsync(50)
    // attempt 1 timeout
    await vi.advanceTimersByTimeAsync(100)
    // retry delay 100
    await vi.advanceTimersByTimeAsync(100)
    // attempt 2 timeout
    await vi.advanceTimersByTimeAsync(100)

    await expectation
    expect(vi.getTimerCount()).toBe(0)
    expect(removeSpy.mock.calls.length).toBeGreaterThan(0)
  })

  it('aborts during retry delay without leaving timers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('fail', { status: 503, statusText: 'Unavailable' }))
    )
    const caller = new AbortController()

    const promise = fetchWithRetry(
      'https://example.com/flaky',
      { signal: caller.signal },
      { timeout: 5000, maxRetries: 3, retryDelay: 1000 }
    )
    const expectation = expect(promise).rejects.toMatchObject({
      name: 'AbortError',
    })

    await Promise.resolve()
    caller.abort()
    await expectation
    expect(vi.getTimerCount()).toBe(0)
  })
})
