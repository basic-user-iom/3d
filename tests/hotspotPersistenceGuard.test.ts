import { describe, expect, it } from 'vitest'

/**
 * Documents the persistence contract for hotspots:
 * never write an empty array before the initial load completes.
 * Mirrors HotspotsPanel save guard logic.
 */
function shouldPersistHotspots(hotspotsLoaded: boolean): boolean {
  return hotspotsLoaded
}

describe('hotspot persistence guard', () => {
  it('blocks save before load completes', () => {
    expect(shouldPersistHotspots(false)).toBe(false)
  })

  it('allows save after load completes (including empty list)', () => {
    expect(shouldPersistHotspots(true)).toBe(true)
  })
})
