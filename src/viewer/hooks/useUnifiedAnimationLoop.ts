/**
 * React hook for subscribing to the unified animation loop
 * 
 * Usage:
 * ```tsx
 * useUnifiedAnimationLoop((delta, time) => {
 *   // Update logic here
 * })
 * ```
 */

import { useEffect, useRef } from 'react'
import { unifiedAnimationLoop, type AnimationCallback } from '../utils/UnifiedAnimationLoop'

export function useUnifiedAnimationLoop(callback: AnimationCallback, deps?: React.DependencyList) {
  const callbackRef = useRef(callback)

  // Always use the latest callback
  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  useEffect(() => {
    const wrappedCallback: AnimationCallback = (delta, time) => {
      callbackRef.current(delta, time)
    }

    const unsubscribe = unifiedAnimationLoop.subscribe(wrappedCallback)

    return () => {
      unsubscribe()
    }
  }, deps || [])
}


























