import type { GuidedTour } from './guidedTourTypes'

export type PanoramaHotspotType = 'link' | 'info' | 'url'

export type PanoramaHotspotShape = 'circle' | 'pin' | 'square'

export type PanoramaPopupAnchor = 'above' | 'below' | 'left' | 'right' | 'center'

export interface PanoramaHotspot {
  id: string
  label: string
  /** Horizontal angle in radians (-π to π). 0 = forward (-Z), positive = right. */
  yaw: number
  /** Vertical angle in radians (-π/2 to π/2). Positive = up. */
  pitch: number
  type: PanoramaHotspotType
  /** Target panorama id when type is 'link'. */
  targetPanoramaId?: string
  /** Camera yaw after navigating via this link hotspot. */
  targetYaw?: number
  /** Camera pitch after navigating via this link hotspot. */
  targetPitch?: number
  /** Info text when type is 'info'. */
  info?: string
  /** External URL when type is 'url'. */
  url?: string
  /** When true, URL hotspots open in an embedded iframe overlay instead of a new tab. */
  openInIframe?: boolean
  /** Marker fill color (hex). Falls back to type default. */
  color?: string
  /** Marker shape. Defaults to circle. */
  shape?: PanoramaHotspotShape
  /** Info popup width in px. */
  popupWidth?: number
  /** Info popup height in px (optional; auto height when unset). */
  popupHeight?: number
  /** Popup anchor relative to marker. */
  popupAnchor?: PanoramaPopupAnchor
  /** Extra horizontal offset in px from anchored position. */
  popupOffsetX?: number
  /** Extra vertical offset in px from anchored position. */
  popupOffsetY?: number
  /** Info popup outline/border color (hex). Falls back to default gold. */
  popupBorderColor?: string
}

export interface PanoramaEntry {
  id: string
  name: string
  /** Uploaded file or remote URL string. */
  source: File | string
  hotspots: PanoramaHotspot[]
  /** Default view when this panorama is first opened. */
  initialYaw?: number
  initialPitch?: number
}

export interface PanoramaTourState {
  panoramas: PanoramaEntry[]
  activePanoramaId: string | null
  /** Optional automated / guided tours persisted with the project. */
  guidedTours?: GuidedTour[]
}

export const DEFAULT_HOTSPOT_COLORS: Record<PanoramaHotspotType, string> = {
  link: '#4a9eff',
  info: '#ffb43c',
  url: '#50c878'
}

export const DEFAULT_HOTSPOT_SHAPE: PanoramaHotspotShape = 'circle'
export const DEFAULT_POPUP_WIDTH = 360
export const DEFAULT_POPUP_ANCHOR: PanoramaPopupAnchor = 'above'
/** Matches edit-preview gold in Panorama360Viewer.css (`rgba(255, 180, 60, …)`). */
export const DEFAULT_POPUP_BORDER_COLOR = '#ffb43c'

export function getHotspotColor(hotspot: PanoramaHotspot): string {
  return hotspot.color ?? DEFAULT_HOTSPOT_COLORS[hotspot.type]
}

export function getHotspotShape(hotspot: PanoramaHotspot): PanoramaHotspotShape {
  return hotspot.shape ?? DEFAULT_HOTSPOT_SHAPE
}

export function getPopupWidth(hotspot: PanoramaHotspot): number {
  const configured = hotspot.popupWidth ?? DEFAULT_POPUP_WIDTH
  if (typeof window === 'undefined') return configured
  return Math.min(configured, Math.max(200, window.innerWidth - 24))
}

export function getPopupAnchor(hotspot: PanoramaHotspot): PanoramaPopupAnchor {
  return hotspot.popupAnchor ?? DEFAULT_POPUP_ANCHOR
}

export function getPopupBorderColor(hotspot: PanoramaHotspot): string {
  return hotspot.popupBorderColor ?? DEFAULT_POPUP_BORDER_COLOR
}

/** Returns a normalized http(s) URL or null when the value is missing or invalid. */
export function resolvePanoramaUrl(url: string | undefined): string | null {
  const trimmed = url?.trim()
  if (!trimmed) return null
  try {
    const parsed = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return parsed.href
  } catch {
    return null
  }
}

/** Hostnames (and their subdomains) commonly blocked from iframe embedding. */
const IFRAME_BLOCKED_HOSTS = new Set([
  'wikipedia.org',
  'google.com',
  'google.co.uk',
  'facebook.com',
  'instagram.com',
  'twitter.com',
  'x.com',
  'linkedin.com',
  'youtube.com',
  'apple.com',
  'amazon.com',
  'bbc.com',
  'bbc.co.uk',
  'nytimes.com',
  'microsoft.com',
  'reddit.com',
  'paypal.com',
  'dropbox.com',
  'spotify.com'
])

function hostnameMatchesBlockedList(hostname: string): boolean {
  const lower = hostname.toLowerCase()
  for (const blocked of IFRAME_BLOCKED_HOSTS) {
    if (lower === blocked || lower.endsWith(`.${blocked}`)) return true
  }
  return false
}

/** True when the URL hostname is known to block iframe embedding (X-Frame-Options / CSP). */
export function isLikelyIframeBlocked(url: string): boolean {
  try {
    return hostnameMatchesBlockedList(new URL(url).hostname)
  } catch {
    return false
  }
}

const DEFAULT_HOTSPOT_LABEL = 'New hotspot'

/** Title for the URL iframe overlay — prefers a custom label, falls back to hostname. */
export function getUrlIframeTitle(label: string | undefined, url: string): string {
  const trimmed = label?.trim()
  if (trimmed && trimmed !== DEFAULT_HOTSPOT_LABEL) return trimmed
  try {
    return new URL(url).hostname.replace(/^www\./i, '')
  } catch {
    return trimmed || 'Webpage'
  }
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180
}

export function createPanoramaId(): string {
  return `pano-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function createHotspotId(): string {
  return `hs-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/** Ephemeral id for the unsaved placement preview marker in the viewer. */
export const PLACEMENT_PREVIEW_HOTSPOT_ID = '__placement-preview__'

export function createEmptyPanorama(name: string, source: File | string): PanoramaEntry {
  return {
    id: createPanoramaId(),
    name,
    source,
    hotspots: []
  }
}

export function hasPanoramaInitialView(pano: PanoramaEntry): boolean {
  return pano.initialYaw !== undefined || pano.initialPitch !== undefined
}

export function getPanoramaInitialView(pano: PanoramaEntry): { yaw: number; pitch: number } {
  return {
    yaw: pano.initialYaw ?? 0,
    pitch: pano.initialPitch ?? 0
  }
}
