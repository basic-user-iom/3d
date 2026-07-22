import createDOMPurify from 'dompurify'

type PurifyInstance = {
  sanitize: (dirty: string | Node, config?: Record<string, unknown>) => string
}

const ALLOWED_HOTSPOT_HTML_TAGS = [
  'a',
  'b',
  'blockquote',
  'br',
  'code',
  'div',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'i',
  'img',
  'li',
  'ol',
  'p',
  'pre',
  'span',
  'strong',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'u',
  'ul'
] as const

const ALLOWED_HOTSPOT_HTML_ATTR = [
  'alt',
  'class',
  'href',
  'rel',
  'src',
  'style',
  'target',
  'title'
] as const

/** Interactive iframe sandbox without allow-same-origin (safer for untrusted URLs). */
export const HOTSPOT_IFRAME_SANDBOX =
  'allow-scripts allow-popups allow-forms allow-presentation allow-downloads'

const SAFE_URL_PROTOCOLS = new Set(['http:', 'https:'])

let purifyInstance: PurifyInstance | null = null

function getPurify(): PurifyInstance {
  if (purifyInstance) {
    return purifyInstance
  }

  const imported = createDOMPurify as unknown as PurifyInstance & ((window: Window) => PurifyInstance)

  // Browser builds expose a ready instance with sanitize().
  if (typeof imported.sanitize === 'function') {
    purifyInstance = imported
    return purifyInstance
  }

  if (typeof window !== 'undefined') {
    purifyInstance = imported(window)
    return purifyInstance
  }

  // Node/tests: create a minimal DOM for sanitization.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { JSDOM } = require('jsdom') as typeof import('jsdom')
  purifyInstance = imported(new JSDOM('').window as unknown as Window)
  return purifyInstance
}

/**
 * Sanitize author/imported hotspot HTML so scripts, event handlers, and active
 * embeds cannot execute when rendered with dangerouslySetInnerHTML.
 */
export function sanitizeHotspotHtml(html: string): string {
  if (typeof html !== 'string' || html.length === 0) {
    return ''
  }

  return getPurify().sanitize(html, {
    ALLOWED_TAGS: [...ALLOWED_HOTSPOT_HTML_TAGS],
    ALLOWED_ATTR: [...ALLOWED_HOTSPOT_HTML_ATTR],
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'svg', 'math'],
    FORBID_ATTR: ['srcdoc'],
    SAFE_FOR_TEMPLATES: true
  })
}

/**
 * Return a normalized http(s) URL suitable for iframe src, or null when unsafe.
 */
export function getSafeHotspotIframeUrl(rawUrl: unknown): string | null {
  if (typeof rawUrl !== 'string' || rawUrl.trim() === '') {
    return null
  }

  let parsed: URL
  try {
    parsed = new URL(rawUrl.trim())
  } catch {
    return null
  }

  if (!SAFE_URL_PROTOCOLS.has(parsed.protocol.toLowerCase())) {
    return null
  }

  if (parsed.username || parsed.password) {
    return null
  }

  if (!parsed.hostname) {
    return null
  }

  return parsed.href
}

/**
 * Escape text for HTML element bodies.
 */
export function escapeHtmlText(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Escape text for double-quoted HTML attributes.
 */
export function escapeHtmlAttr(value: unknown): string {
  return escapeHtmlText(value)
}

/**
 * Encode JSON so it can be embedded inside a <script> without breaking out.
 * JSON.stringify already escapes quotes; this additionally neutralizes
 * </script>, HTML specials, and Unicode line separators.
 */
export function encodeJsonForScriptTag(value: unknown): string {
  const json = JSON.stringify(value, null, 2)
  return json
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}
