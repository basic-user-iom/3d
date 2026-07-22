/**
 * Lifecycle helpers for the Streets GL iframe overlay.
 *
 * Important: tab hide/show (Page Visibility) must NOT unload the iframe.
 * Swapping src to about:blank destroys the WebGL context and all ExternalObjectBridge
 * objects; imported models then vanish until a full re-sync (which can fail or lag).
 */

export type StreetsGLRenderMode = 'product' | 'city' | 'hybrid' | string

/**
 * Whether the Streets GL app should stay loaded in the iframe.
 * Depends only on overlay + render mode — never on document.hidden / tab focus.
 */
export function shouldLoadStreetsGLIframe(
  overlayEnabled: boolean,
  renderMode: StreetsGLRenderMode
): boolean {
  return overlayEnabled && (renderMode === 'city' || renderMode === 'hybrid')
}
