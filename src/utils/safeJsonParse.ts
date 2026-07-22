/**
 * DATA-5: Bounded / non-blocking JSON parsing for large project files.
 *
 * - Rejects oversized inputs before parse.
 * - Parses in a Worker when available (so a timeout can terminate work).
 * - Falls back to sync parse in Node/tests.
 * - Walks the result for nesting / node / embedded-base64 limits.
 */

export const PROJECT_JSON_BOUNDS = {
  /** Maximum project JSON UTF-8 / file byte length. */
  maxJsonBytes: 250 * 1024 * 1024,
  /** Maximum nesting depth. */
  maxDepth: 64,
  /** Maximum total object/array/leaf nodes visited. */
  maxNodes: 500_000,
  /** Maximum length of a single array. */
  maxArrayLength: 100_000,
  /** Maximum total decoded base64 payload across string fields that look embedded. */
  maxEmbeddedBase64Bytes: 100 * 1024 * 1024,
  /** Worker parse timeout (ms). Worker is terminated on expiry. */
  parseTimeoutMs: 30_000
} as const

/** Bounds accept any number so callers/tests can tighten limits without literal-type conflicts. */
export type ProjectJsonBounds = {
  -readonly [K in keyof typeof PROJECT_JSON_BOUNDS]: number
}

export class JsonBoundsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'JsonBoundsError'
  }
}

function looksLikeBase64Payload(value: string): boolean {
  if (value.length < 256) return false
  if (value.startsWith('data:') && value.includes(';base64,')) return true
  // Long strings that are predominantly base64 alphabet (embedded file blobs).
  if (value.length < 1024) return false
  const sample = value.length > 4096 ? value.slice(0, 4096) : value
  return /^[A-Za-z0-9+/=\s]+$/.test(sample)
}

function estimatedDecodedBase64Bytes(value: string): number {
  if (value.startsWith('data:') && value.includes(';base64,')) {
    const idx = value.indexOf(';base64,')
    const payload = value.slice(idx + ';base64,'.length)
    return Math.floor(payload.replace(/\s/g, '').length * 0.75)
  }
  return Math.floor(value.replace(/\s/g, '').length * 0.75)
}

/**
 * Walk a parsed JSON value and enforce structural / embedded-payload limits.
 */
export function assertJsonStructureBounds(
  value: unknown,
  limits: ProjectJsonBounds = PROJECT_JSON_BOUNDS
): void {
  let nodes = 0
  let embeddedBytes = 0

  const visit = (node: unknown, depth: number): void => {
    if (depth > limits.maxDepth) {
      throw new JsonBoundsError(
        `JSON nesting exceeds limit (max depth ${limits.maxDepth})`
      )
    }
    nodes += 1
    if (nodes > limits.maxNodes) {
      throw new JsonBoundsError(
        `JSON structure is too large (max ${limits.maxNodes.toLocaleString()} nodes)`
      )
    }

    if (node === null || typeof node !== 'object') {
      if (typeof node === 'string' && looksLikeBase64Payload(node)) {
        embeddedBytes += estimatedDecodedBase64Bytes(node)
        if (embeddedBytes > limits.maxEmbeddedBase64Bytes) {
          throw new JsonBoundsError(
            `Embedded base64 payload exceeds limit (max ${Math.floor(limits.maxEmbeddedBase64Bytes / (1024 * 1024))} MB)`
          )
        }
      }
      return
    }

    if (Array.isArray(node)) {
      if (node.length > limits.maxArrayLength) {
        throw new JsonBoundsError(
          `JSON array exceeds length limit (${node.length}; max ${limits.maxArrayLength.toLocaleString()})`
        )
      }
      for (const item of node) visit(item, depth + 1)
      return
    }

    for (const key of Object.keys(node as Record<string, unknown>)) {
      visit((node as Record<string, unknown>)[key], depth + 1)
    }
  }

  visit(value, 0)
}

export function assertJsonTextSize(
  text: string,
  limits: ProjectJsonBounds = PROJECT_JSON_BOUNDS
): void {
  // Prefer byte length when available (UTF-8); fall back to string length.
  const bytes =
    typeof TextEncoder !== 'undefined'
      ? new TextEncoder().encode(text).byteLength
      : text.length
  if (bytes > limits.maxJsonBytes) {
    throw new JsonBoundsError(
      `JSON is too large (${(bytes / (1024 * 1024)).toFixed(1)} MB; max ${Math.floor(limits.maxJsonBytes / (1024 * 1024))} MB)`
    )
  }
}

function parseJsonSync<T>(text: string): T {
  try {
    return JSON.parse(text) as T
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Failed to parse JSON: ${error.message}`)
    }
    throw error
  }
}

function canUseJsonWorker(): boolean {
  return typeof Worker !== 'undefined' && typeof Blob !== 'undefined' && typeof URL !== 'undefined'
}

/**
 * Parse JSON off the UI thread when Workers are available; otherwise sync.
 * Always enforces size + structure bounds. Worker is terminated on timeout.
 */
export async function parseJsonBounded<T = unknown>(
  text: string,
  limits: ProjectJsonBounds = PROJECT_JSON_BOUNDS
): Promise<T> {
  assertJsonTextSize(text, limits)

  let parsed: T
  if (canUseJsonWorker()) {
    parsed = await parseJsonInWorker<T>(text, limits.parseTimeoutMs)
  } else {
    parsed = parseJsonSync<T>(text)
  }

  assertJsonStructureBounds(parsed, limits)
  return parsed
}

function parseJsonInWorker<T>(text: string, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const workerCode = `
      self.onmessage = function (e) {
        try {
          var value = JSON.parse(e.data);
          self.postMessage({ ok: true, value: value });
        } catch (err) {
          self.postMessage({
            ok: false,
            error: err && err.message ? String(err.message) : 'JSON parse failed'
          });
        }
      };
    `
    const blob = new Blob([workerCode], { type: 'application/javascript' })
    const url = URL.createObjectURL(blob)
    let worker: Worker
    try {
      worker = new Worker(url)
    } catch (error) {
      URL.revokeObjectURL(url)
      try {
        resolve(parseJsonSync<T>(text))
      } catch (syncError) {
        reject(syncError)
      }
      return
    }

    let settled = false
    const cleanup = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      worker.terminate()
      URL.revokeObjectURL(url)
    }

    const timer = setTimeout(() => {
      cleanup()
      reject(
        new JsonBoundsError(
          `JSON parsing timed out after ${Math.round(timeoutMs / 1000)}s (file may be too large or malicious)`
        )
      )
    }, timeoutMs)

    worker.onmessage = (event: MessageEvent<{ ok: boolean; value?: T; error?: string }>) => {
      const data = event.data
      cleanup()
      if (!data?.ok) {
        reject(new Error(`Failed to parse JSON: ${data?.error || 'unknown error'}`))
        return
      }
      resolve(data.value as T)
    }

    worker.onerror = (event) => {
      cleanup()
      reject(new Error(`JSON worker failed: ${event.message || 'unknown error'}`))
    }

    try {
      worker.postMessage(text)
    } catch (error) {
      cleanup()
      // Structured-clone of huge strings can fail; fall back to sync.
      try {
        resolve(parseJsonSync<T>(text))
      } catch (syncError) {
        reject(syncError)
      }
    }
  })
}
