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

/**
 * Create a timeout promise
 */
function createTimeout(timeoutMs: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Request timeout after ${timeoutMs}ms`))
    }, timeoutMs)
  })
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

  let lastError: Error | null = null
  let lastResponse: Response | undefined

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Create abort controller for timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      // Merge abort signal with existing signal
      const signal = options.signal 
        ? (() => {
            const combinedController = new AbortController()
            const originalSignal = options.signal!
            
            originalSignal.addEventListener('abort', () => {
              combinedController.abort()
            })
            
            combinedController.signal.addEventListener('abort', () => {
              controller.abort()
            })
            
            return combinedController.signal
          })()
        : controller.signal

      const fetchOptions = {
        ...options,
        signal,
      }

      // Make the request
      const response = await fetch(url, fetchOptions)
      clearTimeout(timeoutId)

      // Check if response is ok
      if (!response.ok) {
        // Check if we should retry
        const error = new Error(`HTTP ${response.status}: ${response.statusText}`) as NetworkError
        error.status = response.status
        error.statusText = response.statusText
        error.url = url
        error.retries = attempt
        error.isRetryable = retryOn(error, response)

        if (error.isRetryable && attempt < maxRetries) {
          lastError = error
          lastResponse = response
          
          // Calculate delay with exponential backoff
          const delay = retryDelay * Math.pow(2, attempt)
          
          // For rate limits (429), check Retry-After header
          if (response.status === 429) {
            const retryAfter = response.headers.get('Retry-After')
            const waitTime = retryAfter 
              ? Math.max(parseInt(retryAfter) * 1000, delay)
              : delay
            
            console.warn(`[Network] Rate limited (429), waiting ${Math.round(waitTime/1000)}s before retry ${attempt + 1}/${maxRetries}`, { url })
            await new Promise(resolve => setTimeout(resolve, waitTime))
            continue
          }

          console.warn(`[Network] Request failed, retrying in ${delay}ms... (${attempt + 1}/${maxRetries})`, { 
            url, 
            status: response.status,
            statusText: response.statusText 
          })
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        }

        // Not retryable or out of retries
        throw error
      }

      // Success!
      return response

    } catch (error) {
      const networkError = error as Error
      lastError = networkError

      // Check if it's a timeout/abort
      if (networkError.name === 'AbortError' || networkError.message.includes('timeout')) {
        const timeoutError = new Error(`Request timeout: ${url}`) as NetworkError
        timeoutError.url = url
        timeoutError.retries = attempt
        timeoutError.isRetryable = attempt < maxRetries

        if (timeoutError.isRetryable) {
          const delay = retryDelay * Math.pow(2, attempt)
          console.warn(`[Network] Request timeout, retrying in ${delay}ms... (${attempt + 1}/${maxRetries})`, { url })
          await new Promise(resolve => setTimeout(resolve, delay))
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
          await new Promise(resolve => setTimeout(resolve, delay))
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
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }

      // Not retryable or out of retries
      throw networkError
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




