/**
 * SEC-5 — Streets GL iframe-side bridge security (mirrors src/utils/streetsGLBridgeSecurity.ts).
 */

export const STREETS_GL_CAPABILITY_PARAM = 'sgb'
export const STREETS_GL_PARENT_ORIGIN_PARAM = 'parent'

export const STREETS_GL_ALLOWED_PARENT_ORIGINS = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000'
])

/** Mirrored from parent streetsGLBridgeSecurity — keep in sync. */
export const STREETS_GL_BRIDGE_MAX_VERTICES = 500_000
export const STREETS_GL_BRIDGE_MAX_PARTS = 48
/** Legacy data-URL char cap (base64-inflated). Prefer binary `baseColorTextureBytes` for large maps. */
export const STREETS_GL_BRIDGE_MAX_TEXTURE_DATA_URL_CHARS = 2_500_000
/**
 * Per-texture compressed byte budget for ArrayBuffer / TypedArray transfer.
 * ~8MB fits typical 4k JPEG@0.92 albedo without forcing muddy half-size retries.
 */
export const STREETS_GL_BRIDGE_MAX_TEXTURE_BYTES = 8_000_000
/**
 * Aggregate compressed texture budget for one addObject / sync item (all mesh parts).
 * Two 4k Meshy albedos at high JPEG quality can exceed this — parent must quality/edge
 * backoff (largest first) before postMessage rather than hard-failing.
 */
export const STREETS_GL_BRIDGE_MAX_TOTAL_TEXTURE_BYTES = 12_000_000
export const STREETS_GL_BRIDGE_MAX_SYNC_OBJECTS = 256
export const STREETS_GL_BRIDGE_MAX_ID_CHARS = 256
export const STREETS_GL_BRIDGE_MAX_HIDDEN_BUILDINGS = 10_000

const CAPABILITY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/

export function isValidBridgeCapability(value: unknown): value is string {
  return typeof value === 'string' && CAPABILITY_PATTERN.test(value)
}

export function isAllowedParentOrigin(origin: string): boolean {
  if (STREETS_GL_ALLOWED_PARENT_ORIGINS.has(origin)) return true
  try {
    const url = new URL(origin)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
    if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') return false
    return true
  } catch {
    return false
  }
}

export function readCapabilityFromLocation(search: string): string | null {
  try {
    const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`)
    const value = params.get(STREETS_GL_CAPABILITY_PARAM)
    return isValidBridgeCapability(value) ? value : null
  } catch {
    return null
  }
}

export function readParentOriginFromLocation(search: string): string | null {
  try {
    const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`)
    const value = params.get(STREETS_GL_PARENT_ORIGIN_PARAM)
    if (!value) return null
    return isAllowedParentOrigin(value) ? value : null
  } catch {
    return null
  }
}

export interface StreetsGLBridgeEnvelope {
  type: string
  payload?: unknown
  capability?: string
  timestamp?: number
  ready?: boolean
}

export function parseBridgeEnvelope(data: unknown): StreetsGLBridgeEnvelope | null {
  if (!data || typeof data !== 'object') return null
  const record = data as Record<string, unknown>
  if (typeof record.type !== 'string' || !record.type.startsWith('STREETS_GL_')) {
    return null
  }
  return {
    type: record.type,
    payload: record.payload,
    capability: typeof record.capability === 'string' ? record.capability : undefined,
    timestamp: typeof record.timestamp === 'number' ? record.timestamp : undefined,
    ready: typeof record.ready === 'boolean' ? record.ready : undefined
  }
}

export function envelopeHasCapability(
  envelope: StreetsGLBridgeEnvelope,
  expected: string | null | undefined
): boolean {
  if (!isValidBridgeCapability(expected)) return false
  return envelope.capability === expected
}

function arrayLength(value: unknown): number {
  if (value == null) return 0
  if (typeof (value as { length?: unknown }).length === 'number') {
    return (value as { length: number }).length
  }
  return 0
}

function vertexCountFromPositions(positions: unknown): number {
  return Math.floor(arrayLength(positions) / 3)
}

function textureDataUrlTooLarge(value: unknown): boolean {
  return typeof value === 'string' && value.length > STREETS_GL_BRIDGE_MAX_TEXTURE_DATA_URL_CHARS
}

function textureBytesTooLarge(value: unknown): boolean {
  if (value instanceof ArrayBuffer) {
    return value.byteLength > STREETS_GL_BRIDGE_MAX_TEXTURE_BYTES
  }
  if (ArrayBuffer.isView(value)) {
    return value.byteLength > STREETS_GL_BRIDGE_MAX_TEXTURE_BYTES
  }
  return false
}

function partTexturePayloadTooLarge(part: Record<string, unknown>): boolean {
  return (
    textureDataUrlTooLarge(part.baseColorTextureDataUrl) ||
    textureBytesTooLarge(part.baseColorTextureBytes)
  )
}

function texturePayloadByteLength(value: unknown): number {
  if (value instanceof ArrayBuffer) return value.byteLength
  if (ArrayBuffer.isView(value)) return value.byteLength
  if (typeof value === 'string' && value.startsWith('data:')) {
    const comma = value.indexOf(',')
    const payload = comma >= 0 ? value.slice(comma + 1) : value
    return Math.floor((payload.length * 3) / 4)
  }
  return 0
}

function accumulateUniqueTextureBytes(
  value: unknown,
  seen: WeakSet<object>,
  seenDataUrls: Set<string>
): number {
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    const key = value instanceof ArrayBuffer ? value : value.buffer
    if (seen.has(key as ArrayBuffer)) return 0
    seen.add(key as ArrayBuffer)
    return texturePayloadByteLength(value)
  }
  if (typeof value === 'string' && value.startsWith('data:')) {
    if (seenDataUrls.has(value)) return 0
    seenDataUrls.add(value)
    return texturePayloadByteLength(value)
  }
  return 0
}

export interface GeometryValidationResult {
  ok: boolean
  error?: string
  vertexCount: number
  partCount: number
}

export function validateExternalObjectGeometry(payload: unknown): GeometryValidationResult {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'Object payload must be an object', vertexCount: 0, partCount: 0 }
  }

  const data = payload as Record<string, unknown>
  if (typeof data.id !== 'string' || data.id.length === 0 || data.id.length > STREETS_GL_BRIDGE_MAX_ID_CHARS) {
    return { ok: false, error: 'Invalid object id', vertexCount: 0, partCount: 0 }
  }

  const partsRaw = Array.isArray(data.parts)
    ? data.parts
    : Array.isArray((data.metadata as { parts?: unknown } | undefined)?.parts)
      ? ((data.metadata as { parts: unknown[] }).parts)
      : null

  let vertexCount = 0
  let partCount = 0
  let textureBytesTotal = 0
  const seenTextureBuffers = new WeakSet<object>()
  const seenTextureDataUrls = new Set<string>()

  if (partsRaw && partsRaw.length > 0) {
    if (partsRaw.length > STREETS_GL_BRIDGE_MAX_PARTS) {
      return {
        ok: false,
        error: `Too many mesh parts (${partsRaw.length} > ${STREETS_GL_BRIDGE_MAX_PARTS})`,
        vertexCount: 0,
        partCount: partsRaw.length
      }
    }
    for (const part of partsRaw) {
      if (!part || typeof part !== 'object') {
        return { ok: false, error: 'Invalid mesh part', vertexCount, partCount }
      }
      const partRec = part as Record<string, unknown>
      const geometry = (part as { geometry?: { positions?: unknown } }).geometry
      const partVerts = vertexCountFromPositions(geometry?.positions)
      if (partVerts <= 0) continue
      partCount += 1
      vertexCount += partVerts
      if (partTexturePayloadTooLarge(partRec)) {
        return {
          ok: false,
          error: 'Texture payload exceeds size limit',
          vertexCount,
          partCount
        }
      }
      textureBytesTotal += accumulateUniqueTextureBytes(
        partRec.baseColorTextureBytes,
        seenTextureBuffers,
        seenTextureDataUrls
      )
      textureBytesTotal += accumulateUniqueTextureBytes(
        partRec.baseColorTextureDataUrl,
        seenTextureBuffers,
        seenTextureDataUrls
      )
    }
  } else {
    const geometry = data.geometry as { positions?: unknown } | undefined
    vertexCount = vertexCountFromPositions(geometry?.positions)
    partCount = vertexCount > 0 ? 1 : 0
  }

  if (vertexCount > STREETS_GL_BRIDGE_MAX_VERTICES) {
    return {
      ok: false,
      error: `Geometry exceeds vertex budget (${vertexCount} > ${STREETS_GL_BRIDGE_MAX_VERTICES})`,
      vertexCount,
      partCount
    }
  }

  const meta = data.metadata as Record<string, unknown> | undefined
  if (
    textureDataUrlTooLarge(meta?.baseColorTextureDataUrl) ||
    textureBytesTooLarge(meta?.baseColorTextureBytes)
  ) {
    return {
      ok: false,
      error: 'Texture payload exceeds size limit',
      vertexCount,
      partCount
    }
  }
  if (!partsRaw || partsRaw.length === 0) {
    textureBytesTotal += accumulateUniqueTextureBytes(
      meta?.baseColorTextureBytes,
      seenTextureBuffers,
      seenTextureDataUrls
    )
    textureBytesTotal += accumulateUniqueTextureBytes(
      meta?.baseColorTextureDataUrl,
      seenTextureBuffers,
      seenTextureDataUrls
    )
  }
  const material = meta?.material as Record<string, unknown> | undefined
  if (
    material &&
    (textureDataUrlTooLarge(material.baseColorTextureDataUrl) ||
      textureBytesTooLarge(material.baseColorTextureBytes))
  ) {
    return {
      ok: false,
      error: 'Texture payload exceeds size limit',
      vertexCount,
      partCount
    }
  }
  if (!partsRaw || partsRaw.length === 0) {
    textureBytesTotal += accumulateUniqueTextureBytes(
      material?.baseColorTextureBytes,
      seenTextureBuffers,
      seenTextureDataUrls
    )
    textureBytesTotal += accumulateUniqueTextureBytes(
      material?.baseColorTextureDataUrl,
      seenTextureBuffers,
      seenTextureDataUrls
    )
  }

  if (textureBytesTotal > STREETS_GL_BRIDGE_MAX_TOTAL_TEXTURE_BYTES) {
    return {
      ok: false,
      error: 'Texture payload exceeds size limit',
      vertexCount,
      partCount
    }
  }

  return { ok: true, vertexCount, partCount }
}

export function validateSyncObjectsPayload(payload: unknown): GeometryValidationResult {
  if (!Array.isArray(payload)) {
    return { ok: false, error: 'Sync payload must be an array', vertexCount: 0, partCount: 0 }
  }
  if (payload.length > STREETS_GL_BRIDGE_MAX_SYNC_OBJECTS) {
    return {
      ok: false,
      error: `Too many sync objects (${payload.length} > ${STREETS_GL_BRIDGE_MAX_SYNC_OBJECTS})`,
      vertexCount: 0,
      partCount: 0
    }
  }

  let vertexCount = 0
  let partCount = 0
  for (const item of payload) {
    const result = validateExternalObjectGeometry(item)
    if (!result.ok) return result
    vertexCount += result.vertexCount
    partCount += result.partCount
    if (vertexCount > STREETS_GL_BRIDGE_MAX_VERTICES * 2) {
      return {
        ok: false,
        error: 'Sync batch exceeds aggregate vertex budget',
        vertexCount,
        partCount
      }
    }
  }

  return { ok: true, vertexCount, partCount }
}
