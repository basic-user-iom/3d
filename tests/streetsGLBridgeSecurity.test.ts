import { describe, expect, it } from 'vitest'
import {
  buildStreetsGLIframeSrc,
  envelopeHasCapability,
  generateBridgeCapability,
  isAllowedParentOrigin,
  isAllowedStreetsGLOrigin,
  parseBridgeEnvelope,
  readCapabilityFromUrl,
  validateExternalObjectGeometry,
  validateSyncObjectsPayload
} from '../src/utils/streetsGLBridgeSecurity'

describe('streetsGLBridgeSecurity (SEC-5)', () => {
  it('generates a valid capability token', () => {
    const token = generateBridgeCapability()
    expect(token.length).toBeGreaterThanOrEqual(16)
    expect(readCapabilityFromUrl(`http://localhost:8081/?sgb=${token}`)).toBe(token)
  })

  it('builds iframe src with capability and parent origin', () => {
    const capability = generateBridgeCapability()
    const src = buildStreetsGLIframeSrc({
      capability,
      parentOrigin: 'http://localhost:3000',
      hash: '1.0,2.0,45,0,100'
    })
    const url = new URL(src)
    expect(url.origin).toBe('http://localhost:8081')
    expect(url.searchParams.get('sgb')).toBe(capability)
    expect(url.searchParams.get('parent')).toBe('http://localhost:3000')
    expect(url.hash).toBe('#1.0,2.0,45,0,100')
  })

  it('allows localhost Streets GL / parent origins and rejects foreign ones', () => {
    expect(isAllowedStreetsGLOrigin('http://localhost:8081')).toBe(true)
    expect(isAllowedStreetsGLOrigin('http://127.0.0.1:49152')).toBe(true)
    expect(isAllowedStreetsGLOrigin('https://evil.example')).toBe(false)
    expect(isAllowedParentOrigin('http://localhost:3000')).toBe(true)
    expect(isAllowedParentOrigin('https://evil.example')).toBe(false)
  })

  it('parses envelopes and enforces capability match', () => {
    const capability = generateBridgeCapability()
    const envelope = parseBridgeEnvelope({
      type: 'STREETS_GL_BRIDGE_READY',
      capability,
      ready: true
    })
    expect(envelope?.type).toBe('STREETS_GL_BRIDGE_READY')
    expect(envelopeHasCapability(envelope!, capability)).toBe(true)
    expect(envelopeHasCapability(envelope!, 'wrong-capability-token')).toBe(false)
    expect(parseBridgeEnvelope({ type: 'webpackOk' })).toBeNull()
  })

  it('rejects oversized and malformed geometry before allocation', () => {
    expect(validateExternalObjectGeometry(null).ok).toBe(false)
    expect(validateExternalObjectGeometry({ id: 'x' }).ok).toBe(true)

    const tooManyVerts = {
      id: 'big',
      geometry: { positions: new Float32Array((500_000 + 1) * 3) }
    }
    const rejected = validateExternalObjectGeometry(tooManyVerts)
    expect(rejected.ok).toBe(false)
    expect(rejected.error).toMatch(/vertex budget/i)

    const underBudget = {
      id: 'ok',
      geometry: { positions: new Float32Array(500_000 * 3) }
    }
    expect(validateExternalObjectGeometry(underBudget).ok).toBe(true)

    const tooManyParts = {
      id: 'parts',
      parts: Array.from({ length: 49 }, (_, i) => ({
        geometry: { positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]) },
        baseColorTextureDataUrl: undefined
      }))
    }
    expect(validateExternalObjectGeometry(tooManyParts).ok).toBe(false)

    const hugeTexture = {
      id: 'tex',
      geometry: { positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]) },
      metadata: { baseColorTextureDataUrl: 'data:image/png;base64,' + 'A'.repeat(2_500_001) }
    }
    expect(validateExternalObjectGeometry(hugeTexture).ok).toBe(false)

    const hugeBinary = {
      id: 'tex-bin',
      geometry: { positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]) },
      parts: [
        {
          geometry: { positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]) },
          baseColorTextureBytes: new ArrayBuffer(8_000_001)
        }
      ]
    }
    expect(validateExternalObjectGeometry(hugeBinary).ok).toBe(false)
  })

  it('rejects oversized sync batches', () => {
    const batch = Array.from({ length: 257 }, (_, i) => ({
      id: `o${i}`,
      type: 'box',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 }
    }))
    expect(validateSyncObjectsPayload(batch).ok).toBe(false)
    expect(validateSyncObjectsPayload({}).ok).toBe(false)
  })
})
