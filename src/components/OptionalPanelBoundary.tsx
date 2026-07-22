import { memo, Suspense, type ReactNode } from 'react'

/**
 * PERF-5: memoized Suspense boundary so optional panel trees skip re-render
 * when parent props are unchanged.
 */
function OptionalPanelBoundaryComponent({ children }: { children: ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>
}

export const OptionalPanelBoundary = memo(OptionalPanelBoundaryComponent)
