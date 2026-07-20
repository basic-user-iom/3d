/**
 * Persist Streets GL / City session preferences across browser reloads.
 *
 * Note: this does NOT keep the Streets GL Node process alive. The server on
 * port 8081 dies when its terminal / managed process exits. These prefs only
 * restore UI state (enable flag, location, render mode) so the app can
 * re-request / reconnect to the server on next open.
 */

export const STREETS_GL_SESSION_STORAGE_KEY = 'viewer.streetsGLSession.v1'

export type StreetsGLSessionPrefs = {
  renderMode: 'product' | 'city' | 'hybrid'
  iframeOverlay: boolean
  iframeInteractive: boolean
  groundLat: number
  groundLon: number
  groundZoom: number
  showOSMGroundV2Panel?: boolean
  /** Packed Streets GL building feature ids (stringified for safe JSON). */
  hiddenBuildingIds?: string[]
}

const DEFAULTS: StreetsGLSessionPrefs = {
  renderMode: 'product',
  iframeOverlay: false,
  iframeInteractive: false,
  groundLat: 32.89917,
  groundLon: -97.03813,
  groundZoom: 15,
  showOSMGroundV2Panel: false,
  hiddenBuildingIds: []
}

function normalizeHiddenBuildingIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of value) {
    const id =
      typeof item === 'string'
        ? item.trim()
        : typeof item === 'number' && Number.isFinite(item)
          ? String(item)
          : ''
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function loadStreetsGLSessionPrefs(): StreetsGLSessionPrefs {
  if (typeof window === 'undefined') {
    return { ...DEFAULTS }
  }

  try {
    const raw = window.localStorage.getItem(STREETS_GL_SESSION_STORAGE_KEY)
    if (!raw) {
      return { ...DEFAULTS }
    }

    const parsed = JSON.parse(raw) as Partial<StreetsGLSessionPrefs>
    const renderMode =
      parsed.renderMode === 'city' || parsed.renderMode === 'hybrid' || parsed.renderMode === 'product'
        ? parsed.renderMode
        : DEFAULTS.renderMode

    const iframeOverlay = Boolean(parsed.iframeOverlay)
    return {
      renderMode: renderModeForStreetsGLOverlay(iframeOverlay, renderMode),
      iframeOverlay,
      iframeInteractive: Boolean(parsed.iframeInteractive),
      groundLat: isFiniteNumber(parsed.groundLat) ? parsed.groundLat : DEFAULTS.groundLat,
      groundLon: isFiniteNumber(parsed.groundLon) ? parsed.groundLon : DEFAULTS.groundLon,
      groundZoom: isFiniteNumber(parsed.groundZoom) ? parsed.groundZoom : DEFAULTS.groundZoom,
      showOSMGroundV2Panel: Boolean(parsed.showOSMGroundV2Panel),
      hiddenBuildingIds: normalizeHiddenBuildingIds(parsed.hiddenBuildingIds)
    }
  } catch (error) {
    console.warn('[StreetsGLSession] Failed to load session prefs:', error)
    return { ...DEFAULTS }
  }
}

export function saveStreetsGLSessionPrefs(prefs: StreetsGLSessionPrefs): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(STREETS_GL_SESSION_STORAGE_KEY, JSON.stringify(prefs))
  } catch (error) {
    console.warn('[StreetsGLSession] Failed to save session prefs:', error)
  }
}

/** Ensure overlay-on implies a mode that actually mounts the Streets GL iframe. */
export function renderModeForStreetsGLOverlay(
  overlayEnabled: boolean,
  currentMode: 'product' | 'city' | 'hybrid'
): 'product' | 'city' | 'hybrid' {
  if (!overlayEnabled) {
    return currentMode
  }
  if (currentMode === 'city' || currentMode === 'hybrid') {
    return currentMode
  }
  return 'hybrid'
}
