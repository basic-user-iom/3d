import { useEffect, useState } from 'react'

function formatCountdown(ms: number): string {
  if (ms <= 0) return '00:00:00'
  const totalSeconds = Math.floor(ms / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function useCountdown(targetMs: number | null): { isPending: boolean; label: string } {
  const hasTarget = targetMs != null && Number.isFinite(targetMs)

  const [remainingMs, setRemainingMs] = useState(() =>
    hasTarget ? Math.max(0, targetMs - Date.now()) : 0
  )

  useEffect(() => {
    if (!hasTarget) return
    const tick = () => setRemainingMs(Math.max(0, targetMs - Date.now()))
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [hasTarget, targetMs])

  return {
    isPending: hasTarget && remainingMs > 0,
    label: hasTarget ? formatCountdown(remainingMs) : ''
  }
}

/** Persist a countdown deadline; resets when storageKey changes. */
export function getOrCreateCountdownDeadline(storageKey: string, hours: number): number {
  if (typeof window === 'undefined') {
    return Date.now() + hours * 60 * 60 * 1000
  }
  const stored = window.localStorage.getItem(storageKey)
  if (stored) {
    const parsed = Number.parseInt(stored, 10)
    if (Number.isFinite(parsed) && parsed > Date.now()) return parsed
  }
  const deadline = Date.now() + hours * 60 * 60 * 1000
  window.localStorage.setItem(storageKey, String(deadline))
  return deadline
}
