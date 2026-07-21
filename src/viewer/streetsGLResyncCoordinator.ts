/**
 * Streets GL ResyncCoordinator — single owner for registry → iframe heal/re-add.
 *
 * Phase 1: open / ready / reload / mode-enter must not fire parallel conflicting heals.
 * Concurrent callers join the in-flight pass; if another request arrives during a pass,
 * exactly one follow-up is queued (coalesced). Never run two heals in parallel.
 *
 * Who may call `requestRegistryResync`:
 *   - ObjectRegistryReconciler — mode enter (city/hybrid + overlay)
 *   - StreetsGLIframeOverlay — bridge ready / iframe reload (onReady)
 *   - Tests / explicit manual heal (`reason: 'manual'`)
 *
 * Do NOT call from transform sync, Objects Panel visibility toggles, or per-object add.
 * Visibility RPCs belong to `setIframeVisible(..., { pushToBridge: true })` only.
 */

import type { StreetsGLBridge } from '../utils/streetsGLBridge'

export type StreetsGLResyncReason =
  | 'bridge-ready'
  | 'iframe-reload'
  | 'mode-enter'
  | 'manual'

export type StreetsGLResyncRunner = (bridge: StreetsGLBridge) => Promise<number>

let runner: StreetsGLResyncRunner | null = null
let inFlight: Promise<number> | null = null
let needsFollowUp = false
let pendingBridge: StreetsGLBridge | null = null

/** Bind the heal implementation (called once from useViewer at module load). */
export function bindResyncRunner(fn: StreetsGLResyncRunner): void {
  runner = fn
}

/**
 * Request a registry → Streets GL resync. Safe to call from multiple React effects;
 * overlapping triggers coalesce into at most one in-flight pass + one follow-up.
 */
export async function requestRegistryResync(
  bridge: StreetsGLBridge,
  _reason: StreetsGLResyncReason
): Promise<number> {
  if (!bridge?.isReady) return 0
  if (!runner) {
    console.warn(
      '[StreetsGLResync] No runner bound — call bindResyncRunner from useViewer first'
    )
    return 0
  }

  pendingBridge = bridge

  if (inFlight) {
    needsFollowUp = true
    return inFlight
  }

  inFlight = (async () => {
    let last = 0
    try {
      do {
        needsFollowUp = false
        const b = pendingBridge
        if (!b?.isReady || !runner) break
        last = await runner(b)
      } while (needsFollowUp)
      return last
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}

/** Test helper: reset coordinator mutex state between cases. */
export function __resetResyncCoordinatorForTests(): void {
  runner = null
  inFlight = null
  needsFollowUp = false
  pendingBridge = null
}

/** Test helper: inspect whether a pass is in flight. */
export function __isResyncInFlightForTests(): boolean {
  return inFlight != null
}
