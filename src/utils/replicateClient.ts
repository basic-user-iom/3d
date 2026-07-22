/**
 * Client boundary for Replicate (SEC-4).
 * Never sends or reads REPLICATE_API_TOKEN in the renderer — Electron IPC or
 * the local /api/replicate proxy attach the token server-side.
 */

export interface ReplicateProxyRequest {
  method: 'GET' | 'POST'
  path: string
  body?: unknown
}

export interface ReplicateProxyResult {
  ok: boolean
  status: number
  data?: unknown
  error?: string
}

function getElectronReplicateApi(): {
  replicateStatus?: () => Promise<{ configured: boolean }>
  replicateRequest?: (request: ReplicateProxyRequest) => Promise<ReplicateProxyResult>
} | null {
  if (typeof window === 'undefined' || !window.electronAPI) return null
  return window.electronAPI
}

/** Whether the server/Electron main process has REPLICATE_API_TOKEN set. */
export async function getReplicateConfigured(): Promise<boolean> {
  const electronApi = getElectronReplicateApi()
  if (electronApi?.replicateStatus) {
    const status = await electronApi.replicateStatus()
    return !!status?.configured
  }

  const response = await fetch('/api/replicate/status', {
    method: 'GET',
    headers: { Accept: 'application/json' }
  })
  if (!response.ok) {
    return false
  }
  const payload = (await response.json()) as { configured?: boolean }
  return !!payload.configured
}

/**
 * Call Replicate through Electron IPC or the local Vite/server proxy.
 * Returns parsed JSON data from Replicate on success.
 */
export async function replicateApiRequest(request: ReplicateProxyRequest): Promise<unknown> {
  const electronApi = getElectronReplicateApi()
  if (electronApi?.replicateRequest) {
    const result = await electronApi.replicateRequest(request)
    if (!result?.ok) {
      throw new Error(result?.error || `Replicate request failed (${result?.status ?? 'unknown'})`)
    }
    return result.data
  }

  const response = await fetch('/api/replicate/request', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(request)
  })

  let payload: ReplicateProxyResult
  try {
    payload = (await response.json()) as ReplicateProxyResult
  } catch {
    throw new Error(`Replicate proxy returned non-JSON (${response.status})`)
  }

  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || `Replicate request failed (${response.status})`)
  }

  return payload.data
}
