import { describe, expect, test } from 'vitest'
import {
  JsonBoundsError,
  PROJECT_JSON_BOUNDS,
  assertJsonStructureBounds,
  assertJsonTextSize,
  parseJsonBounded
} from '../src/utils/safeJsonParse'

describe('safeJsonParse (DATA-5)', () => {
  test('assertJsonTextSize rejects oversized text', () => {
    const huge = 'x'.repeat(1024)
    expect(() =>
      assertJsonTextSize(huge, { ...PROJECT_JSON_BOUNDS, maxJsonBytes: 512 })
    ).toThrow(JsonBoundsError)
  })

  test('assertJsonStructureBounds rejects deep nesting', () => {
    let nested: unknown = null
    for (let i = 0; i < 10; i++) nested = { child: nested }
    expect(() =>
      assertJsonStructureBounds(nested, { ...PROJECT_JSON_BOUNDS, maxDepth: 5 })
    ).toThrow(/nesting/i)
  })

  test('assertJsonStructureBounds rejects huge arrays', () => {
    const arr = Array.from({ length: 20 }, (_, i) => i)
    expect(() =>
      assertJsonStructureBounds(arr, { ...PROJECT_JSON_BOUNDS, maxArrayLength: 10 })
    ).toThrow(/array exceeds/i)
  })

  test('assertJsonStructureBounds rejects oversized embedded base64', () => {
    const payload = 'A'.repeat(2048)
    expect(() =>
      assertJsonStructureBounds(
        { fileData: payload },
        { ...PROJECT_JSON_BOUNDS, maxEmbeddedBase64Bytes: 100 }
      )
    ).toThrow(/base64/i)
  })

  test('parseJsonBounded parses normal project-shaped JSON', async () => {
    const parsed = await parseJsonBounded<{ version: number; sceneObjects: unknown[] }>(
      JSON.stringify({ version: 6, sceneObjects: [], store: { modelFiles: [] } })
    )
    expect(parsed.version).toBe(6)
    expect(parsed.sceneObjects).toEqual([])
  })

  test('parseJsonBounded rejects invalid JSON', async () => {
    await expect(parseJsonBounded('{not-json')).rejects.toThrow(/parse/i)
  })

  test('parseJsonBounded rejects structure after parse', async () => {
    const deep: Record<string, unknown> = {}
    let cursor: Record<string, unknown> = deep
    for (let i = 0; i < 8; i++) {
      cursor.child = {}
      cursor = cursor.child as Record<string, unknown>
    }
    await expect(
      parseJsonBounded(JSON.stringify(deep), { ...PROJECT_JSON_BOUNDS, maxDepth: 3 })
    ).rejects.toThrow(JsonBoundsError)
  })
})
