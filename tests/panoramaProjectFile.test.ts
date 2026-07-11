import { describe, expect, it } from 'vitest'
import {
  deserializePanoramaProject,
  PanoramaProjectError,
  parsePanoramaProjectJson,
  PANORAMA_PROJECT_FILE_KIND,
  PANORAMA_PROJECT_FILE_VERSION,
  serializePanoramaProject,
  type PanoramaProjectFile
} from '../src/panorama/panoramaProjectFile'
import type { PanoramaEntry, PanoramaTourState } from '../src/panorama/panoramaTourTypes'

const sampleHotspot = {
  id: 'hs-1',
  label: 'Kitchen',
  yaw: 0.5,
  pitch: -0.1,
  type: 'link' as const,
  targetPanoramaId: 'pano-2',
  targetYaw: 1.2,
  color: '#4a9eff',
  shape: 'pin' as const
}

const sampleState: PanoramaTourState = {
  activePanoramaId: 'pano-1',
  panoramas: [
    {
      id: 'pano-1',
      name: 'Living room',
      source: 'https://example.com/living.jpg',
      initialYaw: 0.25,
      initialPitch: 0.1,
      hotspots: [sampleHotspot]
    },
    {
      id: 'pano-2',
      name: 'Kitchen',
      source: 'https://example.com/kitchen.jpg',
      hotspots: []
    }
  ]
}

function makeProject(overrides: Partial<PanoramaProjectFile> = {}): PanoramaProjectFile {
  return {
    version: PANORAMA_PROJECT_FILE_VERSION,
    kind: PANORAMA_PROJECT_FILE_KIND,
    createdAt: '2026-07-12T00:00:00.000Z',
    activePanoramaId: 'pano-1',
    panoramas: [
      {
        id: 'pano-1',
        name: 'Living room',
        source: { type: 'url', url: 'https://example.com/living.jpg' },
        initialYaw: 0.25,
        initialPitch: 0.1,
        hotspots: [
          {
            id: 'hs-1',
            label: 'Kitchen',
            yaw: 0.5,
            pitch: -0.1,
            type: 'link',
            targetPanoramaId: 'pano-2',
            targetYaw: 1.2,
            color: '#4a9eff',
            shape: 'pin'
          }
        ]
      }
    ],
    ...overrides
  }
}

describe('serializePanoramaProject', () => {
  it('serializes URL-based panoramas and hotspots', async () => {
    const project = await serializePanoramaProject(sampleState)

    expect(project.version).toBe(PANORAMA_PROJECT_FILE_VERSION)
    expect(project.kind).toBe(PANORAMA_PROJECT_FILE_KIND)
    expect(project.activePanoramaId).toBe('pano-1')
    expect(project.panoramas).toHaveLength(2)
    expect(project.panoramas[0].source).toEqual({
      type: 'url',
      url: 'https://example.com/living.jpg'
    })
    expect(project.panoramas[0].hotspots[0]).toMatchObject({
      id: 'hs-1',
      type: 'link',
      targetPanoramaId: 'pano-2'
    })
  })

  it('embeds local File sources as data URLs', async () => {
    const file = new File(['image-bytes'], 'room.jpg', { type: 'image/jpeg' })
    const state: PanoramaTourState = {
      activePanoramaId: 'pano-file',
      panoramas: [
        {
          id: 'pano-file',
          name: 'Room',
          source: file,
          hotspots: []
        }
      ]
    }

    const project = await serializePanoramaProject(state)
    expect(project.panoramas[0].source).toMatchObject({
      type: 'embedded',
      filename: 'room.jpg',
      mediaType: 'image/jpeg'
    })
    expect((project.panoramas[0].source as { dataUrl: string }).dataUrl).toMatch(/^data:image\/jpeg;base64,/)
  })
})

describe('deserializePanoramaProject', () => {
  it('restores tour state from a valid project file', () => {
    const restored = deserializePanoramaProject(makeProject())

    expect(restored.activePanoramaId).toBe('pano-1')
    expect(restored.panoramas).toHaveLength(1)
    expect(restored.panoramas[0].source).toBe('https://example.com/living.jpg')
    expect(restored.panoramas[0].hotspots[0]).toMatchObject({
      id: 'hs-1',
      type: 'link',
      targetPanoramaId: 'pano-2'
    })
  })

  it('round-trips through serialize and deserialize', async () => {
    const project = await serializePanoramaProject(sampleState)
    const restored = deserializePanoramaProject(project)

    expect(restored).toEqual(sampleState)
  })

  it('falls back to the first panorama when active id is missing', () => {
    const restored = deserializePanoramaProject(
      makeProject({ activePanoramaId: 'missing-id' })
    )
    expect(restored.activePanoramaId).toBe('pano-1')
  })

  it('preserves info and url hotspot fields including openInIframe', () => {
    const project = makeProject({
      panoramas: [
        {
          id: 'pano-1',
          name: 'Room',
          source: { type: 'url', url: 'https://example.com/room.jpg' },
          hotspots: [
            {
              id: 'hs-info',
              label: 'Details',
              yaw: 0,
              pitch: 0,
              type: 'info',
              info: 'Welcome',
              popupWidth: 420,
              popupAnchor: 'below',
              popupOffsetX: 12,
              popupOffsetY: -4
            },
            {
              id: 'hs-url',
              label: 'Site',
              yaw: 1,
              pitch: 0,
              type: 'url',
              url: 'https://example.com',
              openInIframe: true
            }
          ]
        }
      ]
    })

    const restored = deserializePanoramaProject(project)
    expect(restored.panoramas[0].hotspots[0]).toMatchObject({
      info: 'Welcome',
      popupWidth: 420,
      popupAnchor: 'below',
      popupOffsetX: 12,
      popupOffsetY: -4
    })
    expect(restored.panoramas[0].hotspots[1]).toMatchObject({
      url: 'https://example.com',
      openInIframe: true
    })
  })
})

describe('parsePanoramaProjectJson validation', () => {
  it('rejects invalid JSON', () => {
    expect(() => parsePanoramaProjectJson('{not json')).toThrow(PanoramaProjectError)
  })

  it('rejects unknown project kind', () => {
    expect(() =>
      parsePanoramaProjectJson(JSON.stringify({ ...makeProject(), kind: 'other' }))
    ).toThrow(/Unsupported project kind/)
  })

  it('rejects newer unsupported versions', () => {
    expect(() =>
      parsePanoramaProjectJson(
        JSON.stringify({ ...makeProject(), version: PANORAMA_PROJECT_FILE_VERSION + 1 })
      )
    ).toThrow(/newer than this app supports/)
  })

  it('rejects corrupt hotspot data on deserialize', () => {
    const project = makeProject({
      panoramas: [
        {
          id: 'pano-1',
          name: 'Room',
          source: { type: 'url', url: 'https://example.com/room.jpg' },
          hotspots: [{ id: 'hs-bad', label: 'Bad', yaw: 'nope' as unknown as number, pitch: 0, type: 'info' }]
        }
      ]
    })

    expect(() => deserializePanoramaProject(project)).toThrow(/invalid yaw\/pitch/)
  })
})
