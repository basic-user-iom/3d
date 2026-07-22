import { createRequire } from 'node:module'
import { describe, expect, test } from 'vitest'

const require = createRequire(import.meta.url)
const {
  isSafeExternalUrl,
  getSafeExternalUrl
} = require('../electron/externalUrlSafety.cjs') as {
  isSafeExternalUrl: (rawUrl: unknown, options?: { allowHttp?: boolean }) => boolean
  getSafeExternalUrl: (rawUrl: unknown, options?: { allowHttp?: boolean }) => string | null
}

describe('electron external URL safety', () => {
  test('allows plain https destinations', () => {
    expect(isSafeExternalUrl('https://example.com/docs')).toBe(true)
    expect(getSafeExternalUrl('https://example.com/docs')).toBe('https://example.com/docs')
  })

  test('blocks dangerous schemes from reaching openExternal', () => {
    const blocked = [
      'file:///C:/Windows/System32/cmd.exe',
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'ms-windows-store://...',
      'smb://server/share',
      'ftp://files.example.com/a.zip'
    ]

    for (const url of blocked) {
      expect(isSafeExternalUrl(url)).toBe(false)
      expect(getSafeExternalUrl(url)).toBeNull()
    }
  })

  test('blocks credentials and malformed input', () => {
    expect(isSafeExternalUrl('https://user:pass@evil.example/')).toBe(false)
    expect(isSafeExternalUrl('not a url')).toBe(false)
    expect(isSafeExternalUrl('')).toBe(false)
    expect(isSafeExternalUrl(null)).toBe(false)
  })

  test('http is denied by default and allowed only when explicitly opted in', () => {
    expect(isSafeExternalUrl('http://localhost:3000')).toBe(false)
    expect(isSafeExternalUrl('http://localhost:3000', { allowHttp: true })).toBe(true)
  })
})
