/**
 * Network Utilities
 * Centralized error handling and retry logic for network requests
 */

export interface RetryOptions {
  maxRetries?: number
  retryDelay?: number
  retryOn?: (error: Error, response?: Response) => boolean
  timeout?: number
}

export interface NetworkError extends Error {
  status?: number
  statusText?: string
  url?: string
  retries?: number
  isRetryable?: boolean
}

/**
 * Check if an error is retryable
 */
function isRetryableError(error: Error, response?: Response): boolean {
  // Network errors (connection failed, timeout, etc.)
  if (error.message.includes('Failed to fetch') ||
      error.message.includes('NetworkError') ||
      error.message.includes('Network request failed') ||
      error.name === 'TypeError') {
    return true
  }

  // HTTP errors that are retryable
  if (response) {
    // 429 = Too Many Requests (rate limit)
    // 500-599 = Server errors
    // 408 = Request Timeout
    // 502, 503, 504 = Gateway errors
    if (response.status === 429 ||
        response.status === 408 ||
        (response.status >= 500 && response.status < 600)) {
      return true
    }
  }

  return false
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const err = error as Error
  return err.name === 'AbortError' || /aborted|AbortError/i.test(err.message)
}

function createCallerAbortError(url: string, attempt: number): NetworkError {
  const error = new Error(`Request aborted: ${url}`) as NetworkError
  error.name = 'AbortError'
  error.url = url
  error.retries = attempt
  error.isRetryable = false
  return error
}

function createTimeoutError(url: string, attempt: number, canRetry: boolean): NetworkError {
  const error = new Error(`Request timeout: ${url}`) as NetworkError
  error.url = url
  error.retries = attempt
  error.isRetryable = canRetry
  return error
}

/**
 * Wait that clears its timer and abort listener on settle or cancel.
 */
function waitMs(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      const err = new Error('Aborted')
      err.name = 'AbortError'
      reject(err)
      return
    }

    let settled = false
    let onAbort: (() => void) | undefined

    const timeoutId = setTimeout(() => {
      if (settled) return
      settled = true
      if (signal && onAbort) {
        signal.removeEventListener('abort', onAbort)
      }
      resolve()
    }, ms)

    onAbort = () => {
      if (settled) return
      settled = true
      clearTimeout(timeoutId)
      if (signal && onAbort) {
        signal.removeEventListener('abort', onAbort)
      }
      const err = new Error('Aborted')
      err.name = 'AbortError'
      reject(err)
    }

    if (signal) {
      signal.addEventListener('abort', onAbort)
    }
  })
}

async function waitForRetry(
  ms: number,
  url: string,
  attempt: number,
  signal?: AbortSignal | null
): Promise<void> {
  try {
    await waitMs(ms, signal)
  } catch {
    throw createCallerAbortError(url, attempt)
  }
}

type AttemptAbortHandle = {
  signal: AbortSignal
  cleanup: () => void
  didTimeout: () => boolean
}

/**
 * One attempt: timeout + optional caller signal both abort the same controller.
 * Always call cleanup() in finally (clears timer + removes caller listener).
 */
function createAttemptAbort(
  timeoutMs: number,
  callerSignal?: AbortSignal | null
): AttemptAbortHandle {
  const controller = new AbortController()
  let timedOut = false
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  let onCallerAbort: (() => void) | undefined
  let cleanedUp = false

  const cleanup = () => {
    if (cleanedUp) return
    cleanedUp = true
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId)
      timeoutId = undefined
    }
    if (callerSignal && onCallerAbort) {
      callerSignal.removeEventListener('abort', onCallerAbort)
      onCallerAbort = undefined
    }
  }

  if (callerSignal?.aborted) {
    controller.abort()
    return {
      signal: controller.signal,
      cleanup,
      didTimeout: () => false,
    }
  }

  timeoutId = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  if (callerSignal) {
    onCallerAbort = () => {
      controller.abort()
    }
    callerSignal.addEventListener('abort', onCallerAbort)
  }

  return {
    signal: controller.signal,
    cleanup,
    didTimeout: () => timedOut,
  }
}

/**
 * Fetch with retry logic and better error handling
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retryOptions: RetryOptions = {}
): Promise<Response> {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    retryOn = isRetryableError,
    timeout = 30000, // 30 seconds default timeout
  } = retryOptions

  const callerSignal = options.signal ?? null
  let lastError: Error | null = null
  let lastResponse: Response | undefined

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (callerSignal?.aborted) {
      throw createCallerAbortError(url, attempt)
    }

    const attemptAbort = createAttemptAbort(timeout, callerSignal)

    try {
      const fetchOptions: RequestInit = {
        ...options,
        signal: attemptAbort.signal,
      }

      const response = await fetch(url, fetchOptions)

      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}: ${response.statusText}`) as NetworkError
        error.status = response.status
        error.statusText = response.statusText
        error.url = url
        error.retries = attempt
        error.isRetryable = retryOn(error, response)

        if (error.isRetryable && attempt < maxRetries) {
          lastError = error
          lastResponse = response

          const delay = retryDelay * Math.pow(2, attempt)

          if (response.status === 429) {
            const retryAfter = response.headers.get('Retry-After')
            const waitTime = retryAfter
              ? Math.max(parseInt(retryAfter) * 1000, delay)
              : delay

            console.warn(`[Network] Rate limited (429), waiting ${Math.round(waitTime / 1000)}s before retry ${attempt + 1}/${maxRetries}`, { url })
            // cleanup before waiting so the attempt timer/listener cannot leak across retries
            attemptAbort.cleanup()
            await waitForRetry(waitTime, url, attempt, callerSignal)
            continue
          }

          console.warn(`[Network] Request failed, retrying in ${delay}ms... (${attempt + 1}/${maxRetries})`, {
            url,
            status: response.status,
            statusText: response.statusText
          })
          attemptAbort.cleanup()
          await waitForRetry(delay, url, attempt, callerSignal)
          continue
        }

        throw error
      }

      return response
    } catch (error) {
      // Caller cancelled — never retry
      if (callerSignal?.aborted && !attemptAbort.didTimeout()) {
        throw createCallerAbortError(url, attempt)
      }

      const networkError = error as Error
      lastError = networkError

      // Timeout / abort from our attempt controller
      if (attemptAbort.didTimeout() || isAbortError(networkError) || networkError.message.includes('timeout')) {
        const canRetry = attempt < maxRetries
        const timeoutError = createTimeoutError(url, attempt, canRetry)

        if (timeoutError.isRetryable) {
          const delay = retryDelay * Math.pow(2, attempt)
          console.warn(`[Network] Request timeout, retrying in ${delay}ms... (${attempt + 1}/${maxRetries})`, { url })
          attemptAbort.cleanup()
          await waitForRetry(delay, url, attempt, callerSignal)
          continue
        }

        throw timeoutError
      }

      // Check if it's a network error (connection failed, etc.)
      if (networkError.message.includes('Failed to fetch') ||
          networkError.message.includes('NetworkError') ||
          networkError.message.includes('Network request failed')) {
        const connectionError = new Error(`Connection failed: ${url}`) as NetworkError
        connectionError.url = url
        connectionError.retries = attempt
        connectionError.isRetryable = retryOn(connectionError)

        if (connectionError.isRetryable && attempt < maxRetries) {
          const delay = retryDelay * Math.pow(2, attempt)
          console.warn(`[Network] Connection failed, retrying in ${delay}ms... (${attempt + 1}/${maxRetries})`, { url })
          attemptAbort.cleanup()
          await waitForRetry(delay, url, attempt, callerSignal)
          continue
        }

        throw connectionError
      }

      // Other errors - check if retryable
      if (retryOn(networkError, lastResponse) && attempt < maxRetries) {
        const delay = retryDelay * Math.pow(2, attempt)
        console.warn(`[Network] Request failed, retrying in ${delay}ms... (${attempt + 1}/${maxRetries})`, {
          url,
          error: networkError.message
        })
        attemptAbort.cleanup()
        await waitForRetry(delay, url, attempt, callerSignal)
        continue
      }

      throw networkError
    } finally {
      attemptAbort.cleanup()
    }
  }

  // Should never reach here, but TypeScript needs it
  throw lastError || new Error(`Failed to fetch ${url} after ${maxRetries} retries`)
}

/**
 * Fetch JSON with retry logic
 */
export async function fetchJSON<T = any>(
  url: string,
  options: RequestInit = {},
  retryOptions: RetryOptions = {}
): Promise<T> {
  const response = await fetchWithRetry(url, options, retryOptions)

  try {
    return await response.json()
  } catch (error) {
    const jsonError = new Error(`Failed to parse JSON from ${url}: ${error instanceof Error ? error.message : String(error)}`) as NetworkError
    jsonError.url = url
    throw jsonError
  }
}

/**
 * Fetch with better error messages for common scenarios
 */
export async function fetchWithErrorHandling(
  url: string,
  options: RequestInit = {},
  retryOptions: RetryOptions = {}
): Promise<Response> {
  try {
    return await fetchWithRetry(url, options, retryOptions)
  } catch (error) {
    const networkError = error as NetworkError

    // Provide user-friendly error messages
    if (networkError.message.includes('Connection failed') ||
        networkError.message.includes('Failed to fetch')) {
      throw new Error(
        `Unable to connect to ${new URL(url).hostname}. ` +
        `Please check your internet connection, VPN settings, or firewall. ` +
        `If the problem persists, the service may be temporarily unavailable.`
      )
    }

    if (networkError.message.includes('timeout')) {
      throw new Error(
        `Request to ${new URL(url).hostname} timed out. ` +
        `The server took too long to respond. Please try again later.`
      )
    }

    if (networkError.status === 429) {
      throw new Error(
        `Rate limit exceeded for ${new URL(url).hostname}. ` +
        `Please wait a moment and try again.`
      )
    }

    if (networkError.status === 401 || networkError.status === 403) {
      throw new Error(
        `Authentication failed for ${new URL(url).hostname}. ` +
        `Please check your API key or credentials.`
      )
    }

    // Re-throw with original message if we can't provide a better one
    throw error
  }
}

/**
 * Suppress expected connection errors in console
 * Use this for APIs that are expected to fail sometimes (rate limits, etc.)
 */
export function suppressExpectedErrors(url: string, error: Error): boolean {
  const hostname = new URL(url).hostname

  // Suppress rate limit errors (429) - these are expected
  if (error.message.includes('429') || error.message.includes('Rate limit')) {
    return true
  }

  // Suppress errors from external APIs that are known to have intermittent issues
  const expectedFailureHosts = [
    'nominatim.openstreetmap.org',
    'overpass-api.de',
    'api.replicate.com',
    'tile.googleapis.com',
  ]

  if (expectedFailureHosts.some(host => hostname.includes(host))) {
    // Only suppress network errors, not auth errors
    if (error.message.includes('Connection failed') ||
        error.message.includes('Failed to fetch') ||
        error.message.includes('timeout')) {
      return true
    }
  }

  return false
}
