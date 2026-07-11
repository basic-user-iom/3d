import type { PanoramaEntry, PanoramaHotspot, PanoramaTourState } from './panoramaTourTypes'

export const PANORAMA_PROJECT_FILE_VERSION = 1
export const PANORAMA_PROJECT_FILE_KIND = '360-panorama-project'
export const PANORAMA_PROJECT_FILE_EXTENSION = '.360project'

type SerializedPanoramaSource =
  | { type: 'url'; url: string }
  | { type: 'embedded'; filename: string; mediaType: string; dataUrl: string }

export interface SerializedPanoramaHotspot {
  id: string
  label: string
  yaw: number
  pitch: number
  type: PanoramaHotspot['type']
  targetPanoramaId?: string
  targetYaw?: number
  targetPitch?: number
  info?: string
  url?: string
  openInIframe?: boolean
  color?: string
  shape?: PanoramaHotspot['shape']
  popupWidth?: number
  popupHeight?: number
  popupAnchor?: PanoramaHotspot['popupAnchor']
  popupOffsetX?: number
  popupOffsetY?: number
}

export interface SerializedPanoramaEntry {
  id: string
  name: string
  source: SerializedPanoramaSource
  hotspots: SerializedPanoramaHotspot[]
  initialYaw?: number
  initialPitch?: number
}

export interface PanoramaProjectFile {
  version: number
  kind: typeof PANORAMA_PROJECT_FILE_KIND
  createdAt: string
  activePanoramaId: string | null
  panoramas: SerializedPanoramaEntry[]
}

export class PanoramaProjectError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PanoramaProjectError'
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64')
  }
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

async function readFileAsDataUrl(file: File): Promise<string> {
  try {
    const buffer = await file.arrayBuffer()
    const base64 = bytesToBase64(new Uint8Array(buffer))
    const mediaType = file.type || 'application/octet-stream'
    return `data:${mediaType};base64,${base64}`
  } catch {
    throw new PanoramaProjectError(`Failed to read file: ${file.name}`)
  }
}

function serializeHotspot(hotspot: PanoramaHotspot): SerializedPanoramaHotspot {
  return {
    id: hotspot.id,
    label: hotspot.label,
    yaw: hotspot.yaw,
    pitch: hotspot.pitch,
    type: hotspot.type,
    ...(hotspot.targetPanoramaId !== undefined ? { targetPanoramaId: hotspot.targetPanoramaId } : {}),
    ...(hotspot.targetYaw !== undefined ? { targetYaw: hotspot.targetYaw } : {}),
    ...(hotspot.targetPitch !== undefined ? { targetPitch: hotspot.targetPitch } : {}),
    ...(hotspot.info !== undefined ? { info: hotspot.info } : {}),
    ...(hotspot.url !== undefined ? { url: hotspot.url } : {}),
    ...(hotspot.openInIframe !== undefined ? { openInIframe: hotspot.openInIframe } : {}),
    ...(hotspot.color !== undefined ? { color: hotspot.color } : {}),
    ...(hotspot.shape !== undefined ? { shape: hotspot.shape } : {}),
    ...(hotspot.popupWidth !== undefined ? { popupWidth: hotspot.popupWidth } : {}),
    ...(hotspot.popupHeight !== undefined ? { popupHeight: hotspot.popupHeight } : {}),
    ...(hotspot.popupAnchor !== undefined ? { popupAnchor: hotspot.popupAnchor } : {}),
    ...(hotspot.popupOffsetX !== undefined ? { popupOffsetX: hotspot.popupOffsetX } : {}),
    ...(hotspot.popupOffsetY !== undefined ? { popupOffsetY: hotspot.popupOffsetY } : {})
  }
}

async function serializePanoramaSource(source: File | string): Promise<SerializedPanoramaSource> {
  if (typeof source === 'string') {
    return { type: 'url', url: source }
  }
  const dataUrl = await readFileAsDataUrl(source)
  return {
    type: 'embedded',
    filename: source.name,
    mediaType: source.type || 'application/octet-stream',
    dataUrl
  }
}

function deserializeHotspot(hotspot: SerializedPanoramaHotspot): PanoramaHotspot {
  if (!hotspot.id || typeof hotspot.id !== 'string') {
    throw new PanoramaProjectError('Hotspot is missing a valid id')
  }
  if (!hotspot.label || typeof hotspot.label !== 'string') {
    throw new PanoramaProjectError(`Hotspot "${hotspot.id}" is missing a valid label`)
  }
  if (typeof hotspot.yaw !== 'number' || typeof hotspot.pitch !== 'number') {
    throw new PanoramaProjectError(`Hotspot "${hotspot.id}" has invalid yaw/pitch`)
  }
  if (hotspot.type !== 'link' && hotspot.type !== 'info' && hotspot.type !== 'url') {
    throw new PanoramaProjectError(`Hotspot "${hotspot.id}" has invalid type`)
  }

  return {
    id: hotspot.id,
    label: hotspot.label,
    yaw: hotspot.yaw,
    pitch: hotspot.pitch,
    type: hotspot.type,
    ...(hotspot.targetPanoramaId !== undefined ? { targetPanoramaId: hotspot.targetPanoramaId } : {}),
    ...(hotspot.targetYaw !== undefined ? { targetYaw: hotspot.targetYaw } : {}),
    ...(hotspot.targetPitch !== undefined ? { targetPitch: hotspot.targetPitch } : {}),
    ...(hotspot.info !== undefined ? { info: hotspot.info } : {}),
    ...(hotspot.url !== undefined ? { url: hotspot.url } : {}),
    ...(hotspot.openInIframe !== undefined ? { openInIframe: hotspot.openInIframe } : {}),
    ...(hotspot.color !== undefined ? { color: hotspot.color } : {}),
    ...(hotspot.shape !== undefined ? { shape: hotspot.shape } : {}),
    ...(hotspot.popupWidth !== undefined ? { popupWidth: hotspot.popupWidth } : {}),
    ...(hotspot.popupHeight !== undefined ? { popupHeight: hotspot.popupHeight } : {}),
    ...(hotspot.popupAnchor !== undefined ? { popupAnchor: hotspot.popupAnchor } : {}),
    ...(hotspot.popupOffsetX !== undefined ? { popupOffsetX: hotspot.popupOffsetX } : {}),
    ...(hotspot.popupOffsetY !== undefined ? { popupOffsetY: hotspot.popupOffsetY } : {})
  }
}

function deserializePanoramaSource(source: SerializedPanoramaSource): File | string {
  if (!source || typeof source !== 'object' || !('type' in source)) {
    throw new PanoramaProjectError('Panorama source is missing or invalid')
  }

  if (source.type === 'url') {
    if (typeof source.url !== 'string' || !source.url.trim()) {
      throw new PanoramaProjectError('Panorama URL source is empty or invalid')
    }
    return source.url
  }

  if (source.type === 'embedded') {
    if (typeof source.dataUrl !== 'string' || !source.dataUrl.startsWith('data:')) {
      throw new PanoramaProjectError('Embedded panorama image is missing or invalid')
    }
    return source.dataUrl
  }

  throw new PanoramaProjectError('Panorama source has an unknown type')
}

function validateProjectFile(data: unknown): PanoramaProjectFile {
  if (!data || typeof data !== 'object') {
    throw new PanoramaProjectError('Project file is not a valid JSON object')
  }

  const file = data as Partial<PanoramaProjectFile>

  if (file.kind !== PANORAMA_PROJECT_FILE_KIND) {
    throw new PanoramaProjectError(
      `Unsupported project kind "${String(file.kind)}". Expected "${PANORAMA_PROJECT_FILE_KIND}".`
    )
  }

  if (typeof file.version !== 'number') {
    throw new PanoramaProjectError('Project file is missing a version number')
  }

  if (file.version > PANORAMA_PROJECT_FILE_VERSION) {
    throw new PanoramaProjectError(
      `Project file version ${file.version} is newer than this app supports (v${PANORAMA_PROJECT_FILE_VERSION}).`
    )
  }

  if (file.version < 1) {
    throw new PanoramaProjectError(`Project file version ${file.version} is not supported`)
  }

  if (!Array.isArray(file.panoramas)) {
    throw new PanoramaProjectError('Project file is missing a panoramas array')
  }

  if (file.activePanoramaId !== null && typeof file.activePanoramaId !== 'string') {
    throw new PanoramaProjectError('Project file has an invalid activePanoramaId')
  }

  return file as PanoramaProjectFile
}

export async function serializePanoramaProject(state: PanoramaTourState): Promise<PanoramaProjectFile> {
  const panoramas: SerializedPanoramaEntry[] = []

  for (const pano of state.panoramas) {
    panoramas.push({
      id: pano.id,
      name: pano.name,
      source: await serializePanoramaSource(pano.source),
      hotspots: pano.hotspots.map(serializeHotspot),
      ...(pano.initialYaw !== undefined ? { initialYaw: pano.initialYaw } : {}),
      ...(pano.initialPitch !== undefined ? { initialPitch: pano.initialPitch } : {})
    })
  }

  return {
    version: PANORAMA_PROJECT_FILE_VERSION,
    kind: PANORAMA_PROJECT_FILE_KIND,
    createdAt: new Date().toISOString(),
    activePanoramaId: state.activePanoramaId,
    panoramas
  }
}

export function deserializePanoramaProject(file: PanoramaProjectFile): PanoramaTourState {
  const validated = validateProjectFile(file)

  const panoramas: PanoramaEntry[] = validated.panoramas.map((pano, index) => {
    if (!pano || typeof pano !== 'object') {
      throw new PanoramaProjectError(`Panorama at index ${index} is invalid`)
    }
    if (!pano.id || typeof pano.id !== 'string') {
      throw new PanoramaProjectError(`Panorama at index ${index} is missing a valid id`)
    }
    if (!pano.name || typeof pano.name !== 'string') {
      throw new PanoramaProjectError(`Panorama "${pano.id}" is missing a valid name`)
    }
    if (!Array.isArray(pano.hotspots)) {
      throw new PanoramaProjectError(`Panorama "${pano.id}" is missing hotspots`)
    }

    return {
      id: pano.id,
      name: pano.name,
      source: deserializePanoramaSource(pano.source),
      hotspots: pano.hotspots.map(deserializeHotspot),
      ...(pano.initialYaw !== undefined ? { initialYaw: pano.initialYaw } : {}),
      ...(pano.initialPitch !== undefined ? { initialPitch: pano.initialPitch } : {})
    }
  })

  const activePanoramaId =
    validated.activePanoramaId && panoramas.some((p) => p.id === validated.activePanoramaId)
      ? validated.activePanoramaId
      : panoramas[0]?.id ?? null

  return { panoramas, activePanoramaId }
}

export function parsePanoramaProjectJson(json: string): PanoramaProjectFile {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new PanoramaProjectError('Project file is not valid JSON')
  }
  return validateProjectFile(parsed)
}

export async function loadPanoramaProjectFromFile(file: File): Promise<PanoramaTourState> {
  const text = await file.text()
  const project = parsePanoramaProjectJson(text)
  return deserializePanoramaProject(project)
}

export function downloadPanoramaProject(project: PanoramaProjectFile, filename?: string): void {
  const dataStr = JSON.stringify(project, null, 2)
  const dataBlob = new Blob([dataStr], { type: 'application/json' })
  const url = URL.createObjectURL(dataBlob)
  const link = document.createElement('a')
  link.href = url
  link.download =
    filename ??
    `panorama-tour-${new Date().toISOString().slice(0, 10)}${PANORAMA_PROJECT_FILE_EXTENSION}`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export async function savePanoramaProject(state: PanoramaTourState, filename?: string): Promise<void> {
  if (state.panoramas.length === 0) {
    throw new PanoramaProjectError('Nothing to save — add at least one panorama first')
  }
  const project = await serializePanoramaProject(state)
  downloadPanoramaProject(project, filename)
}
