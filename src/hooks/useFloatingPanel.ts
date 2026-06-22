import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export interface FloatingPanelOptions {
  /**
   * Minimum gap, in pixels, to keep between the bottom of the toolbar and the panel.
   * Defaults to 2px.
   */
  anchorGap?: number
  /**
   * Horizontal anchor side. Use 'right' for panels that spawn on the right edge.
   */
  anchor?: 'left' | 'right'
  /**
   * Optional custom initial left offset.
   */
  initialLeft?: number
  /**
   * Reactive stacking offset from usePanelStacking.
   * When this changes and the panel hasn't been manually dragged,
   * the panel will auto-reposition.
   */
  stackingOffset?: number
  /**
   * Panel width for calculating positions. Defaults to 320.
   */
  panelWidth?: number
  /**
   * Unique panel identifier for overlap detection.
   */
  panelId?: string
}

const TOOLBAR_SELECTOR = '.toolbar'
const DEFAULT_MARGIN = 16
const SNAP_DISTANCE = 20 // pixels - distance threshold for snapping
const SNAP_GAP = 8 // pixels - gap between snapped panels
const PANEL_GAP = 8 // Gap between auto-stacked panels

const getWindowSize = () => {
  if (typeof window === 'undefined') {
    return { width: 1920, height: 1080 }
  }
  return { width: window.innerWidth, height: window.innerHeight }
}

function getToolbarBaseline(gap: number): number {
  if (typeof document === 'undefined') {
    return 60 + gap
  }

  const toolbar = document.querySelector(TOOLBAR_SELECTOR) as HTMLElement | null
  if (!toolbar) {
    return 60 + gap
  }

  const rect = toolbar.getBoundingClientRect()
  return Math.max(0, Math.round(rect.bottom) + gap)
}

// Registry of currently open panels for overlap detection
interface PanelInfo {
  id: string
  ref: React.RefObject<HTMLElement | null>
  anchor: 'left' | 'right'
  getPosition: () => { top: number; left: number }
  setPosition: (pos: { top: number; left: number }) => void
  hasDragged: boolean
}

const panelRegistry = new Map<string, PanelInfo>()

// Helper to detect and resolve overlaps
function detectAndResolveOverlaps(
  excludePanelId?: string
): void {
  const panels = Array.from(panelRegistry.values())
    .filter(p => p.id !== excludePanelId && p.ref.current)
  
  if (panels.length < 2) return

  // Group panels by anchor side
  const leftPanels = panels.filter(p => p.anchor === 'left')
  const rightPanels = panels.filter(p => p.anchor === 'right')

  // Check and resolve overlaps within each group
  resolveGroupOverlaps(rightPanels, 'right')
  resolveGroupOverlaps(leftPanels, 'left')
}

function resolveGroupOverlaps(panels: PanelInfo[], anchor: 'left' | 'right') {
  if (panels.length < 2) return

  // Sort by current left position
  const sortedPanels = [...panels].sort((a, b) => {
    const posA = a.getPosition().left
    const posB = b.getPosition().left
    return anchor === 'right' ? posB - posA : posA - posB
  })

  // Check for overlaps
  for (let i = 0; i < sortedPanels.length - 1; i++) {
    const current = sortedPanels[i]
    const next = sortedPanels[i + 1]
    
    if (!current.ref.current || !next.ref.current) continue
    
    const currentRect = current.ref.current.getBoundingClientRect()
    const nextRect = next.ref.current.getBoundingClientRect()
    
    // Check vertical overlap (panels must be at similar vertical positions)
    const verticalOverlap = !(currentRect.bottom < nextRect.top || currentRect.top > nextRect.bottom)
    
    if (!verticalOverlap) continue
    
    // Check horizontal overlap
    let horizontalOverlap = false
    if (anchor === 'right') {
      horizontalOverlap = currentRect.left < nextRect.right + PANEL_GAP
    } else {
      horizontalOverlap = currentRect.right + PANEL_GAP > nextRect.left
    }
    
    if (horizontalOverlap && !next.hasDragged) {
      // Move the next panel to avoid overlap
      const nextPos = next.getPosition()
      if (anchor === 'right') {
        const newLeft = currentRect.left - nextRect.width - PANEL_GAP
        if (newLeft > DEFAULT_MARGIN) {
          next.setPosition({ top: nextPos.top, left: newLeft })
        }
      } else {
        const newLeft = currentRect.right + PANEL_GAP
        if (newLeft + nextRect.width < getWindowSize().width - DEFAULT_MARGIN) {
          next.setPosition({ top: nextPos.top, left: newLeft })
        }
      }
    }
  }
}

export function useFloatingPanel<T extends HTMLElement = HTMLElement>(
  panelRef: React.RefObject<T | null>,
  options?: FloatingPanelOptions
) {
  const anchorGap = options?.anchorGap ?? 2
  const anchor = options?.anchor ?? 'right'
  const stackingOffset = options?.stackingOffset ?? 0
  const panelWidth = options?.panelWidth ?? 320
  const panelId = options?.panelId ?? `panel-${Math.random().toString(36).substr(2, 9)}`
  
  const [windowSize, setWindowSize] = useState(getWindowSize)
  const dragOffset = useRef({ startX: 0, startY: 0, initialTop: 0, initialLeft: 0 })
  const [dragging, setDragging] = useState(false)
  const [hasDragged, setHasDragged] = useState(false)
  const lastStackingOffset = useRef(stackingOffset)
  
  // Calculate initial position based on anchor and stacking offset
  const calculateInitialLeft = useCallback(() => {
    if (anchor === 'right') {
      return Math.max(DEFAULT_MARGIN, windowSize.width - panelWidth - DEFAULT_MARGIN - stackingOffset)
    } else {
      return DEFAULT_MARGIN + stackingOffset
    }
  }, [anchor, windowSize.width, panelWidth, stackingOffset])
  
  const [position, setPosition] = useState(() => ({
    top: getToolbarBaseline(anchorGap),
    left: options?.initialLeft ?? calculateInitialLeft()
  }))

  const clampTop = useCallback(
    (candidate: number) => {
      const minTop = getToolbarBaseline(anchorGap)
      const panelHeight = panelRef.current?.offsetHeight ?? 300
      const maxTop = Math.max(minTop, windowSize.height - panelHeight - DEFAULT_MARGIN)
      return Math.min(Math.max(candidate, minTop), maxTop)
    },
    [anchorGap, panelRef, windowSize.height]
  )

  const clampLeft = useCallback(
    (candidate: number) => {
      const currentPanelWidth = panelRef.current?.offsetWidth ?? panelWidth
      const minLeft = DEFAULT_MARGIN
      const maxLeft = Math.max(minLeft, windowSize.width - currentPanelWidth - DEFAULT_MARGIN)
      const clamped = Math.min(Math.max(candidate, minLeft), maxLeft)
      return clamped
    },
    [panelRef, windowSize.width, panelWidth]
  )

  const startDragging = useCallback(
    (clientX: number, clientY: number) => {
      dragOffset.current = {
        startX: clientX,
        startY: clientY,
        initialTop: position.top,
        initialLeft: position.left
      }
      setDragging(true)
    },
    [position]
  )

  const stopDragging = useCallback(() => {
    setDragging(false)
    setHasDragged(true) // Mark as manually dragged
    // After dragging stops, check for overlaps
    setTimeout(() => detectAndResolveOverlaps(panelId), 50)
  }, [panelId])

  const handleMouseDown = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (event.button !== 0) return
      if ((event.target as HTMLElement).closest('button, input, select, textarea, [data-no-drag]')) {
        return
      }
      startDragging(event.clientX, event.clientY)
      event.preventDefault()
    },
    [startDragging]
  )

  // Register panel in registry
  useEffect(() => {
    const info: PanelInfo = {
      id: panelId,
      ref: panelRef,
      anchor,
      getPosition: () => position,
      setPosition: (pos) => setPosition({ top: clampTop(pos.top), left: clampLeft(pos.left) }),
      hasDragged
    }
    panelRegistry.set(panelId, info)
    
    return () => {
      panelRegistry.delete(panelId)
    }
  }, [panelId, panelRef, anchor, position, hasDragged, clampTop, clampLeft])

  // React to stacking offset changes - reposition if not manually dragged
  useEffect(() => {
    if (hasDragged) return // Don't auto-reposition if user has dragged
    if (dragging) return // Don't reposition while dragging
    
    // Only update if stacking offset actually changed
    if (lastStackingOffset.current !== stackingOffset) {
      lastStackingOffset.current = stackingOffset
      
      const newLeft = calculateInitialLeft()
      setPosition(current => ({
        top: current.top,
        left: clampLeft(newLeft)
      }))
      
      // Check for overlaps after repositioning
      setTimeout(() => detectAndResolveOverlaps(), 50)
    }
  }, [stackingOffset, hasDragged, dragging, calculateInitialLeft, clampLeft])

  // Function to find all other panels and check for snap opportunities
  const findSnapPosition = useCallback((candidateTop: number, candidateLeft: number) => {
    if (!panelRef.current) return { top: candidateTop, left: candidateLeft }

    const currentPanel = panelRef.current
    const currentWidth = currentPanel.offsetWidth
    const currentHeight = currentPanel.offsetHeight

    // Find all other panels (panels with position: fixed that are not the current panel)
    const allPanels = (Array.from(document.querySelectorAll('[class*="-panel"]')) as HTMLElement[])
      .filter(panel => {
        const styles = window.getComputedStyle(panel)
        return styles.position === 'fixed' && 
               panel !== currentPanel &&
               panel.offsetWidth > 0 &&
               panel.offsetHeight > 0
      })

    let snappedTop = candidateTop
    let snappedLeft = candidateLeft
    let bestHorizontalSnap: { distance: number; left: number } | null = null
    let bestVerticalSnap: { distance: number; top: number } | null = null

    // Check for horizontal and vertical snapping separately
    for (const otherPanel of allPanels) {
      const otherRect = otherPanel.getBoundingClientRect()
      const otherLeft = otherRect.left
      const otherRight = otherRect.right
      const otherTop = otherRect.top
      const otherBottom = otherRect.bottom

      // Check if panels are on the same side (both right-anchored or both left-anchored)
      const currentIsRight = anchor === 'right'
      const otherIsRight = otherLeft > windowSize.width / 2
      const sameSide = currentIsRight === otherIsRight

      // Horizontal snap: align left or right edges
      if (sameSide) {
        // For right-anchored panels, snap right edges
        if (currentIsRight) {
          const currentRight = candidateLeft + currentWidth
          const distance = Math.abs(currentRight - otherRight)
          if (distance < SNAP_DISTANCE && (!bestHorizontalSnap || distance < bestHorizontalSnap.distance)) {
            bestHorizontalSnap = { distance, left: otherRight - currentWidth }
          }
          // Also check for snapping to left edge of other panel (stacking horizontally)
          const distanceToLeft = Math.abs((candidateLeft + currentWidth) - (otherLeft - SNAP_GAP))
          if (distanceToLeft < SNAP_DISTANCE && (!bestHorizontalSnap || distanceToLeft < bestHorizontalSnap.distance)) {
            bestHorizontalSnap = { distance: distanceToLeft, left: otherLeft - currentWidth - SNAP_GAP }
          }
        } else {
          // For left-anchored panels, snap left edges
          const distance = Math.abs(candidateLeft - otherLeft)
          if (distance < SNAP_DISTANCE && (!bestHorizontalSnap || distance < bestHorizontalSnap.distance)) {
            bestHorizontalSnap = { distance, left: otherLeft }
          }
          // Also check for snapping to right edge of other panel
          const distanceToRight = Math.abs(candidateLeft - (otherRight + SNAP_GAP))
          if (distanceToRight < SNAP_DISTANCE && (!bestHorizontalSnap || distanceToRight < bestHorizontalSnap.distance)) {
            bestHorizontalSnap = { distance: distanceToRight, left: otherRight + SNAP_GAP }
          }
        }
      }

      // Vertical snap: align top or bottom edges
      const currentTop = candidateTop
      const currentBottom = candidateTop + currentHeight
      
      // Snap top edges
      const topDistance = Math.abs(currentTop - otherTop)
      if (topDistance < SNAP_DISTANCE && (!bestVerticalSnap || topDistance < bestVerticalSnap.distance)) {
        bestVerticalSnap = { distance: topDistance, top: otherTop }
      }
      
      // Snap bottom edges
      const bottomDistance = Math.abs(currentBottom - otherBottom)
      if (bottomDistance < SNAP_DISTANCE && (!bestVerticalSnap || bottomDistance < bestVerticalSnap.distance)) {
        bestVerticalSnap = { distance: bottomDistance, top: otherBottom - currentHeight }
      }

      // Snap top to bottom (stack vertically)
      const topToBottomDistance = Math.abs(currentTop - (otherBottom + SNAP_GAP))
      if (topToBottomDistance < SNAP_DISTANCE && (!bestVerticalSnap || topToBottomDistance < bestVerticalSnap.distance)) {
        bestVerticalSnap = { distance: topToBottomDistance, top: otherBottom + SNAP_GAP }
      }

      // Snap bottom to top (stack vertically)
      const bottomToTopDistance = Math.abs(currentBottom - (otherTop - SNAP_GAP))
      if (bottomToTopDistance < SNAP_DISTANCE && (!bestVerticalSnap || bottomToTopDistance < bestVerticalSnap.distance)) {
        bestVerticalSnap = { distance: bottomToTopDistance, top: otherTop - currentHeight - SNAP_GAP }
      }
    }

    // Apply best snaps
    if (bestHorizontalSnap) {
      snappedLeft = bestHorizontalSnap.left
    }
    if (bestVerticalSnap) {
      snappedTop = bestVerticalSnap.top
    }

    return { top: snappedTop, left: snappedLeft }
  }, [panelRef, anchor, windowSize.width])

  useEffect(() => {
    if (!dragging) return

    const handleMove = (event: MouseEvent) => {
      const deltaX = event.clientX - dragOffset.current.startX
      const deltaY = event.clientY - dragOffset.current.startY
      let nextTop = clampTop(dragOffset.current.initialTop + deltaY)
      let nextLeft = clampLeft(dragOffset.current.initialLeft + deltaX)

      // Apply snapping
      const snapped = findSnapPosition(nextTop, nextLeft)
      nextTop = clampTop(snapped.top)
      nextLeft = clampLeft(snapped.left)

      setPosition({ top: nextTop, left: nextLeft })
    }

    const handleUp = () => stopDragging()

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [dragging, clampTop, clampLeft, stopDragging, findSnapPosition])

  useEffect(() => {
    const handleResize = () => {
      const size = getWindowSize()
      setWindowSize(size)
      setPosition((current) => ({
        top: clampTop(current.top),
        left: clampLeft(current.left)
      }))
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [clampTop, clampLeft])

  // On mount, check for overlaps with existing panels
  useEffect(() => {
    setTimeout(() => detectAndResolveOverlaps(), 100)
  }, [])

  useEffect(() => {
    // Clamp position to ensure panel stays within viewport
    setPosition((current) => ({ 
      top: clampTop(current.top), 
      left: clampLeft(current.left) 
    }))
  }, [clampTop, clampLeft])

  const anchorTop = useMemo(() => getToolbarBaseline(anchorGap), [anchorGap])
  const maxHeight = useMemo(() => {
    const available = windowSize.height - position.top - DEFAULT_MARGIN
    return Math.max(240, available)
  }, [windowSize.height, position.top])

  // Function to reset position to auto-calculated position
  const resetPosition = useCallback(() => {
    setHasDragged(false)
    const newLeft = calculateInitialLeft()
    setPosition({
      top: getToolbarBaseline(anchorGap),
      left: clampLeft(newLeft)
    })
    setTimeout(() => detectAndResolveOverlaps(), 50)
  }, [calculateInitialLeft, clampLeft, anchorGap])

  return {
    top: position.top,
    left: position.left,
    maxHeight,
    dragging,
    handleMouseDown,
    setTop: (value: number) => setPosition((current) => ({ ...current, top: clampTop(value) })),
    anchorTop,
    hasDragged,
    resetPosition
  }
}
